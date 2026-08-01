//! Global fiducial points: QRS onset and offset, and T offset.
//!
//! # Why global rather than per lead
//!
//! Depolarisation begins at one instant in the heart, not twelve. A lead whose
//! axis is nearly perpendicular to the initial QRS vector sees almost nothing at
//! true onset, so its per-lead onset lands late — and by a lead-dependent
//! amount. Measuring onsets per lead therefore makes them move with the electrical
//! axis, and a pure axis rotation between two studies then reads as a QRS-duration
//! change.
//!
//! Instead the leads are combined into a **spatial velocity**: the root of the
//! summed squared derivatives across leads. Its threshold crossing marks the
//! first instant *any* lead is moving, which is the fiducial we want. One set of
//! fiducials is produced per study and every lead is measured against it.
//!
//! # Why this matters more than usual here
//!
//! Every ST amplitude in the pipeline is sampled at the J point *these* fiducials
//! locate. The frame itself is anchored on the R peak (see `config::FRAME_T0_S`),
//! so it is the fiducial, not the anchor, that decides where a measurement is
//! taken — which makes a mis-located offset the most expensive single error
//! available here.
//!
//! This module previously argued the opposite: that R-peak anchoring would
//! manufacture 100–300 µV of apparent ST shift when a terminal-QRS change moved
//! the J point. Measured, the anchoring costs about 12 µV, because ST follows the
//! measured J point rather than a fixed frame index. The real exposure was the
//! one that argument obscured — a J point mis-located by the walk below, which
//! cost over 1.3 mV until `SV_REJOIN_MS` was added.

use crate::config::{
    FRAME_N, FRAME_T0_S, QRS_DUR_PLAUSIBLE_MS, QRS_OFF_CLAMP_MS, QRS_ON_CLAMP_MS,
    SV_HALF_PT, SV_HALF_QRS, SV_MIN_LEADS, SV_PERSIST_SAMPLES, SV_REJOIN_MS, SV_THRESH_FRAC,
    SV_THRESH_MAD_K, T_LS_HALF, T_MIN_AMP_MV, T_MIN_SLOPE_MV_S,
};

/// Why a fiducial could not be determined. Each returns *no number* rather than
/// a guess, because a fabricated interval propagates into QTc and into every
/// serial delta built on it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Unmeasurable {
    /// Fewer than `SV_MIN_LEADS` usable leads.
    TooFewLeads,
    /// The spatial velocity never rose above its noise floor.
    NoActivation,
    /// A boundary walked outside its physiological clamp.
    Implausible,
    /// T wave below `T_MIN_AMP_MV`; there is no repolarisation to find an end for.
    FlatT,
    /// The descending tangent was too shallow to intersect the baseline usefully.
    ShallowTangent,
    /// The T wave ran past the end of the frame.
    TruncatedT,
}

/// One study's fiducials, in samples relative to the frame start.
#[derive(Debug, Clone, Copy)]
pub struct GlobalFiducials {
    pub qrs_onset: Result<usize, Unmeasurable>,
    pub qrs_offset: Result<usize, Unmeasurable>,
    pub t_offset: Result<usize, Unmeasurable>,
    /// Peak of the spatial velocity, used as a confidence proxy.
    pub sv_peak: f32,
}

impl GlobalFiducials {
    /// QRS duration in milliseconds, when both boundaries were found.
    pub fn qrs_duration_ms(&self, fs_hz: f64) -> Option<f64> {
        let (on, off) = (self.qrs_onset.ok()?, self.qrs_offset.ok()?);
        Some((off as f64 - on as f64) / fs_hz * 1000.0)
    }

    /// QT interval in milliseconds, when onset and T offset were both found.
    pub fn qt_ms(&self, fs_hz: f64) -> Option<f64> {
        let (on, t) = (self.qrs_onset.ok()?, self.t_offset.ok()?);
        Some((t as f64 - on as f64) / fs_hz * 1000.0)
    }
}

/// Savitzky–Golay first derivative over a symmetric window.
///
/// Least-squares differentiation, so it is far less noise-sensitive than a plain
/// difference — which matters because the derivative here is squared and summed
/// across leads, and noise would accumulate rather than cancel.
fn sg_derivative(x: &[f32], half: usize) -> Vec<f32> {
    let n = x.len();
    let mut out = vec![0.0f32; n];
    if n == 0 || half == 0 {
        return out;
    }
    // For a linear fit the coefficients are proportional to the offset itself.
    let denom: f32 = (1..=half).map(|k| 2.0 * (k * k) as f32).sum();
    for (i, o) in out.iter_mut().enumerate() {
        let mut acc = 0.0f32;
        for k in 1..=half {
            let lo = i.saturating_sub(k);
            let hi = (i + k).min(n - 1);
            acc += k as f32 * (x[hi] - x[lo]);
        }
        *o = acc / denom;
    }
    out
}

/// Spatial velocity across leads: `sqrt(sum_l (dV_l/dt)^2)`.
///
/// Each lead contributes weighted by its own quality, so a noisy or flatlined
/// lead cannot drag the fiducial. Leads below `SV_LEAD_SQI_MIN` are dropped by
/// the caller before they arrive here.
pub fn spatial_velocity(leads: &[Vec<f32>], weights: &[f32], half: usize) -> Vec<f32> {
    let n = leads.first().map_or(0, |l| l.len());
    let mut sv = vec![0.0f32; n];
    for (l, w) in leads.iter().zip(weights) {
        if l.len() != n || *w <= 0.0 {
            continue;
        }
        let d = sg_derivative(l, half);
        for i in 0..n {
            sv[i] += w * d[i] * d[i];
        }
    }
    for v in sv.iter_mut() {
        *v = v.sqrt();
    }
    sv
}

/// Median absolute deviation about the median.
fn mad(x: &[f32]) -> (f32, f32) {
    if x.is_empty() {
        return (0.0, 0.0);
    }
    let mut s = x.to_vec();
    s.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let med = s[s.len() / 2];
    let mut dev: Vec<f32> = x.iter().map(|v| (v - med).abs()).collect();
    dev.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    (med, dev[dev.len() / 2])
}

/// Walk outward from the spatial-velocity peak to find where activity begins
/// and ends.
///
/// The crossing must persist for `SV_PERSIST_SAMPLES` before it counts, so a
/// single noisy dip inside the QRS cannot terminate the walk early and clip the
/// complex.
///
/// # Why persistence alone is not enough
///
/// A delayed terminal deflection — new bundle branch block, hyperkalaemia, a
/// class Ic effect — splits the spatial velocity into two lobes with a trough
/// between them. The trough is longer than `SV_PERSIST_SAMPLES`, so the walk
/// ends there, and the reported offset lands *inside* the complex.
///
/// That failure is silent and expensive. Measured before this guard existed: a
/// 16 ms terminal delay made a 90 ms QRS report as 74 ms — shorter, for a
/// complex that had lengthened — and every ST measurement, taken at the
/// mis-located J point, moved with it. Over 1.3 mV of ST appeared on a fixture
/// with nothing injected. `QRS_OFF_CLAMP_MS` does not catch it because 74 ms is
/// wrong but perfectly plausible.
///
/// So after a candidate offset, look ahead: if activity climbs back above
/// threshold within `SV_REJOIN_MS`, depolarisation had not finished and the walk
/// resumes. What separates the two cases is that the ST segment which follows a
/// genuine QRS end is quiet for far longer than any intra-QRS trough.
fn walk_boundaries(sv: &[f32], peak: usize, threshold: f32, fs_hz: f64) -> (usize, usize) {
    let persist = SV_PERSIST_SAMPLES.max(1);

    let mut onset = 0usize;
    let mut run = 0usize;
    for i in (0..peak).rev() {
        if sv[i] < threshold {
            run += 1;
            if run >= persist {
                onset = i + run - 1;
                break;
            }
        } else {
            run = 0;
        }
    }

    let rejoin = ((SV_REJOIN_MS / 1000.0) * fs_hz).round() as usize;
    let mut offset = sv.len() - 1;
    let mut from = peak;

    // Bounded by the number of candidates the walk can produce; each iteration
    // advances `from` past the previous candidate, so this cannot spin.
    loop {
        let mut candidate = None;
        let mut run = 0usize;
        for (i, &v) in sv.iter().enumerate().skip(from) {
            if v < threshold {
                run += 1;
                if run >= persist {
                    candidate = Some(i - run + 1);
                    break;
                }
            } else {
                run = 0;
            }
        }

        let Some(end) = candidate else { break };
        offset = end;

        // Does activation resume before the ST segment has properly begun?
        let look_to = (end + rejoin).min(sv.len());
        let resumes = sv[end..look_to].iter().any(|&v| v >= threshold);
        if !resumes {
            break;
        }

        // It does, so `end` was a trough inside the complex. Restart past the
        // point where activity came back.
        let Some(back) = (end..look_to).find(|&i| sv[i] >= threshold) else { break };
        // Guarantees forward progress, so the loop terminates.
        if back < from {
            break;
        }
        from = back + 1;
    }

    (onset, offset)
}

/// Locate QRS onset and offset from a set of aligned lead frames.
///
/// `leads` are ensemble beats on the standard frame; `weights` their quality.
/// `r_index` is the frame index of the R peak.
pub fn qrs_boundaries(
    leads: &[Vec<f32>],
    weights: &[f32],
    r_index: usize,
    fs_hz: f64,
) -> (Result<usize, Unmeasurable>, Result<usize, Unmeasurable>, f32) {
    let usable = weights.iter().filter(|w| **w > 0.0).count();
    if usable < SV_MIN_LEADS {
        return (Err(Unmeasurable::TooFewLeads), Err(Unmeasurable::TooFewLeads), 0.0);
    }

    let sv = spatial_velocity(leads, weights, SV_HALF_QRS);
    if sv.is_empty() {
        return (Err(Unmeasurable::NoActivation), Err(Unmeasurable::NoActivation), 0.0);
    }

    // Peak search near the R wave rather than globally, so a large T does not
    // capture the walk.
    let lo = r_index.saturating_sub((0.08 * fs_hz) as usize);
    let hi = (r_index + (0.08 * fs_hz) as usize).min(sv.len());
    let mut peak = r_index.min(sv.len() - 1);
    let mut peak_v = f32::MIN;
    for (i, &v) in sv.iter().enumerate().take(hi).skip(lo) {
        if v > peak_v {
            peak_v = v;
            peak = i;
        }
    }

    // Threshold: a fraction of the peak, floored by the signal's own noise so a
    // quiet record does not produce a threshold below its baseline wobble.
    let (med, m) = mad(&sv);
    let floor = med + SV_THRESH_MAD_K * m;
    let threshold = (SV_THRESH_FRAC * peak_v).max(floor);
    if peak_v <= floor {
        return (Err(Unmeasurable::NoActivation), Err(Unmeasurable::NoActivation), peak_v);
    }

    let (on, off) = walk_boundaries(&sv, peak, threshold, fs_hz);

    // Physiological clamps, relative to R.
    let ms = |s: usize| (s as f64 - r_index as f64) / fs_hz * 1000.0;
    let on_res = if (QRS_ON_CLAMP_MS.0..=QRS_ON_CLAMP_MS.1).contains(&ms(on)) {
        Ok(on)
    } else {
        Err(Unmeasurable::Implausible)
    };
    let off_res = if (QRS_OFF_CLAMP_MS.0..=QRS_OFF_CLAMP_MS.1).contains(&ms(off)) {
        Ok(off)
    } else {
        Err(Unmeasurable::Implausible)
    };

    // A duration outside the plausible band usually means the paper speed is
    // wrong, not that the patient has a 300 ms QRS.
    if let (Ok(a), Ok(b)) = (on_res, off_res) {
        let dur = (b as f64 - a as f64) / fs_hz * 1000.0;
        if !(QRS_DUR_PLAUSIBLE_MS.0..=QRS_DUR_PLAUSIBLE_MS.1).contains(&dur) {
            return (Err(Unmeasurable::Implausible), Err(Unmeasurable::Implausible), peak_v);
        }
    }

    (on_res, off_res, peak_v)
}

/// T offset by the tangent method.
///
/// A least-squares tangent is fitted at the steepest descending point of the
/// terminal T lobe and intersected with the isoelectric baseline. This is the
/// method with the least inter-reader variability and the one guideline
/// documents describe, which matters because QT is compared against published
/// thresholds derived the same way.
///
/// Returns `Unmeasurable` rather than a number whenever the T wave is too flat,
/// the tangent too shallow, or the wave runs past the frame — all cases where a
/// plausible-looking value would be invented.
pub fn t_offset(
    vm: &[f32],
    qrs_offset: usize,
    fs_hz: f64,
    baseline_mv: f32,
) -> Result<usize, Unmeasurable> {
    let n = vm.len();
    let search_start = (qrs_offset + (0.04 * fs_hz) as usize).min(n.saturating_sub(1));
    if search_start + 4 >= n {
        return Err(Unmeasurable::TruncatedT);
    }

    // Peak of the terminal lobe: the largest absolute deflection after the QRS.
    let mut t_peak = search_start;
    let mut t_amp = 0.0f32;
    for (i, &v) in vm.iter().enumerate().take(n).skip(search_start) {
        let a = (v - baseline_mv).abs();
        if a > t_amp {
            t_amp = a;
            t_peak = i;
        }
    }
    if t_amp < T_MIN_AMP_MV {
        return Err(Unmeasurable::FlatT);
    }

    let polarity = (vm[t_peak] - baseline_mv).signum();
    let d = sg_derivative(vm, SV_HALF_PT);

    // Steepest return toward baseline after the T peak.
    let mut steep = t_peak;
    let mut steep_slope = 0.0f32;
    for (i, &slope) in d.iter().enumerate().take(n).skip(t_peak + 1) {
        let toward = -polarity * slope;
        if toward > steep_slope {
            steep_slope = toward;
            steep = i;
        }
        // Stop once the wave has crossed and settled.
        if (vm[i] - baseline_mv).abs() < 0.2 * t_amp && i > t_peak + (0.04 * fs_hz) as usize {
            break;
        }
    }

    // Least-squares slope over a short window at that point, which is steadier
    // than the single-sample derivative.
    let lo = steep.saturating_sub(T_LS_HALF);
    let hi = (steep + T_LS_HALF + 1).min(n);
    if hi <= lo + 2 {
        return Err(Unmeasurable::TruncatedT);
    }
    let m = (hi - lo) as f32;
    let mean_x = (lo + hi - 1) as f32 / 2.0;
    let mean_y = vm[lo..hi].iter().sum::<f32>() / m;
    let mut num = 0.0f32;
    let mut den = 0.0f32;
    for (k, &y) in vm[lo..hi].iter().enumerate() {
        let dx = (lo + k) as f32 - mean_x;
        num += dx * (y - mean_y);
        den += dx * dx;
    }
    if den <= 0.0 {
        return Err(Unmeasurable::ShallowTangent);
    }
    let slope_per_sample = num / den;
    let slope_mv_s = slope_per_sample * fs_hz as f32;
    if slope_mv_s.abs() < T_MIN_SLOPE_MV_S {
        return Err(Unmeasurable::ShallowTangent);
    }

    // Intersect the tangent with the baseline.
    let x_at_baseline = mean_x + (baseline_mv - mean_y) / slope_per_sample;
    if !x_at_baseline.is_finite() || x_at_baseline < t_peak as f32 {
        return Err(Unmeasurable::ShallowTangent);
    }
    let idx = x_at_baseline.round() as usize;
    if idx >= n {
        return Err(Unmeasurable::TruncatedT);
    }
    Ok(idx)
}

/// Compute all fiducials for one study.
pub fn fiducials(
    leads: &[Vec<f32>],
    weights: &[f32],
    vm: &[f32],
    fs_hz: f64,
    baseline_mv: f32,
) -> GlobalFiducials {
    let r_index = ((-FRAME_T0_S) * fs_hz).round() as usize;
    let (qrs_onset, qrs_offset, sv_peak) = qrs_boundaries(leads, weights, r_index, fs_hz);

    let t_offset = match qrs_offset {
        Ok(off) => t_offset(vm, off, fs_hz, baseline_mv),
        Err(e) => Err(e),
    };

    GlobalFiducials { qrs_onset, qrs_offset, t_offset, sv_peak }
}

/// Frame index of the R peak, by construction of the standard frame.
pub fn r_index(fs_hz: f64) -> usize {
    ((-FRAME_T0_S) * fs_hz).round() as usize
}

/// Length of the standard frame.
pub const FRAME_LEN: usize = FRAME_N;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::FS;

    /// A compactly-supported lobe: raised cosine, zero outside `±halfwidth`.
    fn lobe(d: f32, centre: f32, halfwidth: f32, amp: f32) -> f32 {
        let x = (d - centre) / halfwidth;
        if x.abs() < 1.0 {
            amp * 0.5 * (1.0 + (std::f32::consts::PI * x).cos())
        } else {
            0.0
        }
    }

    /// One lead's frame: a QRS of `qrs_ms` total width built from separate Q, R
    /// and S lobes, plus a T wave.
    ///
    /// Two fixture properties are load-bearing, and getting each wrong produced
    /// a failure that looked like a detector bug:
    ///
    /// 1. **Compact support.** A Gaussian σ=30 ms "150 ms QRS" still carries
    ///    derivative energy 90 ms before R, which no real complex does, and it
    ///    walked the onset past its physiological clamp.
    /// 2. **Distinct per-lead morphology.** A single symmetric lobe has zero
    ///    derivative exactly at its centre, so twelve identically-shaped leads
    ///    give a spatial velocity that is genuinely zero at R — and the forward
    ///    walk terminates there. Real leads differ in Q/R/S balance, so their
    ///    derivative zeros do not coincide and the velocity stays positive
    ///    across the complex.
    fn frame(qrs_ms: f64, t_amp: f32, q: f32, r_amp: f32, s: f32) -> Vec<f32> {
        let r = r_index(FS);
        let half = (qrs_ms / 1000.0 * FS) as f32 / 2.0;
        (0..FRAME_N)
            .map(|i| {
                let d = i as f32 - r as f32;
                let qrs = lobe(d, -0.55 * half, 0.45 * half, q)
                    + lobe(d, -0.05 * half, 0.60 * half, r_amp)
                    + lobe(d, 0.50 * half, 0.50 * half, s);
                let t = t_amp
                    * (-0.5 * ((d - 0.21 * FS as f32) / (0.048 * FS as f32)).powi(2)).exp();
                qrs + t
            })
            .collect()
    }

    /// Per-lead (Q, R, S) amplitudes standing in for the twelve lead axes,
    /// including aVR's predominantly negative complex and the precordial
    /// rS-to-qR progression.
    const MORPH: [(f32, f32, f32); 12] = [
        (-0.05, 0.62, -0.06), // I
        (-0.05, 1.05, -0.08), // II
        (-0.02, 0.45, -0.05), // III
        (0.04, -0.80, 0.05),  // aVR
        (-0.04, 0.30, -0.04), // aVL
        (-0.03, 0.70, -0.06), // aVF
        (0.00, 0.18, -0.95),  // V1  rS
        (0.00, 0.35, -1.35),  // V2
        (-0.02, 0.72, -0.78), // V3  transition
        (-0.05, 1.35, -0.35), // V4
        (-0.07, 1.42, -0.14), // V5
        (-0.06, 1.10, -0.07), // V6  qR
    ];

    fn twelve(qrs_ms: f64, t_amp: f32) -> (Vec<Vec<f32>>, Vec<f32>) {
        (
            MORPH
                .iter()
                .map(|&(q, r, s)| frame(qrs_ms, t_amp * r.abs().max(0.2), q, r, s))
                .collect(),
            vec![1.0; 12],
        )
    }

    #[test]
    fn qrs_boundaries_bracket_the_complex() {
        let (leads, w) = twelve(100.0, 0.35);
        let (on, off, _) = qrs_boundaries(&leads, &w, r_index(FS), FS);
        let on = on.expect("no onset");
        let off = off.expect("no offset");
        let r = r_index(FS);
        assert!(on < r && off > r, "onset {on}, R {r}, offset {off}");
        let dur = (off - on) as f64 / FS * 1000.0;
        assert!(
            (60.0..170.0).contains(&dur),
            "duration {dur} ms implausible for a 100 ms QRS"
        );
    }

    #[test]
    fn a_wider_qrs_reads_as_wider() {
        let (narrow, w) = twelve(80.0, 0.35);
        let (wide, _) = twelve(150.0, 0.35);
        let fn_ = fiducials(&narrow, &w, &narrow[1], FS, 0.0);
        let fw = fiducials(&wide, &w, &wide[1], FS, 0.0);
        let dn = fn_.qrs_duration_ms(FS).expect("narrow");
        let dw = fw.qrs_duration_ms(FS).expect("wide");
        assert!(dw > dn + 20.0, "wide {dw} ms not clearly above narrow {dn} ms");
    }

    #[test]
    fn the_fiducial_does_not_move_with_lead_scaling() {
        // The whole point of a global fiducial: a pure axis change rescales the
        // leads without changing when activation starts. A per-lead onset would
        // move here and manufacture a QRS-duration change.
        let (base, w) = twelve(100.0, 0.35);
        let rescaled: Vec<Vec<f32>> = base
            .iter()
            .enumerate()
            .map(|(i, l)| {
                let k = if i % 2 == 0 { 0.4 } else { 1.6 };
                l.iter().map(|v| v * k).collect()
            })
            .collect();

        let a = qrs_boundaries(&base, &w, r_index(FS), FS).0.unwrap();
        let b = qrs_boundaries(&rescaled, &w, r_index(FS), FS).0.unwrap();
        assert!(
            (a as i64 - b as i64).abs() <= 2,
            "onset moved from {a} to {b} under pure rescaling"
        );
    }

    #[test]
    fn too_few_leads_is_unmeasurable_not_a_guess() {
        let (leads, _) = twelve(100.0, 0.35);
        let mut w = vec![0.0f32; 12];
        w[0] = 1.0;
        w[1] = 1.0;
        let (on, off, _) = qrs_boundaries(&leads, &w, r_index(FS), FS);
        assert_eq!(on.unwrap_err(), Unmeasurable::TooFewLeads);
        assert_eq!(off.unwrap_err(), Unmeasurable::TooFewLeads);
    }

    #[test]
    fn a_flat_record_yields_no_activation() {
        let leads = vec![vec![0.0f32; FRAME_N]; 12];
        let w = vec![1.0f32; 12];
        let (on, _, _) = qrs_boundaries(&leads, &w, r_index(FS), FS);
        assert!(on.is_err());
    }

    // ---- T offset ----------------------------------------------------------

    #[test]
    fn t_offset_lands_after_the_t_peak() {
        let (leads, w) = twelve(100.0, 0.40);
        let f = fiducials(&leads, &w, &leads[0], FS, 0.0);
        let t = f.t_offset.expect("no T offset");
        let t_peak = r_index(FS) + (0.21 * FS) as usize;
        assert!(t > t_peak, "T offset {t} is not after the peak {t_peak}");
        assert!(t < FRAME_N, "T offset ran off the frame");
    }

    #[test]
    fn qt_is_plausible() {
        let (leads, w) = twelve(100.0, 0.40);
        let f = fiducials(&leads, &w, &leads[0], FS, 0.0);
        let qt = f.qt_ms(FS).expect("no QT");
        assert!((280.0..520.0).contains(&qt), "QT {qt} ms implausible");
    }

    #[test]
    fn a_flat_t_returns_no_number() {
        // The failure that matters: guessing a T end on a flat T fabricates a QT
        // and then a QTc, and QTc change is a reported serial finding.
        let (leads, w) = twelve(100.0, 0.005);
        let f = fiducials(&leads, &w, &leads[0], FS, 0.0);
        assert_eq!(f.t_offset.unwrap_err(), Unmeasurable::FlatT);
        assert!(f.qt_ms(FS).is_none(), "a QT was produced from a flat T");
    }

    #[test]
    fn an_inverted_t_is_still_measurable() {
        // T inversion is a finding, not an error; the tangent must follow the
        // wave back toward baseline whichever side it left from.
        let (mut leads, w) = twelve(100.0, 0.40);
        let r = r_index(FS);
        for l in leads.iter_mut() {
            let from = r + (0.10 * FS) as usize;
            for (i, v) in l.iter_mut().enumerate().skip(from) {
                let d = i as f32 - (r as f32 + 0.21 * FS as f32);
                let g = 0.40 * (-0.5 * (d / (0.048 * FS as f32)).powi(2)).exp();
                *v -= 2.0 * g; // flip the T
            }
        }
        let f = fiducials(&leads, &w, &leads[0], FS, 0.0);
        assert!(f.t_offset.is_ok(), "inverted T reported {:?}", f.t_offset);
    }

    #[test]
    fn fiducial_failure_propagates_rather_than_being_papered_over() {
        let leads = vec![vec![0.0f32; FRAME_N]; 12];
        let w = vec![1.0f32; 12];
        let f = fiducials(&leads, &w, &leads[0], FS, 0.0);
        assert!(f.qrs_onset.is_err());
        assert!(f.t_offset.is_err(), "a T offset appeared without a QRS offset");
        assert!(f.qrs_duration_ms(FS).is_none());
        assert!(f.qt_ms(FS).is_none());
    }

    #[test]
    fn sg_derivative_is_zero_on_a_constant_and_linear_on_a_ramp() {
        let flat = vec![0.7f32; 50];
        assert!(sg_derivative(&flat, 3).iter().all(|d| d.abs() < 1e-6));

        let ramp: Vec<f32> = (0..50).map(|i| i as f32 * 0.25).collect();
        let d = sg_derivative(&ramp, 3);
        for v in &d[5..45] {
            assert!((v - 0.25).abs() < 1e-4, "slope {v} should be 0.25");
        }
    }
}


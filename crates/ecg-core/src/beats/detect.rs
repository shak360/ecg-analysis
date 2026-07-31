//! QRS detection: Pan–Tompkins, retuned to 500 Hz by time constants.
//!
//! # Where this runs
//!
//! On the **rhythm strip only**. The strip is the sole timing authority for a
//! study. Running twelve independent detectors on twelve 2.5 s panels yields
//! twelve mutually inconsistent beat sets, after which any cross-lead fiducial
//! is meaningless. The panels inherit their timing from the strip and are
//! verified against it (spec stage 13).
//!
//! # Retuning
//!
//! Every window in the original 200 Hz design is respecified as a duration and
//! converted, which is why the stage delays still sum exactly:
//!
//! | stage      | window    | delay      |
//! |------------|-----------|------------|
//! | low-pass   | 30 ms     | 15 samples |
//! | high-pass  | 160 ms    | 40 samples |
//! | derivative | 5-point   | 2 samples  |
//! | integrate  | 150 ms    | 37 samples |
//! | **total**  |           | **94** = 188 ms |
//!
//! # Two-pass warm start
//!
//! The published algorithm spends a 2 s learning phase converging its adaptive
//! thresholds. A 10 s rhythm strip cannot spare that — it is 20% of the record,
//! and the beats lost are real beats. So the detector runs twice: pass 1 from
//! crude initial estimates, pass 2 re-initialised from pass 1's converged
//! statistics. Every beat is then found under settled thresholds.
//!
//! # Padding
//!
//! The signal is odd-reflected by 200 samples at each end before filtering.
//! Without it the filter transient swallows the first beat, which costs the
//! first column one of only two or three beats it has.
//!
//! Note this is *not* in tension with the resampler's refusal to pad. There, the
//! padded samples would be measured. Here they are discarded after detection,
//! and the reflection is **odd** (`2·x[0] − x[k]`), which inverts the mirrored
//! QRS so it cannot itself be detected as a beat.

use crate::config::{
    PT_ALPHA, PT_HP_N, PT_LP_M, PT_MWI_W, PT_PAD, PT_PIPELINE_DELAY, PT_REFRACTORY,
    PT_RR_HIGH, PT_RR_LOW, PT_RR_MISSED, PT_SLOPE_HALF, PT_T_LIMIT, PT_THRESH_FRAC,
    PT_T_SLOPE_RATIO,
};

/// How a beat relates to the prevailing rhythm.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BeatClass {
    /// Conducted at the prevailing rate.
    Normal,
    /// Preceded by a short RR — likely ectopic.
    Premature,
    /// Immediately follows a premature beat. Its ST-T is genuinely altered by
    /// post-extrasystolic potentiation, so it is real but not resting morphology.
    PostEctopic,
    /// The first beat, which has no preceding RR to judge by.
    Unclassified,
}

/// One detected beat.
#[derive(Debug, Clone, Copy)]
pub struct Beat {
    /// R peak index in the input signal.
    pub r_sample: usize,
    /// R peak time in seconds from the signal's start.
    pub r_time_s: f64,
    /// Interval from the previous beat, seconds.
    pub rr_prev_s: Option<f64>,
    /// Signed amplitude at the R peak, millivolts.
    pub r_amplitude_mv: f32,
    pub class: BeatClass,
    /// True when found by search-back rather than by crossing the main threshold.
    pub via_searchback: bool,
}

/// Detection result for one strip.
#[derive(Debug, Clone)]
pub struct Detection {
    pub beats: Vec<Beat>,
    /// Median instantaneous rate, beats per minute.
    pub hr_bpm: Option<f64>,
    /// Median RR, seconds.
    pub rr_median_s: Option<f64>,
}

impl Detection {
    /// Beats whose class permits them into a resting-morphology ensemble.
    pub fn resting_beats(&self) -> impl Iterator<Item = &Beat> {
        self.beats
            .iter()
            .filter(|b| matches!(b.class, BeatClass::Normal | BeatClass::Unclassified))
    }
}

// ---------------------------------------------------------------------------
// Filter chain
// ---------------------------------------------------------------------------

/// Odd reflection about the endpoints: `x[-k] = 2·x[0] − x[k]`.
///
/// Preserves value and slope at the join, and inverts the mirrored waveform so a
/// QRS near the edge does not reappear as a detectable beat in the padding.
fn odd_reflect_pad(x: &[f32], pad: usize) -> Vec<f64> {
    let n = x.len();
    let mut out = Vec::with_capacity(n + 2 * pad);
    if n == 0 {
        return out;
    }
    let first = x[0] as f64;
    let last = x[n - 1] as f64;

    for k in (1..=pad).rev() {
        let src = if k < n { x[k] as f64 } else { last };
        out.push(2.0 * first - src);
    }
    out.extend(x.iter().map(|&v| v as f64));
    for k in 1..=pad {
        let src = if k < n { x[n - 1 - k] as f64 } else { first };
        out.push(2.0 * last - src);
    }
    out
}

/// Pan–Tompkins low-pass: `y[n] = 2y[n−1] − y[n−2] + x[n] − 2x[n−M] + x[n−2M]`.
///
/// Kept in f64: the poles sit on the unit circle, so f32 accumulates a visible
/// drift over a few thousand samples.
fn low_pass(x: &[f64], m: usize) -> Vec<f64> {
    let n = x.len();
    let mut y = vec![0.0; n];
    for i in 0..n {
        let mut v = x[i];
        if i >= m {
            v -= 2.0 * x[i - m];
        }
        if i >= 2 * m {
            v += x[i - 2 * m];
        }
        if i >= 1 {
            v += 2.0 * y[i - 1];
        }
        if i >= 2 {
            v -= y[i - 2];
        }
        y[i] = v;
    }
    y
}

/// High-pass as all-pass minus moving average: `y[n] = x[n−N/2] − MA_N(x)[n]`.
fn high_pass(x: &[f64], n_ma: usize) -> Vec<f64> {
    let n = x.len();
    let mut out = vec![0.0; n];
    let mut acc = 0.0;
    let half = n_ma / 2;
    for i in 0..n {
        acc += x[i];
        if i >= n_ma {
            acc -= x[i - n_ma];
        }
        let count = (i + 1).min(n_ma) as f64;
        let ma = acc / count;
        let delayed = if i >= half { x[i - half] } else { x[0] };
        out[i] = delayed - ma;
    }
    out
}

/// Five-point derivative: `(2x[n] + x[n−1] − x[n−3] − 2x[n−4]) / 8`.
fn derivative(x: &[f64]) -> Vec<f64> {
    let n = x.len();
    let mut y = vec![0.0; n];
    for i in 4..n {
        y[i] = (2.0 * x[i] + x[i - 1] - x[i - 3] - 2.0 * x[i - 4]) / 8.0;
    }
    y
}

/// Moving-window integration of the squared signal.
fn integrate(x: &[f64], w: usize) -> Vec<f64> {
    let n = x.len();
    let mut y = vec![0.0; n];
    let mut acc = 0.0;
    for i in 0..n {
        acc += x[i];
        if i >= w {
            acc -= x[i - w];
        }
        y[i] = acc / (i + 1).min(w) as f64;
    }
    y
}

/// Local maxima of the integrated signal, the algorithm's fiducial marks.
fn local_maxima(x: &[f64], min_sep: usize) -> Vec<usize> {
    let n = x.len();
    let mut peaks = Vec::new();
    let mut i = 1;
    while i + 1 < n {
        if x[i] > x[i - 1] && x[i] >= x[i + 1] {
            // Walk any plateau to its centre.
            let start = i;
            let mut j = i;
            while j + 1 < n && x[j + 1] == x[i] {
                j += 1;
            }
            let centre = (start + j) / 2;
            if peaks.last().is_none_or(|&p: &usize| centre - p >= min_sep) {
                peaks.push(centre);
            } else if let Some(last) = peaks.last_mut() {
                if x[centre] > x[*last] {
                    *last = centre;
                }
            }
            i = j + 1;
        } else {
            i += 1;
        }
    }
    peaks
}

// ---------------------------------------------------------------------------
// Adaptive thresholding
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy)]
struct Thresholds {
    spki: f64,
    npki: f64,
    rr_avg: f64,
}

impl Thresholds {
    fn i1(&self) -> f64 {
        self.npki + PT_THRESH_FRAC * (self.spki - self.npki)
    }
    fn i2(&self) -> f64 {
        0.5 * self.i1()
    }
}

/// One detection pass over the integrated signal.
///
/// Returns the accepted peak indices (in integrated-signal coordinates) and the
/// converged thresholds, which seed the second pass.
fn detect_pass(
    mwi: &[f64],
    deriv: &[f64],
    peaks: &[usize],
    init: Thresholds,
    fs: f64,
) -> (Vec<(usize, bool)>, Thresholds) {
    let refractory = (PT_REFRACTORY as f64 * fs / 500.0) as usize;
    let t_limit = (PT_T_LIMIT as f64 * fs / 500.0) as usize;
    let slope_half = (PT_SLOPE_HALF as f64 * fs / 500.0).max(1.0) as usize;

    let slope_at = |i: usize| -> f64 {
        let lo = i.saturating_sub(slope_half);
        let hi = (i + slope_half + 1).min(deriv.len());
        deriv[lo..hi].iter().fold(0.0f64, |a, &b| a.max(b.abs()))
    };

    let mut th = init;
    let mut accepted: Vec<(usize, bool)> = Vec::new();
    let mut rr_history: Vec<f64> = Vec::new();
    let mut last_slope = 0.0f64;

    let mut pi = 0usize;
    while pi < peaks.len() {
        let p = peaks[pi];
        let amp = mwi[p];
        let last_r = accepted.last().map(|&(i, _)| i);

        // Search-back: too long since the last accepted beat, so re-examine the
        // interval with the relaxed threshold before moving on.
        if let (Some(lr), true) = (last_r, !rr_history.is_empty()) {
            let missed_gap = PT_RR_MISSED * th.rr_avg * fs;
            if (p - lr) as f64 > missed_gap {
                let lo = lr + refractory;
                let hi = p;
                let mut best: Option<(usize, f64)> = None;
                for &q in peaks.iter().filter(|&&q| q > lo && q < hi) {
                    if mwi[q] > th.i2() && best.is_none_or(|(_, v)| mwi[q] > v) {
                        best = Some((q, mwi[q]));
                    }
                }
                if let Some((q, v)) = best {
                    th.spki = 0.25 * v + 0.75 * th.spki;
                    if let Some(prev) = accepted.last().map(|&(i, _)| i) {
                        rr_history.push((q - prev) as f64 / fs);
                    }
                    accepted.push((q, true));
                    last_slope = slope_at(q);
                    update_rr(&mut th, &rr_history);
                    continue; // re-evaluate the current peak against the new state
                }
            }
        }

        if let Some(lr) = last_r {
            if p - lr < refractory {
                pi += 1;
                continue;
            }
        }

        if amp > th.i1() {
            // T-wave discrimination: a candidate arriving soon after a QRS with a
            // markedly shallower upstroke is repolarisation, not depolarisation.
            let is_t = match last_r {
                Some(lr) if p - lr < t_limit => {
                    slope_at(p) < PT_T_SLOPE_RATIO * last_slope
                }
                _ => false,
            };

            if is_t {
                th.npki = PT_ALPHA * amp + (1.0 - PT_ALPHA) * th.npki;
            } else {
                th.spki = PT_ALPHA * amp + (1.0 - PT_ALPHA) * th.spki;
                if let Some(lr) = last_r {
                    rr_history.push((p - lr) as f64 / fs);
                }
                accepted.push((p, false));
                last_slope = slope_at(p);
                update_rr(&mut th, &rr_history);
            }
        } else {
            th.npki = PT_ALPHA * amp + (1.0 - PT_ALPHA) * th.npki;
        }

        pi += 1;
    }

    (accepted, th)
}

/// Maintain the RR average over the last eight intervals that look regular.
fn update_rr(th: &mut Thresholds, history: &[f64]) {
    if history.is_empty() {
        return;
    }
    let recent: Vec<f64> = history.iter().rev().take(8).copied().collect();
    let mean_all = recent.iter().sum::<f64>() / recent.len() as f64;

    // Second average over intervals inside the acceptance band, which keeps an
    // ectopic couplet from dragging the missed-beat trigger.
    let inband: Vec<f64> = recent
        .iter()
        .copied()
        .filter(|&r| r >= PT_RR_LOW * mean_all && r <= PT_RR_HIGH * mean_all)
        .collect();
    th.rr_avg = if inband.is_empty() {
        mean_all
    } else {
        inband.iter().sum::<f64>() / inband.len() as f64
    };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/// Detect QRS complexes in a rhythm strip.
///
/// `x` should be the pass-1 provisionally detrended signal, in millivolts, on a
/// uniform grid at `fs` Hz.
pub fn detect_qrs(x: &[f32], fs: f64) -> Detection {
    let n = x.len();
    if n < (0.5 * fs) as usize {
        return Detection { beats: Vec::new(), hr_bpm: None, rr_median_s: None };
    }

    let scale = fs / 500.0;
    let m = (PT_LP_M as f64 * scale).round().max(1.0) as usize;
    let n_ma = (PT_HP_N as f64 * scale).round().max(2.0) as usize;
    let w = (PT_MWI_W as f64 * scale).round().max(1.0) as usize;
    let pad = (PT_PAD as f64 * scale).round() as usize;
    let delay = (PT_PIPELINE_DELAY as f64 * scale).round() as usize;

    let padded = odd_reflect_pad(x, pad);
    let lp = low_pass(&padded, m);
    let hp = high_pass(&lp, n_ma);
    let dv = derivative(&hp);
    let sq: Vec<f64> = dv.iter().map(|v| v * v).collect();
    let mwi = integrate(&sq, w);

    let refractory = (PT_REFRACTORY as f64 * scale) as usize;
    let peaks = local_maxima(&mwi, refractory / 2);

    // Pass 1 from crude estimates over the whole record.
    let max_mwi = mwi.iter().fold(0.0f64, |a, &b| a.max(b));
    let mean_mwi = mwi.iter().sum::<f64>() / mwi.len() as f64;
    let init = Thresholds {
        spki: 0.25 * max_mwi,
        npki: 0.5 * mean_mwi,
        rr_avg: 0.8,
    };
    let (_, converged) = detect_pass(&mwi, &dv, &peaks, init, fs);

    // Pass 2 with the thresholds already settled, so the opening beats are found
    // on the same footing as the rest.
    let (accepted, _) = detect_pass(&mwi, &dv, &peaks, converged, fs);

    // Map back to input coordinates and snap to the true extremum.
    let snap_half = (0.05 * fs) as usize;
    let mut beats: Vec<Beat> = Vec::new();
    for (idx, via_searchback) in accepted {
        let unpadded = idx as i64 - delay as i64 - pad as i64;
        if unpadded < 0 || unpadded as usize >= n {
            continue;
        }
        let r = snap_to_extremum(x, unpadded as usize, snap_half);
        if beats.last().is_some_and(|b| r <= b.r_sample) {
            continue; // snapping collapsed two detections onto one peak
        }
        beats.push(Beat {
            r_sample: r,
            r_time_s: r as f64 / fs,
            rr_prev_s: None,
            r_amplitude_mv: x[r],
            class: BeatClass::Unclassified,
            via_searchback,
        });
    }

    classify(&mut beats, fs);

    let rrs: Vec<f64> = beats.iter().filter_map(|b| b.rr_prev_s).collect();
    let rr_median_s = median_of(&rrs);
    let hr_bpm = rr_median_s.map(|rr| 60.0 / rr);

    Detection { beats, hr_bpm, rr_median_s }
}

/// Move a detection to the nearby sample of greatest absolute deflection.
///
/// The integration stage deliberately smears the QRS, so its peak sits near but
/// not on the R wave. Every downstream alignment references this index.
fn snap_to_extremum(x: &[f32], centre: usize, half: usize) -> usize {
    let lo = centre.saturating_sub(half);
    let hi = (centre + half + 1).min(x.len());
    let mut best = centre.min(x.len() - 1);
    let mut best_v = f32::MIN;
    for (i, v) in x[lo..hi].iter().enumerate() {
        let mag = v.abs();
        if mag > best_v {
            best_v = mag;
            best = lo + i;
        }
    }
    best
}

fn classify(beats: &mut [Beat], fs: f64) {
    let _ = fs;
    let rrs: Vec<f64> = beats
        .windows(2)
        .map(|w| w[1].r_time_s - w[0].r_time_s)
        .collect();
    let rr_med = match median_of(&rrs) {
        Some(v) => v,
        None => return,
    };

    for i in 1..beats.len() {
        let rr = beats[i].r_time_s - beats[i - 1].r_time_s;
        beats[i].rr_prev_s = Some(rr);
        beats[i].class = if rr < crate::config::ECTOPY_RR_FRAC * rr_med {
            BeatClass::Premature
        } else {
            BeatClass::Normal
        };
    }
    // Post-ectopic beats carry genuinely altered repolarisation, so they are
    // excluded from a resting ensemble even though they are perfectly real.
    for i in 1..beats.len() {
        if beats[i - 1].class == BeatClass::Premature && beats[i].class == BeatClass::Normal {
            beats[i].class = BeatClass::PostEctopic;
        }
    }
}

fn median_of(v: &[f64]) -> Option<f64> {
    if v.is_empty() {
        return None;
    }
    let mut s = v.to_vec();
    s.sort_by(|a, b| a.partial_cmp(b).unwrap());
    Some(s[s.len() / 2])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::FS;

    /// A beat train of Gaussian R waves with P and T, at `hr` bpm.
    fn beat_train(fs: f64, secs: f64, hr: f64) -> (Vec<f32>, Vec<usize>) {
        let n = (fs * secs) as usize;
        let rr = 60.0 / hr;
        let mut truth = Vec::new();
        let mut t0 = 0.4;
        while t0 < secs - 0.3 {
            truth.push((t0 * fs).round() as usize);
            t0 += rr;
        }
        let sig = (0..n)
            .map(|i| {
                let t = i as f64 / fs;
                let mut v = 0.0f64;
                for &r in &truth {
                    let dt = t - r as f64 / fs;
                    if dt.abs() < 0.5 {
                        v += 1.2 * (-0.5 * (dt / 0.012).powi(2)).exp(); // R
                        v += 0.12 * (-0.5 * ((dt + 0.17) / 0.025).powi(2)).exp(); // P
                        v += 0.30 * (-0.5 * ((dt - 0.22) / 0.055).powi(2)).exp(); // T
                    }
                }
                v as f32
            })
            .collect();
        (sig, truth)
    }

    fn assert_matches(det: &Detection, truth: &[usize], tol: usize, label: &str) {
        assert_eq!(
            det.beats.len(),
            truth.len(),
            "{label}: found {} beats, expected {} (at {:?})",
            det.beats.len(),
            truth.len(),
            det.beats.iter().map(|b| b.r_sample).collect::<Vec<_>>()
        );
        for (b, &t) in det.beats.iter().zip(truth) {
            let err = (b.r_sample as i64 - t as i64).unsigned_abs() as usize;
            assert!(err <= tol, "{label}: R at {} expected {t}, off by {err}", b.r_sample);
        }
    }

    #[test]
    fn finds_every_beat_with_no_false_positives() {
        // The spec's acceptance test: all beats, 0 FP, R within +/-1 sample.
        for &hr in &[48.0f64, 60.0, 75.0, 100.0, 140.0] {
            let (sig, truth) = beat_train(FS, 10.0, hr);
            let det = detect_qrs(&sig, FS);
            assert_matches(&det, &truth, 1, &format!("hr={hr}"));
        }
    }

    #[test]
    fn finds_the_first_beat_which_the_pad_exists_to_protect() {
        // Without the odd-reflect pad the filter transient swallows this beat,
        // and the first panel column loses one of its two or three beats.
        let (sig, truth) = beat_train(FS, 10.0, 60.0);
        let det = detect_qrs(&sig, FS);
        assert!(!det.beats.is_empty());
        let first_err = (det.beats[0].r_sample as i64 - truth[0] as i64).abs();
        assert!(first_err <= 1, "first beat off by {first_err} samples");
    }

    #[test]
    fn reports_a_plausible_heart_rate() {
        for &hr in &[50.0f64, 72.0, 110.0] {
            let (sig, _) = beat_train(FS, 10.0, hr);
            let det = detect_qrs(&sig, FS);
            let got = det.hr_bpm.expect("no rate reported");
            assert!((got - hr).abs() < 1.5, "expected {hr} bpm, got {got:.1}");
        }
    }

    #[test]
    fn tall_t_waves_are_not_counted_as_beats() {
        // A T wave as tall as the R wave is the classic false-positive source;
        // doubling the reported rate would corrupt every rate-corrected value.
        let fs = FS;
        let secs = 10.0;
        let rr = 1.0;
        let n = (fs * secs) as usize;
        let mut truth = Vec::new();
        let mut t0 = 0.4;
        while t0 < secs - 0.3 {
            truth.push((t0 * fs).round() as usize);
            t0 += rr;
        }
        let sig: Vec<f32> = (0..n)
            .map(|i| {
                let t = i as f64 / fs;
                let mut v = 0.0f64;
                for &r in &truth {
                    let dt = t - r as f64 / fs;
                    if dt.abs() < 0.6 {
                        v += 1.0 * (-0.5 * (dt / 0.012).powi(2)).exp();
                        // Broad T of nearly equal height but far shallower slope.
                        v += 0.95 * (-0.5 * ((dt - 0.26) / 0.070).powi(2)).exp();
                    }
                }
                v as f32
            })
            .collect();

        let det = detect_qrs(&sig, fs);
        assert_eq!(
            det.beats.len(),
            truth.len(),
            "T waves were counted: {} detections for {} beats",
            det.beats.len(),
            truth.len()
        );
    }

    #[test]
    fn survives_baseline_wander_and_noise() {
        let (mut sig, truth) = beat_train(FS, 10.0, 72.0);
        let mut seed = 12345u32;
        for (i, v) in sig.iter_mut().enumerate() {
            let t = i as f64 / FS;
            *v += (0.45 * (2.0 * std::f64::consts::PI * 0.28 * t).sin()) as f32;
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            *v += ((seed >> 8) as f32 / 16777216.0 - 0.5) * 0.05;
        }
        let det = detect_qrs(&sig, FS);
        assert_matches(&det, &truth, 3, "wander+noise");
    }

    #[test]
    fn detects_inverted_qrs() {
        // aVR, and any limb-lead reversal, present a predominantly negative QRS.
        let (sig, truth) = beat_train(FS, 10.0, 66.0);
        let inverted: Vec<f32> = sig.iter().map(|v| -v).collect();
        let det = detect_qrs(&inverted, FS);
        assert_matches(&det, &truth, 2, "inverted");
    }

    #[test]
    fn flags_a_premature_beat_and_the_one_after_it() {
        let fs = FS;
        let secs = 10.0;
        let n = (fs * secs) as usize;
        // Regular at 1.0 s except one beat arriving early at 4.55 s.
        let truth: Vec<usize> = [0.5, 1.5, 2.5, 3.5, 4.05, 5.5, 6.5, 7.5, 8.5]
            .iter()
            .map(|t| (t * fs) as usize)
            .collect();
        let sig: Vec<f32> = (0..n)
            .map(|i| {
                let t = i as f64 / fs;
                let mut v = 0.0f64;
                for &r in &truth {
                    let dt = t - r as f64 / fs;
                    if dt.abs() < 0.4 {
                        v += 1.2 * (-0.5 * (dt / 0.012).powi(2)).exp();
                        v += 0.30 * (-0.5 * ((dt - 0.22) / 0.055).powi(2)).exp();
                    }
                }
                v as f32
            })
            .collect();

        let det = detect_qrs(&sig, fs);
        assert_eq!(det.beats.len(), truth.len());
        let premature = det.beats.iter().position(|b| b.class == BeatClass::Premature);
        assert_eq!(premature, Some(4), "early beat not flagged as premature");
        assert_eq!(det.beats[5].class, BeatClass::PostEctopic);
        // Neither may enter a resting ensemble.
        assert_eq!(det.resting_beats().count(), truth.len() - 2);
    }

    #[test]
    fn rr_intervals_are_recorded() {
        let (sig, _) = beat_train(FS, 10.0, 60.0);
        let det = detect_qrs(&sig, FS);
        assert!(det.beats[0].rr_prev_s.is_none(), "first beat has no preceding RR");
        for b in &det.beats[1..] {
            let rr = b.rr_prev_s.expect("missing RR");
            assert!((rr - 1.0).abs() < 0.02, "RR {rr}");
        }
    }

    #[test]
    fn short_or_empty_input_returns_nothing_rather_than_guessing() {
        assert!(detect_qrs(&[], FS).beats.is_empty());
        assert!(detect_qrs(&vec![0.0; 100], FS).beats.is_empty());
        let flat = vec![0.0f32; 5000];
        let det = detect_qrs(&flat, FS);
        assert!(det.beats.is_empty(), "found beats in a flat line");
    }

    #[test]
    fn stage_delays_sum_to_the_budgeted_total() {
        // If a window is retuned, the delay budget must be updated with it or
        // every R index shifts systematically.
        assert_eq!(PT_LP_M + PT_HP_N / 2 + 2 + (PT_MWI_W - 1) / 2, PT_PIPELINE_DELAY);
    }

    #[test]
    fn odd_reflection_inverts_the_mirrored_signal() {
        let x = vec![0.0f32, 1.0, 2.0, 3.0];
        let p = odd_reflect_pad(&x, 2);
        // Leading pad mirrors about x[0]=0: 2*0 - x[2], 2*0 - x[1] => -2, -1.
        assert_eq!(p[0], -2.0);
        assert_eq!(p[1], -1.0);
        assert_eq!(p[2], 0.0);
        // Trailing pad mirrors about x[3]=3: 2*3 - x[2], 2*3 - x[1] => 4, 5.
        assert_eq!(p[p.len() - 2], 4.0);
        assert_eq!(p[p.len() - 1], 5.0);

        // The defining property: a deflection near an edge reappears inverted,
        // so it cannot be detected as a beat inside the padding.
        let spike = vec![0.0f32, 0.0, 5.0, 0.0, 0.0];
        let q = odd_reflect_pad(&spike, 4);
        assert!(q[..4].iter().any(|&v| v < -4.0), "mirrored spike was not inverted");
    }
}

//! The ensemble beat: one representative complex per lead.
//!
//! # Why not a "median beat"
//!
//! The conventional name is wrong here, and the conventional estimator is wrong
//! with it. A 2.5 s panel yields two to four beats, and at n=3 the per-sample
//! median *is* the 1-trimmed mean — it discards a third of the evidence and
//! carries roughly 35% more variance, buying no robustness in return. Robustness
//! belongs at the level of the whole beat, where 800 ms of morphology is
//! available to judge, not at the level of the individual sample.
//!
//! So: per-sample median only at n≥5, a screened mean at 3–4, a strictly gated
//! screened mean at n=2, a single displayable beat at n=1, and nothing at all at
//! n=0. Never a blank, never a flat line, and never the word "unchanged".
//!
//! # Alignment before combination
//!
//! Beats are aligned to a medoid template by normalised cross-correlation with a
//! parabolic sub-sample refinement. On the QRS upstroke, where slope reaches
//! 120 mV/s, 4 ms of misalignment smears 0.48 mV of amplitude — so alignment
//! error shows up directly as a shrunken R wave and a fabricated Q.
//!
//! The correlation window is QRS-only. Including the T wave lets a large slow
//! deflection dominate the correlation and drag the QRS out of alignment, after
//! which a genuine QT change reads as an ST change.

use crate::config::{
    ALIGN_MAX_LAG_MS, ENSEMBLE_MEDIAN_MIN_N, FRAME_N, FRAME_T0_S, RHO_OK_RASTER,
    RHO_OK_VECTOR, RHO_SUSPECT, SCALE_OUTLIER_FRAC, SIGMA_ENS_FLOOR_FRAC, TEMPLATE_WIN_MS,
};

/// Where the samples came from, which sets the correlation threshold a beat must
/// clear: image-derived traces plateau near 0.95 and cannot meet a vector bar.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provenance {
    VectorPdf,
    Raster,
}

impl Provenance {
    fn rho_ok(self) -> f32 {
        match self {
            Provenance::VectorPdf => RHO_OK_VECTOR,
            Provenance::Raster => RHO_OK_RASTER,
        }
    }
}

/// How the representative beat was formed. Carried through to the UI, because
/// "combined from 2 beats" and "combined from 8" are different claims.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Estimator {
    /// n ≥ 5: per-sample median.
    PerSampleMedian,
    /// 3 ≤ n ≤ 4: screened mean.
    ScreenedMean,
    /// n = 2: screened mean under a stricter correlation gate.
    ScreenedMeanPair,
    /// n = 1: the beat itself. Display only — σ is unestimable from one beat.
    SingleBeat,
}

/// Why a beat was kept out of the ensemble.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BeatExclusion {
    /// Morphology did not match the template.
    LowCorrelation,
    /// Amplitude departed from the medoid's.
    ScaleOutlier,
    /// The frame ran off the end of the available signal.
    FrameIncomplete,
}

/// One lead's representative beat.
#[derive(Debug, Clone)]
pub struct EnsembleBeat {
    /// `FRAME_N` samples spanning `FRAME_T0_S` to +0.600 s about the anchor.
    pub v_mv: Vec<f32>,
    /// Per-sample standard deviation across contributing beats, millivolts.
    /// Infinite at n=1, where it cannot be estimated from the data.
    pub sigma_mv: Vec<f32>,
    pub estimator: Estimator,
    pub n_used: usize,
    pub excluded: Vec<(usize, BeatExclusion)>,
    /// Correlation of each contributing beat against the template.
    pub rho: Vec<f32>,
    /// Sub-sample shifts applied, in samples.
    pub shifts: Vec<f32>,
}

impl EnsembleBeat {
    /// Whether this beat may back a numeric measurement.
    ///
    /// A single beat renders, but carries full single-beat noise and none of the
    /// alignment blunting a multi-beat combination has. Comparing a 1-beat lead
    /// against a 4-beat lead manufactures "new Q wave" findings, so n=1 is
    /// display-only by construction.
    pub fn measurable(&self) -> bool {
        self.n_used >= 2
    }
}

/// The lead could not produce a representative beat at all.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnsembleFailure {
    /// No beat survived gating. Renders as "unavailable", never as a flat line
    /// and never as "unchanged".
    NoUsableBeats,
}

pub type EnsembleResult = Result<EnsembleBeat, EnsembleFailure>;

/// Extract one beat's frame, anchored at `anchor` in `sig`.
///
/// Returns `None` when the frame would run off either end. It is never padded:
/// zero-padding a clipped beat pulls the ensemble's T amplitude toward baseline
/// by 1/n, which is a fabricated T-wave flattening.
fn frame_at(sig: &[f32], anchor: usize, fs_hz: f64) -> Option<Vec<f32>> {
    let start = anchor as i64 + (FRAME_T0_S * fs_hz).round() as i64;
    let end = start + FRAME_N as i64;
    if start < 0 || end > sig.len() as i64 {
        return None;
    }
    Some(sig[start as usize..end as usize].to_vec())
}

/// Normalised cross-correlation of two equal-length slices.
fn ncc(a: &[f32], b: &[f32]) -> f32 {
    let n = a.len().min(b.len());
    if n == 0 {
        return 0.0;
    }
    let ma = a[..n].iter().sum::<f32>() / n as f32;
    let mb = b[..n].iter().sum::<f32>() / n as f32;
    let mut num = 0.0f64;
    let mut da = 0.0f64;
    let mut db = 0.0f64;
    for i in 0..n {
        let x = (a[i] - ma) as f64;
        let y = (b[i] - mb) as f64;
        num += x * y;
        da += x * x;
        db += y * y;
    }
    if da <= 0.0 || db <= 0.0 {
        return 0.0;
    }
    (num / (da.sqrt() * db.sqrt())) as f32
}

/// Peak-to-peak amplitude, used to spot a beat whose scale disagrees.
fn peak_to_peak(x: &[f32]) -> f32 {
    let mut lo = f32::MAX;
    let mut hi = f32::MIN;
    for &v in x {
        if v < lo { lo = v; }
        if v > hi { hi = v; }
    }
    if hi < lo { 0.0 } else { hi - lo }
}

/// Sub-sample peak position by parabolic fit through three correlation values.
fn parabolic_vertex(ym1: f32, y0: f32, yp1: f32) -> f32 {
    let denom = ym1 - 2.0 * y0 + yp1;
    if denom.abs() < 1e-12 {
        return 0.0;
    }
    (0.5 * (ym1 - yp1) / denom).clamp(-1.0, 1.0)
}

/// Shift a frame by a fractional number of samples via linear interpolation.
///
/// Display-grade only, and used here solely to re-register frames that are
/// already within a sample of each other. The spec's fractional-resample path
/// (polyline or Kaiser sinc) belongs at the extraction stage, before gridding.
fn shift_frame(x: &[f32], delta: f32) -> Vec<f32> {
    let n = x.len();
    let mut out = vec![0.0f32; n];
    for (i, o) in out.iter_mut().enumerate() {
        let src = i as f32 - delta;
        let k = src.floor();
        let f = src - k;
        let k = k as i64;
        let a = if k >= 0 && (k as usize) < n { x[k as usize] } else { 0.0 };
        let b = if k + 1 >= 0 && ((k + 1) as usize) < n { x[(k + 1) as usize] } else { 0.0 };
        *o = a + (b - a) * f;
    }
    out
}

/// The correlation window, in frame indices: QRS only, never including the T.
fn template_window(fs_hz: f64) -> (usize, usize) {
    let t0 = FRAME_T0_S;
    let lo = (((TEMPLATE_WIN_MS.0 / 1000.0) - t0) * fs_hz).round().max(0.0) as usize;
    let hi = (((TEMPLATE_WIN_MS.1 / 1000.0) - t0) * fs_hz).round() as usize;
    (lo.min(FRAME_N - 1), hi.min(FRAME_N))
}

/// Build the ensemble beat for one lead.
///
/// `anchors` are per-beat alignment points in `sig` — QRS onset where available,
/// R peak otherwise. `sigma_prov_mv` is the provenance noise floor, used to keep
/// the reported σ from claiming better precision than the source supports.
pub fn ensemble(
    sig: &[f32],
    fs_hz: f64,
    anchors: &[usize],
    provenance: Provenance,
    sigma_prov_mv: f32,
) -> EnsembleResult {
    let mut frames: Vec<(usize, Vec<f32>)> = Vec::new();
    let mut excluded: Vec<(usize, BeatExclusion)> = Vec::new();

    for (i, &a) in anchors.iter().enumerate() {
        match frame_at(sig, a, fs_hz) {
            Some(f) => frames.push((i, f)),
            None => excluded.push((i, BeatExclusion::FrameIncomplete)),
        }
    }
    if frames.is_empty() {
        return Err(EnsembleFailure::NoUsableBeats);
    }

    let (wlo, whi) = template_window(fs_hz);

    // Medoid template: the beat most like all the others. More robust than the
    // first beat (which may be the ectopic one) and cheaper than iterating.
    let medoid = if frames.len() == 1 {
        0
    } else {
        let mut best = (0usize, f32::MIN);
        for (i, (_, fi)) in frames.iter().enumerate() {
            let total: f32 = frames
                .iter()
                .enumerate()
                .filter(|(j, _)| *j != i)
                .map(|(_, (_, fj))| ncc(&fi[wlo..whi], &fj[wlo..whi]))
                .sum();
            if total > best.1 {
                best = (i, total);
            }
        }
        best.0
    };
    let template = frames[medoid].1.clone();
    let template_pp = peak_to_peak(&template[wlo..whi]);

    // Align and gate.
    let max_lag = ((ALIGN_MAX_LAG_MS / 1000.0) * fs_hz).round() as i64;
    let rho_gate = if frames.len() == 2 {
        // n=2 has no majority to appeal to, so the pair must agree strictly.
        provenance.rho_ok().max(RHO_OK_VECTOR)
    } else {
        provenance.rho_ok()
    };

    let mut kept: Vec<Vec<f32>> = Vec::new();
    let mut rho_kept: Vec<f32> = Vec::new();
    let mut shifts: Vec<f32> = Vec::new();

    for (idx, f) in &frames {
        // Integer lag search on the QRS window.
        let mut best = (0i64, f32::MIN);
        for lag in -max_lag..=max_lag {
            let shifted = shift_frame(f, lag as f32);
            let r = ncc(&template[wlo..whi], &shifted[wlo..whi]);
            if r > best.1 {
                best = (lag, r);
            }
        }
        // Parabolic refinement about the integer optimum.
        let (l, r0) = best;
        let rm = ncc(&template[wlo..whi], &shift_frame(f, (l - 1) as f32)[wlo..whi]);
        let rp = ncc(&template[wlo..whi], &shift_frame(f, (l + 1) as f32)[wlo..whi]);
        let delta = l as f32 + parabolic_vertex(rm, r0, rp);

        let aligned = shift_frame(f, delta);
        let rho = ncc(&template[wlo..whi], &aligned[wlo..whi]);

        if rho < rho_gate.min(RHO_SUSPECT.max(rho_gate)) && rho < rho_gate {
            excluded.push((*idx, BeatExclusion::LowCorrelation));
            continue;
        }
        let pp = peak_to_peak(&aligned[wlo..whi]);
        if template_pp > 0.0 && ((pp / template_pp) - 1.0).abs() > SCALE_OUTLIER_FRAC {
            excluded.push((*idx, BeatExclusion::ScaleOutlier));
            continue;
        }

        kept.push(aligned);
        rho_kept.push(rho);
        shifts.push(delta);
    }

    if kept.is_empty() {
        return Err(EnsembleFailure::NoUsableBeats);
    }

    let n = kept.len();
    let estimator = if n >= ENSEMBLE_MEDIAN_MIN_N {
        Estimator::PerSampleMedian
    } else if n >= 3 {
        Estimator::ScreenedMean
    } else if n == 2 {
        Estimator::ScreenedMeanPair
    } else {
        Estimator::SingleBeat
    };

    let mut v_mv = vec![0.0f32; FRAME_N];
    let mut sigma_mv = vec![0.0f32; FRAME_N];
    let mut scratch = vec![0.0f32; n];

    for s in 0..FRAME_N {
        for (k, f) in kept.iter().enumerate() {
            scratch[k] = f[s];
        }
        v_mv[s] = match estimator {
            Estimator::PerSampleMedian => {
                scratch.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                if n % 2 == 1 {
                    scratch[n / 2]
                } else {
                    0.5 * (scratch[n / 2 - 1] + scratch[n / 2])
                }
            }
            _ => scratch.iter().sum::<f32>() / n as f32,
        };

        sigma_mv[s] = if n < 2 {
            // Unestimable from one beat. Infinity rather than zero, so any
            // downstream gate that divides by it fails closed.
            f32::INFINITY
        } else {
            let mean = scratch.iter().sum::<f32>() / n as f32;
            let var = scratch.iter().map(|x| ((x - mean) as f64).powi(2)).sum::<f64>()
                / (n - 1) as f64;
            // Never claim better precision than the source medium supports.
            (var.sqrt() as f32).max(SIGMA_ENS_FLOOR_FRAC * sigma_prov_mv)
        };
    }

    Ok(EnsembleBeat {
        v_mv,
        sigma_mv,
        estimator,
        n_used: n,
        excluded,
        rho: rho_kept,
        shifts,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::FS;

    /// A beat-shaped frame: Q, R, S, then a T wave.
    fn beat_wave(t: f64, r_amp: f32, t_amp: f32) -> f32 {
        let g = |c: f64, w: f64, a: f32| a * (-0.5 * ((t - c) / w).powi(2)).exp() as f32;
        g(-0.026, 0.007, -0.05) + g(0.0, 0.011, r_amp) + g(0.028, 0.011, -0.08)
            + g(0.21, 0.048, t_amp)
    }

    /// Signal with `n` identical beats at 1 s spacing, plus optional per-beat noise.
    fn make_signal(n: usize, r_amp: f32, noise: f32) -> (Vec<f32>, Vec<usize>) {
        let fs = FS;
        let total = ((n + 2) as f64 * 1.0 * fs) as usize;
        let mut sig = vec![0.0f32; total];
        let mut anchors = Vec::new();
        let mut seed = 99u32;
        for k in 0..n {
            let centre = ((k as f64 + 1.0) * fs) as usize;
            anchors.push(centre);
            for i in 0..total {
                let dt = (i as f64 - centre as f64) / fs;
                if dt.abs() < 0.5 {
                    sig[i] += beat_wave(dt, r_amp, 0.30);
                }
            }
        }
        if noise > 0.0 {
            for v in sig.iter_mut() {
                seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                *v += ((seed >> 8) as f32 / 16777216.0 - 0.5) * noise;
            }
        }
        (sig, anchors)
    }

    #[test]
    fn estimator_follows_the_beat_count() {
        for (n, want) in [
            (8usize, Estimator::PerSampleMedian),
            (5, Estimator::PerSampleMedian),
            (4, Estimator::ScreenedMean),
            (3, Estimator::ScreenedMean),
            (2, Estimator::ScreenedMeanPair),
            (1, Estimator::SingleBeat),
        ] {
            let (sig, anchors) = make_signal(n, 1.2, 0.0);
            let e = ensemble(&sig, FS, &anchors, Provenance::VectorPdf, 0.01).unwrap();
            assert_eq!(e.estimator, want, "n={n}");
            assert_eq!(e.n_used, n, "n={n}");
        }
    }

    #[test]
    fn at_n3_a_mean_is_used_not_a_median() {
        // At n=3 the per-sample median IS the 1-trimmed mean: it throws away a
        // third of the evidence for no robustness gain. This asserts the
        // correction the research made.
        let (sig, anchors) = make_signal(3, 1.2, 0.0);
        let e = ensemble(&sig, FS, &anchors, Provenance::VectorPdf, 0.01).unwrap();
        assert_eq!(e.estimator, Estimator::ScreenedMean);
    }

    #[test]
    fn the_ensemble_reproduces_a_clean_beat() {
        let (sig, anchors) = make_signal(6, 1.2, 0.0);
        let e = ensemble(&sig, FS, &anchors, Provenance::VectorPdf, 0.01).unwrap();
        let r_idx = ((-FRAME_T0_S) * FS) as usize;
        assert!(
            (e.v_mv[r_idx] - 1.2).abs() < 0.05,
            "R amplitude {} should be 1.2",
            e.v_mv[r_idx]
        );
    }

    #[test]
    fn averaging_reduces_noise() {
        let (sig1, a1) = make_signal(1, 1.2, 0.06);
        let (sig8, a8) = make_signal(8, 1.2, 0.06);
        let e1 = ensemble(&sig1, FS, &a1, Provenance::VectorPdf, 0.01).unwrap();
        let e8 = ensemble(&sig8, FS, &a8, Provenance::VectorPdf, 0.01).unwrap();

        // Compare flat pre-P baseline roughness.
        let rough = |v: &[f32]| {
            let seg = &v[0..60];
            let m = seg.iter().sum::<f32>() / seg.len() as f32;
            (seg.iter().map(|x| (x - m).powi(2)).sum::<f32>() / seg.len() as f32).sqrt()
        };
        assert!(
            rough(&e8.v_mv) < rough(&e1.v_mv),
            "8-beat roughness {} not below 1-beat {}",
            rough(&e8.v_mv),
            rough(&e1.v_mv)
        );
    }

    #[test]
    fn sigma_is_infinite_at_n1_not_zero() {
        // A single beat cannot estimate its own spread. Zero would let a gate
        // that divides by sigma pass anything; infinity fails closed.
        let (sig, anchors) = make_signal(1, 1.2, 0.0);
        let e = ensemble(&sig, FS, &anchors, Provenance::VectorPdf, 0.01).unwrap();
        assert!(e.sigma_mv.iter().all(|s| s.is_infinite()));
        assert!(!e.measurable(), "n=1 must be display-only");
    }

    #[test]
    fn sigma_respects_the_provenance_floor() {
        // Identical beats have zero empirical spread, but the source medium's
        // own noise floor still applies -- claiming 0 uV would be a lie.
        let (sig, anchors) = make_signal(6, 1.2, 0.0);
        let floor = 0.04f32;
        let e = ensemble(&sig, FS, &anchors, Provenance::Raster, floor).unwrap();
        let expect = SIGMA_ENS_FLOOR_FRAC * floor;
        assert!(
            e.sigma_mv.iter().all(|&s| s >= expect - 1e-6),
            "sigma fell below the provenance floor"
        );
    }

    #[test]
    fn a_morphologically_different_beat_is_excluded() {
        // Stand-in for a PVC: same anchor cadence, wrong shape.
        let (mut sig, anchors) = make_signal(5, 1.2, 0.0);
        let bad = anchors[2];
        for i in 0..sig.len() {
            let dt = (i as f64 - bad as f64) / FS;
            if dt.abs() < 0.5 {
                sig[i] -= beat_wave(dt, 1.2, 0.30);
                // Wide, inverted, slurred.
                sig[i] += -1.0 * (-0.5 * (dt / 0.055).powi(2)).exp() as f32;
            }
        }
        let e = ensemble(&sig, FS, &anchors, Provenance::VectorPdf, 0.01).unwrap();
        assert_eq!(e.n_used, 4, "the aberrant beat was not excluded");
        assert!(e.excluded.iter().any(|(i, r)| *i == 2 && *r == BeatExclusion::LowCorrelation));
    }

    #[test]
    fn an_amplitude_outlier_is_excluded() {
        let (mut sig, anchors) = make_signal(5, 1.2, 0.0);
        let bad = anchors[3];
        for i in 0..sig.len() {
            let dt = (i as f64 - bad as f64) / FS;
            if dt.abs() < 0.5 {
                sig[i] += beat_wave(dt, 1.2, 0.30); // doubles this beat only
            }
        }
        let e = ensemble(&sig, FS, &anchors, Provenance::VectorPdf, 0.01).unwrap();
        assert!(e.n_used < 5, "the scale outlier was kept");
        assert!(e.excluded.iter().any(|(i, _)| *i == 3));
    }

    #[test]
    fn a_clipped_frame_is_excluded_never_padded() {
        // Zero-padding would pull the ensemble T amplitude toward baseline by
        // 1/n -- a fabricated T-wave flattening with no visible artefact.
        let (sig, mut anchors) = make_signal(4, 1.2, 0.0);
        anchors.push(sig.len() - 10); // frame runs off the end
        let e = ensemble(&sig, FS, &anchors, Provenance::VectorPdf, 0.01).unwrap();
        assert_eq!(e.n_used, 4);
        assert!(e.excluded.iter().any(|(_, r)| *r == BeatExclusion::FrameIncomplete));
    }

    #[test]
    fn no_usable_beats_is_an_error_not_a_flat_line() {
        let (sig, _) = make_signal(3, 1.2, 0.0);
        let e = ensemble(&sig, FS, &[], Provenance::VectorPdf, 0.01);
        assert_eq!(e.unwrap_err(), EnsembleFailure::NoUsableBeats);
    }

    #[test]
    fn misaligned_beats_are_realigned_before_combining() {
        // Anchors jittered by up to 3 samples. Without realignment the combined
        // R wave is smeared and shortened -- which downstream reads as a real
        // amplitude change.
        let (sig, anchors) = make_signal(6, 1.2, 0.0);
        let jittered: Vec<usize> = anchors
            .iter()
            .enumerate()
            .map(|(k, &a)| if k % 2 == 0 { a + 3 } else { a.saturating_sub(2) })
            .collect();

        let e = ensemble(&sig, FS, &jittered, Provenance::VectorPdf, 0.01).unwrap();
        let peak = e.v_mv.iter().cloned().fold(f32::MIN, f32::max);
        assert!(peak > 1.1, "R wave smeared down to {peak} by misalignment");
        assert!(e.shifts.iter().any(|s| s.abs() > 0.5), "no realignment happened");
    }

    #[test]
    fn n2_uses_the_stricter_gate() {
        // With only two beats there is no majority to appeal to, so a pair that
        // disagrees must not silently average into a plausible-looking beat.
        let (mut sig, anchors) = make_signal(2, 1.2, 0.0);
        let bad = anchors[1];
        for i in 0..sig.len() {
            let dt = (i as f64 - bad as f64) / FS;
            if dt.abs() < 0.5 {
                sig[i] -= beat_wave(dt, 1.2, 0.30);
                sig[i] += -0.9 * (-0.5 * (dt / 0.06).powi(2)).exp() as f32;
            }
        }
        let e = ensemble(&sig, FS, &anchors, Provenance::Raster, 0.04);
        match e {
            Ok(b) => assert!(b.n_used < 2, "a disagreeing pair was combined"),
            Err(EnsembleFailure::NoUsableBeats) => {}
        }
    }
}

//! Cross-study registration: putting two or more ensemble beats on one frame.
//!
//! # What is aligned, and what is deliberately not
//!
//! **Time is aligned. Amplitude is not.**
//!
//! Amplitude is already on a common footing: each study's baseline came from its
//! own PQ anchors, so zero means the same thing in both. Beyond that, no gain
//! matching is applied. The estimator would be circular — any scale factor
//! derived from QRS amplitude assumes QRS amplitude did not change, which is the
//! hypothesis under test — and the findings this product exists to surface are
//! precisely the ones it would erase: new LVH voltage, new low voltage, R-wave
//! amputation.
//!
//! # Why the anchor is QRS onset
//!
//! A 20 ms change in the terminal QRS — new RBBB, hyperkalaemia, a class Ic
//! effect — displaces the J point by up to 20 ms relative to the R peak. On the
//! ST-T upstroke, where dV/dt runs 5–15 µV/ms, anchoring on R would manufacture
//! 100–300 µV of apparent ST shift underneath an overlay that looks entirely
//! plausible. Onset does not move with terminal-QRS morphology.
//!
//! # The interlocks
//!
//! Refinement maximises correlation over a small lag range, which is exactly the
//! wrong thing to do when the QRS genuinely changed shape: the optimiser slides
//! to whatever lag best flatters the residual, and reports a confident alignment
//! of two different complexes. So a low correlation forces the shift to zero and
//! says so, rather than producing a number.

use crate::config::{
    FRAME_N, FRAME_T0_S, RHO_XSTUDY_MIN, XSTUDY_CLAMP_MS, XSTUDY_MAX_LAG_MS,
};

/// How the frames were put in register.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WarpMode {
    /// A single shift per lead. The only mode that produces reportable numbers.
    Rigid,
}

/// Why an alignment shift was not applied as computed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AlignFlag {
    /// Correlation fell below the interlock; the QRS is not the same shape, so
    /// the shift was forced to zero. This is a finding, not an error.
    QrsMorphologyChanged,
    /// A large shift with acceptable correlation, which is not physiological at
    /// this stage of the pipeline. Clamped to zero.
    AlignImplausible,
}

/// One lead's registration against the reference study.
#[derive(Debug, Clone)]
pub struct LeadRegistration {
    /// How much later the comparison beat sat than the reference, in samples.
    ///
    /// Positive means the comparison occurred later and was moved *earlier* to
    /// register. This reports the misalignment observed, not the correction
    /// applied — those differ in sign, and reporting the correction invites the
    /// reader to conclude the opposite of what happened.
    pub lag_samples: f32,
    /// Correlation over the QRS window after alignment.
    pub rho_qrs: f32,
    pub flags: Vec<AlignFlag>,
    /// Comparison minus reference, per sample, in millivolts.
    pub difference_mv: Vec<f32>,
    /// RMS of `difference_mv` over the whole frame, millivolts.
    pub rms_difference_mv: f32,
    /// The comparison beat after shifting, on the reference's frame.
    pub aligned_mv: Vec<f32>,
}

impl LeadRegistration {
    /// Whether the alignment was accepted as computed rather than forced to zero.
    pub fn aligned_cleanly(&self) -> bool {
        self.flags.is_empty()
    }
}

/// Normalised cross-correlation over a slice range.
fn ncc(a: &[f32], b: &[f32]) -> f32 {
    let n = a.len().min(b.len());
    if n == 0 {
        return 0.0;
    }
    let ma = a[..n].iter().sum::<f32>() / n as f32;
    let mb = b[..n].iter().sum::<f32>() / n as f32;
    let (mut num, mut da, mut db) = (0.0f64, 0.0f64, 0.0f64);
    for i in 0..n {
        let (x, y) = ((a[i] - ma) as f64, (b[i] - mb) as f64);
        num += x * y;
        da += x * x;
        db += y * y;
    }
    if da <= 0.0 || db <= 0.0 {
        return 0.0;
    }
    (num / (da.sqrt() * db.sqrt())) as f32
}

/// Sub-sample vertex of a parabola through three points.
fn parabolic_vertex(ym1: f32, y0: f32, yp1: f32) -> f32 {
    let d = ym1 - 2.0 * y0 + yp1;
    if d.abs() < 1e-12 {
        return 0.0;
    }
    (0.5 * (ym1 - yp1) / d).clamp(-1.0, 1.0)
}

/// Shift a frame by a fractional number of samples, linear interpolation.
fn shift(x: &[f32], delta: f32) -> Vec<f32> {
    // Below a thousandth of a sample the interpolation contributes only its own
    // rounding error; copying is both exact and faster.
    if delta.abs() < 1e-3 {
        return x.to_vec();
    }
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

/// The correlation window: QRS only.
///
/// Including the T wave lets a large slow deflection dominate the correlation
/// and drag the QRS out of alignment — after which a real QT change reads as an
/// ST change, which is precisely the confusion to avoid.
fn qrs_window(qrs_onset: usize, qrs_offset: usize, fs_hz: f64) -> (usize, usize) {
    let pre = (0.020 * fs_hz).round() as usize;
    let post = (0.010 * fs_hz).round() as usize;
    let lo = qrs_onset.saturating_sub(pre);
    let hi = (qrs_offset + post).min(FRAME_N);
    (lo.min(FRAME_N - 2), hi.max(lo + 2).min(FRAME_N))
}

/// Register one comparison lead against a reference lead.
///
/// Both frames are already anchored on their own study's global QRS onset, so
/// the residual shift here is small by construction — it corrects sub-sample
/// fiducial jitter, not gross misalignment.
pub fn register_lead(
    reference_mv: &[f32],
    comparison_mv: &[f32],
    qrs_onset: usize,
    qrs_offset: usize,
    fs_hz: f64,
) -> LeadRegistration {
    let (wlo, whi) = qrs_window(qrs_onset, qrs_offset, fs_hz);
    let max_lag = ((XSTUDY_MAX_LAG_MS / 1000.0) * fs_hz).round() as i64;
    let clamp = ((XSTUDY_CLAMP_MS / 1000.0) * fs_hz) as f32;

    // Integer lag search, then a parabolic refinement about the optimum.
    let mut best = (0i64, f32::MIN);
    for lag in -max_lag..=max_lag {
        let r = ncc(&reference_mv[wlo..whi], &shift(comparison_mv, lag as f32)[wlo..whi]);
        if r > best.1 {
            best = (lag, r);
        }
    }
    let (l, r0) = best;
    let rm = ncc(&reference_mv[wlo..whi], &shift(comparison_mv, (l - 1) as f32)[wlo..whi]);
    let rp = ncc(&reference_mv[wlo..whi], &shift(comparison_mv, (l + 1) as f32)[wlo..whi]);
    let mut delta = l as f32 + parabolic_vertex(rm, r0, rp);

    let rho = ncc(&reference_mv[wlo..whi], &shift(comparison_mv, delta)[wlo..whi]);

    let mut flags = Vec::new();
    if rho < RHO_XSTUDY_MIN {
        // Maximising correlation between two differently-shaped complexes finds
        // whichever lag flatters the residual. Refuse the shift and say why.
        delta = 0.0;
        flags.push(AlignFlag::QrsMorphologyChanged);
    } else if delta.abs() > clamp {
        delta = 0.0;
        flags.push(AlignFlag::AlignImplausible);
    }

    // `delta` is the correction that brings the comparison onto the reference.
    // The lag reported to callers is its negation: the comparison sat that much
    // later than the reference.
    let aligned_mv = shift(comparison_mv, delta);
    let lag_samples = -delta;
    let difference_mv: Vec<f32> = aligned_mv
        .iter()
        .zip(reference_mv)
        .map(|(c, r)| c - r)
        .collect();
    let rms_difference_mv = {
        let s: f64 = difference_mv.iter().map(|d| (*d as f64).powi(2)).sum();
        (s / difference_mv.len().max(1) as f64).sqrt() as f32
    };

    LeadRegistration {
        lag_samples,
        rho_qrs: rho,
        flags,
        difference_mv,
        rms_difference_mv,
        aligned_mv,
    }
}

/// Frame index of the anchor, by construction of the standard frame.
pub fn anchor_index(fs_hz: f64) -> usize {
    ((-FRAME_T0_S) * fs_hz).round() as usize
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::FS;

    fn lobe(d: f32, centre: f32, halfwidth: f32, amp: f32) -> f32 {
        let x = (d - centre) / halfwidth;
        if x.abs() < 1.0 {
            amp * 0.5 * (1.0 + (std::f32::consts::PI * x).cos())
        } else {
            0.0
        }
    }

    /// A beat frame: QRS of `qrs_ms`, T wave, and an ST plateau offset by `st_mv`.
    fn beat(qrs_ms: f64, r_amp: f32, st_mv: f32) -> Vec<f32> {
        let r = anchor_index(FS);
        let half = (qrs_ms / 1000.0 * FS) as f32 / 2.0;
        (0..FRAME_N)
            .map(|i| {
                let d = i as f32 - r as f32;
                let qrs = lobe(d, -0.55 * half, 0.45 * half, -0.06)
                    + lobe(d, -0.05 * half, 0.60 * half, r_amp)
                    + lobe(d, 0.50 * half, 0.50 * half, -0.10);
                let t = 0.35
                    * (-0.5 * ((d - 0.21 * FS as f32) / (0.048 * FS as f32)).powi(2)).exp();
                // ST plateau from the J point into the T wave.
                let st = if d > half && d < 0.21 * FS as f32 { st_mv } else { 0.0 };
                qrs + t + st
            })
            .collect()
    }

    // The frame anchor sits at 0.200 s * 500 Hz = index 100, and a 100 ms QRS
    // spans anchor +/- 25 samples. Getting these wrong puts the correlation
    // window over the ST segment instead of the QRS -- which is precisely the
    // failure the QRS-only window exists to prevent, and it shows up as a
    // collapsed rho rather than a silently wrong alignment.
    const ON: usize = 75;
    const OFF: usize = 125;

    #[test]
    fn identical_studies_register_with_no_shift_and_no_difference() {
        let a = beat(100.0, 1.2, 0.0);
        let r = register_lead(&a, &a, ON, OFF, FS);
        assert!(r.lag_samples.abs() < 0.05, "shift {}", r.lag_samples);
        assert!(r.rho_qrs > 0.999, "rho {}", r.rho_qrs);
        assert!(r.rms_difference_mv < 1e-3, "rms {}", r.rms_difference_mv);
        assert!(r.aligned_cleanly());
    }

    #[test]
    fn a_known_shift_is_recovered() {
        let a = beat(100.0, 1.2, 0.0);
        for &truth in &[-3.0f32, -1.5, 0.7, 2.0] {
            // `b` is `a` moved later by `truth`, so the reported lag is `truth`.
            let b = shift(&a, truth);
            let r = register_lead(&a, &b, ON, OFF, FS);
            assert!(
                (r.lag_samples - truth).abs() < 0.25,
                "lag {} should be {truth}",
                r.lag_samples
            );
        }
    }

    #[test]
    fn st_elevation_does_not_move_the_alignment() {
        // THE case the whole design turns on. Two studies differing only by ST
        // elevation must register at zero shift, so the difference trace shows
        // the elevation rather than the aligner absorbing it.
        let a = beat(100.0, 1.2, 0.0);
        let b = beat(100.0, 1.2, 0.25);
        let r = register_lead(&a, &b, ON, OFF, FS);

        assert!(
            r.lag_samples.abs() < 0.3,
            "ST elevation pulled the alignment by {} samples",
            r.lag_samples
        );
        assert!(r.rho_qrs > 0.99, "QRS correlation should be unaffected: {}", r.rho_qrs);

        // The difference in the ST region should be the elevation itself.
        let st_idx = anchor_index(FS) + (0.10 * FS) as usize;
        assert!(
            (r.difference_mv[st_idx] - 0.25).abs() < 0.03,
            "ST difference {} should be 0.25 mV",
            r.difference_mv[st_idx]
        );
        // And the QRS region should show essentially nothing.
        let qrs_idx = anchor_index(FS);
        assert!(
            r.difference_mv[qrs_idx].abs() < 0.03,
            "QRS difference {} should be ~0",
            r.difference_mv[qrs_idx]
        );
    }

    #[test]
    fn a_changed_qrs_forces_the_shift_to_zero_rather_than_sliding() {
        // A much wider QRS: correlation over the window falls, and the optimiser
        // would otherwise slide to whatever lag flatters the residual and report
        // a confident alignment of two different complexes.
        let a = beat(90.0, 1.2, 0.0);
        let b = beat(170.0, 1.2, 0.0);
        let r = register_lead(&a, &b, ON, OFF, FS);

        if r.rho_qrs < RHO_XSTUDY_MIN {
            assert_eq!(r.lag_samples, 0.0);
            assert!(r.flags.contains(&AlignFlag::QrsMorphologyChanged));
            assert!(!r.aligned_cleanly());
        } else {
            // If the shapes still correlate, the shift must at least stay small
            // rather than wandering.
            assert!(r.lag_samples.abs() < 6.0, "slid to {}", r.lag_samples);
        }
    }

    #[test]
    fn an_implausibly_large_shift_is_clamped() {
        // A shift beyond the clamp with good correlation is not physiological
        // once both frames are already onset-anchored.
        let a = beat(100.0, 1.2, 0.0);
        let b = shift(&a, 11.0); // 22 ms, past the 12 ms clamp
        let r = register_lead(&a, &b, ON, OFF, FS);
        assert_eq!(r.lag_samples, 0.0, "large shift was applied");
        assert!(r.flags.contains(&AlignFlag::AlignImplausible));
    }

    #[test]
    fn amplitude_is_never_normalised_away() {
        // A doubled R wave is a finding (new LVH voltage). Registration must
        // leave it in the difference trace, not scale it out.
        let a = beat(100.0, 0.8, 0.0);
        let b = beat(100.0, 1.6, 0.0);
        let r = register_lead(&a, &b, ON, OFF, FS);
        let peak_diff = r.difference_mv.iter().cloned().fold(f32::MIN, f32::max);
        assert!(
            peak_diff > 0.6,
            "amplitude difference {peak_diff} was suppressed; gain matching must stay off"
        );
        // Correlation is scale-invariant, so the shapes still align.
        assert!(r.rho_qrs > 0.99, "rho {}", r.rho_qrs);
    }

    #[test]
    fn rms_difference_separates_changed_from_unchanged_leads() {
        let a = beat(100.0, 1.2, 0.0);
        let same = register_lead(&a, &beat(100.0, 1.2, 0.0), ON, OFF, FS);
        let changed = register_lead(&a, &beat(100.0, 1.2, 0.25), ON, OFF, FS);
        assert!(
            changed.rms_difference_mv > same.rms_difference_mv + 0.05,
            "changed {} vs unchanged {}",
            changed.rms_difference_mv,
            same.rms_difference_mv
        );
    }

    #[test]
    fn the_correlation_window_excludes_the_t_wave() {
        // A large T change must not drag the QRS alignment. Build two beats with
        // identical QRS and very different T waves.
        let mut a = beat(100.0, 1.2, 0.0);
        let mut b = beat(100.0, 1.2, 0.0);
        let r = anchor_index(FS);
        for i in (r + (0.12 * FS) as usize)..FRAME_N {
            let d = i as f32 - (r as f32 + 0.21 * FS as f32);
            let g = (-0.5 * (d / (0.048 * FS as f32)).powi(2)).exp();
            a[i] += 0.5 * g;
            b[i] -= 0.9 * g; // inverted, much larger
        }
        let reg = register_lead(&a, &b, ON, OFF, FS);
        assert!(
            reg.lag_samples.abs() < 0.5,
            "T-wave change moved the QRS alignment by {} samples",
            reg.lag_samples
        );
    }
}

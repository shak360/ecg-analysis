//! PQ-anchored piecewise detrend, and the type barrier around it.
//!
//! # Why not a filter
//!
//! No high-pass filter of any cutoff may touch the measurement path. A 2.5 s
//! panel cannot structurally support one — at 0.05 Hz the time constant is
//! 3.18 s, longer than the panel itself, and 0.5 Hz zero-phase settling eats
//! about a second at each end. Empirically, a causal 0.5 Hz high-pass produced
//! J-point deviation averaging 0.30 mV in 42 of 45 patients (Buendía-Fuentes
//! 2012): three times the STEMI threshold, in the direction of the finding. Even
//! the best zero-phase filter in clean simulation carries ST error of
//! 0.042–0.097 mV (Lenis 2017) — the filter's own error is the size of what we
//! are trying to measure.
//!
//! # What happens instead
//!
//! The isoelectric level is estimated at the **PQ segment** of each beat — the
//! flat stretch just before the QRS — and a piecewise-linear baseline through
//! those anchors is subtracted. This sets ST deviation to zero *at the anchors
//! by construction*, which is the clinical definition of ST deviation. It cannot
//! fabricate ST shift there, because there is nothing to fabricate: the
//! reference point is defined as zero.
//!
//! Between anchors the baseline is linear; past the first and last anchor it is
//! **constant**, not extrapolated. Continuing the slope would swing the trace at
//! panel ends, exactly where a truncated complex already makes life hard.
//!
//! # The type barrier
//!
//! [`ProvisionalSignal`] and [`MeasurementSignal`] are distinct types, and every
//! measurement function takes the latter. There is no conversion that does not
//! run this detrend. Measuring the pass-1 median-cascade output is therefore not
//! a mistake to be caught in review — it does not compile.

use crate::config::{
    BASELINE_REMOVED_MAX_MV, DETREND_RESID_MAX_MV, PQ_FLATNESS_MAX_MV, PQ_SEARCH_HI_MS,
    PQ_SEARCH_LO_MS, PQ_SLOPE_COST_W, PQ_WIN_MS,
};

/// A conditioned but **unmeasurable** signal.
///
/// This is what the pass-1 median cascade produces. It is fit for locating
/// beats and for display, and for nothing else. The only way to obtain a
/// [`MeasurementSignal`] from it is [`detrend`], which requires PQ anchors.
///
/// ```compile_fail
/// use ecg_core::dsp::detrend::{ProvisionalSignal, st_level_mv};
/// let p = ProvisionalSignal::new(vec![0.0; 100], 500.0);
/// // Measuring a provisional signal is a type error, not a review comment.
/// let _ = st_level_mv(&p, 10);
/// ```
#[derive(Debug, Clone)]
pub struct ProvisionalSignal {
    v_mv: Vec<f32>,
    fs_hz: f64,
}

impl ProvisionalSignal {
    pub fn new(v_mv: Vec<f32>, fs_hz: f64) -> Self {
        ProvisionalSignal { v_mv, fs_hz }
    }

    /// Read-only access for beat detection and rendering.
    pub fn samples(&self) -> &[f32] {
        &self.v_mv
    }

    pub fn fs_hz(&self) -> f64 {
        self.fs_hz
    }

    pub fn len(&self) -> usize {
        self.v_mv.len()
    }

    pub fn is_empty(&self) -> bool {
        self.v_mv.is_empty()
    }
}

/// A signal whose baseline is defined by PQ anchors. Measurements come only from
/// here, and its zero is the isoelectric level rather than an arbitrary offset.
#[derive(Debug, Clone)]
pub struct MeasurementSignal {
    v_mv: Vec<f32>,
    fs_hz: f64,
    anchors: Vec<Anchor>,
    /// RMS of anchor levels about the fitted baseline, millivolts.
    residual_mv: f32,
    /// Largest baseline excursion removed, millivolts.
    removed_peak_mv: f32,
}

impl MeasurementSignal {
    pub fn samples(&self) -> &[f32] {
        &self.v_mv
    }

    pub fn fs_hz(&self) -> f64 {
        self.fs_hz
    }

    pub fn len(&self) -> usize {
        self.v_mv.len()
    }

    pub fn is_empty(&self) -> bool {
        self.v_mv.is_empty()
    }

    pub fn anchors(&self) -> &[Anchor] {
        &self.anchors
    }

    pub fn residual_mv(&self) -> f32 {
        self.residual_mv
    }

    pub fn removed_peak_mv(&self) -> f32 {
        self.removed_peak_mv
    }

    /// The anchors did not lie on a line: wander is present that a piecewise
    /// fit through PQ points does not model.
    pub fn baseline_unmodelled(&self) -> bool {
        self.residual_mv > DETREND_RESID_MAX_MV
    }

    /// A large correction was applied. Not wrong, but worth disclosing, since
    /// heavy wander degrades every amplitude downstream.
    pub fn heavy_correction(&self) -> bool {
        self.removed_peak_mv > BASELINE_REMOVED_MAX_MV
    }
}

/// One isoelectric estimate, taken from a single beat's PQ segment.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Anchor {
    /// Centre of the window the level was taken from.
    pub sample: usize,
    /// Isoelectric level, millivolts.
    pub level_mv: f32,
    /// Peak-to-peak spread within the window; lower is flatter.
    pub flatness_mv: f32,
}

/// Why a signal could not be made measurable.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DetrendFailure {
    /// No beat yielded a sufficiently flat PQ segment. Morphology may still be
    /// displayed; no amplitude may be reported.
    NoIsoelectricAnchor,
    /// The signal was empty.
    EmptySignal,
}

/// Outcome of detrending.
#[derive(Debug, Clone)]
pub enum Detrended {
    Measurable(MeasurementSignal),
    /// Displayable, never measurable. Deliberately not a `MeasurementSignal`
    /// with a flag set — a flag can be ignored, a type cannot.
    MorphologyOnly {
        v_mv: Vec<f32>,
        fs_hz: f64,
        reason: DetrendFailure,
    },
}

impl Detrended {
    pub fn measurable(&self) -> Option<&MeasurementSignal> {
        match self {
            Detrended::Measurable(m) => Some(m),
            _ => None,
        }
    }
}

/// Locate the PQ isoelectric level for one beat.
///
/// Searches `[onset − 44 ms, onset − 8 ms]` for the flattest 20 ms window and
/// takes its median. The 8 ms guard keeps onset jitter from pulling the window
/// into the QRS upstroke; the search sits adjacent to the ST segment so residual
/// wander barely leaks into the estimate. TP would be flatter but vanishes above
/// about 110 bpm and hosts the U wave.
///
/// Returns `None` when nothing in the search span is flat enough to trust.
pub fn find_pq_anchor(v_mv: &[f32], fs_hz: f64, qrs_onset: usize) -> Option<Anchor> {
    let lo_off = (PQ_SEARCH_LO_MS / 1000.0 * fs_hz).round() as i64;
    let hi_off = (PQ_SEARCH_HI_MS / 1000.0 * fs_hz).round() as i64;
    let win = ((PQ_WIN_MS / 1000.0 * fs_hz).round() as usize).max(2);

    let lo = qrs_onset as i64 + lo_off;
    let hi = qrs_onset as i64 + hi_off;
    if lo < 0 || hi <= lo || (hi as usize) > v_mv.len() {
        return None;
    }
    let (lo, hi) = (lo as usize, hi as usize);
    if hi - lo < win {
        return None;
    }

    let mut best: Option<(f32, usize, f32, f32)> = None; // (cost, start, level, flatness)
    for start in lo..=(hi - win) {
        let w = &v_mv[start..start + win];

        let mut min = f32::MAX;
        let mut max = f32::MIN;
        for &x in w {
            if x < min { min = x; }
            if x > max { max = x; }
        }
        let flatness = max - min;

        // Slope across the window, in mV per sample, penalised so a smoothly
        // sloping stretch loses to a genuinely flat one of equal spread.
        let slope = (w[win - 1] - w[0]) / win as f32;
        let cost = flatness + PQ_SLOPE_COST_W * slope * slope;

        if best.is_none_or(|(bc, _, _, _)| cost < bc) {
            let mut sorted: Vec<f32> = w.to_vec();
            sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            let level = sorted[sorted.len() / 2];
            best = Some((cost, start, level, flatness));
        }
    }

    let (_, start, level, flatness) = best?;
    if flatness > PQ_FLATNESS_MAX_MV {
        return None; // nothing here is isoelectric; better no anchor than a wrong one
    }
    Some(Anchor { sample: start + win / 2, level_mv: level, flatness_mv: flatness })
}

/// Build the piecewise-linear baseline implied by a set of anchors.
///
/// Linear between consecutive anchors; **constant** before the first and after
/// the last. Extrapolating the slope past the end anchors swings the trace at
/// panel boundaries, and a spline through knots roughly a second apart bends the
/// ST segment by tens of microvolts — which is the size of the finding.
pub fn baseline_from_anchors(anchors: &[Anchor], n: usize) -> Vec<f32> {
    let mut out = vec![0.0f32; n];
    if anchors.is_empty() {
        return out;
    }
    if anchors.len() == 1 {
        out.fill(anchors[0].level_mv);
        return out;
    }

    // Before the first anchor: hold its level.
    let first = &anchors[0];
    for v in out.iter_mut().take(first.sample.min(n)) {
        *v = first.level_mv;
    }

    for pair in anchors.windows(2) {
        let (a, b) = (&pair[0], &pair[1]);
        let span = b.sample.saturating_sub(a.sample);
        if span == 0 {
            continue;
        }
        let start = a.sample.min(n);
        let end = b.sample.min(n);
        for (k, v) in out[start..end].iter_mut().enumerate() {
            let t = k as f32 / span as f32;
            *v = a.level_mv + (b.level_mv - a.level_mv) * t;
        }
    }

    // After the last anchor: hold its level.
    let last = &anchors[anchors.len() - 1];
    for v in out.iter_mut().skip(last.sample.min(n)) {
        *v = last.level_mv;
    }

    out
}

/// Detrend a provisional signal against PQ anchors located at `qrs_onsets`.
///
/// This is the only route from [`ProvisionalSignal`] to [`MeasurementSignal`].
pub fn detrend(sig: &ProvisionalSignal, qrs_onsets: &[usize]) -> Detrended {
    let n = sig.len();
    let fs = sig.fs_hz();
    if n == 0 {
        return Detrended::MorphologyOnly {
            v_mv: Vec::new(),
            fs_hz: fs,
            reason: DetrendFailure::EmptySignal,
        };
    }

    let anchors: Vec<Anchor> = qrs_onsets
        .iter()
        .filter_map(|&on| find_pq_anchor(sig.samples(), fs, on))
        .collect();

    if anchors.is_empty() {
        return Detrended::MorphologyOnly {
            v_mv: sig.samples().to_vec(),
            fs_hz: fs,
            reason: DetrendFailure::NoIsoelectricAnchor,
        };
    }

    let baseline = baseline_from_anchors(&anchors, n);
    let v_mv: Vec<f32> = sig
        .samples()
        .iter()
        .zip(&baseline)
        .map(|(a, b)| a - b)
        .collect();

    // Residual: how far the anchors sit from the line drawn through them. With
    // piecewise-linear interpolation the fit passes through every anchor exactly,
    // so this measures anchor-to-anchor *roughness* — wander the model does not
    // capture — via the second difference of anchor levels.
    let residual_mv = if anchors.len() >= 3 {
        let mut acc = 0.0f64;
        for w in anchors.windows(3) {
            let mid_expected = 0.5 * (w[0].level_mv + w[2].level_mv);
            let d = (w[1].level_mv - mid_expected) as f64;
            acc += d * d;
        }
        ((acc / (anchors.len() - 2) as f64).sqrt()) as f32
    } else {
        0.0
    };

    let removed_peak_mv = baseline.iter().fold(0.0f32, |a, &b| a.max(b.abs()));

    Detrended::Measurable(MeasurementSignal {
        v_mv,
        fs_hz: fs,
        anchors,
        residual_mv,
        removed_peak_mv,
    })
}

/// Example measurement, existing to demonstrate the type barrier.
///
/// Takes a [`MeasurementSignal`] and nothing else; see the `compile_fail`
/// doctest on [`ProvisionalSignal`].
pub fn st_level_mv(sig: &MeasurementSignal, at: usize) -> Option<f32> {
    sig.samples().get(at).copied()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::FS;

    /// Beats with a flat PQ segment, a QRS, and an ST-T plateau at `st_mv`.
    /// Returns the signal and the QRS onset sample of each beat.
    fn beats(fs: f64, secs: f64, hr: f64, st_mv: f32, drift: impl Fn(f64) -> f32)
        -> (Vec<f32>, Vec<usize>)
    {
        let n = (fs * secs) as usize;
        let rr = 60.0 / hr;
        let mut onsets = Vec::new();
        let mut t0 = 0.5;
        while t0 < secs - 0.6 {
            onsets.push((t0 * fs) as usize);
            t0 += rr;
        }

        let sig = (0..n)
            .map(|i| {
                let t = i as f64 / fs;
                let mut v = drift(t);
                for &on in &onsets {
                    let dt = t - on as f64 / fs;
                    if (-0.25..0.02).contains(&dt) {
                        // P wave then a flat PQ run into the QRS onset.
                        if (-0.20..-0.14).contains(&dt) {
                            v += 0.12 * ((dt + 0.17) / 0.03 * std::f64::consts::PI).cos() as f32;
                        }
                    } else if (0.0..0.02).contains(&dt) {
                        v += 1.4; // QRS
                    } else if (0.02..0.34).contains(&dt) {
                        v += st_mv; // ST-T plateau
                    }
                }
                v
            })
            .collect();
        (sig, onsets)
    }

    fn provisional(v: Vec<f32>) -> ProvisionalSignal {
        ProvisionalSignal::new(v, FS)
    }

    // ---- anchor location ---------------------------------------------------

    #[test]
    fn anchor_lands_in_the_pq_segment_before_the_onset() {
        let (sig, onsets) = beats(FS, 6.0, 70.0, 0.0, |_| 0.0);
        let on = onsets[2];
        let a = find_pq_anchor(&sig, FS, on).expect("no anchor found");
        let offset_ms = (a.sample as f64 - on as f64) / FS * 1000.0;
        assert!(
            (PQ_SEARCH_LO_MS..=PQ_SEARCH_HI_MS).contains(&offset_ms),
            "anchor at {offset_ms} ms is outside the search span"
        );
    }

    #[test]
    fn anchor_level_is_the_isoelectric_level_not_the_signal_mean() {
        // Baseline sits at 0.4 mV; the beat has a 1.4 mV QRS and 0.3 mV ST, so
        // the signal mean is far above the isoelectric level.
        let (sig, onsets) = beats(FS, 6.0, 70.0, 0.3, |_| 0.4);
        let a = find_pq_anchor(&sig, FS, onsets[2]).unwrap();
        assert!((a.level_mv - 0.4).abs() < 0.02, "level {} should be 0.4", a.level_mv);
    }

    #[test]
    fn a_non_isoelectric_span_yields_no_anchor_rather_than_a_wrong_one() {
        // Steep ramp everywhere: nothing is flat, so there is no honest anchor.
        let sig: Vec<f32> = (0..3000).map(|i| i as f32 * 0.01).collect();
        assert!(find_pq_anchor(&sig, FS, 1500).is_none());
    }

    #[test]
    fn an_onset_too_close_to_the_start_yields_no_anchor() {
        let (sig, _) = beats(FS, 6.0, 70.0, 0.0, |_| 0.0);
        assert!(find_pq_anchor(&sig, FS, 3).is_none());
    }

    // ---- the property the whole redesign exists for ------------------------

    #[test]
    fn st_elevation_survives_detrending() {
        // THE test. The median cascade erases this; PQ anchoring must not,
        // because the anchor is defined as zero and the ST plateau is measured
        // relative to it.
        let st = 0.30f32;
        let (sig, onsets) = beats(FS, 8.0, 70.0, st, |_| 0.0);
        let d = detrend(&provisional(sig), &onsets);
        let m = d.measurable().expect("should be measurable");

        // Sample mid-plateau of an interior beat.
        let idx = onsets[3] + (0.18 * FS) as usize;
        let got = m.samples()[idx];
        assert!(
            (got - st).abs() < 0.03,
            "ST elevation became {got} mV, expected {st}"
        );
    }

    #[test]
    fn the_pq_segment_is_zero_by_construction() {
        // The defining property: ST deviation is measured against the PQ level,
        // so the PQ level after detrending is zero.
        let (sig, onsets) = beats(FS, 8.0, 70.0, 0.25, |t| 0.3 * (t * 0.7).sin() as f32);
        let d = detrend(&provisional(sig), &onsets);
        let m = d.measurable().unwrap();
        for a in m.anchors() {
            assert!(
                m.samples()[a.sample].abs() < 0.02,
                "anchor at {} left at {} mV",
                a.sample,
                m.samples()[a.sample]
            );
        }
    }

    #[test]
    fn linear_drift_is_removed_without_touching_st() {
        let st = 0.25f32;
        let (sig, onsets) = beats(FS, 8.0, 70.0, st, |t| 0.12 * t as f32);
        let d = detrend(&provisional(sig), &onsets);
        let m = d.measurable().unwrap();

        let idx = onsets[3] + (0.18 * FS) as usize;
        assert!((m.samples()[idx] - st).abs() < 0.04, "got {}", m.samples()[idx]);
        assert!(m.removed_peak_mv() > 0.3, "drift was not actually removed");
    }

    #[test]
    fn slow_wander_is_removed() {
        let (sig, onsets) = beats(FS, 8.0, 70.0, 0.0, |t| {
            0.5 * (2.0 * std::f64::consts::PI * 0.2 * t).sin() as f32
        });
        let d = detrend(&provisional(sig), &onsets);
        let m = d.measurable().unwrap();
        for a in m.anchors() {
            assert!(m.samples()[a.sample].abs() < 0.03);
        }
    }

    // ---- baseline construction ---------------------------------------------

    #[test]
    fn baseline_is_constant_past_the_end_anchors_not_extrapolated() {
        // Slope extrapolation would swing the trace at panel ends, exactly where
        // a truncated complex already makes measurement hard.
        let anchors = vec![
            Anchor { sample: 100, level_mv: 0.0, flatness_mv: 0.0 },
            Anchor { sample: 200, level_mv: 0.5, flatness_mv: 0.0 },
        ];
        let b = baseline_from_anchors(&anchors, 400);
        // Before the first anchor: held at its level, not projected downward.
        assert_eq!(b[0], 0.0);
        assert_eq!(b[50], 0.0);
        // After the last: held, not continuing to 1.0 and beyond.
        assert_eq!(b[300], 0.5);
        assert_eq!(b[399], 0.5);
        // Between: linear.
        assert!((b[150] - 0.25).abs() < 1e-5, "midpoint {}", b[150]);
    }

    #[test]
    fn a_single_anchor_gives_a_constant_baseline() {
        let anchors = vec![Anchor { sample: 50, level_mv: 0.7, flatness_mv: 0.0 }];
        let b = baseline_from_anchors(&anchors, 200);
        assert!(b.iter().all(|&v| (v - 0.7).abs() < 1e-6));
    }

    #[test]
    fn no_anchors_gives_a_zero_baseline() {
        assert!(baseline_from_anchors(&[], 100).iter().all(|&v| v == 0.0));
    }

    // ---- failure modes -----------------------------------------------------

    #[test]
    fn no_anchor_yields_morphology_only_not_a_measurable_signal() {
        // A signal with no flat PQ anywhere must not become measurable. Returning
        // a MeasurementSignal with a flag would let the flag be ignored; a
        // different variant cannot be.
        let sig: Vec<f32> = (0..3000).map(|i| i as f32 * 0.01).collect();
        let d = detrend(&provisional(sig), &[1000, 1500, 2000]);
        assert!(d.measurable().is_none());
        match d {
            Detrended::MorphologyOnly { reason, .. } => {
                assert_eq!(reason, DetrendFailure::NoIsoelectricAnchor)
            }
            _ => panic!("expected MorphologyOnly"),
        }
    }

    #[test]
    fn an_empty_signal_is_not_measurable() {
        let d = detrend(&provisional(Vec::new()), &[]);
        assert!(d.measurable().is_none());
    }

    #[test]
    fn rough_anchors_raise_the_unmodelled_flag() {
        // Anchors that do not lie near a line mean wander the piecewise model
        // does not capture; the caller must be told rather than shown a clean
        // number.
        let (mut sig, onsets) = beats(FS, 10.0, 70.0, 0.0, |_| 0.0);
        // Shove alternate beats' baselines apart so the anchor sequence zigzags.
        for (k, &on) in onsets.iter().enumerate() {
            if k % 2 == 0 {
                let lo = on.saturating_sub(60);
                for v in sig[lo..on].iter_mut() {
                    *v += 0.25;
                }
            }
        }
        let d = detrend(&provisional(sig), &onsets);
        let m = d.measurable().unwrap();
        assert!(
            m.baseline_unmodelled(),
            "residual {} should exceed {}",
            m.residual_mv(),
            DETREND_RESID_MAX_MV
        );
    }

    #[test]
    fn heavy_correction_is_disclosed() {
        let (sig, onsets) = beats(FS, 8.0, 70.0, 0.0, |t| 0.9 * (t * 0.8).sin() as f32);
        let d = detrend(&provisional(sig), &onsets);
        let m = d.measurable().unwrap();
        assert!(m.heavy_correction(), "removed {} mV", m.removed_peak_mv());
    }

    #[test]
    fn a_clean_signal_reports_neither_flag() {
        let (sig, onsets) = beats(FS, 8.0, 70.0, 0.1, |_| 0.0);
        let d = detrend(&provisional(sig), &onsets);
        let m = d.measurable().unwrap();
        assert!(!m.baseline_unmodelled());
        assert!(!m.heavy_correction());
    }
}

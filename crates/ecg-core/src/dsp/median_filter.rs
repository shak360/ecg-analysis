//! Constant-time running median, and the pass-1 baseline estimate built from it.
//!
//! # This output must never be measured
//!
//! The median cascade exists for exactly one purpose: giving the QRS detector a
//! reasonably flat signal to work on. Its result is discarded afterwards.
//!
//! The reason is in [`baseline_estimate`]: a running median whose window is
//! shorter than QRS+ST+T tracks the ST segment instead of the baseline, and
//! subtracting it *removes real ST elevation*. There is no artefact to see
//! afterwards — the trace is smooth and the ST segment sits neatly on the
//! baseline. A follow-up study processed this way reports the patient as
//! improved. [`median_filter_erases_st_elevation_when_window_too_short`] pins
//! that behaviour deliberately, so it cannot be rediscovered by accident.
//!
//! Measurements are taken from the original signal after PQ-anchored piecewise
//! detrending instead. Once the `MeasurementSignal` newtype lands (spec §7.5),
//! measuring on this output becomes a compile error.
//!
//! # Algorithm
//!
//! Two-level histogram after Perreault & Hébert (2007): a fine histogram of
//! 1 µV bins spanning ±16.384 mV, plus a coarse histogram of 256 buckets over
//! 128 fine bins each. Median lookup scans at most 256 coarse buckets and then
//! 128 fine bins, so it is O(1) in the window length rather than O(w log w) —
//! and the 600 ms window here is 300 samples at 500 Hz, applied twice, to every
//! lead of every study.

use crate::config::{
    MED_BIN_UV, MED_RANGE_MV, MED_W1_MS, MED_W1_WIDE_MS, MED_W2_MS, MED_W2_WIDE_MS,
    MED_WIDE_QRS_MS, MED_WIDE_RR_MS,
};

/// Fine bins: 1 µV over ±16.384 mV.
const FINE_BINS: usize = 32768;
/// Fine bins per coarse bucket; 2^7 = 128, giving 256 coarse buckets.
const COARSE_SHIFT: u32 = 7;
const COARSE_BINS: usize = FINE_BINS >> COARSE_SHIFT;

/// Millivolts per fine bin.
const BIN_MV: f32 = MED_BIN_UV / 1000.0;

#[inline]
fn to_bin(v_mv: f32) -> usize {
    // Values beyond the histogram's span saturate. At ±16.384 mV that only
    // happens on a saturated or lead-off channel, which the quality metrics
    // reject anyway.
    let x = (v_mv + MED_RANGE_MV) / BIN_MV;
    if !x.is_finite() {
        return FINE_BINS / 2;
    }
    (x.round().max(0.0) as usize).min(FINE_BINS - 1)
}

#[inline]
fn from_bin(bin: usize) -> f32 {
    bin as f32 * BIN_MV - MED_RANGE_MV
}

/// A sliding-window median over a quantised histogram.
pub struct RunningMedian {
    fine: Vec<u16>,
    coarse: Vec<u16>,
    count: usize,
}

impl RunningMedian {
    pub fn new() -> Self {
        RunningMedian {
            fine: vec![0; FINE_BINS],
            coarse: vec![0; COARSE_BINS],
            count: 0,
        }
    }

    pub fn len(&self) -> usize {
        self.count
    }

    pub fn is_empty(&self) -> bool {
        self.count == 0
    }

    pub fn insert(&mut self, v_mv: f32) {
        let b = to_bin(v_mv);
        self.fine[b] += 1;
        self.coarse[b >> COARSE_SHIFT] += 1;
        self.count += 1;
    }

    pub fn remove(&mut self, v_mv: f32) {
        let b = to_bin(v_mv);
        debug_assert!(self.fine[b] > 0, "removing a value that was never inserted");
        self.fine[b] -= 1;
        self.coarse[b >> COARSE_SHIFT] -= 1;
        self.count -= 1;
    }

    pub fn clear(&mut self) {
        self.fine.iter_mut().for_each(|x| *x = 0);
        self.coarse.iter_mut().for_each(|x| *x = 0);
        self.count = 0;
    }

    /// The window's median, quantised to 1 µV.
    ///
    /// For an even count this returns the upper of the two central order
    /// statistics rather than their mean; the difference is one bin, 1 µV, which
    /// is three orders of magnitude below anything clinical.
    pub fn median(&self) -> f32 {
        if self.count == 0 {
            return 0.0;
        }
        let target = self.count / 2; // 0-indexed rank of the value we want

        let mut seen = 0usize;
        let mut c = 0usize;
        while c < COARSE_BINS {
            let n = self.coarse[c] as usize;
            if seen + n > target {
                break;
            }
            seen += n;
            c += 1;
        }

        let base = c << COARSE_SHIFT;
        for f in base..(base + (1 << COARSE_SHIFT)).min(FINE_BINS) {
            seen += self.fine[f] as usize;
            if seen > target {
                return from_bin(f);
            }
        }
        from_bin(FINE_BINS - 1)
    }
}

impl Default for RunningMedian {
    fn default() -> Self {
        Self::new()
    }
}

/// Running median of `x` over a centred window of `window` samples.
///
/// The window is truncated at the signal's ends rather than padded. Reflect- or
/// edge-padding here would invent samples, and at a panel boundary the invented
/// samples are a mirrored QRS.
pub fn median_filter(x: &[f32], window: usize) -> Vec<f32> {
    let n = x.len();
    if n == 0 {
        return Vec::new();
    }
    let w = window.max(1);
    if w <= 1 {
        return x.to_vec();
    }

    let half = (w - 1) / 2;
    let mut rm = RunningMedian::new();
    let mut out = Vec::with_capacity(n);

    let mut lo = 0usize;
    let mut hi = 0usize; // exclusive
    for i in 0..n {
        let want_lo = i.saturating_sub(half);
        let want_hi = (i + half + 1).min(n);

        while hi < want_hi {
            rm.insert(x[hi]);
            hi += 1;
        }
        while lo < want_lo {
            rm.remove(x[lo]);
            lo += 1;
        }

        out.push(rm.median());
    }
    out
}

/// Window lengths for the pass-1 cascade, in samples.
///
/// The wide pair is selected when the QRS is broad or the rate is fast, because
/// the hard rule is that the second window must exceed 1.2 × QT — otherwise the
/// filter tracks repolarisation instead of the baseline.
pub fn cascade_windows(fs_hz: f64, qrs_ms: Option<f64>, rr_ms: Option<f64>) -> (usize, usize) {
    let wide = qrs_ms.is_some_and(|q| q > MED_WIDE_QRS_MS)
        || rr_ms.is_some_and(|r| r < MED_WIDE_RR_MS);
    let (w1_ms, w2_ms) = if wide {
        (MED_W1_WIDE_MS, MED_W2_WIDE_MS)
    } else {
        (MED_W1_MS, MED_W2_MS)
    };
    (to_odd_samples(w1_ms, fs_hz), to_odd_samples(w2_ms, fs_hz))
}

/// Convert a duration to an odd sample count, so the window is symmetric.
fn to_odd_samples(ms: f64, fs_hz: f64) -> usize {
    let n = (ms / 1000.0 * fs_hz).round().max(1.0) as usize;
    if n.is_multiple_of(2) { n + 1 } else { n }
}

/// Verify the hard rule that the second cascade window exceeds 1.2 × QT.
///
/// Called once QT is actually known. A false return means the pass-1 signal was
/// filtered with a window that could have tracked repolarisation.
pub fn cascade_window_is_adequate(w2_samples: usize, fs_hz: f64, qt_ms: f64) -> bool {
    let w2_ms = w2_samples as f64 / fs_hz * 1000.0;
    w2_ms >= 1.2 * qt_ms
}

/// Pass-1 baseline estimate: the median cascade.
///
/// **The return value is a baseline estimate, not a signal to measure.**
pub fn baseline_estimate(
    x: &[f32],
    fs_hz: f64,
    qrs_ms: Option<f64>,
    rr_ms: Option<f64>,
) -> Vec<f32> {
    let (w1, w2) = cascade_windows(fs_hz, qrs_ms, rr_ms);
    let stage1 = median_filter(x, w1);
    median_filter(&stage1, w2)
}

/// Pass-1 detrended signal, for beat detection only.
///
/// See the module docs: this result is discarded once beats are located, and the
/// measurement path re-derives its baseline from PQ anchors on the original.
pub fn provisional_detrend(
    x: &[f32],
    fs_hz: f64,
    qrs_ms: Option<f64>,
    rr_ms: Option<f64>,
) -> Vec<f32> {
    let base = baseline_estimate(x, fs_hz, qrs_ms, rr_ms);
    x.iter().zip(&base).map(|(a, b)| a - b).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::FS;

    /// Straightforward reference implementation to check the histogram against.
    fn naive_median_filter(x: &[f32], w: usize) -> Vec<f32> {
        let n = x.len();
        let half = (w - 1) / 2;
        (0..n)
            .map(|i| {
                let lo = i.saturating_sub(half);
                let hi = (i + half + 1).min(n);
                let mut v: Vec<f32> = x[lo..hi].to_vec();
                v.sort_by(|a, b| a.partial_cmp(b).unwrap());
                v[v.len() / 2]
            })
            .collect()
    }

    fn lcg(seed: u32) -> impl FnMut() -> f32 {
        let mut s = seed;
        move || {
            s = s.wrapping_mul(1664525).wrapping_add(1013904223);
            (s >> 8) as f32 / 16777216.0 - 0.5
        }
    }

    #[test]
    fn matches_a_naive_implementation() {
        let mut rnd = lcg(7);
        let x: Vec<f32> = (0..500).map(|_| rnd() * 4.0).collect();
        for &w in &[3usize, 9, 51, 101] {
            let fast = median_filter(&x, w);
            let slow = naive_median_filter(&x, w);
            for i in 0..x.len() {
                // The histogram quantises to 1 uV, so allow one bin.
                assert!(
                    (fast[i] - slow[i]).abs() <= 1.01 * BIN_MV,
                    "w={w} i={i}: {} vs {}",
                    fast[i],
                    slow[i]
                );
            }
        }
    }

    #[test]
    fn constant_signal_is_unchanged() {
        let x = vec![0.42f32; 200];
        for v in median_filter(&x, 51) {
            assert!((v - 0.42).abs() <= BIN_MV);
        }
    }

    #[test]
    fn impulse_is_removed() {
        let mut x = vec![0.0f32; 200];
        x[100] = 5.0;
        let out = median_filter(&x, 21);
        assert!(out.iter().all(|v| v.abs() <= BIN_MV), "impulse survived");
    }

    #[test]
    fn step_edge_is_preserved() {
        // Edge preservation is why a median is used rather than a moving average.
        let mut x = vec![0.0f32; 200];
        x[100..].iter_mut().for_each(|v| *v = 1.0);
        let out = median_filter(&x, 21);
        assert!(out[80].abs() <= BIN_MV);
        assert!((out[120] - 1.0).abs() <= BIN_MV);
        // The transition must be sharp, not smeared across the window.
        let transition = out.iter().filter(|v| **v > 0.05 && **v < 0.95).count();
        assert!(transition <= 1, "step was smeared over {transition} samples");
    }

    #[test]
    fn window_is_truncated_not_padded_at_the_ends() {
        // A rising ramp: with padding, the first output would be pulled toward a
        // reflected value. Truncation makes it the median of what exists.
        let x: Vec<f32> = (0..101).map(|i| i as f32 * 0.01).collect();
        let out = median_filter(&x, 21);
        // At i=0 the window is [0..11), median index 5 => 0.05.
        assert!((out[0] - 0.05).abs() <= 1.01 * BIN_MV, "got {}", out[0]);
    }

    #[test]
    fn handles_empty_and_single_sample_input() {
        assert!(median_filter(&[], 51).is_empty());
        assert_eq!(median_filter(&[1.5], 51).len(), 1);
    }

    #[test]
    fn saturating_values_do_not_panic() {
        let x = vec![1e9f32, -1e9, f32::NAN, 0.0, 1e9];
        let out = median_filter(&x, 3);
        assert_eq!(out.len(), 5);
        assert!(out.iter().all(|v| v.is_finite()));
    }

    // ---- window selection --------------------------------------------------

    #[test]
    fn windows_are_odd_and_scale_with_rate() {
        let (w1, w2) = cascade_windows(FS, None, None);
        assert!(!w1.is_multiple_of(2));
        assert!(!w2.is_multiple_of(2));
        assert_eq!(w1, 101); // 200 ms at 500 Hz
        assert_eq!(w2, 301); // 600 ms at 500 Hz
    }

    #[test]
    fn wide_cascade_fires_on_broad_qrs_or_fast_rate() {
        let (_, narrow) = cascade_windows(FS, Some(90.0), Some(900.0));
        let (_, wide_qrs) = cascade_windows(FS, Some(150.0), Some(900.0));
        let (_, wide_rr) = cascade_windows(FS, Some(90.0), Some(600.0));
        assert_eq!(narrow, 301);
        assert_eq!(wide_qrs, 375); // 750 ms
        assert_eq!(wide_rr, 375);
    }

    #[test]
    fn adequacy_check_enforces_the_1_point_2_qt_rule() {
        // 600 ms window against a 400 ms QT: 600 >= 480, adequate.
        assert!(cascade_window_is_adequate(301, FS, 400.0));
        // Against a long QT of 520 ms: 600 < 624, inadequate.
        assert!(!cascade_window_is_adequate(301, FS, 520.0));
        // The wide window covers it.
        assert!(cascade_window_is_adequate(375, FS, 520.0));
    }

    // ---- the reason this output is discarded -------------------------------

    /// Synthesise a beat train with a flat ST segment elevated by `st_mv`.
    fn beats_with_st(fs: f64, secs: f64, hr: f64, st_mv: f32) -> Vec<f32> {
        let n = (fs * secs) as usize;
        let rr = 60.0 / hr;
        (0..n)
            .map(|i| {
                let t = i as f64 / fs;
                let phase = t % rr;
                if phase < 0.02 {
                    1.5 // QRS
                } else if phase < 0.34 {
                    st_mv // ST-T plateau, elevated
                } else {
                    0.0 // TP baseline
                }
            })
            .collect()
    }

    #[test]
    fn median_filter_erases_st_elevation_when_window_too_short() {
        // THE hazard this module is quarantined for. A window shorter than
        // QRS+ST+T follows the elevated plateau, so subtracting it deletes the
        // elevation. Nothing looks wrong afterwards, which is what makes it
        // dangerous: a follow-up study reads as improved.
        let fs = FS;
        let x = beats_with_st(fs, 6.0, 75.0, 0.30);

        let short = median_filter(&x, to_odd_samples(150.0, fs));
        let detrended: Vec<f32> = x.iter().zip(&short).map(|(a, b)| a - b).collect();

        // Sample mid-plateau of an interior beat.
        let rr = 60.0 / 75.0;
        let idx = ((2.0 * rr + 0.18) * fs) as usize;
        assert!(
            detrended[idx].abs() < 0.10,
            "expected the short window to have eaten the 0.30 mV elevation, \
             but {} mV survived — if this now passes, re-derive the window rule",
            detrended[idx]
        );
    }

    #[test]
    fn adequate_window_leaves_st_elevation_largely_intact() {
        // The same signal with a window that satisfies the rule. Some attenuation
        // is expected — which is exactly why measurements do not come from here.
        let fs = FS;
        let x = beats_with_st(fs, 6.0, 75.0, 0.30);

        let base = baseline_estimate(&x, fs, Some(150.0), Some(600.0)); // wide: 750 ms
        let detrended: Vec<f32> = x.iter().zip(&base).map(|(a, b)| a - b).collect();

        let rr = 60.0 / 75.0;
        let idx = ((2.0 * rr + 0.18) * fs) as usize;
        assert!(
            detrended[idx] > 0.15,
            "the wide cascade should preserve most of the elevation, got {}",
            detrended[idx]
        );
    }

    #[test]
    fn provisional_detrend_removes_slow_wander() {
        // What pass 1 is actually for: flattening wander so beat detection works.
        let fs = FS;
        let n = (fs * 6.0) as usize;
        let mut x = beats_with_st(fs, 6.0, 75.0, 0.0);
        for (i, v) in x.iter_mut().enumerate() {
            let t = i as f64 / fs;
            *v += (0.8 * (2.0 * std::f64::consts::PI * 0.25 * t).sin()) as f32;
        }

        let out = provisional_detrend(&x, fs, None, None);
        // Baseline segments should sit near zero despite the 0.8 mV wander.
        let rr = 60.0 / 75.0;
        for k in 1..6 {
            let idx = ((k as f64 * rr + 0.55) * fs) as usize;
            if idx < n {
                assert!(out[idx].abs() < 0.20, "wander survived at beat {k}: {}", out[idx]);
            }
        }
    }

    // ---- the histogram itself ----------------------------------------------

    #[test]
    fn running_median_tracks_insertions_and_removals() {
        let mut rm = RunningMedian::new();
        for v in [1.0f32, 3.0, 2.0, 5.0, 4.0] {
            rm.insert(v);
        }
        assert_eq!(rm.len(), 5);
        assert!((rm.median() - 3.0).abs() <= BIN_MV);

        rm.remove(3.0);
        rm.remove(5.0);
        // Remaining {1, 2, 4}: median 2.
        assert!((rm.median() - 2.0).abs() <= BIN_MV);

        rm.clear();
        assert!(rm.is_empty());
        assert_eq!(rm.median(), 0.0);
    }

    #[test]
    fn running_median_handles_negative_values() {
        let mut rm = RunningMedian::new();
        for v in [-2.5f32, -0.5, -1.5] {
            rm.insert(v);
        }
        assert!((rm.median() - (-1.5)).abs() <= BIN_MV);
    }

    #[test]
    fn coarse_and_fine_levels_stay_consistent() {
        // Values chosen to straddle several coarse buckets.
        let mut rm = RunningMedian::new();
        let vals: Vec<f32> = (0..300).map(|i| (i as f32 - 150.0) * 0.05).collect();
        for &v in &vals {
            rm.insert(v);
        }
        let mut sorted = vals.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let expect = sorted[sorted.len() / 2];
        assert!((rm.median() - expect).abs() <= 1.01 * BIN_MV);
    }
}

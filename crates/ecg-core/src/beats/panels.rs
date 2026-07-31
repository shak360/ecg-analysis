//! Proving that each lead panel sits where the layout says it does.
//!
//! A 3×4 printout gives each lead a 2.5 s window at its column's offset: leads
//! I/II/III cover 0–2.5 s, aVR/aVL/aVF cover 2.5–5 s, and so on. Panel geometry
//! *asserts* that mapping; this module *verifies* it, by matching the beats
//! visible inside each panel against the beats the rhythm strip found at the
//! same absolute times.
//!
//! Without the check, a swapped or misordered column reads as "new ST elevation
//! in V2 that resolved in V3" — a coherent, plausible, entirely fabricated
//! finding. Geometry alone cannot catch it, because a swapped column is still
//! perfectly rectangular and in the right place on the page.
//!
//! The second job here is the panel edge. A column boundary bisects whatever
//! complex happens to be crossing it, leaving a half-drawn upstroke: high
//! amplitude, high slope, and exactly what a peak detector wants to promote to a
//! beat. Averaging that truncated complex into an ensemble pulls the result
//! toward baseline and fabricates T-wave flattening or a shrunken R wave. Such
//! beats are *excluded*, never zero-padded — padding does the same damage more
//! quietly, scaled by 1/n.

use crate::beats::detect::Beat;
use crate::config::{
    EDGE_DISCONT_MV, EDGE_MARGIN_MS, PANEL_EXCLUDE_TOL_MS, PANEL_MATCH_TOL_MS,
    PANEL_MIN_MATCHED_BEATS, PANEL_TAU_TOL_MS, PANEL_WINDOW_S,
};

/// Outcome of verifying one panel's time base.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PanelFlag {
    /// Panel beats matched strip beats within tolerance at the expected offset.
    Verified,
    /// Matched only after shifting the offset; usable, but the layout disagreed
    /// with the geometry and the user should be told.
    Corrected,
    /// No consistent offset found, or too few beats to judge. The panel is
    /// excluded from serial comparison — its identity cannot be trusted.
    Excluded(PanelExclusion),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PanelExclusion {
    /// Fewer than `PANEL_MIN_MATCHED_BEATS` beats matched.
    TooFewMatches,
    /// Best achievable residual exceeded `PANEL_EXCLUDE_TOL_MS`.
    OffsetImplausible,
    /// The panel contained no detectable beats at all.
    NoBeats,
}

/// A panel's verified relationship to the rhythm strip.
#[derive(Debug, Clone)]
pub struct PanelMapping {
    /// Column index, 0-based, left to right.
    pub column: usize,
    /// Offset from the record's start to this panel's first sample, seconds.
    /// This is the *verified* value, which may differ from the nominal one.
    pub tau_s: f64,
    /// Nominal offset implied by the layout: `column × PANEL_WINDOW_S`.
    pub tau_nominal_s: f64,
    pub flag: PanelFlag,
    /// Beats matched against the strip.
    pub matched: usize,
    /// Median absolute residual of the matches, seconds.
    pub residual_s: f64,
    /// True when the verified offset departs from the standard 2.5 s cadence by
    /// more than `PANEL_TAU_TOL_MS`, i.e. this is not a standard layout.
    pub non_standard_cadence: bool,
}

impl PanelMapping {
    /// Whether this panel may take part in serial comparison.
    pub fn usable(&self) -> bool {
        !matches!(self.flag, PanelFlag::Excluded(_))
    }
}

/// Why a beat inside a panel may not be used for a given measurement.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BeatRejection {
    /// The beat's R peak sits inside the panel's edge margin.
    InEdgeMargin,
    /// The measurement window runs past the panel's start or end.
    WindowClipped,
    /// The trace is discontinuous within the window — a truncated complex.
    Truncated,
}

/// Which beats support a specific measurement on a specific panel.
///
/// Computed per measurement rather than per beat, because a beat can be perfectly
/// adequate for QRS duration and useless for a T-offset that runs off the panel.
#[derive(Debug, Clone)]
pub struct BeatSupport {
    /// Indices into the strip's beat list that support this measurement.
    pub used: Vec<usize>,
    /// Rejected beats, with the reason.
    pub rejected: Vec<(usize, BeatRejection)>,
}

impl BeatSupport {
    pub fn n_used(&self) -> usize {
        self.used.len()
    }

    pub fn n_rejected(&self) -> usize {
        self.rejected.len()
    }

    /// A measurement with no supporting beats is unavailable, never zero.
    pub fn is_empty(&self) -> bool {
        self.used.is_empty()
    }
}

/// Beat times observed inside one panel, in seconds from the panel's own start.
///
/// These come from running detection on the panel trace itself. They are only
/// used to *verify* the mapping — the strip remains the timing authority.
pub type PanelBeatTimes = [f64];

/// Verify one panel against the rhythm strip's beats.
///
/// `strip_beats` are in seconds from the record's start; `panel_beats` in seconds
/// from the panel's own left edge. `column` gives the nominal offset.
pub fn verify_panel(
    column: usize,
    panel_beats: &PanelBeatTimes,
    strip_beats: &[Beat],
    panel_duration_s: f64,
) -> PanelMapping {
    let tau_nominal = column as f64 * PANEL_WINDOW_S;
    let match_tol = PANEL_MATCH_TOL_MS / 1000.0;
    let exclude_tol = PANEL_EXCLUDE_TOL_MS / 1000.0;

    let base = PanelMapping {
        column,
        tau_s: tau_nominal,
        tau_nominal_s: tau_nominal,
        flag: PanelFlag::Excluded(PanelExclusion::NoBeats),
        matched: 0,
        residual_s: f64::INFINITY,
        non_standard_cadence: false,
    };

    if panel_beats.is_empty() || strip_beats.is_empty() {
        return base;
    }

    // Geometry proposes; timing disposes.
    //
    // The nominal offset is tried first and kept unless the beats actually
    // contradict it. This ordering is not a convenience — it is forced by an
    // ambiguity in the problem. Under a perfectly regular rhythm every offset
    // differing by a whole RR interval fits the beats equally well, so a free
    // search would pick an arbitrary member of a tie and "correct" a panel that
    // was right all along. See the regular-rhythm test: with an isochronous
    // rhythm, a whole-RR column swap is undetectable from timing, and the
    // defence against it is the lead-identity check, not this module.
    let evaluate = |tau: f64| -> Option<(usize, f64)> {
        let mut residuals: Vec<f64> = Vec::new();
        for pb in panel_beats.iter() {
            let absolute = tau + pb;
            let nearest = strip_beats
                .iter()
                .map(|sb| (sb.r_time_s - absolute).abs())
                .fold(f64::INFINITY, f64::min);
            if nearest <= exclude_tol {
                residuals.push(nearest);
            }
        }
        if residuals.is_empty() {
            return None;
        }
        residuals.sort_by(|a, b| a.partial_cmp(b).unwrap());
        Some((residuals.len(), residuals[residuals.len() / 2]))
    };

    if let Some((matched, residual)) = evaluate(tau_nominal) {
        if matched >= PANEL_MIN_MATCHED_BEATS && residual <= match_tol {
            return PanelMapping {
                column,
                tau_s: tau_nominal,
                tau_nominal_s: tau_nominal,
                flag: PanelFlag::Verified,
                matched,
                residual_s: residual,
                non_standard_cadence: false,
            };
        }
    }

    // The nominal offset did not hold up. Search for one that does, preferring
    // more matches, then the placement closest to where geometry said it should
    // be, then the tightest residual.
    let mut candidates: Vec<f64> = vec![tau_nominal];
    for pb in panel_beats.iter() {
        for sb in strip_beats {
            candidates.push(sb.r_time_s - pb);
        }
    }

    let mut best: Option<(f64, usize, f64)> = None; // (tau, matched, residual)
    for &tau in &candidates {
        if tau < -exclude_tol || tau > 12.0 {
            continue; // physically impossible placement in a 10 s record
        }
        let Some((matched, residual)) = evaluate(tau) else { continue };

        let better = match best {
            None => true,
            Some((bt, bm, br)) => {
                let d = (tau - tau_nominal).abs();
                let bd = (bt - tau_nominal).abs();
                matched > bm
                    || (matched == bm && d < bd - 1e-9)
                    || (matched == bm && (d - bd).abs() <= 1e-9 && residual < br)
            }
        };
        if better {
            best = Some((tau, matched, residual));
        }
    }

    let (tau, matched, residual) = match best {
        Some(v) => v,
        None => {
            return PanelMapping {
                flag: PanelFlag::Excluded(PanelExclusion::OffsetImplausible),
                ..base
            }
        }
    };

    if matched < PANEL_MIN_MATCHED_BEATS {
        return PanelMapping {
            tau_s: tau,
            matched,
            residual_s: residual,
            flag: PanelFlag::Excluded(PanelExclusion::TooFewMatches),
            ..base
        };
    }

    let departure = (tau - tau_nominal).abs();
    let flag = if residual > exclude_tol || departure > exclude_tol {
        PanelFlag::Excluded(PanelExclusion::OffsetImplausible)
    } else if departure <= match_tol && residual <= match_tol {
        PanelFlag::Verified
    } else {
        PanelFlag::Corrected
    };

    let _ = panel_duration_s;

    PanelMapping {
        column,
        tau_s: tau,
        tau_nominal_s: tau_nominal,
        flag,
        matched,
        residual_s: residual,
        non_standard_cadence: departure > PANEL_TAU_TOL_MS / 1000.0,
    }
}

/// Decide which beats support a measurement spanning `[win_start_s, win_end_s]`
/// relative to each beat's R peak.
///
/// `beat_times_in_panel` are R times in seconds from the panel's left edge.
pub fn beat_support(
    beat_times_in_panel: &[f64],
    panel_duration_s: f64,
    win_start_s: f64,
    win_end_s: f64,
    panel_signal: Option<(&[f32], f64)>,
) -> BeatSupport {
    let margin = EDGE_MARGIN_MS / 1000.0;
    let mut used = Vec::new();
    let mut rejected = Vec::new();

    for (i, &r) in beat_times_in_panel.iter().enumerate() {
        // A complex whose R peak sits in the edge margin is very likely truncated
        // by the column boundary, whatever the measurement window says.
        if r < margin || r > panel_duration_s - margin {
            rejected.push((i, BeatRejection::InEdgeMargin));
            continue;
        }
        // The measurement window itself must fit inside the panel.
        if r + win_start_s < 0.0 || r + win_end_s > panel_duration_s {
            rejected.push((i, BeatRejection::WindowClipped));
            continue;
        }
        // A step discontinuity inside the window means the pen left the panel and
        // came back, so the samples between are not one continuous complex.
        if let Some((sig, fs)) = panel_signal {
            if window_is_discontinuous(sig, fs, r + win_start_s, r + win_end_s) {
                rejected.push((i, BeatRejection::Truncated));
                continue;
            }
        }
        used.push(i);
    }

    BeatSupport { used, rejected }
}

/// True when the window contains an adjacent-sample jump larger than
/// [`EDGE_DISCONT_MV`].
fn window_is_discontinuous(sig: &[f32], fs: f64, from_s: f64, to_s: f64) -> bool {
    let a = (from_s * fs).floor().max(0.0) as usize;
    let b = ((to_s * fs).ceil() as usize).min(sig.len());
    if b <= a + 1 {
        return false;
    }
    sig[a..b]
        .windows(2)
        .any(|w| (w[1] - w[0]).abs() > EDGE_DISCONT_MV)
}

/// Map strip beats into a panel's local time frame.
///
/// Returns R times in seconds from the panel's left edge, for beats that fall
/// inside the panel at all. This is how a panel inherits the strip's timing
/// rather than deriving its own.
pub fn project_strip_beats(
    strip_beats: &[Beat],
    tau_s: f64,
    panel_duration_s: f64,
) -> Vec<(usize, f64)> {
    strip_beats
        .iter()
        .enumerate()
        .filter_map(|(i, b)| {
            let local = b.r_time_s - tau_s;
            (local >= 0.0 && local <= panel_duration_s).then_some((i, local))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::beats::detect::BeatClass;

    fn strip_at(times: &[f64]) -> Vec<Beat> {
        times
            .iter()
            .map(|&t| Beat {
                r_sample: (t * 500.0) as usize,
                r_time_s: t,
                rr_prev_s: None,
                r_amplitude_mv: 1.2,
                class: BeatClass::Normal,
                via_searchback: false,
            })
            .collect()
    }

    /// A 10 s strip at 60 bpm.
    fn regular_strip() -> Vec<Beat> {
        strip_at(&[0.4, 1.4, 2.4, 3.4, 4.4, 5.4, 6.4, 7.4, 8.4, 9.4])
    }

    #[test]
    fn a_correctly_placed_panel_verifies() {
        // Column 2 covers 5.0-7.5 s, so it contains beats at 5.4, 6.4, 7.4,
        // which are 0.4, 1.4 and 2.4 s into the panel.
        let m = verify_panel(2, &[0.4, 1.4, 2.4], &regular_strip(), 2.5);
        assert_eq!(m.flag, PanelFlag::Verified);
        assert!(m.matched >= 3);
        assert!((m.tau_s - 5.0).abs() < 0.02, "tau {}", m.tau_s);
        assert!(!m.non_standard_cadence);
        assert!(m.usable());
    }

    /// An irregular 10 s strip. Irregularity is what makes panel placement
    /// identifiable at all — see `regular_rhythm_cannot_detect_a_whole_rr_swap`.
    fn irregular_strip() -> Vec<Beat> {
        strip_at(&[0.4, 1.4, 2.4, 3.4, 4.4, 5.4, 6.4, 7.6, 8.3, 9.5])
    }

    #[test]
    fn a_swapped_column_is_caught() {
        // THE failure this module exists for. Geometry says column 2 (5.0 s), but
        // the panel actually holds column 3's beats (7.6, 8.3, 9.5 absolute, so
        // 0.1, 0.8 and 2.0 s into a panel starting at 7.5). Nothing about the
        // panel's appearance reveals this; only the timing does.
        let m = verify_panel(2, &[0.1, 0.8, 2.0], &irregular_strip(), 2.5);
        assert!(
            !matches!(m.flag, PanelFlag::Verified),
            "swapped column was reported as Verified (tau {})",
            m.tau_s
        );
        assert!(!m.usable(), "a swapped column must not enter serial comparison");
        assert_eq!(m.flag, PanelFlag::Excluded(PanelExclusion::OffsetImplausible));
    }

    #[test]
    fn regular_rhythm_cannot_detect_a_whole_rr_swap() {
        // A limitation, documented rather than papered over. Under a perfectly
        // isochronous rhythm every offset differing by a whole RR fits the beats
        // identically, so a column swapped by an exact multiple of RR is
        // invisible to timing. This module therefore keeps the nominal offset,
        // which is the safe default; the real defence against swapped columns is
        // the Einthoven/Goldberger lead-identity check, which does not depend on
        // the rhythm being irregular.
        //
        // If this ever starts failing, someone has taught the offset search to
        // guess among ties — which will silently "correct" correctly-placed
        // panels on the majority of ECGs, since most are regular.
        let m = verify_panel(2, &[0.4, 1.4, 2.4], &regular_strip(), 2.5);
        assert_eq!(m.flag, PanelFlag::Verified);
        assert!((m.tau_s - 5.0).abs() < 1e-9, "drifted off nominal to {}", m.tau_s);
    }

    #[test]
    fn a_small_offset_is_corrected_and_flagged_not_silently_accepted() {
        // Panel truly starts 90 ms late at 2.59 s, so it holds the beats at 3.4
        // and 4.4 absolute, i.e. 0.81 and 1.81 s locally. That is past the 40 ms
        // accept tolerance and inside the 150 ms exclusion tolerance.
        let m = verify_panel(1, &[0.81, 1.81], &regular_strip(), 2.5);
        assert_eq!(m.flag, PanelFlag::Corrected);
        assert!(m.usable(), "a correctable panel should still be usable");
        assert!(
            (m.residual_s - 0.09).abs() < 0.02,
            "residual {} should be about 90 ms",
            m.residual_s
        );
    }

    #[test]
    fn a_panel_with_no_consistent_offset_is_excluded() {
        // Beat spacing that matches no rhythm in the strip.
        let m = verify_panel(1, &[0.13, 0.72, 1.06, 2.31], &regular_strip(), 2.5);
        if let PanelFlag::Excluded(_) = m.flag {
            // expected
        } else {
            assert!(m.residual_s > PANEL_MATCH_TOL_MS / 1000.0, "spurious match");
        }
    }

    #[test]
    fn too_few_matched_beats_excludes_the_panel() {
        let m = verify_panel(1, &[0.4], &regular_strip(), 2.5);
        assert_eq!(m.flag, PanelFlag::Excluded(PanelExclusion::TooFewMatches));
        assert!(!m.usable());
    }

    #[test]
    fn an_empty_panel_is_excluded_rather_than_assumed_correct() {
        let m = verify_panel(1, &[], &regular_strip(), 2.5);
        assert_eq!(m.flag, PanelFlag::Excluded(PanelExclusion::NoBeats));
        assert!(!m.usable());
    }

    // ---- edge policy -------------------------------------------------------

    #[test]
    fn a_beat_bisected_by_the_panel_boundary_is_excluded() {
        // The spec's acceptance test. A complex 30 ms from the edge is inside the
        // 60 ms margin: half-drawn, high-slope, and exactly what a peak detector
        // wants. It must be dropped and n_used must fall.
        let beats = [0.03, 0.8, 1.6, 2.47];
        let s = beat_support(&beats, 2.5, -0.2, 0.4, None);
        assert_eq!(s.n_used(), 2, "edge beats were not excluded");
        assert_eq!(s.n_rejected(), 2);
        assert!(
            s.rejected.iter().all(|(_, r)| *r == BeatRejection::InEdgeMargin),
            "wrong rejection reason: {:?}",
            s.rejected
        );
    }

    #[test]
    fn support_is_per_measurement_not_per_beat() {
        // One beat, two windows. A short window fits; a long one runs off the
        // panel. The same beat is therefore usable for QRS duration and unusable
        // for a T offset — which is why support is computed per measurement.
        let beats = [2.30];
        let short = beat_support(&beats, 2.5, -0.05, 0.10, None);
        let long = beat_support(&beats, 2.5, -0.20, 0.60, None);
        assert_eq!(short.n_used(), 1);
        assert_eq!(long.n_used(), 0);
        assert_eq!(long.rejected[0].1, BeatRejection::WindowClipped);
    }

    #[test]
    fn a_measurement_with_no_support_is_empty_not_zero() {
        let s = beat_support(&[0.01, 2.49], 2.5, -0.2, 0.4, None);
        assert!(s.is_empty());
        assert_eq!(s.n_used(), 0);
    }

    #[test]
    fn a_discontinuous_window_is_rejected_as_truncated() {
        // A pen-lift inside the measurement window: the samples either side are
        // not one continuous complex, so the beat cannot support a measurement.
        let fs = 500.0;
        let mut sig = vec![0.0f32; 1250];
        for (i, v) in sig.iter_mut().enumerate() {
            *v = if i < 600 { 0.0 } else { 1.2 }; // 1.2 mV step, far above the threshold
        }
        let beats = [1.25];
        let s = beat_support(&beats, 2.5, -0.2, 0.4, Some((&sig, fs)));
        assert_eq!(s.n_used(), 0);
        assert_eq!(s.rejected[0].1, BeatRejection::Truncated);
    }

    #[test]
    fn a_continuous_window_is_accepted() {
        let fs = 500.0;
        let sig: Vec<f32> = (0..1250).map(|i| (i as f32 * 0.001).sin() * 0.3).collect();
        let s = beat_support(&[1.25], 2.5, -0.2, 0.4, Some((&sig, fs)));
        assert_eq!(s.n_used(), 1);
    }

    // ---- projection --------------------------------------------------------

    #[test]
    fn strip_beats_project_into_panel_local_time() {
        let strip = regular_strip();
        let got = project_strip_beats(&strip, 5.0, 2.5);
        let times: Vec<f64> = got.iter().map(|&(_, t)| t).collect();
        assert_eq!(got.len(), 3);
        for (a, b) in times.iter().zip([0.4, 1.4, 2.4]) {
            assert!((a - b).abs() < 1e-9, "{a} vs {b}");
        }
        // Indices refer back to the strip, so a panel measurement can always be
        // traced to the beat that produced it.
        assert_eq!(got[0].0, 5);
    }

    #[test]
    fn projection_drops_beats_outside_the_panel() {
        let strip = regular_strip();
        assert!(project_strip_beats(&strip, 20.0, 2.5).is_empty());
    }
}

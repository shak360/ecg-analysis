//! Clinical measurements from registered ensemble beats.
//!
//! Every value is an `Option`. A measurement that could not be made returns
//! `None` and is rendered as "unmeasurable", never as zero and never as a
//! plausible-looking number — a fabricated interval propagates into QTc, into
//! the serial delta, and into whatever the reader concludes from it.
//!
//! Amplitudes are millivolts relative to the PQ isoelectric level, which the
//! detrend stage set to zero by construction. Intervals are milliseconds
//! measured from the study's own global fiducials.

use crate::config::{
    FS, MIN_BEATS_FOR_DELTA, ST_CAP_MS_BY_HR, ST_J60_WIN_MS, ST_J_WIN_MS, ST_SLOPE_PTS_MS,
    ST_TPEAK_GUARD_FRAC,
};
use crate::fiducial::GlobalFiducials;

/// Per-lead amplitudes, all in millivolts about the isoelectric line.
#[derive(Debug, Clone, Default)]
pub struct LeadMeasurements {
    pub lead: String,
    /// ST level at the J point, averaged over the first 20 ms.
    pub st_j_mv: Option<f32>,
    /// ST level one grid period about J+60 ms.
    pub st_j60_mv: Option<f32>,
    /// ST slope between J+20 and J+80 ms, mV/s.
    pub st_slope_mv_s: Option<f32>,
    /// Tallest positive deflection within the QRS.
    pub r_amplitude_mv: Option<f32>,
    /// Deepest negative deflection after the R peak within the QRS.
    pub s_amplitude_mv: Option<f32>,
    /// Initial negative deflection before the first positive one.
    pub q_amplitude_mv: Option<f32>,
    pub q_duration_ms: Option<f32>,
    /// Peak T amplitude within the repolarisation window.
    pub t_amplitude_mv: Option<f32>,
    /// mV, 1σ beat-to-beat spread at the J point. `None` when unestimable — at
    /// n = 1, or on any path that returned before measuring.
    ///
    /// This was a plain `f32` and the struct derives `Default`, so both early
    /// returns below reported σ = 0 for a lead whose QRS boundaries were never
    /// found. The resulting serial row read `mdc: 0.0040, belowLimit: false`,
    /// which every downstream reader treats as "resolved, no change" — perfect
    /// certainty about a lead nobody looked at.
    pub sigma_ens_mv: Option<f32>,
    /// mV, 1σ gain contribution at this lead's ST level. `None` for the same
    /// reasons, and additionally when no gain was ever recorded.
    ///
    /// Separate from `sigma_ens_mv` because ρ applies here and nowhere else:
    /// two studies off the same cart share their gain error and share none of
    /// their beat-to-beat noise, and folding the two together makes an
    /// evidenced correlation unrepresentable.
    pub sigma_gain_mv: Option<f32>,
    /// Why an ST value is absent, when it is.
    pub st_note: Option<&'static str>,
}

/// One study's measurements.
#[derive(Debug, Clone, Default)]
pub struct StudyMeasurements {
    pub hr_bpm: Option<f64>,
    pub qrs_ms: Option<f64>,
    pub qt_ms: Option<f64>,
    /// Fridericia, the default: QT / RR^(1/3).
    pub qtc_fridericia_ms: Option<f64>,
    /// Bazett, shown only as a labelled secondary; it must not drive a verdict.
    pub qtc_bazett_ms: Option<f64>,
    /// Frontal-plane QRS axis in degrees, from net areas in I and aVF.
    pub axis_deg: Option<f32>,
    /// Why QT is absent, when it is.
    pub qt_note: Option<&'static str>,
    pub leads: Vec<LeadMeasurements>,
}

/// How far past J we may sample before the T wave contaminates the reading.
fn st_cap_ms(hr_bpm: f64) -> f64 {
    for (upper, cap) in ST_CAP_MS_BY_HR {
        if hr_bpm < upper {
            return cap;
        }
    }
    40.0
}

/// Mean of a signal over a millisecond window relative to a frame index.
fn window_mean(sig: &[f32], centre: usize, from_ms: f64, to_ms: f64, fs: f64) -> Option<f32> {
    let a = centre as i64 + (from_ms / 1000.0 * fs).round() as i64;
    let b = centre as i64 + (to_ms / 1000.0 * fs).round() as i64;
    if a < 0 || b <= a || b as usize > sig.len() {
        return None;
    }
    let slice = &sig[a as usize..b as usize];
    Some(slice.iter().sum::<f32>() / slice.len() as f32)
}

/// Net signed area under a signal over a sample range, in mV·s.
fn net_area(sig: &[f32], from: usize, to: usize, fs: f64) -> f32 {
    if to <= from || to > sig.len() {
        return 0.0;
    }
    sig[from..to].iter().sum::<f32>() / fs as f32
}

/// Measure one lead against the study's global fiducials.
///
/// `gain_relative_sigma` is `None` when no millivolt scale was ever recorded.
/// There is then no relative error to propagate, and inventing a conservative
/// stand-in would put a number in `sigma_gain_mv` that looks exactly like a
/// measured one everywhere downstream.
///
/// `n_beats` is the count that went into this lead's ensemble. It is taken
/// separately from `sigma_mv` rather than inferred from it: the array can carry
/// a finite value at n = 1 the moment anyone floors or sanitises it for display,
/// and the beat count is the fact the precondition is actually about.
pub fn measure_lead(
    lead: &str,
    beat_mv: &[f32],
    sigma_mv: &[f32],
    fid: &GlobalFiducials,
    hr_bpm: Option<f64>,
    gain_relative_sigma: Option<f32>,
    n_beats: u32,
) -> LeadMeasurements {
    let mut m = LeadMeasurements { lead: lead.to_string(), ..Default::default() };

    let (Ok(on), Ok(off)) = (fid.qrs_onset, fid.qrs_offset) else {
        m.st_note = Some("QRS boundaries unmeasurable");
        return m;
    };
    if off >= beat_mv.len() {
        m.st_note = Some("QRS offset beyond the frame");
        return m;
    }

    // --- QRS wave amplitudes -------------------------------------------------
    let qrs = &beat_mv[on..off.min(beat_mv.len())];
    if !qrs.is_empty() {
        let (mut r_idx, mut r_val) = (0usize, f32::MIN);
        for (i, &v) in qrs.iter().enumerate() {
            if v > r_val {
                r_val = v;
                r_idx = i;
            }
        }
        if r_val > 0.0 {
            m.r_amplitude_mv = Some(r_val);
        }

        // Q: an initial negative deflection, before anything positive.
        let mut q_val = 0.0f32;
        let mut q_samples = 0usize;
        for &v in qrs.iter().take(r_idx) {
            if v < 0.0 {
                q_val = q_val.min(v);
                q_samples += 1;
            } else if q_samples > 0 {
                break;
            }
        }
        if q_val < 0.0 {
            m.q_amplitude_mv = Some(q_val);
            m.q_duration_ms = Some(q_samples as f32 / FS as f32 * 1000.0);
        }

        // S: the deepest negative deflection after the R peak.
        let s_val = qrs[r_idx..].iter().cloned().fold(0.0f32, f32::min);
        if s_val < 0.0 {
            m.s_amplitude_mv = Some(s_val);
        }
    }

    // --- ST ------------------------------------------------------------------
    let hr = hr_bpm.unwrap_or(60.0);
    let cap = st_cap_ms(hr);

    // Never sample past halfway to the T peak, whatever the rate-based cap says.
    let t_guard_ms = fid.t_offset.ok().map(|t| {
        let t_peak_ms = (t as f64 - off as f64) / FS * 1000.0 * 0.6;
        t_peak_ms * ST_TPEAK_GUARD_FRAC
    });

    m.st_j_mv = window_mean(beat_mv, off, ST_J_WIN_MS.0, ST_J_WIN_MS.1, FS);

    let j60_allowed = ST_J60_WIN_MS.1 <= cap
        && t_guard_ms.is_none_or(|g| ST_J60_WIN_MS.1 <= g.max(20.0));
    if j60_allowed {
        m.st_j60_mv = window_mean(beat_mv, off, ST_J60_WIN_MS.0, ST_J60_WIN_MS.1, FS);
    } else {
        m.st_note = Some("J+60 falls on the T wave at this rate; ST_J reported alone");
    }

    if ST_SLOPE_PTS_MS.1 <= cap {
        let a = window_mean(beat_mv, off, ST_SLOPE_PTS_MS.0 - 5.0, ST_SLOPE_PTS_MS.0 + 5.0, FS);
        let b = window_mean(beat_mv, off, ST_SLOPE_PTS_MS.1 - 5.0, ST_SLOPE_PTS_MS.1 + 5.0, FS);
        if let (Some(a), Some(b)) = (a, b) {
            let dt = (ST_SLOPE_PTS_MS.1 - ST_SLOPE_PTS_MS.0) / 1000.0;
            m.st_slope_mv_s = Some(((b - a) as f64 / dt) as f32);
        }
    }

    // --- T -------------------------------------------------------------------
    if let Ok(t_end) = fid.t_offset {
        let from = (off + (0.04 * FS) as usize).min(beat_mv.len());
        let to = t_end.min(beat_mv.len());
        if to > from {
            let seg = &beat_mv[from..to];
            let hi = seg.iter().cloned().fold(f32::MIN, f32::max);
            let lo = seg.iter().cloned().fold(f32::MAX, f32::min);
            m.t_amplitude_mv = Some(if hi.abs() >= lo.abs() { hi } else { lo });
        }
    }

    // --- uncertainty ---------------------------------------------------------
    //
    // The two terms are kept apart. Beat-to-beat spread is independent between
    // two studies; gain error is shared to whatever degree the same cart printed
    // both, and only the gain term may ever carry a ρ. Gain error also scales
    // with the value, so it matters little for a 0.1 mV ST level and a great
    // deal for a 2 mV R wave.
    //
    // Both stay `None` unless an ST level was actually measured. A σ attached to
    // a level that does not exist is a band around nothing.
    if let Some(level) = m.st_j_mv {
        // Below the beat-count precondition the spread is unestimable, not
        // small — independently of whatever the ensemble wrote into the array.
        if n_beats >= MIN_BEATS_FOR_DELTA {
            m.sigma_ens_mv = sigma_mv.get(off).copied().filter(|s| s.is_finite());
        }
        m.sigma_gain_mv = gain_relative_sigma.map(|g| g * level.abs());
    }

    m
}

/// Measure a whole study.
///
/// `n_used[i]` is the beat count behind `leads[i]`'s ensemble. A lead with no
/// entry is measured as though it had no beats, which costs it its uncertainty
/// and therefore its verdict — the safe direction for a mismatch that should
/// not happen.
///
/// `baselined[i]` says whether that lead's detrend established an isoelectric
/// level. Where it did not, no ST value is emitted: every ST amplitude is a
/// height above the isoelectric line, and without one the number would be a
/// height above zero — with zero wherever the trace happened to sit. A missing
/// entry is treated as *not* baselined, so a caller that forgets loses ST rather
/// than gaining an unfounded one.
pub fn measure_study(
    leads: &[(String, Vec<f32>, Vec<f32>)],
    fid: &GlobalFiducials,
    hr_bpm: Option<f64>,
    gain_relative_sigma: Option<f32>,
    n_used: &[u32],
    baselined: &[bool],
) -> StudyMeasurements {
    let mut s = StudyMeasurements {
        hr_bpm,
        qrs_ms: fid.qrs_duration_ms(FS),
        qt_ms: fid.qt_ms(FS),
        ..Default::default()
    };

    // Refuse a QT that will not fit inside its own cardiac cycle.
    //
    // Repolarisation finishes before the next depolarisation begins, so QT < RR
    // is not a convention but arithmetic.
    //
    // This once carried the estimator. The frame runs to 600 ms past R, so above
    // 100 bpm the next complex was inside it, and an unbounded "largest
    // deflection after the QRS" search took that R wave for the T peak: over
    // 1,184 PTB-XL records 11.0% of QT values exceeded their own RR, and in the
    // 100+ bpm band 70.7% did. `fiducial::t_offset` now bounds the search by RR,
    // and that is where the defect is fixed.
    //
    // This stays, as a backstop rather than the mechanism, for three reasons.
    // The bound admits a span of `0.60 * RR` and `QRS_DUR_PLAUSIBLE_MS` permits a
    // 220 ms complex, so the widest QT the estimator can still emit is about
    // `220 + 0.60 * RR` ms — which reaches RR itself from around 109 bpm, at a
    // width where QT is not a meaningful measurement anyway. `StudyAnalysis::
    // measure` also rebuilds fiducials from cached integers, a path the bound is
    // nowhere near. And "the estimator can no longer produce an impossible QT"
    // is a claim about a corpus; `QT < RR` is a proof, and it costs five lines.
    //
    // It never covered the case where the rate itself is unknown — `hr_bpm` is
    // `None` for a single beat, so this does not run at all there. That case is
    // now `Unmeasurable::RateUnknown` before a QT is ever computed.
    //
    // It remains a REFUSAL, not a correction. Clamping to a plausible-looking
    // number would hide whatever remains behind numbers that no longer look
    // wrong, which is the one outcome worse than a blank.
    if let (Some(qt), Some(hr)) = (s.qt_ms, hr_bpm) {
        if hr > 0.0 && qt >= 60_000.0 / hr {
            s.qt_ms = None;
            s.qt_note = Some("QT exceeded the RR interval — T offset not established");
        }
    }

    // QTc. Fridericia is the default because Bazett over-corrects at tachycardia
    // and under-corrects at bradycardia, which manufactures a QTc change between
    // two studies that differ only in rate — exactly this product's use case.
    if let (Some(qt), Some(hr)) = (s.qt_ms, hr_bpm) {
        if hr > 20.0 && hr < 250.0 {
            let rr = 60.0 / hr;
            s.qtc_fridericia_ms = Some(qt / rr.cbrt());
            s.qtc_bazett_ms = Some(qt / rr.sqrt());
        }
    }

    for (i, (name, beat, sigma)) in leads.iter().enumerate() {
        let n = n_used.get(i).copied().unwrap_or(0);
        let mut m = measure_lead(name, beat, sigma, fid, hr_bpm, gain_relative_sigma, n);
        if !baselined.get(i).copied().unwrap_or(false) {
            // Morphology survives; the amplitudes do not. Cleared here rather
            // than never computed because `measure_lead` has one exit for every
            // other refusal and threading an eighth argument through it to reach
            // the same result would buy nothing.
            m.st_j_mv = None;
            m.st_j60_mv = None;
            m.st_slope_mv_s = None;
            m.sigma_ens_mv = None;
            m.sigma_gain_mv = None;
            m.st_note = Some("baseline not established — no isoelectric anchor");
        }
        s.leads.push(m);
    }

    // Frontal axis from net QRS *area* in I and aVF. Area is far steadier than
    // peak amplitude on a digitized tracing, where a single clipped sample can
    // move a peak but barely moves an integral.
    if let (Ok(on), Ok(off)) = (fid.qrs_onset, fid.qrs_offset) {
        let area = |n: &str| {
            leads
                .iter()
                .find(|(l, _, _)| l == n)
                .map(|(_, b, _)| net_area(b, on, off.min(b.len()), FS))
        };
        if let (Some(i), Some(f)) = (area("I"), area("aVF")) {
            if i.abs() > 1e-6 || f.abs() > 1e-6 {
                s.axis_deg = Some(f.atan2(i).to_degrees());
            }
        }
    }

    s
}

// The two-state serial gate that used to live here — `StDelta`, `st_delta` and
// `CLINICAL_ST_MV` — is now `serial::gate`. It collapsed seven preconditions and
// five verdict states into two booleans, and `below_detection_limit == false`
// did not mean the pair had resolved the lead: it meant the arithmetic had run.
// Keeping it alongside the new gate would leave two gates that disagree, with
// the looser one wired to the screen.

#[cfg(test)]
mod tests {

    /// A QT that will not fit in its own cardiac cycle is refused, not printed.
    ///
    /// This used to fire on 11% of real PTB-XL records and 71% above 100 bpm,
    /// when it was carrying an unbounded T search. `fiducial::t_offset` now
    /// bounds that search by RR, so what is left here is the narrow geometric
    /// corner where a very wide complex at a high rate can still overrun — see
    /// the comment on the check itself. It is exercised directly rather than
    /// through the estimator, because it must hold for any fiducials handed to
    /// `measure_study`, including the cached ones `StudyAnalysis::measure`
    /// rebuilds without going near the bound.
    #[test]
    fn a_qt_longer_than_its_rr_is_refused() {
        // 150 bpm: RR is 400 ms, so a 420 ms QT is impossible.
        let fast = measure_study(&[], &fid(88, 125, 300), Some(150.0), Some(0.02), &[], &[]);
        assert_eq!(fast.qt_ms, None, "an impossible QT must not be reported");
        assert!(fast.qt_note.is_some(), "and it must say why");
        assert_eq!(fast.qtc_fridericia_ms, None, "no QTc may be derived from it");

        // 60 bpm: RR is 1000 ms, and the same 420 ms QT is entirely ordinary.
        let slow = measure_study(&[], &fid(88, 125, 300), Some(60.0), Some(0.02), &[], &[]);
        assert!(slow.qt_ms.is_some(), "a plausible QT must survive: {:?}", slow.qt_note);
        assert!(slow.qtc_fridericia_ms.is_some());
    }
    use super::*;
    use crate::config::FRAME_N;
    use crate::fiducial::r_index;

    fn fid(on: usize, off: usize, t: usize) -> GlobalFiducials {
        GlobalFiducials {
            qrs_onset: Ok(on),
            qrs_offset: Ok(off),
            t_offset: Ok(t),
            sv_peak: 1.0,
        }
    }

    /// A beat with a known R amplitude and a flat ST plateau at `st`.
    fn beat(r_amp: f32, st: f32) -> Vec<f32> {
        let r = r_index(FS);
        (0..FRAME_N)
            .map(|i| {
                let d = i as f32 - r as f32;
                if d.abs() < 12.0 {
                    r_amp * (1.0 - d.abs() / 12.0)
                } else if (25.0..105.0).contains(&d) {
                    st
                } else {
                    0.0
                }
            })
            .collect()
    }

    #[test]
    fn r_amplitude_is_recovered() {
        let b = beat(1.35, 0.0);
        let m = measure_lead("V4", &b, &vec![0.01; FRAME_N], &fid(88, 112, 210), Some(60.0), Some(0.02), 4);
        let r = m.r_amplitude_mv.expect("no R");
        assert!((r - 1.35).abs() < 0.05, "R {r} should be 1.35");
    }

    #[test]
    fn st_level_is_measured_against_the_isoelectric_zero() {
        let b = beat(1.2, 0.25);
        let m = measure_lead("V3", &b, &vec![0.01; FRAME_N], &fid(88, 125, 210), Some(60.0), Some(0.02), 4);
        let st = m.st_j_mv.expect("no ST");
        assert!((st - 0.25).abs() < 0.03, "ST {st} should be 0.25");
    }

    #[test]
    fn a_flat_st_reads_as_zero_not_as_missing() {
        let b = beat(1.2, 0.0);
        let m = measure_lead("I", &b, &vec![0.01; FRAME_N], &fid(88, 125, 210), Some(60.0), Some(0.02), 4);
        assert!(m.st_j_mv.is_some());
        assert!(m.st_j_mv.unwrap().abs() < 0.02);
    }

    #[test]
    fn unmeasurable_fiducials_yield_no_st_rather_than_zero() {
        use crate::fiducial::Unmeasurable;
        let b = beat(1.2, 0.25);
        let f = GlobalFiducials {
            qrs_onset: Err(Unmeasurable::NoActivation),
            qrs_offset: Err(Unmeasurable::NoActivation),
            t_offset: Err(Unmeasurable::NoActivation),
            sv_peak: 0.0,
        };
        let m = measure_lead("I", &b, &vec![0.01; FRAME_N], &f, Some(60.0), Some(0.02), 4);
        assert!(m.st_j_mv.is_none(), "an ST value appeared without QRS boundaries");
        assert!(m.st_note.is_some());
    }

    #[test]
    fn j60_is_withheld_at_tachycardia() {
        // At 140 bpm the cap is 40 ms, so J+60 would land on the T wave.
        let b = beat(1.2, 0.2);
        let m = measure_lead("V2", &b, &vec![0.01; FRAME_N], &fid(88, 125, 190), Some(140.0), Some(0.02), 4);
        assert!(m.st_j_mv.is_some(), "ST_J should still be available");
        assert!(m.st_j60_mv.is_none(), "J+60 should be withheld at 140 bpm");
        assert!(m.st_note.is_some());
    }

    #[test]
    fn fridericia_and_bazett_diverge_with_rate_as_expected() {
        let mk = |hr: f64| {
            measure_study(&[], &fid(88, 125, 300), Some(hr), Some(0.02), &[], &[])
        };
        let slow = mk(60.0);
        let fast = mk(100.0);
        // At 60 bpm RR is 1 s, so both corrections equal QT.
        assert!(
            (slow.qtc_fridericia_ms.unwrap() - slow.qt_ms.unwrap()).abs() < 1e-6,
            "at 60 bpm QTc should equal QT"
        );
        // At 100 bpm Bazett inflates more than Fridericia -- the reason it is
        // barred from driving a verdict when two studies differ in rate.
        let fri = fast.qtc_fridericia_ms.unwrap();
        let baz = fast.qtc_bazett_ms.unwrap();
        assert!(baz > fri + 20.0, "Bazett {baz} should exceed Fridericia {fri} by >20 ms");
    }

    #[test]
    fn axis_comes_out_of_leads_i_and_avf() {
        let mk = |i: f32, f: f32| {
            vec![
                ("I".to_string(), beat(i, 0.0), vec![0.01; FRAME_N]),
                ("aVF".to_string(), beat(f, 0.0), vec![0.01; FRAME_N]),
            ]
        };
        // Equal positive areas in I and aVF put the axis at +45 degrees.
        let s = measure_study(&mk(1.0, 1.0), &fid(88, 112, 210), Some(60.0), Some(0.02), &[4, 4], &[true, true]);
        let ax = s.axis_deg.expect("no axis");
        assert!((ax - 45.0).abs() < 5.0, "axis {ax} should be near +45");

        // Positive I, negative aVF is left axis deviation.
        let s2 = measure_study(&mk(1.0, -1.0), &fid(88, 112, 210), Some(60.0), Some(0.02), &[4, 4], &[true, true]);
        assert!(s2.axis_deg.unwrap() < -30.0, "expected left axis deviation");
    }

    // ---- uncertainty, and the shape of its absence --------------------------
    //
    // The five gating tests that used to sit here went with `st_delta`, into
    // `serial::gate`, where the decision rule now lives: the notable case became
    // `a_change_clearing_both_the_detection_limit_and_the_clinical_criterion_is_significant`,
    // the sub-threshold case `a_change_clearing_the_detection_limit_but_not_the_criterion_is_indeterminate`,
    // the unresolvable pair `a_pair_that_cannot_resolve_the_criterion_reads_as_below_the_detection_limit`,
    // and the single-beat lead `a_lead_built_from_one_beat_is_unmeasurable_not_unchanged`.
    // What belongs here is the half of that story this file owns: whether a
    // measurement has an uncertainty at all.

    #[test]
    fn a_lead_that_measured_nothing_reports_no_uncertainty_rather_than_zero() {
        use crate::fiducial::Unmeasurable;
        let b = beat(1.2, 0.25);
        let f = GlobalFiducials {
            qrs_onset: Err(Unmeasurable::NoActivation),
            qrs_offset: Err(Unmeasurable::NoActivation),
            t_offset: Err(Unmeasurable::NoActivation),
            sv_peak: 0.0,
        };
        let m = measure_lead("V2", &b, &vec![0.01; FRAME_N], &f, Some(60.0), Some(0.02), 4);

        // This is the regression the whole verdict gate was built around. The
        // struct derives `Default`, so before this change the early return left
        // sigma at 0.0 and the pair reported a 0.004 mV detection limit for a
        // lead whose QRS boundaries were never found.
        assert_eq!(m.sigma_ens_mv, None, "an unmeasured lead claimed a beat-to-beat sigma");
        assert_eq!(m.sigma_gain_mv, None, "an unmeasured lead claimed a gain sigma");
        assert!(m.st_j_mv.is_none());
    }

    #[test]
    fn a_single_beat_lead_has_no_estimable_ensemble_sigma() {
        // The array is finite and small — deliberately, because that is what it
        // looks like the moment anyone floors or sanitises it for display. The
        // beat count is what makes the spread unestimable, so the beat count is
        // what this reads.
        let b = beat(1.2, 0.25);
        let m = measure_lead("V2", &b, &vec![0.01; FRAME_N], &fid(88, 125, 210), Some(60.0), Some(0.02), 1);
        assert_eq!(m.sigma_ens_mv, None, "n=1 must not report a beat-to-beat sigma");
        assert!(m.st_j_mv.is_some(), "the level itself is still measurable and still shown");

        let two = measure_lead("V2", &b, &vec![0.01; FRAME_N], &fid(88, 125, 210), Some(60.0), Some(0.02), 2);
        assert!(two.sigma_ens_mv.is_some(), "n=2 is estimable");
    }

    #[test]
    fn the_gain_term_is_reported_separately_from_the_beat_to_beat_term() {
        // They cannot be summed here. Beat-to-beat noise is independent between
        // two studies and gain error is shared to whatever degree the same cart
        // printed both, so only one of the two may ever carry a rho.
        let b = beat(1.2, 0.25);
        let m = measure_lead("V2", &b, &vec![0.02; FRAME_N], &fid(88, 125, 210), Some(60.0), Some(0.04), 4);
        let ens = m.sigma_ens_mv.expect("no ensemble sigma");
        let gain = m.sigma_gain_mv.expect("no gain sigma");
        assert!((ens - 0.02).abs() < 1e-6, "ensemble sigma {ens}");
        // Gain error scales with the level: 4% of a 0.25 mV ST segment.
        assert!((gain - 0.04 * m.st_j_mv.unwrap().abs()).abs() < 1e-6, "gain sigma {gain}");
        assert!(gain != ens, "the two terms collapsed into one number");

        // And with no gain recorded there is no term to report, rather than a
        // conservative stand-in that would look measured downstream.
        let none = measure_lead("V2", &b, &vec![0.02; FRAME_N], &fid(88, 125, 210), Some(60.0), None, 4);
        assert_eq!(none.sigma_gain_mv, None);
        assert!(none.sigma_ens_mv.is_some(), "an unrecorded gain must not erase the beat sigma");
    }
}

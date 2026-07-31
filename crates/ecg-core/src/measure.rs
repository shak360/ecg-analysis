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
    FS, ST_CAP_MS_BY_HR, ST_J60_WIN_MS, ST_J_WIN_MS, ST_SLOPE_PTS_MS, ST_TPEAK_GUARD_FRAC,
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
    /// 1σ uncertainty on the ST values, millivolts.
    pub sigma_st_mv: f32,
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
pub fn measure_lead(
    lead: &str,
    beat_mv: &[f32],
    sigma_mv: &[f32],
    fid: &GlobalFiducials,
    hr_bpm: Option<f64>,
    gain_relative_sigma: f32,
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
    // Beat-to-beat spread at the J point, combined with the gain's own relative
    // error. Gain error scales with the value, so it matters little for a
    // 0.1 mV ST level and a great deal for a 2 mV R wave.
    let ens_sigma = sigma_mv
        .get(off)
        .copied()
        .filter(|s| s.is_finite())
        .unwrap_or(f32::INFINITY);
    let level = m.st_j_mv.unwrap_or(0.0).abs();
    m.sigma_st_mv = if ens_sigma.is_finite() {
        (ens_sigma.powi(2) + (gain_relative_sigma * level).powi(2)).sqrt()
    } else {
        f32::INFINITY
    };

    m
}

/// Measure a whole study.
pub fn measure_study(
    leads: &[(String, Vec<f32>, Vec<f32>)],
    fid: &GlobalFiducials,
    hr_bpm: Option<f64>,
    gain_relative_sigma: f32,
) -> StudyMeasurements {
    let mut s = StudyMeasurements {
        hr_bpm,
        qrs_ms: fid.qrs_duration_ms(FS),
        qt_ms: fid.qt_ms(FS),
        ..Default::default()
    };

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

    for (name, beat, sigma) in leads {
        s.leads.push(measure_lead(name, beat, sigma, fid, hr_bpm, gain_relative_sigma));
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

/// A serial change in one lead, with the limit below which it cannot be claimed.
#[derive(Debug, Clone)]
pub struct StDelta {
    pub lead: String,
    pub delta_mv: Option<f32>,
    /// Minimum detectable change at 95% confidence, millivolts.
    pub mdc95_mv: f32,
    /// True when |delta| exceeds both the detection limit and the clinical threshold.
    pub notable: bool,
    /// True when the detection limit is itself above the clinical threshold, so
    /// a clinically significant change can be neither confirmed nor excluded.
    pub below_detection_limit: bool,
}

/// Clinical ST-shift threshold, millivolts. UDMI-4 convention.
pub const CLINICAL_ST_MV: f32 = 0.10;

/// Compare ST levels between two studies, gated by their combined uncertainty.
///
/// A difference smaller than what the pair can resolve is not reported as a
/// change. The bias terms add linearly rather than in quadrature because they
/// are systematic, not random.
pub fn st_delta(
    reference: &LeadMeasurements,
    comparison: &LeadMeasurements,
    bias_ref_mv: f32,
    bias_cmp_mv: f32,
) -> StDelta {
    let delta = match (reference.st_j_mv, comparison.st_j_mv) {
        (Some(a), Some(b)) => Some(b - a),
        _ => None,
    };

    let var = reference.sigma_st_mv.powi(2) + comparison.sigma_st_mv.powi(2);
    let mdc = if var.is_finite() {
        1.96 * var.sqrt() + bias_ref_mv + bias_cmp_mv
    } else {
        f32::INFINITY
    };

    // Explicitly NaN- and infinity-safe: an unestimable sigma gives an infinite
    // MDC, which must read as "cannot resolve", not as "no change".
    let below = !mdc.is_finite() || mdc >= CLINICAL_ST_MV;
    let notable = delta.is_some_and(|d| d.abs() > mdc && d.abs() >= CLINICAL_ST_MV);

    StDelta {
        lead: reference.lead.clone(),
        delta_mv: delta,
        mdc95_mv: mdc,
        notable,
        below_detection_limit: below,
    }
}

#[cfg(test)]
mod tests {
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
        let m = measure_lead("V4", &b, &vec![0.01; FRAME_N], &fid(88, 112, 210), Some(60.0), 0.02);
        let r = m.r_amplitude_mv.expect("no R");
        assert!((r - 1.35).abs() < 0.05, "R {r} should be 1.35");
    }

    #[test]
    fn st_level_is_measured_against_the_isoelectric_zero() {
        let b = beat(1.2, 0.25);
        let m = measure_lead("V3", &b, &vec![0.01; FRAME_N], &fid(88, 125, 210), Some(60.0), 0.02);
        let st = m.st_j_mv.expect("no ST");
        assert!((st - 0.25).abs() < 0.03, "ST {st} should be 0.25");
    }

    #[test]
    fn a_flat_st_reads_as_zero_not_as_missing() {
        let b = beat(1.2, 0.0);
        let m = measure_lead("I", &b, &vec![0.01; FRAME_N], &fid(88, 125, 210), Some(60.0), 0.02);
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
        let m = measure_lead("I", &b, &vec![0.01; FRAME_N], &f, Some(60.0), 0.02);
        assert!(m.st_j_mv.is_none(), "an ST value appeared without QRS boundaries");
        assert!(m.st_note.is_some());
    }

    #[test]
    fn j60_is_withheld_at_tachycardia() {
        // At 140 bpm the cap is 40 ms, so J+60 would land on the T wave.
        let b = beat(1.2, 0.2);
        let m = measure_lead("V2", &b, &vec![0.01; FRAME_N], &fid(88, 125, 190), Some(140.0), 0.02);
        assert!(m.st_j_mv.is_some(), "ST_J should still be available");
        assert!(m.st_j60_mv.is_none(), "J+60 should be withheld at 140 bpm");
        assert!(m.st_note.is_some());
    }

    #[test]
    fn fridericia_and_bazett_diverge_with_rate_as_expected() {
        let mk = |hr: f64| {
            measure_study(&[], &fid(88, 125, 300), Some(hr), 0.02)
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
        let s = measure_study(&mk(1.0, 1.0), &fid(88, 112, 210), Some(60.0), 0.02);
        let ax = s.axis_deg.expect("no axis");
        assert!((ax - 45.0).abs() < 5.0, "axis {ax} should be near +45");

        // Positive I, negative aVF is left axis deviation.
        let s2 = measure_study(&mk(1.0, -1.0), &fid(88, 112, 210), Some(60.0), 0.02);
        assert!(s2.axis_deg.unwrap() < -30.0, "expected left axis deviation");
    }

    // ---- gating ------------------------------------------------------------

    fn lead_with(st: f32, sigma: f32) -> LeadMeasurements {
        LeadMeasurements {
            lead: "V2".into(),
            st_j_mv: Some(st),
            sigma_st_mv: sigma,
            ..Default::default()
        }
    }

    #[test]
    fn a_change_above_the_detection_limit_is_notable() {
        let d = st_delta(&lead_with(0.00, 0.010), &lead_with(0.25, 0.010), 0.002, 0.002);
        assert!((d.delta_mv.unwrap() - 0.25).abs() < 1e-6);
        assert!(d.notable, "0.25 mV against an MDC of {} should be notable", d.mdc95_mv);
        assert!(!d.below_detection_limit);
    }

    #[test]
    fn a_change_below_the_detection_limit_is_not_claimed() {
        // Real difference, but smaller than the pair can resolve.
        let d = st_delta(&lead_with(0.00, 0.040), &lead_with(0.06, 0.040), 0.012, 0.012);
        assert!(!d.notable, "a 0.06 mV change must not be claimed at MDC {}", d.mdc95_mv);
    }

    #[test]
    fn a_pair_that_cannot_resolve_the_clinical_threshold_says_so() {
        // Poor-quality pair: the detection limit exceeds 0.10 mV, so a
        // clinically significant change can be neither confirmed nor excluded.
        let d = st_delta(&lead_with(0.00, 0.087), &lead_with(0.09, 0.087), 0.035, 0.035);
        assert!(d.below_detection_limit);
        assert!(!d.notable);
        assert!(d.mdc95_mv > CLINICAL_ST_MV);
    }

    #[test]
    fn a_single_beat_lead_cannot_support_a_delta() {
        // sigma is infinite at n=1, so the MDC is infinite and nothing is claimed.
        let d = st_delta(&lead_with(0.0, f32::INFINITY), &lead_with(0.4, 0.01), 0.002, 0.002);
        assert!(!d.notable);
        assert!(d.below_detection_limit);
    }

    #[test]
    fn a_large_change_is_still_gated_by_the_clinical_threshold() {
        // Exceeds the detection limit but sits under 0.10 mV: measurable, but
        // not a change worth flagging.
        let d = st_delta(&lead_with(0.00, 0.005), &lead_with(0.04, 0.005), 0.002, 0.002);
        assert!(d.delta_mv.unwrap() > d.mdc95_mv, "should be measurable");
        assert!(!d.notable, "0.04 mV is under the clinical threshold");
    }
}

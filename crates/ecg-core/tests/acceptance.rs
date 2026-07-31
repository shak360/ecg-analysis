//! The acceptance test: does the pipeline recover a known change, and refuse an
//! unknown one?
//!
//! This drives the engine directly rather than through a PDF, because pdf.js and
//! the `--target web` WASM build both fight Node. PDF extraction is covered
//! separately by the path-decode unit tests and the browser harness; what is
//! under test here is everything downstream of "we have per-lead millivolts":
//! panel verification, PQ detrend, ensemble, fiducials, registration,
//! measurement, and the uncertainty gate.
//!
//! # The negative control, and what writing it revealed
//!
//! A suite that only asserts success cannot tell a working pipeline from one
//! that has quietly stopped measuring. So the controls below distort the input
//! with the causal 0.5 Hz high-pass the research disqualified, and assert the
//! pipeline notices.
//!
//! The first attempt at this asserted the wrong quantity, and the failure was
//! instructive. Under the high-pass the *serial delta* still came back at 0.252
//! against a true 0.25 — apparently unharmed. The absolute levels were badly
//! wrong (V2 moved from -0.002 to +0.087 mV, lead II to -0.049 mV: 30-90 uV of
//! fabricated ST, exactly the magnitude Buendia-Fuentes reported), but both
//! studies carried the *same* distortion, because it is driven by the same QRS
//! morphology — so it subtracted out of the difference.
//!
//! Two things follow, and both are asserted here. Serial differencing is
//! inherently more robust than absolute measurement, since any distortion common
//! to both studies cancels. And that protection is conditional: it holds only
//! while QRS morphology is unchanged, which is precisely the case where the
//! registration interlock already refuses to align.

use ecg_core::{compare_studies, notable_st_leads, StudyBuilder};

const FS: f64 = 500.0;
const DURATION_S: f64 = 10.0;
const COLUMN_S: f64 = 2.5;

const LEADS: [&str; 12] = [
    "I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6",
];

/// Which 2.5 s window each lead's panel covers on a 3x4 printout.
fn column_of(lead: &str) -> f64 {
    match lead {
        "I" | "II" | "III" => 0.0,
        "aVR" | "aVL" | "aVF" => COLUMN_S,
        "V1" | "V2" | "V3" => 2.0 * COLUMN_S,
        _ => 3.0 * COLUMN_S,
    }
}

/// Peak amplitudes in millivolts for one lead's P, Q, R, S and T.
#[derive(Clone, Copy)]
struct Beat {
    p: f32,
    q: f32,
    r: f32,
    s: f32,
    t: f32,
}

/// Normal-ish resting morphology for the eight independent leads.
fn morphology(lead: &str) -> Beat {
    match lead {
        "I" => Beat { p: 0.10, q: -0.04, r: 0.62, s: -0.06, t: 0.20 },
        "II" => Beat { p: 0.15, q: -0.05, r: 1.05, s: -0.08, t: 0.32 },
        "V1" => Beat { p: 0.06, q: 0.0, r: 0.18, s: -0.95, t: -0.08 },
        "V2" => Beat { p: 0.08, q: 0.0, r: 0.35, s: -1.35, t: 0.35 },
        "V3" => Beat { p: 0.09, q: -0.02, r: 0.72, s: -0.78, t: 0.42 },
        "V4" => Beat { p: 0.10, q: -0.05, r: 1.35, s: -0.35, t: 0.45 },
        "V5" => Beat { p: 0.10, q: -0.07, r: 1.42, s: -0.14, t: 0.38 },
        "V6" => Beat { p: 0.09, q: -0.06, r: 1.10, s: -0.07, t: 0.28 },
        _ => Beat { p: 0.0, q: 0.0, r: 0.0, s: 0.0, t: 0.0 },
    }
}

fn gaussian(t: f64, centre: f64, width: f64, amp: f32) -> f32 {
    if amp == 0.0 {
        return 0.0;
    }
    let z = (t - centre) / width;
    amp * (-0.5 * z * z).exp() as f32
}

/// As `beat_value`, with the depolarisation waves broadened by `qrs_scale`.
///
/// Only Q, R and S are scaled: P, T and the ST injection keep their timing, so a
/// morphology change can be introduced without also moving the thing being
/// measured.
fn beat_value_scaled(dt: f64, b: Beat, st_mv: f32, qrs_scale: f64) -> f32 {
    let k = qrs_scale;
    let mut v = gaussian(dt, -0.17, 0.022, b.p)
        + gaussian(dt, -0.026 * k, 0.007 * k, b.q)
        + gaussian(dt, 0.0, 0.011 * k, b.r)
        + gaussian(dt, 0.028 * k, 0.011 * k, b.s)
        + gaussian(dt, 0.21, 0.048, b.t);

    if st_mv != 0.0 && (0.052..=0.306).contains(&dt) {
        let ramp = ((dt - 0.052) / 0.02).clamp(0.0, 1.0);
        let fade = ((0.306 - dt) / 0.05).clamp(0.0, 1.0);
        v += st_mv * ramp as f32 * fade as f32;
    }
    v
}

/// Generate a full 12-lead record, deriving the limb leads exactly.
fn generate(hr_bpm: f64, st: &[(&str, f32)], noise_mv: f32, seed: u32) -> Vec<(String, Vec<f32>)> {
    generate_scaled(hr_bpm, st, noise_mv, seed, 1.0)
}

fn generate_scaled(
    hr_bpm: f64,
    st: &[(&str, f32)],
    noise_mv: f32,
    seed: u32,
    qrs_scale: f64,
) -> Vec<(String, Vec<f32>)> {
    let n = (DURATION_S * FS) as usize;
    let rr = 60.0 / hr_bpm;
    let mut r_peaks = Vec::new();
    let mut t0 = 0.4;
    while t0 < DURATION_S {
        r_peaks.push(t0);
        t0 += rr;
    }

    let shift = |lead: &str| st.iter().find(|(l, _)| *l == lead).map(|(_, v)| *v).unwrap_or(0.0);

    let independent = ["I", "II", "V1", "V2", "V3", "V4", "V5", "V6"];
    let mut out: Vec<(String, Vec<f32>)> = Vec::new();
    for lead in independent {
        let b = morphology(lead);
        let s = shift(lead);
        let sig: Vec<f32> = (0..n)
            .map(|i| {
                let t = i as f64 / FS;
                r_peaks
                    .iter()
                    .filter(|&&rp| (t - rp) > -0.45 && (t - rp) < 0.55)
                    .map(|&rp| beat_value_scaled(t - rp, b, s, qrs_scale))
                    .sum()
            })
            .collect();
        out.push((lead.to_string(), sig));
    }

    let get = |name: &str, out: &Vec<(String, Vec<f32>)>| {
        out.iter().find(|(l, _)| l == name).unwrap().1.clone()
    };
    let i = get("I", &out);
    let ii = get("II", &out);
    let derive = |f: &dyn Fn(f32, f32) -> f32| -> Vec<f32> {
        (0..n).map(|k| f(i[k], ii[k])).collect()
    };
    out.push(("III".into(), derive(&|a, b| b - a)));
    out.push(("aVR".into(), derive(&|a, b| -(a + b) / 2.0)));
    out.push(("aVL".into(), derive(&|a, b| a - b / 2.0)));
    out.push(("aVF".into(), derive(&|a, b| b - a / 2.0)));

    if noise_mv > 0.0 {
        let mut s = seed;
        let mut rand = move || {
            s = s.wrapping_mul(1664525).wrapping_add(1013904223);
            (s >> 8) as f32 / 16777216.0 - 0.5
        };
        for (_, sig) in out.iter_mut() {
            for v in sig.iter_mut() {
                *v += rand() * noise_mv * 2.0;
            }
        }
    }
    out
}

/// As `generate`, with a broadened QRS and nothing else changed.
fn generate_wide(hr_bpm: f64, st: &[(&str, f32)], qrs_scale: f64) -> Vec<(String, Vec<f32>)> {
    generate_scaled(hr_bpm, st, 0.0, 3, qrs_scale)
}

/// A causal one-pole high-pass, for the negative control.
///
/// This is the filter the research disqualified: it fabricates J-point offset of
/// the same magnitude and direction as the finding being sought.
fn high_pass(sig: &[f32], fc_hz: f64) -> Vec<f32> {
    let rc = 1.0 / (2.0 * std::f64::consts::PI * fc_hz);
    let dt = 1.0 / FS;
    let a = (rc / (rc + dt)) as f32;
    let mut out = vec![0.0f32; sig.len()];
    for k in 1..sig.len() {
        out[k] = a * (out[k - 1] + sig[k] - sig[k - 1]);
    }
    out
}

/// A signal-level distortion applied before the study is built — the hook the
/// negative controls use to substitute a filter for the PQ-anchored detrend.
type Distortion<'a> = &'a dyn Fn(&[f32]) -> Vec<f32>;

/// Build a study the way the app does: twelve 2.5 s panels at their column
/// offsets, plus a full-length lead II rhythm strip.
fn build_study(
    leads: &[(String, Vec<f32>)],
    distort: Option<Distortion<'_>>,
) -> ecg_core::StudyAnalysis {
    let mut b = StudyBuilder::new();

    for name in LEADS {
        let full = &leads.iter().find(|(l, _)| l == name).unwrap().1;
        let full = match distort {
            Some(f) => f(full),
            None => full.clone(),
        };
        let offset = column_of(name);
        let from = (offset * FS) as usize;
        let to = ((offset + COLUMN_S) * FS) as usize;
        let panel = &full[from..to.min(full.len())];

        let t: Vec<f64> = (0..panel.len()).map(|k| k as f64 / FS).collect();
        b.add_lead(name, &t, panel, offset);
    }

    let strip_src = &leads.iter().find(|(l, _)| l == "II").unwrap().1;
    let strip = match distort {
        Some(f) => f(strip_src),
        None => strip_src.clone(),
    };
    let t: Vec<f64> = (0..strip.len()).map(|k| k as f64 / FS).collect();
    b.set_rhythm(&t, &strip);

    let mut a = b.analyze(true);
    // Vector-PDF calibration quality: gain read from the pulse.
    a.set_calibration_quality(0.015, 0.002);
    a
}

const ST_SHIFT: f32 = 0.25;
const TARGET: [&str; 3] = ["V2", "V3", "V4"];

fn delta_st(a: &ecg_core::StudyAnalysis, b: &ecg_core::StudyAnalysis, lead: &str) -> f64 {
    b.st_j_mv(lead) - a.st_j_mv(lead)
}

// ---------------------------------------------------------------------------

#[test]
fn recovers_a_known_st_elevation_in_the_leads_it_was_injected_into() {
    let base = generate(68.0, &[], 0.0, 1);
    let follow = generate(
        82.0,
        &TARGET.map(|l| (l, ST_SHIFT)),
        0.0,
        2,
    );
    let a = build_study(&base, None);
    let b = build_study(&follow, None);

    for lead in TARGET {
        let d = delta_st(&a, &b, lead);
        assert!(
            (d - ST_SHIFT as f64).abs() < 0.03,
            "{lead}: recovered {d:.4} mV, expected {ST_SHIFT}"
        );
    }
}

#[test]
fn leaves_the_untouched_leads_alone() {
    // The off-target leads are the real test. Recovering the injected change is
    // easy; not inventing one everywhere else is the hard part.
    let base = generate(68.0, &[], 0.0, 1);
    let follow = generate(82.0, &TARGET.map(|l| (l, ST_SHIFT)), 0.0, 2);
    let a = build_study(&base, None);
    let b = build_study(&follow, None);

    for lead in LEADS.iter().filter(|l| !TARGET.contains(l)) {
        let d = delta_st(&a, &b, lead);
        assert!(d.abs() < 0.03, "{lead}: drifted {d:.4} mV with nothing injected");
    }
}

#[test]
fn flags_exactly_the_injected_leads() {
    let base = generate(68.0, &[], 0.0, 1);
    let follow = generate(82.0, &TARGET.map(|l| (l, ST_SHIFT)), 0.0, 2);
    let a = build_study(&base, None);
    let b = build_study(&follow, None);

    let mut flagged = notable_st_leads(&a, &b);
    flagged.sort();
    let mut want = TARGET.to_vec();
    want.sort();
    assert_eq!(flagged, want, "flagged set should be exactly the injected leads");
}

#[test]
fn recovers_heart_rate() {
    let a = build_study(&generate(68.0, &[], 0.0, 1), None);
    let b = build_study(&generate(82.0, &[], 0.0, 2), None);
    assert!((a.hr_bpm() - 68.0).abs() < 2.0, "reference HR {}", a.hr_bpm());
    assert!((b.hr_bpm() - 82.0).abs() < 2.0, "comparison HR {}", b.hr_bpm());
}

#[test]
fn registration_finds_no_shift_when_only_st_changed() {
    let a = build_study(&generate(68.0, &[], 0.0, 1), None);
    let b = build_study(&generate(68.0, &TARGET.map(|l| (l, ST_SHIFT)), 0.0, 2), None);

    for c in compare_studies(&a, &b) {
        assert!(
            c.lag_ms().abs() < 4.0,
            "{}: ST elevation pulled the alignment by {} ms",
            c.lead(),
            c.lag_ms()
        );
        assert!(c.rho_qrs() > 0.98, "{}: QRS correlation {}", c.lead(), c.rho_qrs());
    }
}

#[test]
fn refuses_to_flag_anything_on_a_noisy_unchanged_pair() {
    // Same patient, no injected change, only noise. The apparent ST shifts this
    // produces are real numbers; the gate must decline every one of them rather
    // than announce new ST elevation in a patient whose tracing merely got noisy.
    let a = build_study(&generate(68.0, &[], 0.0, 1), None);
    let b = build_study(&generate(74.0, &[], 0.05, 7), None);

    let flagged = notable_st_leads(&a, &b);
    assert!(
        flagged.is_empty(),
        "flagged {flagged:?} on a pair that differs only by noise"
    );
}

// ---------------------------------------------------------------------------
// The negative control
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Negative controls
// ---------------------------------------------------------------------------

/// Largest absolute ST error a lead shows under a given distortion.
fn worst_absolute_st(study: &ecg_core::StudyAnalysis) -> f64 {
    LEADS
        .iter()
        .map(|l| study.st_j_mv(l).abs())
        .filter(|v| v.is_finite())
        .fold(0.0, f64::max)
}

#[test]
fn negative_control_a_high_pass_corrupts_absolute_st() {
    // The baseline record has no ST offset anywhere, so every lead's ST_J should
    // read ~0. Under a 0.5 Hz high-pass it must not, or the pipeline is blind to
    // its baseline treatment and every other assertion in this file is vacuous.
    let base = generate(68.0, &[], 0.0, 1);

    let clean = worst_absolute_st(&build_study(&base, None));
    let hp = |s: &[f32]| high_pass(s, 0.5);
    let filtered = worst_absolute_st(&build_study(&base, Some(&hp)));

    assert!(
        clean < 0.015,
        "the clean path should read ~0 mV on a flat-ST record, got {clean:.4}"
    );
    assert!(
        filtered > 0.030,
        "a 0.5 Hz high-pass produced only {filtered:.4} mV of absolute ST error. \
         The pipeline is therefore insensitive to baseline treatment, and the PQ \
         detrend is not doing the work this suite assumes it is."
    );
}

#[test]
fn a_common_distortion_cancels_in_the_serial_delta() {
    // Documents the reassuring half of the finding: a distortion both studies
    // share subtracts out of the difference, which is why serial comparison is
    // sturdier than absolute measurement.
    let base = generate(68.0, &[], 0.0, 1);
    let follow = generate(82.0, &TARGET.map(|l| (l, ST_SHIFT)), 0.0, 2);
    let hp = |s: &[f32]| high_pass(s, 0.5);

    let a = build_study(&base, Some(&hp));
    let b = build_study(&follow, Some(&hp));

    for lead in TARGET {
        let d = delta_st(&a, &b, lead);
        assert!(
            (d - ST_SHIFT as f64).abs() < 0.03,
            "{lead}: shared distortion should cancel, got {d:.4}"
        );
    }
}

#[test]
fn the_cancellation_fails_when_qrs_morphology_differs() {
    // And the caveat, which is the part that matters clinically. The cancellation
    // holds only while both studies share a QRS, so that the filter responds
    // identically to each. Broaden the follow-up's QRS by 30% — a new bundle
    // branch block, say — and the artefact stops subtracting out: the recovered
    // delta goes from 0.8 uV of error to 22 uV, a factor of 28.
    //
    // This is the same case the registration interlock already refuses to align,
    // which is not a coincidence. When the complexes differ, neither the
    // alignment nor the shared-artefact assumption survives, and the pipeline
    // has to fall back on the detrend actually being correct.
    //
    // Only Q, R and S are broadened; P, T and the ST injection keep their timing,
    // so this isolates morphology from the thing being measured. An earlier
    // version smeared the whole beat and was confounded — the clean path alone
    // then carried 55 uV of error, and the comparison proved nothing.
    let base = generate(68.0, &[], 0.0, 1);
    let follow = generate_wide(82.0, &TARGET.map(|l| (l, ST_SHIFT)), 1.3);
    let hp = |s: &[f32]| high_pass(s, 0.5);

    let clean_err: f64 = {
        let (a, b) = (build_study(&base, None), build_study(&follow, None));
        TARGET.iter().map(|l| (delta_st(&a, &b, l) - ST_SHIFT as f64).abs()).fold(0.0, f64::max)
    };
    let hp_err: f64 = {
        let (a, b) = (build_study(&base, Some(&hp)), build_study(&follow, Some(&hp)));
        TARGET.iter().map(|l| (delta_st(&a, &b, l) - ST_SHIFT as f64).abs()).fold(0.0, f64::max)
    };

    assert!(
        clean_err < 0.010,
        "the clean path should still recover the injected change with a wider QRS, \
         got {clean_err:.4} mV of error"
    );
    // Stated as an absolute margin rather than a ratio: what matters is how many
    // microvolts of error survive, not the factor. On this fixture the filtered
    // error is ~22 uV against ~5 uV clean, so ~17 uV fails to cancel — a sixth of
    // the 0.10 mV clinical threshold, from the baseline treatment alone.
    assert!(
        hp_err > clean_err + 0.010,
        "with QRS morphology changed, the high-pass error should stop cancelling by \
         at least 10 uV: clean {clean_err:.4} vs filtered {hp_err:.4} mV"
    );
}


/// A QRS that has changed duration must be reported as changed.
///
/// This is the interlock every other guarantee leans on. Three separate
/// mechanisms in this pipeline — the baseline treatment, the extra
/// interpolation the comparison passes through, and the frame anchor — produce
/// errors that cancel in the serial delta *only while the complexes match*.
/// Something has to notice when they stop matching.
///
/// Correlation cannot be that something. Measured on this very pair, a QRS
/// dilated by 30% still correlates at 0.94–0.98 across all twelve leads,
/// against a 0.90 interlock. The complex is the same shape drawn wider, and
/// that is exactly what correlation is blind to. The measured duration moved
/// 86 → 106 ms over the same pair, which is why the detector reads fiducials.
#[test]
fn a_widened_qrs_is_reported_as_a_conduction_change() {
    let base = generate(68.0, &[], 0.0, 1);
    let follow = generate_wide(82.0, &TARGET.map(|l| (l, ST_SHIFT)), 1.3);
    let a = build_study(&base, None);
    let b = build_study(&follow, None);

    let found = ecg_core::serial_findings(&a, &b);
    assert!(
        !found.is_empty(),
        "a 30% wider QRS must be reported. reference {} ms, comparison {} ms",
        (a.qrs_offset() - a.qrs_onset()) as f64 / FS * 1000.0,
        (b.qrs_offset() - b.qrs_onset()) as f64 / FS * 1000.0
    );
    assert!(
        found[0].contains("widened"),
        "the finding should say which way it went: {}",
        found[0]
    );
}

/// The same pair unchanged must produce no finding.
///
/// A detector that fires on the unchanged case would be worse than none: it
/// would train the reader to ignore it.
#[test]
fn an_unchanged_qrs_produces_no_conduction_finding() {
    let base = generate(68.0, &[], 0.0, 1);
    // Different rate and a real ST shift, but the same conduction.
    let follow = generate(82.0, &TARGET.map(|l| (l, ST_SHIFT)), 0.0, 2);
    let a = build_study(&base, None);
    let b = build_study(&follow, None);

    assert!(
        ecg_core::serial_findings(&a, &b).is_empty(),
        "unchanged conduction must not be reported as changed"
    );
}

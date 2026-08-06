//! The engine over real serial ECGs.
//!
//! Everything the measurement path has been tested against so far was
//! synthesised by `acceptance.rs` — sums of Gaussians with exactly the
//! morphology the tests expect. That verifies the arithmetic and nothing about
//! whether the assumptions hold on a real heart.
//!
//! PTB-XL supplies 2,930 consecutive serial pairs from 2,111 patients, with
//! cardiologist-reviewed statements. 484 of those pairs have a ventricular
//! conduction abnormality that appeared or resolved between the two recordings —
//! which is precisely the case `serial::findings` was built to detect and the
//! case the QRS-offset walk used to mis-measure.
//!
//! Run with the corpus fetched:
//!   npm run fetch:ptbxl
//!   cargo test --test real_serial -- --ignored --nocapture
//!
//! Marked `#[ignore]` because the data is 90+ MB and deliberately not committed;
//! CI must not depend on a network fetch.

mod common;

use common::{build_study, corpus_available, load_pairs, read_by_id};

const FS: f64 = 500.0;

fn qrs_ms(s: &ecg_core::StudyAnalysis) -> Option<f64> {
    if s.qrs_onset() < 0 || s.qrs_offset() < 0 {
        return None;
    }
    Some((s.qrs_offset() - s.qrs_onset()) as f64 / FS * 1000.0)
}

/// QT straight off the fiducials, before `measure`'s arithmetic backstop.
///
/// `measurements_json` reports the number that survived `measure_study`, which
/// nulls every `qt >= RR` — that is, precisely the values this survey exists to
/// count. Reading it alone reports 0% impossible however broken the estimator
/// is, so the survey was measuring its own backstop rather than the estimator.
/// Both getters are already on the boundary.
fn qt_raw_ms(s: &ecg_core::StudyAnalysis) -> Option<f64> {
    if s.qrs_onset() < 0 || s.t_offset() < 0 {
        return None;
    }
    Some((s.t_offset() - s.qrs_onset()) as f64 / FS * 1000.0)
}

/// Can the engine read a real ECG at all?
///
/// The first question, and not a rhetorical one: every assumption in the
/// pipeline was tuned against synthetic beats.
#[test]
#[ignore = "needs `npm run fetch:ptbxl`"]
fn the_engine_analyses_real_records() {
    if !corpus_available() {
        eprintln!("corpus not fetched; skipping");
        return;
    }
    let pairs = load_pairs();
    assert!(!pairs.is_empty(), "pair index is empty");

    let mut ids: Vec<u32> = pairs.iter().flat_map(|p| [p.before, p.after]).collect();
    ids.sort_unstable();
    ids.dedup();

    let (mut read_ok, mut analysed, mut twelve, mut fiducials) = (0, 0, 0, 0);
    let mut durations = Vec::new();
    let mut read_errors = Vec::new();

    for id in &ids {
        let rec = match read_by_id(*id) {
            Ok(r) => r,
            Err(e) => {
                if read_errors.len() < 5 {
                    read_errors.push(e);
                }
                continue;
            }
        };
        read_ok += 1;
        let Some(s) = build_study(&rec) else { continue };
        analysed += 1;
        if s.lead_names().len() == 12 {
            twelve += 1;
        }
        if let Some(d) = qrs_ms(&s) {
            fiducials += 1;
            durations.push(d);
        }
    }

    durations.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let pct = |p: f64| durations[((durations.len() as f64 - 1.0) * p) as usize];

    println!("records in index      {}", ids.len());
    println!("read from disk        {read_ok}");
    println!("analysed              {analysed}");
    println!("all twelve leads      {twelve}");
    println!("QRS measurable        {fiducials}");
    if !durations.is_empty() {
        println!(
            "QRS duration ms       p5 {:.0}  p50 {:.0}  p95 {:.0}  (min {:.0}, max {:.0})",
            pct(0.05),
            pct(0.50),
            pct(0.95),
            durations[0],
            durations[durations.len() - 1]
        );
    }
    for e in &read_errors {
        println!("read error: {e}");
    }

    assert!(read_ok > 0, "no records could be read; is the corpus fetched?");
}

/// How well does the QRS-duration detector agree with cardiologist labels?
///
/// The first empirical calibration of anything in this pipeline. Both halves
/// matter: a detector that fires on everything is no detector, so the unchanged
/// pairs are the control that proves it is not.
///
/// Stratified by what the label actually implies, which a first pass got wrong.
/// PTB-XL's conduction statements are dominated by LAFB and LPFB — fascicular
/// blocks, which rotate the frontal axis and leave QRS duration essentially
/// normal. A duration detector cannot see those and should not be scored on
/// them. Lumping them in produced an apparent 28%-versus-18% discrimination that
/// said more about the evaluation than the detector.
#[test]
#[ignore = "needs `npm run fetch:ptbxl`"]
fn conduction_change_detection_against_cardiologist_labels() {
    if !corpus_available() {
        eprintln!("corpus not fetched; skipping");
        return;
    }

    /// Blocks that lengthen depolarisation, and so should move QRS duration.
    fn widening(code: &str) -> bool {
        matches!(code, "CLBBB" | "CRBBB" | "ILBBB" | "IRBBB" | "IVCD" | "WPW")
    }
    /// Complete blocks: the unambiguous cases, QRS >= 120 ms by definition.
    fn complete(code: &str) -> bool {
        matches!(code, "CLBBB" | "CRBBB")
    }

    #[derive(Default)]
    struct Tally {
        n: usize,
        changed: usize,
        equivocal: usize,
        unmeasurable: usize,
        deltas: Vec<f64>,
    }
    let mut g: std::collections::BTreeMap<&str, Tally> = Default::default();

    for p in load_pairs() {
        let group = if p.kind == "unchanged" {
            "control"
        } else if p.change.iter().any(|c| complete(c)) {
            "complete block"
        } else if p.change.iter().any(|c| widening(c)) {
            "partial/IVCD"
        } else {
            "fascicular only"
        };

        let (Ok(a), Ok(b)) = (read_by_id(p.before), read_by_id(p.after)) else { continue };
        let (Some(sa), Some(sb)) = (build_study(&a), build_study(&b)) else { continue };

        let t = g.entry(group).or_default();
        t.n += 1;
        match (qrs_ms(&sa), qrs_ms(&sb)) {
            (Some(da), Some(db)) => t.deltas.push(db - da),
            _ => t.unmeasurable += 1,
        }
        // Split by band. "Flagged" collapsing both would hide the entire point
        // of having three: a run where every hit is equivocal is a very
        // different result from one where they are all changes.
        let json = ecg_core::serial_findings_json(&sa, &sb);
        if json.contains("\"level\":\"changed\"") {
            t.changed += 1;
        } else if json.contains("\"level\":\"equivocal\"") {
            t.equivocal += 1;
        }
    }

    println!(
        "\n{:<18} {:>5} {:>9} {:>11} {:>7} {:>7} {:>7} {:>7}",
        "group", "n", "changed", "equivocal", "unmeas", "p50", "p75", "p90"
    );
    for (name, t) in &g {
        let mut abs: Vec<f64> = t.deltas.iter().map(|d| d.abs()).collect();
        abs.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let q = |f: f64| -> f64 {
            if abs.is_empty() { f64::NAN } else { abs[((abs.len() - 1) as f64 * f) as usize] }
        };
        println!(
            "{name:<18} {:>5} {:>8.0}% {:>10.0}% {:>6.0}% {:>7.0} {:>7.0} {:>7.0}",
            t.n,
            100.0 * t.changed as f64 / t.n.max(1) as f64,
            100.0 * t.equivocal as f64 / t.n.max(1) as f64,
            100.0 * t.unmeasurable as f64 / t.n.max(1) as f64,
            q(0.50), q(0.75), q(0.90)
        );
    }

    // What separation is available at all? Sweep the threshold against controls.
    let controls: Vec<f64> = g.get("control").map(|t| t.deltas.iter().map(|d| d.abs()).collect()).unwrap_or_default();
    let cases: Vec<f64> = g.get("complete block").map(|t| t.deltas.iter().map(|d| d.abs()).collect()).unwrap_or_default();
    if !controls.is_empty() && !cases.is_empty() {
        println!("\n{:>10} {:>18} {:>20}", "threshold", "complete blocks hit", "controls false-flagged");
        for thr in [6.0f64, 8.0, 10.0, 12.0, 15.0, 20.0, 25.0] {
            let sens = cases.iter().filter(|d| **d >= thr).count() as f64 / cases.len() as f64;
            let fpr = controls.iter().filter(|d| **d >= thr).count() as f64 / controls.len() as f64;
            println!("{thr:>8.0} ms {:>17.0}% {:>19.0}%", sens * 100.0, fpr * 100.0);
        }
    }

    assert!(g.values().map(|t| t.n).sum::<usize>() > 0, "no pairs analysed");
}

#[test]
#[ignore = "diagnostic"]
fn diagnose_lead_loss() {
    if !corpus_available() { return; }
    for p in load_pairs().iter().take(3) {
        let Ok(rec) = read_by_id(p.before) else { continue };
        println!("\n--- record {} ---", p.before);
        println!("leads in file: {}", rec.leads.len());
        println!("samples: {} at {} Hz", rec.n_samples, rec.fs_hz);
        for (n, v) in rec.leads.iter().take(3) {
            let mn = v.iter().cloned().fold(f32::MAX, f32::min);
            let mx = v.iter().cloned().fold(f32::MIN, f32::max);
            println!("  {n:>4}: {} samples, {:.3} .. {:.3} mV", v.len(), mn, mx);
        }
        let Some(s) = build_study(&rec) else { println!("build_study returned None"); continue };
        println!("engine leads: {:?}", s.lead_names());
        println!("hr {:.1}  onset {}  offset {}", s.hr_bpm(), s.qrs_onset(), s.qrs_offset());
        for w in s.warnings().iter().take(8) { println!("  warn: {w}"); }
    }
}

/// How often, and how badly, is QT wrong?
///
/// Found while validating the corpus browser: one record reported QT = 656 ms
/// at 102 bpm, where the whole RR interval is 588 ms. A QT longer than its own
/// cardiac cycle is impossible, not merely unusual, and QTc computed from it
/// would read as life-threatening on a patient who is not.
///
/// The question this answers is which fix is right. If it is rare and confined
/// to tachycardia, a plausibility refusal is the fix. If it is common, the
/// tangent-method T offset needs rebuilding, and a clamp would only hide it.
#[test]
#[ignore = "needs `npm run fetch:ptbxl`"]
fn survey_qt_plausibility() {
    if !corpus_available() {
        eprintln!("corpus not fetched; skipping");
        return;
    }

    // (raw_qt_ms, rr_ms, hr, reported_qt_ms). `raw` is the estimator's own
    // output; `reported` is what survives the backstop and reaches a reader.
    // Keeping both is the point: the gap between them is how much of the
    // estimator's error is currently being absorbed by a refusal.
    let mut ratios: Vec<(f64, f64, f64, Option<f64>)> = Vec::new();
    let (mut n, mut no_qt) = (0, 0);

    for id in common::all_record_ids() {
        let Ok(rec) = read_by_id(id) else { continue };
        let Some(s) = build_study(&rec) else { continue };
        n += 1;

        let hr = s.hr_bpm();
        if !hr.is_finite() || hr <= 0.0 {
            continue;
        }
        let rr_ms = 60_000.0 / hr;

        let Some(raw) = qt_raw_ms(&s) else {
            no_qt += 1;
            continue;
        };
        let m: serde_json_lite::Value = serde_json_lite::parse(&s.measurements_json());
        ratios.push((raw, rr_ms, hr, m.number("qt")));
    }

    ratios.sort_by(|a, b| (a.0 / a.1).partial_cmp(&(b.0 / b.1)).unwrap());
    let frac = |f: f64| ratios[((ratios.len() - 1) as f64 * f) as usize];

    let impossible: Vec<_> = ratios.iter().filter(|(qt, rr, _, _)| qt > rr).collect();
    let very_long: Vec<_> = ratios.iter().filter(|(qt, _, _, _)| *qt > 600.0).collect();
    let reported = ratios.iter().filter(|r| r.3.is_some()).count();

    println!("records analysed        {n}");
    println!("raw QT unmeasurable     {no_qt}");
    println!("raw QT produced         {}", ratios.len());
    println!("reported to a reader    {reported}");
    println!(
        "raw QT/RR ratio         p5 {:.2}  p50 {:.2}  p95 {:.2}  max {:.2}",
        { let r = frac(0.05); r.0 / r.1 },
        { let r = frac(0.50); r.0 / r.1 },
        { let r = frac(0.95); r.0 / r.1 },
        { let r = ratios[ratios.len() - 1]; r.0 / r.1 },
    );
    println!(
        "raw QT longer than RR   {} ({:.1}%)",
        impossible.len(),
        100.0 * impossible.len() as f64 / ratios.len().max(1) as f64
    );
    println!(
        "raw QT over 600 ms      {} ({:.1}%)",
        very_long.len(),
        100.0 * very_long.len() as f64 / ratios.len().max(1) as f64
    );

    // Is it a tachycardia problem, as the single observed case suggested?
    //
    // Banded, and reporting the raw median alongside the impossible count,
    // because the bands where the RR bound cannot bind must not move at all —
    // movement there is a threading bug, not a measurement change — while the
    // bands where it does bind are expected to trade wrong numbers for refusals.
    println!("\nby rate:");
    println!("  band          n   raw>RR          reported   p50 raw QT/RR");
    for (lo, hi) in [(0.0, 60.0), (60.0, 80.0), (80.0, 100.0), (100.0, 300.0)] {
        let mut sub: Vec<_> =
            ratios.iter().filter(|(_, _, hr, _)| *hr >= lo && *hr < hi).collect();
        if sub.is_empty() {
            continue;
        }
        let bad = sub.iter().filter(|(qt, rr, _, _)| qt > rr).count();
        let rep = sub.iter().filter(|r| r.3.is_some()).count();
        sub.sort_by(|a, b| (a.0 / a.1).partial_cmp(&(b.0 / b.1)).unwrap());
        let p50 = { let r = sub[sub.len() / 2]; r.0 / r.1 };
        println!(
            "  {lo:>3.0}-{hi:<3.0} bpm {:>5}   {bad:<4} ({:>5.1}%)   {rep:>5} ({:>5.1}%)   {p50:>10.2}",
            sub.len(),
            100.0 * bad as f64 / sub.len() as f64,
            100.0 * rep as f64 / sub.len() as f64,
        );
    }
}

/// The smallest JSON reader that serves this survey, rather than a dependency.
mod serde_json_lite {
    pub struct Value(String);
    pub fn parse(s: &str) -> Value {
        Value(s.to_string())
    }
    impl Value {
        /// Read a top-level numeric field. Returns None for `null`.
        pub fn number(&self, key: &str) -> Option<f64> {
            let at = self.0.find(&format!("\"{key}\":"))?;
            let rest = &self.0[at + key.len() + 3..];
            let end = rest.find([',', '}'])?;
            rest[..end].trim().parse().ok()
        }
    }
}

/// How often a real record actually yields a vectorcardiogram, and why not.
///
/// `VCG_QRS_RHO_MIN` is stricter than the bar a beat clears to join an ensemble
/// at all, so it could plausibly refuse almost everything and leave a teaching
/// page that only ever says no. That is not knowable by reading the constant.
///
///   cargo test -p ecg-core --test real_serial -- --ignored --nocapture survey_vcg
#[test]
#[ignore = "needs the fetched corpus; run deliberately"]
fn survey_vcg_refusals() {
    if !common::corpus_available() {
        eprintln!("no corpus on disk — skipping");
        return;
    }

    let mut counts: std::collections::BTreeMap<String, usize> = Default::default();
    let mut drawn = 0usize;
    let mut total = 0usize;
    let mut spread_over_4ms = 0usize;
    let mut rr_cvs: Vec<f64> = Vec::new();
    let mut rhos: Vec<f32> = Vec::new();

    for id in common::all_record_ids() {
        let Ok(rec) = common::read_by_id(id) else { continue };
        let Some(study) = common::build_study(&rec) else { continue };
        total += 1;

        rr_cvs.push(study.rr_cv_measured());
        rhos.push(study.rho_min_measured());
        let v = study.vcg();
        let refusal = v.refusal_json();
        if refusal == "null" {
            drawn += 1;
            if v.alignment_spread_ms() > 4.0 {
                spread_over_4ms += 1;
            }
        } else {
            let code = refusal
                .split("\"code\":\"")
                .nth(1)
                .and_then(|r| r.split('"').next())
                .unwrap_or("?")
                .to_string();
            *counts.entry(code).or_default() += 1;
        }
    }

    println!("\nVCG over {total} records");
    println!("  loop drawn        {drawn} ({:.1}%)", 100.0 * drawn as f64 / total as f64);
    println!("  alignment > 4 ms  {spread_over_4ms} of the drawn");
    let pct = |v: &mut Vec<f64>, q: f64| -> f64 {
        v.sort_by(|a, b| a.partial_cmp(b).unwrap());
        if v.is_empty() { return f64::NAN; }
        v[((v.len() - 1) as f64 * q) as usize]
    };
    let mut cv: Vec<f64> = rr_cvs.iter().copied().filter(|x| x.is_finite()).collect();
    let mut rh: Vec<f64> = rhos.iter().map(|&x| x as f64).filter(|x| x.is_finite()).collect();
    let n_cv_fail = cv.iter().filter(|&&x| x > 0.10).count();
    let n_rho_fail = rh.iter().filter(|&&x| x < 0.98).count();
    println!("  rr_cv measurable {} of {total}: p50 {:.3} p90 {:.3} p99 {:.3} | >0.10: {n_cv_fail}",
             cv.len(), pct(&mut cv, 0.5), pct(&mut cv, 0.9), pct(&mut cv, 0.99));
    println!("  rho   measurable {} of {total}: p01 {:.3} p10 {:.3} p50 {:.3} | <0.98: {n_rho_fail}",
             rh.len(), pct(&mut rh, 0.01), pct(&mut rh, 0.10), pct(&mut rh, 0.5));
    println!("  refused:");
    for (code, n) in &counts {
        println!("    {code:<24} {n:>5} ({:.1}%)", 100.0 * *n as f64 / total as f64);
    }
}

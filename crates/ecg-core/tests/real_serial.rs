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

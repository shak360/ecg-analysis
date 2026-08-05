//! Where the analysis time actually goes.
//!
//! Profiling `StudyBuilder::analyze` over the PTB-XL corpus put 66% of all work
//! inside `wasm_api::condition` and 22% inside `beats::ensemble`. `condition` is
//! three stages — column envelope, PCHIP to a uniform grid, windowed-sinc
//! resample — and link-time inlining collapses all three into one symbol, so the
//! profile cannot say which. This times them separately on the same shape of
//! input the corpus produces.
//!
//! It is a measurement, not an assertion about speed: wall-clock thresholds in a
//! test fail on a loaded laptop and teach everyone to ignore them. The one thing
//! it does assert is the property that makes the numbers actionable — that the
//! stages are being fed what the pipeline really feeds them.
//!
//!   cargo test --profile profiling --test hot_path -- --ignored --nocapture

use std::time::Instant;

use ecg_core::config::FS;
use ecg_core::dsp::resample::{
    column_envelope, intermediate_rate, pchip_uniform, resample, Vertex,
};

/// One lead of a PTB-XL record: 10 s at 500 Hz, which is what `add_lead` gets.
fn lead_vertices() -> Vec<Vertex> {
    let n = (FS * 10.0) as usize;
    (0..n)
        .map(|i| {
            let t = i as f64 / FS;
            // A QRS-ish spike train plus a slow baseline, so the envelope and
            // the slope limiter both have something to do.
            let phase = (t % 0.8) - 0.1;
            let qrs = if phase.abs() < 0.05 {
                (1.0 - (phase / 0.05).abs()) as f32
            } else {
                0.0
            };
            let base = (0.3 * (2.0 * std::f64::consts::PI * 0.25 * t).sin()) as f32;
            Vertex { t_s: t, v_mv: qrs + 0.1 * base }
        })
        .collect()
}

fn ms(t: Instant) -> f64 {
    t.elapsed().as_secs_f64() * 1000.0
}

#[test]
#[ignore = "a measurement, run it deliberately"]
fn where_condition_spends_its_time() {
    let verts = lead_vertices();
    let span = verts[verts.len() - 1].t_s - verts[0].t_s;
    let f_src = (verts.len() - 1) as f64 / span;
    let f_int = intermediate_rate(f_src, FS);

    // The claim the numbers below rest on. If a future change makes the
    // intermediate rate differ from the canonical one, `resample` stops taking
    // its identity path and this whole ranking is about a different program.
    println!("f_src {f_src:.3} Hz -> f_int {f_int:.3} Hz -> out {FS:.3} Hz");
    assert!(f_int >= FS, "intermediate rate must not be below canonical");

    // 13 leads per study, as the corpus feeds it: twelve panels plus the strip.
    const LEADS: usize = 13;
    const REPS: usize = 20;

    let t = Instant::now();
    let mut cols = Vec::new();
    for _ in 0..REPS * LEADS {
        cols = column_envelope(&verts, 1.0 / f_int, 100.0);
    }
    let t_env = ms(t);

    let t = Instant::now();
    let mut uniform = pchip_uniform(&cols, f_int);
    for _ in 1..REPS * LEADS {
        uniform = pchip_uniform(&cols, f_int);
    }
    let t_pchip = ms(t);

    let t = Instant::now();
    for _ in 0..REPS * LEADS {
        let _ = resample(&uniform, FS);
    }
    let t_resample = ms(t);

    let total = t_env + t_pchip + t_resample;
    let per_study = |x: f64| x / REPS as f64;
    println!("\nper study of {LEADS} leads, mean of {REPS}:");
    println!("  column_envelope  {:7.2} ms  {:5.1}%", per_study(t_env), 100.0 * t_env / total);
    println!("  pchip_uniform    {:7.2} ms  {:5.1}%", per_study(t_pchip), 100.0 * t_pchip / total);
    println!("  resample         {:7.2} ms  {:5.1}%", per_study(t_resample), 100.0 * t_resample / total);
    println!("  ----------------------------------");
    println!("  condition total  {:7.2} ms", per_study(total));
}

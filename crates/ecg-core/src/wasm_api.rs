//! The WebAssembly surface.
//!
//! Kept deliberately narrow: JavaScript hands over irregular `(t, mV)` vertices
//! and gets back a uniform 500 Hz signal plus located beats. No per-sample calls
//! cross the boundary.
//!
//! Nothing here reports an amplitude. Every function on this surface is timing
//! only, because amplitudes require a confirmed gain and that confirmation is a
//! human-in-the-loop step that has not been built yet. A 2× gain error fabricates
//! an entire anterior STEMI evolution out of a normal tracing, so the boundary
//! refuses to be the place where an unconfirmed gain leaks into a number.

use wasm_bindgen::prelude::*;

use crate::beats::detect::{detect_qrs, BeatClass};
use crate::config::FS;
use crate::dsp::median_filter::provisional_detrend;
use crate::dsp::resample::{
    column_envelope, intermediate_rate, pchip_uniform, resample, Vertex,
};

/// Result of conditioning and beat-detecting one rhythm strip.
#[wasm_bindgen]
pub struct StripAnalysis {
    samples: Vec<f32>,
    flags: Vec<u8>,
    r_samples: Vec<u32>,
    beat_classes: Vec<u8>,
    fs_hz: f64,
    t0_s: f64,
    hr_bpm: f64,
    rr_median_s: f64,
    edge_samples: u32,
}

#[wasm_bindgen]
impl StripAnalysis {
    /// Conditioned signal in millivolts on the canonical grid.
    #[wasm_bindgen(getter)]
    pub fn samples(&self) -> Vec<f32> {
        self.samples.clone()
    }

    /// Per-sample provenance flags; see `dsp::resample::flags`.
    #[wasm_bindgen(getter)]
    pub fn flags(&self) -> Vec<u8> {
        self.flags.clone()
    }

    /// R-peak indices into `samples`.
    #[wasm_bindgen(getter)]
    pub fn r_samples(&self) -> Vec<u32> {
        self.r_samples.clone()
    }

    /// Beat classes, parallel to `r_samples`: 0 normal, 1 premature,
    /// 2 post-ectopic, 3 unclassified.
    #[wasm_bindgen(getter)]
    pub fn beat_classes(&self) -> Vec<u8> {
        self.beat_classes.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn fs_hz(&self) -> f64 {
        self.fs_hz
    }

    #[wasm_bindgen(getter)]
    pub fn t0_s(&self) -> f64 {
        self.t0_s
    }

    /// Median heart rate, or NaN when too few beats were found to say.
    #[wasm_bindgen(getter)]
    pub fn hr_bpm(&self) -> f64 {
        self.hr_bpm
    }

    #[wasm_bindgen(getter)]
    pub fn rr_median_s(&self) -> f64 {
        self.rr_median_s
    }

    /// Samples at each end sitting inside the resampler's transient.
    #[wasm_bindgen(getter)]
    pub fn edge_samples(&self) -> u32 {
        self.edge_samples
    }

    #[wasm_bindgen(getter)]
    pub fn beat_count(&self) -> usize {
        self.r_samples.len()
    }
}

/// Condition an irregularly sampled trace and locate its beats.
///
/// `t_s` and `v_mv` are parallel arrays of extracted vertices: seconds and
/// millivolts. `max_slope_mv_per_s` guards the column-envelope step against a
/// merged neighbouring lead; pass 0 for the default.
#[wasm_bindgen]
pub fn analyze_strip(t_s: &[f64], v_mv: &[f32], max_slope_mv_per_s: f32) -> StripAnalysis {
    let empty = StripAnalysis {
        samples: Vec::new(),
        flags: Vec::new(),
        r_samples: Vec::new(),
        beat_classes: Vec::new(),
        fs_hz: FS,
        t0_s: 0.0,
        hr_bpm: f64::NAN,
        rr_median_s: f64::NAN,
        edge_samples: 0,
    };

    let n = t_s.len().min(v_mv.len());
    if n < 4 {
        return empty;
    }

    let vertices: Vec<Vertex> = (0..n)
        .map(|i| Vertex { t_s: t_s[i], v_mv: v_mv[i] })
        .collect();

    // Source density drives the intermediate grid: never interpolate onto a
    // grid coarser than the source, which would alias.
    let span = t_s[n - 1] - t_s[0];
    if !(span > 0.0) {
        return empty;
    }
    let f_src = (n - 1) as f64 / span;
    let f_int = intermediate_rate(f_src, FS);

    let slope = if max_slope_mv_per_s > 0.0 { max_slope_mv_per_s } else { 100.0 };
    let cols = column_envelope(&vertices, 1.0 / f_int, slope);
    if cols.len() < 4 {
        return empty;
    }

    let uniform = pchip_uniform(&cols, f_int);
    if uniform.is_empty() {
        return empty;
    }

    let out = resample(&uniform, FS);

    // Pass 1: detrended purely so the detector has a flat signal. This result is
    // handed back for display, never for measurement.
    let detrended = provisional_detrend(&out.v_mv, FS, None, None);
    let det = detect_qrs(&detrended, FS);

    let r_samples: Vec<u32> = det.beats.iter().map(|b| b.r_sample as u32).collect();
    let beat_classes: Vec<u8> = det
        .beats
        .iter()
        .map(|b| match b.class {
            BeatClass::Normal => 0,
            BeatClass::Premature => 1,
            BeatClass::PostEctopic => 2,
            BeatClass::Unclassified => 3,
        })
        .collect();

    StripAnalysis {
        samples: detrended,
        flags: out.flags,
        r_samples,
        beat_classes,
        fs_hz: FS,
        t0_s: out.t0_s,
        hr_bpm: det.hr_bpm.unwrap_or(f64::NAN),
        rr_median_s: det.rr_median_s.unwrap_or(f64::NAN),
        edge_samples: out.edge_samples as u32,
    }
}

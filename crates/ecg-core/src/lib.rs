//! Compute core for serial ECG registration.
//!
//! Everything that touches sample arrays or pixels lives here and is compiled to
//! WebAssembly. The JavaScript side owns file I/O, PDF parsing, and rendering.
//!
//! Unit conventions, enforced throughout and never renegotiated locally:
//!   * amplitudes are **millivolts** (`f32`)
//!   * time is **seconds** (`f64` where absolute, `f32` for durations)
//!   * sample grids are uniform at [`SAMPLE_RATE_HZ`]
//!
//! Function names carry the unit when there is any doubt (`_mv`, `_sec`, `_hz`).

pub mod beats;
pub mod config;
pub mod dsp;
pub mod fiducial;
pub mod measure;
pub mod serial;
mod wasm_api;

pub use wasm_api::{
    analyze_strip, compare_studies, notable_st_leads, st_deltas_json, LeadComparison,
    StripAnalysis, StudyAnalysis, StudyBuilder,
};

pub use config::FS as SAMPLE_RATE_HZ;



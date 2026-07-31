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

use wasm_bindgen::prelude::*;

pub mod beats;
pub mod config;
pub mod dsp;
mod wasm_api;

pub use wasm_api::{analyze_strip, StripAnalysis};

pub use config::FS as SAMPLE_RATE_HZ;

/// Build identifier, surfaced in the UI so a reported measurement can be traced
/// back to the code that produced it.
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Round-trip smoke check across the JS/WASM boundary.
///
/// Returns the root-mean-square of `samples_mv`, in millivolts.
#[wasm_bindgen]
pub fn rms_mv(samples_mv: &[f32]) -> f32 {
    dsp::rms(samples_mv)
}

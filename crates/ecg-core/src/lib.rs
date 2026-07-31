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

pub mod dsp;

/// The common sample grid every study is resampled onto before registration.
///
/// 500 Hz is the diagnostic-ECG standard: it resolves the QRS upstroke and narrow
/// Q waves (a 20 ms notch spans 10 samples) without the memory cost of 1 kHz, and
/// it is a clean integer ratio to the 250/500/1000 Hz rates carts actually emit.
pub const SAMPLE_RATE_HZ: f64 = 500.0;

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

# Serial ECG — registration & comparison

Client-side tooling to recover per-lead tracings from ECG **PDFs, scans, and photographs**, register
several studies from the same patient onto a common voltage and time base, and compare them lead by
lead to surface **change over time** — new ST elevation, evolving T-wave inversion, new Q waves, QRS
widening, axis shift.

Comparing serial ECGs is normally done by eye with two printouts side by side. A 1 mm ST shift is
clinically decisive and easy to miss, and printouts vary in paper speed, gain, and baseline, so naive
overlay is meaningless. Registration is what makes the comparison valid.

> **Not a medical device.** This tool assists visual comparison of ECG tracings for research and
> educational use. Measurements are derived from digitized images and carry uncertainty that depends
> on source quality. It does not provide diagnosis or interpretation. All findings must be verified
> against the original tracings by a qualified clinician.

## Privacy

Everything runs in the browser. There is no backend and no upload — tracings never leave the machine,
and nothing is written to disk between sessions.

`sample_ECGs/` is gitignored, as are `*.pdf`, `*.png`, and `*.jpg` anywhere in the tree, so real
patient data cannot be committed by accident. **Gitignoring is not the same as being safe**, though:
it governs git and nothing else. Agents, shell commands, and search tools read the working tree
regardless, so `.claude/settings.json` additionally denies reads of `sample_ECGs/**`.

**Until the de-identifying ingest exists, do not put real patient ECGs anywhere inside this
repository.** The synthetic fixtures cover the pipeline; the first real file the system touches
should be one it can strip identifiers from at the door. See
[docs/decisions/0002-real-ecg-handling.md](docs/decisions/0002-real-ecg-handling.md) for the incident
that motivated this.

## Status

Early. What works today:

- **Vector-PDF extraction.** When a cart emits a vector PDF the tracing is literally a polyline in the
  content stream, so coordinates are read directly rather than inferred from pixels. On the 12-lead
  fixture this recovers all 12 lead panels, the rhythm strip, and the calibration pulses, and measures
  the grid pitch to 1.0000 mm.
- **Grid/trace classification** and grid-pitch estimation, including mixed 1 mm / 5 mm lattices.
- **Synthetic fixture generator** — 12-lead ECGs rendered as realistic printout PDFs with exact ground
  truth, including a serial pair differing only by a known +0.25 mV ST elevation in V2–V4.
- Rust → WebAssembly compute core wired end to end, with a numeric self-check at boot.

Not yet built: calibration to mV/seconds, lead assignment, DSP, the registration engine, the
comparison UI, and the raster (scan/photo) path.

## The constraint that shapes the design

A standard 3×4 printout does **not** contain 10 seconds of all 12 leads. Each lead panel is a 2.5 s
window at a different time offset — I/II/III cover 0–2.5 s, aVR/aVL/aVF cover 2.5–5 s, V1–V3 cover
5–7.5 s, V4–V6 cover 7.5–10 s. Only the rhythm strip spans the full record.

So there are only ~2–4 beats per lead, registration is **beat-based** (a median beat per lead) rather
than strip-based, the rhythm strip is the timing authority, and the app must never present a
reconstructed 12-lead as continuous simultaneous signal.

## Requirements

- [Rust](https://rustup.rs) with the `wasm32-unknown-unknown` target, and
  [`wasm-pack`](https://rustwasm.github.io/wasm-pack/)
- [Deno](https://deno.com) 2.x

```bash
brew install rustup deno wasm-pack
rustup default stable
rustup target add wasm32-unknown-unknown
```

## Usage

```bash
deno task fixtures   # generate synthetic ECG PDFs with ground truth
deno task dev        # build WASM, bundle, serve on :8080
deno task test       # Rust unit tests + Deno tests
```

Then open <http://localhost:8080/> for the app, or <http://localhost:8080/dev.html> for the vector
extraction harness, which renders a fixture PDF beside the geometry the extractor recovered from it.

## Layout

```
crates/ecg-core/   Rust → WASM compute core (DSP, registration, image processing)
web/src/ingest/    file routing, PDF geometry extraction, classification
web/src/ui/        canvas views and controls
web/vendor/pdfjs/  vendored pdf.js, pinned (see VERSION)
tools/synth/       synthetic ECG generator and printout renderer
test/              Rust and Deno tests
sample_ECGs/       your own ECGs — gitignored, never committed
```

Rust owns anything touching sample arrays or pixels; TypeScript owns file I/O, pdf.js, and Canvas.
All in-memory signals are `Float32Array` in **millivolts** on a common **500 Hz** grid, with time in
seconds.

## Licence

Not yet determined. `web/vendor/pdfjs/` is Mozilla's pdf.js under Apache-2.0; see its `LICENSE`.

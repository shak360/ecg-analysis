# ECG Atlas

**Live at <https://shak360.github.io/ecg-analysis/>** — no install, no account, no backend.

A browsable library of **real, de-identified ECGs** labelled by the cardiologists who read them,
drawn from seven open corpora, plus the measurement tooling to interrogate them. Everything runs in
the browser.

How many cases a given build carries is a parameter, not a property: `--atlas N` selects up to N per
finding, so the corpus is a *sample* sized when it is fetched rather than a fixed cohort. The
deployed site states its own count in the Findings bar, and that count is derived from the index it
actually loaded — it cannot disagree with what you can open. Do not quote a number from this file in
anything citable; read it off the site.

The site has four parts:

| Page | What it is |
| --- | --- |
| **Atlas** (home) | 120 findings across seven categories, each with real examples. Browse by what a cardiologist found. |
| **Test yourself** | Anki-style multiple choice over the human-validated subset. |
| **Serial pairs** | Before/after pairs from PTB-XL patients, for studying change over time. |
| **Compare** | Recover tracings from **vector PDFs**, register several studies onto a common voltage and time base, and compare them lead by lead. Scans and photographs are not yet supported. |

Comparing serial ECGs is normally done by eye with two printouts side by side. A 1 mm ST shift is
clinically decisive and easy to miss, and printouts vary in paper speed, gain, and baseline, so naive
overlay is meaningless. Registration is what makes the comparison valid.

The name is deliberately plain. It is **not** related to the EU
[OpenECG network](https://cinc.org/archives/2002/pdf/285.pdf) (2002–2006), which promoted the
SCP-ECG standard that PTB-XL's labels happen to use.

> **Not a medical device.** This tool assists visual comparison of ECG tracings for research and
> educational use. Measurements are derived from digitized images and carry uncertainty that depends
> on source quality. This tool does not suggest, assign or adjudicate a diagnosis. Where it shows
> published diagnostic criteria beside a label, the label is the reporting cardiologist's and the
> criteria are quotations — frequently disagreeing with one another — shown for teaching; nothing on
> the page evaluates the label. A measurement this tool could not make is withheld rather than
> reported as normal, and an absent number means nothing either way. All findings must be verified
> against the original tracings by a qualified clinician.

## Privacy

Everything runs in the browser. There is no backend and no upload path: a PDF you open on **Compare**
is parsed in the page and is never sent anywhere, and no tracing you supply leaves the machine.

Two things changed when the site went up, and both are worth stating plainly rather than leaving the
old sentence to cover them. The **atlas corpus is now downloaded from the site** — it used to be read
off your own disk through a dev-server mount, so "nothing is fetched at page load" was true locally
and is not true of a deployed build. Those are open, de-identified, CC BY 4.0 recordings published by
PhysioNet, so what is being fetched is public data, not yours. And **one thing does persist**: the
quiz keeps your score in `localStorage` so progress survives a reload. Nothing else is stored — not
the theme, not any tracing, not any measurement — and the quiz's Reset progress button clears it.

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

Early, and the vector-PDF path runs end to end. What works today:

- **Vector-PDF extraction.** When a cart emits a vector PDF the tracing is literally a polyline in the
  content stream, so coordinates are read directly rather than inferred from pixels. On the 12-lead
  fixture this recovers all 12 lead panels, the rhythm strip, and the calibration pulses, and measures
  the grid pitch to 1.0000 mm.
- **Grid/trace classification** and grid-pitch estimation, including mixed 1 mm / 5 mm lattices.
- **Calibration** to millivolts and seconds, read from the calibration pulse in preference to any
  header text, per row, because split-gain printouts are routine.
- **The measurement path**: PCHIP and Kaiser resampling to a 500 Hz grid, a throwaway median cascade
  that stabilises beat detection and is then discarded, Pan–Tompkins detection on the rhythm strip as
  the sole timing authority, panel↔strip time-base verification, PQ-anchored piecewise-linear detrend,
  ensemble beats with per-sample σ, and two-pass global fiducials from spatial velocity.
- **Registration and comparison.** Rigid cross-study alignment on QRS onset with the correlation
  interlocks, per-lead Δ(t), a series view rather than only a pair, and study-level findings — a QRS
  duration change is reported separately, because it changes how every other number should be read.
- **The verdict gate.** Serial ST change is reported through five states — `Significant`,
  `Indeterminate`, `BelowDetectionLimit`, `NoChange`, `Unmeasurable` — behind the spec's fail-closed
  preconditions, with an MDC95 for the pair and both uncertainty bands. `NoChange` requires positively
  excluding the clinical threshold; it is never the fallback. See
  [docs/decisions/0007-verdict-gate.md](docs/decisions/0007-verdict-gate.md), which also records what
  this costs today: the pipeline does not yet measure ST-window coverage, lead identity, or the
  electrode arrangement, so on real input every lead currently returns `Unmeasurable` rather than a
  number the evidence does not support.
- **Synthetic fixture generator** — 12-lead ECGs rendered as realistic printout PDFs with exact ground
  truth, including a serial pair differing only by a known +0.25 mV ST elevation in V2–V4.
- Rust → WebAssembly compute core in a Web Worker behind a plain-data boundary, with a numeric
  self-check at boot.

Not yet built: the raster (scan/photo) path, lead assignment from labels, the five human-in-the-loop
gates, and the evidence the verdict gate is waiting on.

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
- Node 24, pinned in `.node-version` and now also declared in `package.json`
  `engines` (see
  [docs/decisions/0006-node-toolchain.md](docs/decisions/0006-node-toolchain.md)).
  `engines` previously said `>=20`, which contradicted the pin and let a shell
  that had not run `fnm use` fail twelve tests with a misleading message.

Browsers: Chrome/Edge 111, Firefox 114, Safari 16.4. Each bound is a verified
constraint in shipped code — `color-mix()` in the stylesheet, module workers in
the engine client, and a class static block in the vendored pdf.js worker, which
Vite copies rather than transpiles. The target previously read Chrome 100 /
Safari 15.4, which nothing supported. A fourth constraint, Safari 17.4, is
shimmed away — see [web/vendor/pdfjs/PATCHES.md](web/vendor/pdfjs/PATCHES.md).

```bash
brew install rustup wasm-pack fnm
rustup default stable
rustup target add wasm32-unknown-unknown
fnm install && fnm use
npm ci --ignore-scripts   # lifecycle scripts are npm's main supply-chain vector
```

### The corpus is not in this repository

`data/` is gitignored, so **a fresh clone has none of the ECGs** and the
atlas, the quiz and the serial-pairs browser will all come up empty. That is
deliberate — it is 461 MB, and the gitignore rule that excludes it is the same
one that stops a real patient PDF being committed by accident. Fetch it:

```bash
npm run fetch:ptbxl -- --atlas 6     # PTB-XL, human-validated, ~40 min
npm run fetch:ptbxl -- --reindex     # index everything already on disk
npm run fetch:challenge -- --atlas 4 # the other six corpora
```

Everything is CC BY 4.0 from PhysioNet and needs no login. `Compare` and the
developer harnesses work without any of it — they run on the synthetic fixtures
from `npm run fixtures`.

## Usage

```bash
npm run fixtures   # generate synthetic ECG PDFs with ground truth
npm run dev        # build WASM, serve with HMR
npm test           # Rust tests + web tests
npm run check      # tsc --noEmit and clippy
```

Then open the printed dev-server URL for the app, or `/dev.html` for the vector extraction harness,
which renders a fixture PDF beside the geometry the extractor recovered from it.

`npm test` needs `web/wasm` present, so run `npm run wasm:dev` (or `npm run dev` once) first.

## Layout

```
crates/ecg-core/   Rust → WASM compute core (DSP, registration, image processing)
web/src/ingest/    file routing, PDF geometry extraction, classification
web/src/ui/        canvas views and controls
web/vendor/pdfjs/  vendored pdf.js, pinned (see VERSION)
tools/synth/       synthetic ECG generator and printout renderer
test/              web tests (vitest); Rust tests live beside the code and in crates/*/tests/
sample_ECGs/       your own ECGs — gitignored, never committed
```

Rust owns anything touching sample arrays or pixels; TypeScript owns file I/O, pdf.js, and Canvas.
All in-memory signals are `Float32Array` in **millivolts** on a common **500 Hz** grid, with time in
seconds.

## Licence

Not yet determined. `web/vendor/pdfjs/` is Mozilla's pdf.js under Apache-2.0; see its `LICENSE`.

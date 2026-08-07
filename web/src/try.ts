/**
 * End-to-end trial of the pipeline as built so far.
 *
 * PDF → vector geometry → grid pitch → millivolts and seconds → Rust/WASM
 * (column envelope, PCHIP, Kaiser resample, pass-1 detrend, Pan–Tompkins) →
 * rendered rhythm strip with located beats.
 *
 * What is deliberately absent, and why no amplitude appears anywhere on screen:
 * the gain has not been confirmed by a human, there is no PQ-anchored detrend,
 * no ensemble beat, and no registration. Timing is safe to show because it
 * depends only on paper speed, which the grid pitch pins exactly.
 */
import { darkTheme } from "./ui/theme.ts";
import { assetUrl } from "./app/site.ts";
import init, { analyze_strip } from "../wasm/ecg_core.js";
import { extractPageGeometry, POINTS_PER_MM } from "./ingest/pdf-paths.ts";
import { classifyPolylines } from "./ingest/classify.ts";
import type { Polyline } from "./ingest/path-decode.ts";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

/** Sample flags mirrored from `dsp::resample::flags`. */
const FLAG_INTERPOLATED = 1 << 0;

interface Assumptions {
  mmPerSec: number;
  mmPerMv: number;
}

/**
 * Pick the rhythm strip: the trace spanning the largest fraction of page width.
 *
 * A real layout detector arrives in a later stage; this is a stand-in that
 * happens to be reliable on a standard 3×4-plus-strip printout, where the strip
 * is the only trace crossing all four column boundaries.
 */
function pickRhythmStrip(traces: Polyline[]): Polyline | null {
  if (traces.length === 0) return null;
  return traces.reduce((best, t) => (t.maxX - t.minX > best.maxX - best.minX ? t : best));
}

/**
 * Convert a polyline in PDF points to `(seconds, millivolts)`.
 *
 * The vertical zero is the trace's own median, which is a stand-in for the
 * PQ-anchored isoelectric that the measurement path will use. It is good enough
 * to look at and not good enough to measure, which is why nothing downstream of
 * here reports a voltage.
 */
function toPhysical(
  poly: Polyline,
  pxPerMm: { x: number; y: number },
  a: Assumptions,
): { t: Float64Array; v: Float32Array } {
  const n = poly.points.length / 2;
  const ys: number[] = [];
  for (let i = 0; i < n; i++) ys.push(poly.points[i * 2 + 1]!);
  const sorted = [...ys].sort((p, q) => p - q);
  const baseline = sorted[sorted.length >> 1]!;

  const t = new Float64Array(n);
  const v = new Float32Array(n);
  const x0 = poly.points[0]!;
  for (let i = 0; i < n; i++) {
    const px = poly.points[i * 2]!;
    const py = poly.points[i * 2 + 1]!;
    t[i] = (px - x0) / pxPerMm.x / a.mmPerSec;
    // Page y grows downward; millivolts grow upward.
    v[i] = -(py - baseline) / pxPerMm.y / a.mmPerMv;
  }
  return { t, v };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

interface Analysis {
  samples: Float32Array;
  flags: Uint8Array;
  rSamples: Uint32Array;
  beatClasses: Uint8Array;
  fsHz: number;
  hrBpm: number;
  edgeSamples: number;
}

const CLASS_COLOUR = ["#0b6ab8", "#c2410c", "#a16207", "#6b7280"];

function drawStrip(canvas: HTMLCanvasElement, a: Analysis, mmPerSec: number, mmPerMv: number) {
  const dpr = globalThis.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 900;
  const secs = a.samples.length / a.fsHz;

  // One CSS pixel per 0.1 mm keeps the grid crisp without a huge canvas.
  const pxPerMm = Math.max(2, cssW / (secs * mmPerSec));
  const cssH = 40 * pxPerMm;

  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const dark = darkTheme();

  // Grid, at true millimetre scale.
  ctx.fillStyle = dark ? "#12151a" : "#fffafa";
  ctx.fillRect(0, 0, cssW, cssH);
  const drawGrid = (stepMm: number, colour: string, width: number) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let x = 0; x <= cssW; x += stepMm * pxPerMm) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, cssH);
    }
    for (let y = 0; y <= cssH; y += stepMm * pxPerMm) {
      ctx.moveTo(0, y);
      ctx.lineTo(cssW, y);
    }
    ctx.stroke();
  };
  drawGrid(1, dark ? "#3a2020" : "#fadddd", 0.5);
  drawGrid(5, dark ? "#5c2e2e" : "#f2b8b8", 0.9);

  const midY = cssH / 2;
  const xOf = (i: number) => (i / a.fsHz) * mmPerSec * pxPerMm;
  const yOf = (mv: number) => midY - mv * mmPerMv * pxPerMm;

  // Edge transients: present, but visibly not measurement-grade.
  ctx.fillStyle = dark ? "rgba(120,130,145,.16)" : "rgba(90,100,115,.10)";
  ctx.fillRect(0, 0, xOf(a.edgeSamples), cssH);
  ctx.fillRect(xOf(a.samples.length - a.edgeSamples), 0, xOf(a.edgeSamples), cssH);

  // The trace. Interpolated spans are dashed so an invented span never reads as
  // recovered signal.
  ctx.lineWidth = 1.2;
  ctx.lineJoin = "round";
  let i = 0;
  while (i < a.samples.length) {
    const interp = (a.flags[i]! & FLAG_INTERPOLATED) !== 0;
    const start = i;
    while (
      i < a.samples.length &&
      ((a.flags[i]! & FLAG_INTERPOLATED) !== 0) === interp
    ) i++;

    ctx.strokeStyle = dark ? "#e8eaee" : "#101317";
    ctx.setLineDash(interp ? [3, 3] : []);
    ctx.beginPath();
    for (let k = Math.max(0, start - 1); k < i; k++) {
      const x = xOf(k), y = yOf(a.samples[k]!);
      if (k === Math.max(0, start - 1)) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Beat markers.
  for (let b = 0; b < a.rSamples.length; b++) {
    const idx = a.rSamples[b]!;
    const cls = a.beatClasses[b]!;
    const x = xOf(idx);
    ctx.strokeStyle = CLASS_COLOUR[cls] ?? CLASS_COLOUR[3]!;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cssH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = CLASS_COLOUR[cls] ?? CLASS_COLOUR[3]!;
    ctx.beginPath();
    ctx.arc(x, yOf(a.samples[idx]!), 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

let lastAnalysis: Analysis | null = null;
let lastAssumptions: Assumptions = { mmPerSec: 25, mmPerMv: 10 };

async function loadBytes(): Promise<{ bytes: Uint8Array; label: string }> {
  const file = ($<HTMLInputElement>("file").files ?? [])[0];
  if (file) {
    return { bytes: new Uint8Array(await file.arrayBuffer()), label: file.name };
  }
  const name = $<HTMLSelectElement>("fixture").value;
  const res = await fetch(assetUrl(`fixtures/synthetic/${name}.pdf`));
  if (!res.ok) throw new Error(`could not load fixture (${res.status})`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), label: name };
}

async function run(): Promise<void> {
  const report = $("report");
  report.textContent = "Working…";

  try {
    const { bytes, label } = await loadBytes();
    const assume: Assumptions = {
      mmPerSec: Number($<HTMLSelectElement>("speed").value),
      mmPerMv: Number($<HTMLSelectElement>("gain").value),
    };
    lastAssumptions = assume;

    const t0 = performance.now();
    const geom = await extractPageGeometry(bytes.slice(), 1, 1);
    if (!geom.isVector) {
      report.textContent =
        `${label}: no vector geometry found (${geom.imageOps} image operators).\n` +
        `This is a raster PDF and needs the image pipeline, which is not built yet.`;
      return;
    }

    const cls = classifyPolylines(geom.polylines);
    if (!cls.gridPitch) {
      report.textContent =
        `${label}: no grid lattice detected, so the millimetre scale is unknown.\n` +
        `Refusing to guess — every amplitude and interval would inherit the error.`;
      return;
    }

    const strip = pickRhythmStrip(cls.traces);
    if (!strip) {
      report.textContent = `${label}: no waveform traces found.`;
      return;
    }

    const pxPerMm = cls.gridPitch;
    const { t, v } = toPhysical(strip, pxPerMm, assume);
    const tExtract = performance.now() - t0;

    const t1 = performance.now();
    const res = analyze_strip(t, v, 0);
    const tAnalyze = performance.now() - t1;

    const a: Analysis = {
      samples: res.samples,
      flags: res.flags,
      rSamples: res.r_samples,
      beatClasses: res.beat_classes,
      fsHz: res.fs_hz,
      hrBpm: res.hr_bpm,
      edgeSamples: res.edge_samples,
    };
    lastAnalysis = a;
    drawStrip($<HTMLCanvasElement>("strip"), a, assume.mmPerSec, assume.mmPerMv);

    const counts = [0, 0, 0, 0];
    for (const c of a.beatClasses) counts[c]!++;
    const stripSecs = a.samples.length / a.fsHz;
    const interpolated = Array.from(a.flags).filter((f) => f & FLAG_INTERPOLATED).length;

    report.textContent = [
      `source        ${label}`,
      `grid pitch    ${(pxPerMm.x / POINTS_PER_MM).toFixed(4)} x ` +
      `${(pxPerMm.y / POINTS_PER_MM).toFixed(4)} mm   (measured, expect 1.0000)`,
      `traces        ${cls.traces.length} waveform, ${cls.grid.length} grid`,
      `rhythm strip  ${(strip.maxX - strip.minX).toFixed(0)} pt wide, ` +
      `${strip.points.length / 2} vertices`,
      ``,
      `resampled     ${a.samples.length} samples @ ${a.fsHz} Hz = ${stripSecs.toFixed(2)} s`,
      `edge samples  ${a.edgeSamples} at each end (excluded from measurement)`,
      `interpolated  ${interpolated} samples`,
      ``,
      `beats         ${a.rSamples.length}  ` +
      `(${counts[0]} normal, ${counts[1]} premature, ${counts[2]} post-ectopic)`,
      `heart rate    ${Number.isFinite(a.hrBpm) ? a.hrBpm.toFixed(1) + " bpm" : "not determined"}`,
      ``,
      `timing        extract ${tExtract.toFixed(0)} ms, analyse ${tAnalyze.toFixed(0)} ms`,
    ].join("\n");
  } catch (err) {
    report.textContent = `ERROR\n${err instanceof Error ? (err.stack ?? err.message) : err}`;
  }
}

await init();
$("run").addEventListener("click", () => void run());
$<HTMLSelectElement>("fixture").addEventListener("change", () => void run());
$<HTMLSelectElement>("speed").addEventListener("change", () => void run());
$<HTMLSelectElement>("gain").addEventListener("change", () => void run());
$<HTMLInputElement>("file").addEventListener("change", () => void run());
globalThis.addEventListener("resize", () => {
  if (lastAnalysis) {
    drawStrip(
      $<HTMLCanvasElement>("strip"),
      lastAnalysis,
      lastAssumptions.mmPerSec,
      lastAssumptions.mmPerMv,
    );
  }
});
void run();

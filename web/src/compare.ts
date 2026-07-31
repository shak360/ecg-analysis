/**
 * The comparison window: two ECGs, registered and superimposed.
 *
 * PDF → vector geometry → grid pitch → 3×4 layout → per-lead millivolts →
 * WASM (condition, detect beats, ensemble, fiducials) → cross-study registration
 * → overlay.
 *
 * Morphology and differences are shown. Numbers are not: reporting a millivolt
 * requires a confirmed gain and the uncertainty gate, and neither exists yet.
 * The Δrms figure beneath each lead is a shape-difference indicator, labelled as
 * such, not a clinical measurement.
 */
import init, { compare_studies, StudyBuilder } from "../wasm/ecg_core.js";
import { extractPageGeometry } from "./ingest/pdf-paths.ts";
import { classifyPolylines } from "./ingest/classify.ts";
import {
  checkIdentities,
  detectLayout,
  type Layout,
  sampleUniform,
  toPhysical,
} from "./ingest/layout.ts";
import { DEFAULT_OVERLAY, drawOverlay, type OverlayLead } from "./ui/overlay.ts";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

interface Assumptions {
  mmPerSec: number;
  mmPerMv: number;
}

interface Prepared {
  label: string;
  layout: Layout;
  // deno-lint-ignore no-explicit-any
  analysis: any;
  identity: ReturnType<typeof checkIdentities>;
  warnings: string[];
}

/** Extract, lay out, and analyse one study. */
async function prepare(
  bytes: Uint8Array,
  label: string,
  a: Assumptions,
): Promise<Prepared> {
  const geom = await extractPageGeometry(bytes, 1, 1);
  if (!geom.isVector) {
    throw new Error(
      `${label}: no vector geometry (${geom.imageOps} image operators). ` +
        `This is a raster PDF; the image pipeline is not built yet.`,
    );
  }

  const cls = classifyPolylines(geom.polylines);
  if (!cls.gridPitch) {
    throw new Error(
      `${label}: no grid lattice found, so the millimetre scale is unknown. ` +
        `Refusing to guess — every amplitude would inherit the error.`,
    );
  }

  const layout = detectLayout(cls.traces, cls.gridPitch, a.mmPerSec);
  const warnings = [...layout.warnings];

  // Identity check runs on the raw per-panel signals, before conditioning, so a
  // mislabelled lead is caught before anything downstream trusts the assignment.
  const sampled = new Map<string, Float32Array>();
  for (const p of layout.panels) {
    const { t, v } = toPhysical(p.trace, cls.gridPitch, a.mmPerSec, a.mmPerMv);
    sampled.set(p.lead, sampleUniform(t, v));
  }
  const identity = checkIdentities(sampled);
  warnings.push(...identity.notes);

  const builder = new StudyBuilder();
  for (const p of layout.panels) {
    const { t, v } = toPhysical(p.trace, cls.gridPitch, a.mmPerSec, a.mmPerMv);
    builder.add_lead(p.lead, t, v, p.timeOffsetSec);
  }
  if (layout.rhythm) {
    const { t, v } = toPhysical(layout.rhythm, cls.gridPitch, a.mmPerSec, a.mmPerMv);
    builder.set_rhythm(t, v);
  } else {
    warnings.push("no rhythm strip found — rate and beat timing are unavailable");
  }

  return { label, layout, analysis: builder.analyze(true), identity, warnings };
}

async function loadBytes(
  fixtureId: string,
  fileId: string,
): Promise<{ bytes: Uint8Array; label: string }> {
  const file = ($<HTMLInputElement>(fileId).files ?? [])[0];
  if (file) return { bytes: new Uint8Array(await file.arrayBuffer()), label: file.name };
  const name = $<HTMLSelectElement>(fixtureId).value;
  const res = await fetch(`/fixtures/synthetic/${name}.pdf`);
  if (!res.ok) throw new Error(`could not load ${name} (${res.status})`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), label: name };
}

let lastLeads: OverlayLead[] = [];
let lastAnchor = DEFAULT_OVERLAY.anchorIndex;

function render(): void {
  drawOverlay($<HTMLCanvasElement>("overlay"), lastLeads, {
    ...DEFAULT_OVERLAY,
    anchorIndex: lastAnchor,
    mmPerMv: Number($<HTMLSelectElement>("scale").value),
    showDifference: $<HTMLInputElement>("show-diff").checked,
    showSigma: $<HTMLInputElement>("show-sigma").checked,
    columns: Number($<HTMLSelectElement>("cols").value),
  });
}

async function run(): Promise<void> {
  const report = $("report");
  report.textContent = "Working…";
  try {
    const a: Assumptions = {
      mmPerSec: Number($<HTMLSelectElement>("speed").value),
      mmPerMv: Number($<HTMLSelectElement>("gain").value),
    };

    const [refRaw, cmpRaw] = await Promise.all([
      loadBytes("fixture-a", "file-a"),
      loadBytes("fixture-b", "file-b"),
    ]);

    const t0 = performance.now();
    const ref = await prepare(refRaw.bytes, refRaw.label, a);
    const cmp = await prepare(cmpRaw.bytes, cmpRaw.label, a);
    const comparisons = compare_studies(ref.analysis, cmp.analysis);
    const elapsed = performance.now() - t0;

    lastAnchor = ref.analysis.qrs_onset >= 0
      ? ref.analysis.qrs_onset
      : ref.analysis.anchor_index;

    lastLeads = comparisons.map((c) => {
      const refBeat = ref.analysis.beat(c.lead);
      return {
        lead: c.lead,
        traces: refBeat
          ? [
            {
              label: ref.label,
              samples: refBeat,
              sigma: ref.analysis.sigma(c.lead),
              beatsUsed: ref.analysis.beats_used(c.lead),
            },
            {
              label: cmp.label,
              samples: c.aligned_mv,
              sigma: cmp.analysis.sigma(c.lead),
              beatsUsed: cmp.analysis.beats_used(c.lead),
            },
          ]
          : [],
        difference: c.difference_mv,
        rmsDifferenceMv: c.rms_difference_mv,
        morphologyChanged: c.morphology_changed,
        unavailable: !refBeat,
      } satisfies OverlayLead;
    });
    render();

    const byRms = [...comparisons].sort((x, y) =>
      y.rms_difference_mv - x.rms_difference_mv
    );
    const warn = [...ref.warnings, ...cmp.warnings];

    report.textContent = [
      `reference    ${ref.label}    HR ${fmtHr(ref.analysis.hr_bpm)}`,
      `comparison   ${cmp.label}    HR ${fmtHr(cmp.analysis.hr_bpm)}`,
      `leads        ${comparisons.length} compared`,
      `anchor       global QRS onset at frame index ${lastAnchor}`,
      ``,
      `identity     Einthoven ${fmtPct(ref.identity.einthoven)}   ` +
      `Goldberger ${fmtPct(ref.identity.goldberger)}   ` +
      `${ref.identity.passed ? "consistent" : "INCONSISTENT"}`,
      ``,
      `shape difference by lead, largest first:`,
      ...byRms.map((c) =>
        `  ${c.lead.padEnd(4)} Δrms ${c.rms_difference_mv.toFixed(3)} mV   ` +
        `ρ ${c.rho_qrs.toFixed(3)}   lag ${c.lag_ms.toFixed(1)} ms` +
        (c.morphology_changed ? "   [QRS morphology differs]" : "")
      ),
      ``,
      ...(warn.length ? ["warnings:", ...warn.map((w) => `  ${w}`), ``] : []),
      `pitch        ${(ref.layout.columnSeconds).toFixed(2)} s per column`,
      `timing       ${elapsed.toFixed(0)} ms`,
    ].join("\n");
  } catch (err) {
    report.textContent = `ERROR\n${err instanceof Error ? (err.stack ?? err.message) : err}`;
  }
}

const fmtHr = (v: number) => Number.isFinite(v) ? `${v.toFixed(0)} bpm` : "n/a";
const fmtPct = (v: number | null) => v === null ? "n/a" : `${(v * 100).toFixed(1)}%`;

await init();
$("run").addEventListener("click", () => void run());
for (const id of ["fixture-a", "fixture-b", "file-a", "file-b", "speed", "gain"]) {
  $(id).addEventListener("change", () => void run());
}
for (const id of ["scale", "cols", "show-diff", "show-sigma"]) {
  $(id).addEventListener("change", render);
}
globalThis.addEventListener("resize", () => {
  if (lastLeads.length) render();
});
void run();

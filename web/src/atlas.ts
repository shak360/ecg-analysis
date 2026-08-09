/**
 * The teaching atlas: real ECGs, browsable by what a cardiologist found in them.
 *
 * PTB-XL carries 71 SCP-ECG statements across three kinds — diagnostic (40),
 * morphological (15) and rhythm (12), with four statements in two kinds at once.
 * The serial-pairs page uses eight of them, all conduction. This page uses all
 * of them, which is most of what makes the corpus worth having for learning.
 *
 * Two deliberate restrictions, both about not teaching the wrong thing:
 *
 * Only `validated_by_human` records are fetched. In a training set an unreviewed
 * label is noise you average out; here it is one person learning that a normal
 * ECG is an infarct.
 *
 * And this page does not interpret. It renders the tracing and shows the label
 * that came with it, attributed. The measurements below are this tool's and are
 * marked as such — a learner should be able to see where the two disagree, which
 * is impossible if the page quietly merges them.
 */
import { darkTheme } from "./ui/theme.ts";
import { createEngine } from "./engine/client.ts";
import { fetchAtlasRecord } from "./ingest/wfdb.ts";
import {
  ATLAS_WINDOW_S,
  type CorpusIndex,
  type Entry,
  firstWindow,
  loadCorpusIndex,
} from "./app/corpus.ts";
import { mountCasePicker } from "./ui/case-picker.ts";
import { DEFAULT_PRINTOUT, drawPrintout, type PrintoutStudy } from "./ui/printout.ts";
import { CRITERIA, entriesFor, evaluateEntry } from "./criteria/index.ts";
import { evidenceHtml } from "./ui/evidence.ts";
import { mountTools } from "./ui/tools.ts";
import { mountVcgView, type VcgView } from "./ui/vcg-view.ts";
import { translateReport } from "./ui/report-gloss.ts";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const engine = createEngine();
const TRACE = "#1b4a8f";

/** Everything loaded, once the index has been read. */
let corpus: CorpusIndex | null = null;
let lastPrintout: PrintoutStudy[] = [];
let lastColumnSeconds = 10;
/** Full duration in seconds when the record was longer than the shown window. */
let lastTrimmedFrom: number | null = null;
/** Leads the chosen criterion row names, washed on the tracing. */
let markedLeads: string[] = [];
/** The scale the last draw used, so the calipers convert with the same numbers. */
let lastScale: {
  pxPerMm: number;
  mmPerSec: number;
  mmPerMv: number;
  panels: { x: number; y: number; w: number; h: number }[];
} = { pxPerMm: 1, mmPerSec: 25, mmPerMv: 10, panels: [] };
/** The measured frontal axis, for the wheel. Null when it was not measurable. */
let lastAxis: number | null = null;
/** Guards against an older case landing after a newer one. */
let ticket = 0;
/** The vector-loop view of the same case, mounted once and fed per case. */
let vcg: VcgView | null = null;
/**
 * The engine keeps a case loaded until the next one is opened.
 *
 * The tracing needs the study only long enough to measure it, but the loop is
 * derived on demand — so releasing it the moment the printout was drawn meant
 * switching views had to re-ingest the record. Held instead, and released when
 * something else takes its place.
 */
let heldStudy: string | null = null;
/** Which loop has been fetched for the case currently open, if any. */
let loopFetched: "averaged" | "raw" | null = null;

// ---------------------------------------------------------------------------
// The finding list
// ---------------------------------------------------------------------------

/**
 * The seven categories the fan offers.
 *
 * Ordered as ECGs are taught rather than alphabetically or by frequency: what
 * normal looks like, then the rhythm, then how the impulse travels, then what
 * the muscle has suffered, then repolarisation, then chamber size. "Other"
 * collects the morphology statements that describe the tracing without
 * committing to a diagnosis, and is last because it is the least self-contained.
 *
 * `NORM`, `MI`, `STTC`, `CD` and `HYP` are PTB-XL's own `diagnostic_class`
 * values, carried through the shared vocabulary; the last two are derived from
 * `kind`, since a rhythm statement has no diagnostic class.
 */
// ---------------------------------------------------------------------------
// One case
// ---------------------------------------------------------------------------

function render(): void {
  if (!lastPrintout.length) return;
  lastScale = drawPrintout($<HTMLCanvasElement>("printout"), lastPrintout, {
    ...DEFAULT_PRINTOUT,
    mmPerMv: Number($<HTMLSelectElement>("scale").value),
    columnSeconds: lastColumnSeconds,
    layout: $<HTMLSelectElement>("layout").value as "3x4" | "12x1",
    emphasiseLeads: markedLeads,
  });
  // The overlay is a sibling layer and cannot see that the tracing was
  // repainted, so it is told.
  tools.redraw();
}

async function openCase(code: string, e: Entry): Promise<void> {
  // Which finding is open is the picker's state now, and the evidence view is
  // told the code directly, so nothing here needs to mirror it.
  const mine = ++ticket;

  // The previous case's study goes back to the engine before this one arrives.
  if (heldStudy) {
    const stale = heldStudy;
    heldStudy = null;
    void engine.release([stale]).catch(() => {});
  }
  loopFetched = null;
  vcg?.show(null);

  $("case-placeholder").hidden = false;
  $("case-panel").hidden = true;
  $("atlas-status").textContent = `Loading ${e.id}…`;

  try {
    const rec = await fetchAtlasRecord(e.id);
    if (mine !== ticket) return;

    const { leads, nSamples, trimmedFrom } = firstWindow(rec);

    // The cardiologist's labels and the published criteria are corpus data. They
    // do not depend on this tool measuring anything, so they are rendered before
    // the analysis is attempted — otherwise a record the engine cannot measure
    // shows a bare error line and hides the very content the page exists for.
    renderLabels(e);
    renderEvidence(code, e, null);
    $("case-placeholder").hidden = true;
    $("case-panel").hidden = false;

    let summary: any = null;
    let failure: string | null = null;
    lastAxis = null;
    try {
      summary = await engine.analyseSignals(`atlas-${e.id}`, leads, rec.fsHz);
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err);
    }
    if (mine !== ticket) return;

    // A digital record has no columns — the whole ten seconds is one window per
    // lead, so the printout draws each row continuously rather than as four
    // 2.5 s panels.
    lastColumnSeconds = nSamples / rec.fsHz / 4;
    lastPrintout = [{
      label: e.id,
      colour: TRACE,
      leads,
      rhythm: leads.get("II") ?? null,
    }];
    lastTrimmedFrom = trimmedFrom;

    if (summary) {
      lastAxis = Number.isFinite(summary.measurements?.axis)
        ? summary.measurements.axis
        : null;
      renderEvidence(code, e, summary);
      renderReport(summary);
      render();
      heldStudy = `atlas-${e.id}`;
    } else {
      // Say which half failed. "No lead produced a usable beat" against a blank
      // page reads as though the record is missing; against the labels and the
      // criteria it reads as what it is — this tool could not measure a tracing
      // that is still perfectly readable by eye.
      $("case-report").textContent =
        `this tool could not measure this recording: ${failure}\n` +
        `the labels and criteria above are the corpus's and are unaffected.`;
    }
  } catch (err) {
    if (mine !== ticket) return;
    $("atlas-status").textContent = err instanceof Error ? err.message : String(err);
  }
}

function renderLabels(e: Entry): void {
  const el = $("case-labels");
  el.innerHTML = "";

  const item = document.createElement("div");
  item.className = "findings__item";

  const label = document.createElement("strong");
  label.className = "findings__label";
  const who = [e.sex, e.age ? `${e.age}` : null].filter(Boolean).join(", ");
  label.textContent = `${e.sourceLabel} · ${e.id}${who ? ` · ${who}` : ""}`;
  item.appendChild(label);

  // Whether a human reviewed this label. Only PTB-XL records it, so saying so
  // per case is the only way a learner can tell which standard applies.
  const prov = document.createElement("div");
  prov.className = "study__when";
  prov.textContent = e.provenance === "human-validated"
    ? "label reviewed by a human (PTB-XL validated_by_human)"
    : "label as published by the source corpus — not separately reviewed";
  item.appendChild(prov);

  const ul = document.createElement("ul");
  for (const s of e.findings) {
    const li = document.createElement("li");
    // textContent throughout: the report field is free text from a clinical
    // system and must never be interpolated into markup.
    li.textContent = `${s.description || s.id} (${s.sourceCode}, ${s.kind}${
      s.diagnosticClass ? `, ${s.diagnosticClass}` : ""
    })`;
    ul.appendChild(li);
  }
  item.appendChild(ul);

  if (e.report) {
    const rep = document.createElement("div");
    rep.className = "note";
    rep.textContent = `Cardiologist's report: ${e.report}`;
    item.appendChild(rep);

    // 664 of these reports are German and 62 are Swedish — PTB-XL is a German
    // hospital's archive, and some of its reports are not in German at all. For
    // most cases the one line written by the person who actually read the
    // tracing is unusable to a reader without those languages.
    //
    // The original stays above, always. What follows is a translation of the
    // phrases the table knows, labelled with the language it came from: whole
    // clauses are translated as units so the word order is English, anything
    // unrecognised is left exactly as written, and the gaps are named. A reader
    // can work with that; what they could not work with is a fluent sentence
    // containing a term this tool invented.
    const tr = translateReport(e.report);
    if (tr.language === "de" || tr.language === "sv") {
      const { text, unknown, language } = tr;
      const gl = document.createElement("div");
      gl.className = "note note--gloss";
      const from = language === "sv" ? "Swedish" : "German";
      gl.textContent = `Translated from ${from}: ${text}`;
      item.appendChild(gl);

      if (unknown.length) {
        const un = document.createElement("div");
        un.className = "study__when";
        // Named rather than silently passed through, so a reader can see where
        // the gloss has nothing to offer instead of assuming those words were
        // already English.
        un.textContent = `Not in this tool's glossary, left in German: ${unknown.join(", ")}`;
        item.appendChild(un);
      }
    }
  }

  el.appendChild(item);
}

// deno-lint-ignore no-explicit-any
/**
 * The published criteria for the finding that was chosen, beside our numbers.
 *
 * Scoped to the *chosen* finding rather than every finding on the record. A case
 * with six labels would otherwise produce six criterion blocks above the
 * tracing, and the one the reader asked about would be buried among five they
 * did not.
 */
function renderEvidence(code: string, e: Entry, summary: any): void {
  const entries = entriesFor(CRITERIA, code);
  const m = summary?.measurements;
  const who = { sex: e.sex, age: e.age };
  const covered = new Set(CRITERIA.flatMap((c) => c.codes));

  markedLeads = [];
  $("case-evidence").innerHTML = evidenceHtml({
    findingLabel: corpus?.meta.get(code)?.description || code,
    results: m ? entries.map((x) => evaluateEntry(x, m, who)) : [],
    // Computed, never written into a string: `atlas.ts` already learned that a
    // hardcoded count drifts and always in the flattering direction.
    coverage: {
      covered: [...covered].filter((c) => corpus?.meta.has(c)).length,
      total: corpus?.meta.size ?? 0,
    },
  });
}

/**
 * Marking is one row at a time.
 *
 * A union across several criteria washes most of the page and starts to look
 * like a composite assessment, which is the one reading this panel must not
 * invite.
 */
/** The measuring tools, mounted onto this page's toolbar. */
const tools = mountTools({
  canvas: $<HTMLCanvasElement>("printout"),
  mount: document.querySelector<HTMLElement>(".panel__toolbar")!,
  getScale: () => lastScale,
  getAxis: () => lastAxis,
  // The same call as `render()`, into a wider canvas. `drawPrintout` derives its
  // millimetre scale from the canvas width, so a canvas `zoom` times wider is a
  // genuine `zoom`-times-finer rendering rather than the same pixels stretched.
  renderHiRes: (target) =>
    drawPrintout(target, lastPrintout, {
      ...DEFAULT_PRINTOUT,
      mmPerMv: Number($<HTMLSelectElement>("scale").value),
      columnSeconds: lastColumnSeconds,
    layout: $<HTMLSelectElement>("layout").value as "3x4" | "12x1",
      emphasiseLeads: markedLeads,
    }),
});

$("case-evidence").addEventListener("click", (ev) => {
  const tab = (ev.target as HTMLElement).closest<HTMLElement>(".evidence__pick__tab");
  if (tab) {
    const want = tab.dataset.idx;
    for (const el of document.querySelectorAll<HTMLElement>(".evidence__pick__tab")) {
      const on = el === tab;
      el.classList.toggle("is-on", on);
      el.setAttribute("aria-selected", String(on));
    }
    for (const el of document.querySelectorAll<HTMLElement>(".evidence__entry")) {
      el.hidden = el.dataset.idx !== want;
    }
    // A mark belongs to the row that set it, and that row is now off screen.
    markedLeads = [];
    for (const el of document.querySelectorAll(".evidence__row--marked")) {
      el.classList.remove("evidence__row--marked");
    }
    render();
    return;
  }

  const row = (ev.target as HTMLElement).closest<HTMLElement>(".evidence__row");
  if (!row) return;
  const leads = (row.dataset.leads ?? "").split(",").filter(Boolean);
  const same = row.classList.contains("evidence__row--marked");
  for (const el of document.querySelectorAll(".evidence__row--marked")) {
    el.classList.remove("evidence__row--marked");
  }
  markedLeads = same ? [] : leads;
  if (!same) row.classList.add("evidence__row--marked");
  render();
});

function renderReport(summary: any): void {
  const m = summary.measurements ?? {};
  const n = (v: number | null | undefined, unit: string, digits = 0) =>
    v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(digits)} ${unit}`;

  const lines = [
    "measured by this tool, not by the cardiologist:",
    `  rate            ${n(summary.hrBpm, "bpm")}`,
    `  QRS duration    ${n(m.qrs, "ms")}`,
    `  QT              ${m.qt == null && m.qtNote ? `not established — ${m.qtNote}` : n(m.qt, "ms")}`,
    `  QTc (Fridericia)${n(m.qtcF, "ms")}`,
    `  frontal axis    ${m.axis == null && m.axisNote ? `not comparable — ${m.axisNote}` : n(m.axis, "°")}`,
    `  leads recovered ${summary.leadNames?.length ?? 0} of 12`,
  ];

  // Say so when the tracing above is a window onto something longer. Measuring
  // ten seconds of a thirty-minute Holter and reporting the rate without
  // qualification would present one window as the whole recording.
  if (lastTrimmedFrom !== null) {
    lines.push(
      "",
      `  showing the first ${ATLAS_WINDOW_S} s of a ` +
        `${(lastTrimmedFrom / 60).toFixed(0)}-minute recording;`,
      `  every measurement above is of that window alone`,
    );
  }

  if (summary.warnings?.length) {
    lines.push("", "warnings:");
    for (const w of summary.warnings.slice(0, 6)) lines.push(`  ${w}`);
  }

  $("case-report").textContent = lines.join("\n");
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

/**
 * Re-render both tiers after a filter change.
 *
 * The fan's counts depend on the filters, so it cannot be drawn once at boot.
 * And a filter can empty the open category — searching "fibrillation" while
 * Hypertrophy is open leaves a selected card with nothing under it, which reads
 * as "no results" when the results are one card away. So the selection falls
 * through to the first category that still has findings.
 */
$("scale").addEventListener("change", render);
$("layout").addEventListener("change", render);
globalThis.addEventListener("resize", () => {
  render();
  vcg?.redraw();
});
$("theme-toggle").addEventListener("click", () => {
  const root = document.documentElement;
  root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  render();
  vcg?.redraw();
});

/**
 * Two ways of drawing one case, behind a switch rather than behind a link.
 *
 * The loop is derived on demand and only once per case: it is a second call
 * into the engine against a study it is already holding, so a reader who never
 * opens it never pays for it, and one who switches back and forth pays once.
 */
async function showView(which: "tracing" | "loop"): Promise<void> {
  const loop = which === "loop";
  $("pane-tracing").hidden = loop;
  $("pane-loop").hidden = !loop;
  $("view-tracing").setAttribute("aria-pressed", String(!loop));
  $("view-loop").setAttribute("aria-pressed", String(loop));

  if (!loop) {
    vcg?.pause();
    render();
    return;
  }

  if (!heldStudy) {
    vcg?.show(null);
    return;
  }
  const want = vcg?.mode() ?? "averaged";
  if (loopFetched !== want) {
    loopFetched = want;
    const mine = ticket;
    try {
      const snapshot = await engine.vcg(heldStudy, want);
      if (mine !== ticket) return;
      vcg?.show(snapshot);
    } catch {
      // A study the engine no longer holds is not an error worth a banner —
      // the reader sees the empty view and the tracing is one click away.
      vcg?.show(null);
    }
  } else {
    vcg?.redraw();
  }
}

$("view-tracing").addEventListener("click", () => void showView("tracing"));
$("view-loop").addEventListener("click", () => void showView("loop"));

vcg = mountVcgView({
  split: $("split"),
  beats: $<HTMLCanvasElement>("beats"),
  loops: $<HTMLCanvasElement>("loops"),
  space: $<HTMLCanvasElement>("space"),
  compass: $<HTMLCanvasElement>("compass"),
  compassLimb: $<HTMLCanvasElement>("compass-limb"),
  compassPrec: $<HTMLCanvasElement>("compass-prec"),
  play: $<HTMLButtonElement>("play"),
  speed: $<HTMLSelectElement>("speed"),
  showQrs: $<HTMLInputElement>("show-qrs"),
  showT: $<HTMLInputElement>("show-t"),
  scrub: $<HTMLInputElement>("scrub"),
  readout: $("cursor-readout"),
  refusal: $("vcg-refusal"),
  notes: $("vcg-notes"),
  expand: $<HTMLButtonElement>("expand-view"),
  reset: $<HTMLButtonElement>("reset-view"),
  focusHost: $("case-panel"),
  modeAveraged: $<HTMLButtonElement>("mode-averaged"),
  modeRaw: $<HTMLButtonElement>("mode-raw"),
}, {
  dark: () => darkTheme(),
});

// Switching how the loop is built asks the engine for the other one; the same
// study is still loaded, so it is a second call rather than a re-ingest.
vcg.onModeChange(() => void showView("loop"));

async function boot(): Promise<void> {
  const status = $("engine-status");
  try {
    await engine.ready();
    status.textContent = `Engine ready · ${engine.where}`;
    status.classList.add("statusbar__item--ok");
  } catch (err) {
    status.textContent = `Engine failed to start: ${err instanceof Error ? err.message : err}`;
    status.classList.add("statusbar__item--error");
  }

  const index = await loadCorpusIndex();
  corpus = index;

  if (!index.entries.length) {
    $("atlas-status").textContent =
      "No atlas index found. Run `npm run fetch:ptbxl -- --atlas 6`, " +
      "and optionally `npm run fetch:challenge -- --atlas 4` for the other corpora.";
    $("record-count").textContent = "not fetched";
    return;
  }

  mountCasePicker({
    el: {
      fan: $("class-fan"),
      list: $("finding-list"),
      count: $("record-count"),
      kind: $<HTMLSelectElement>("filter-kind"),
      source: $<HTMLSelectElement>("filter-source"),
      search: $<HTMLInputElement>("search"),
    },
    index,
    onPick: (code, e) => void openCase(code, e),
  });

  const reviewed = index.entries.filter((e) => e.provenance === "human-validated").length;
  $("atlas-status").textContent =
    `${index.entries.length} cases across ${index.meta.size} findings, from ` +
    `${index.sources.size} corpora — ${reviewed} with human-reviewed labels.`;
}

void boot();

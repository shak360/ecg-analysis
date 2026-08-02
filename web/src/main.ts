/**
 * The app.
 *
 * Drop ECGs, they are analysed as they arrive, pick two or more, and their
 * registered beats are superimposed lead by lead.
 *
 * Everything happens in this page. Files are read through the File API and
 * parsed in-process; there is no upload path in this code, and none should ever
 * be added — these are patient tracings.
 */
import { mountTools } from "./ui/tools.ts";
import { createEngine } from "./engine/client.ts";
import type { ComparisonSnapshot, SerialFinding } from "./engine/protocol.ts";
import { measurementsHtml } from "./ui/measurements.ts";
import {
  analyse,
  type Assumptions,
  formatInterval,
  loadFile,
  placeOnTimeline,
  type Study,
} from "./app/study.ts";
import { DEFAULT_PRINTOUT, drawPrintout, type PrintoutStudy } from "./ui/printout.ts";
import {
  DEFAULT_OVERLAY,
  drawOverlay,
  type OverlayDifference,
  type OverlayLead,
} from "./ui/overlay.ts";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const engine = createEngine();

let studies: Study[] = [];
const selected = new Set<string>();
let lastLeads: OverlayLead[] = [];
let lastScale: {
  pxPerMm: number;
  mmPerSec: number;
  mmPerMv: number;
  panels: { x: number; y: number; w: number; h: number }[];
} = { pxPerMm: 1, mmPerSec: 25, mmPerMv: 10, panels: [] };
let lastAnchor = DEFAULT_OVERLAY.anchorIndex;

/**
 * The comparison the screen is currently showing, kept so that a change of
 * colour or view can redraw without going back to the engine.
 *
 * Colour is deliberately not part of what the engine is asked for. The picker
 * fires on every pointer move while a user drags it, and each of those used to
 * re-run the whole registration.
 */
let lastSnapshot: ComparisonSnapshot | null = null;

/**
 * Guards against an older comparison landing after a newer one.
 *
 * Every request takes a ticket; a reply whose ticket is stale is dropped. With
 * the compute on another thread, "the user changed the selection while a
 * comparison was in flight" stops being hypothetical, and the failure it causes
 * — the screen settling on the *previous* selection — is silent.
 */
let compareTicket = 0;

const assumptions = (): Assumptions => ({
  mmPerSec: Number($<HTMLSelectElement>("speed").value),
  mmPerMv: Number($<HTMLSelectElement>("gain").value),
});

// ---------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------

async function accept(files: FileList): Promise<void> {
  const incoming: Study[] = [];
  for (const file of Array.from(files)) {
    incoming.push(await loadFile(file, assumptions()));
  }
  studies = placeOnTimeline([...studies, ...incoming]);
  renderStudies();

  // Analyse sequentially: pdf.js is single-worker, and a progressive list reads
  // better than everything appearing at once after a stall.
  for (const s of incoming) {
    await analyse(s, engine);
    if (!s.error && selected.size < 2) selected.add(s.id);
    renderStudies();
    compare();
  }
}

function removeStudy(id: string): void {
  studies = studies.filter((s) => s.id !== id);
  selected.delete(id);
  studies = placeOnTimeline(studies);
  // The engine holds this study's WASM handle until told otherwise. Dropping it
  // from the list is not enough: over a session of loading and clearing files,
  // the difference is a heap that stays flat and one that only grows.
  void engine.release([id]);
  renderStudies();
  compare();
}

// ---------------------------------------------------------------------------
// Study list
// ---------------------------------------------------------------------------

function renderStudies(): void {
  const list = $("study-list");
  list.innerHTML = "";

  // Say how they are ordered, not how we wish they were. `placeOnTimeline` can
  // only sort studies whose filename carries a timestamp; the rest keep load
  // order. Claiming "oldest first" over an unsorted strip would put a timeline
  // reading on an arbitrary one, which is the same error as reporting a
  // measurement we did not make.
  const dated = studies.filter((s) => s.acquiredAt).length;
  $("study-count").textContent = !studies.length
    ? ""
    : dated === studies.length
    ? `${studies.length} loaded · oldest first`
    : dated === 0
    ? `${studies.length} loaded · load order, no dates in filenames`
    : `${studies.length} loaded · ${dated} dated first, then load order`;

  if (studies.length === 0) {
    const li = document.createElement("li");
    li.className = "picker-strip__empty";
    li.textContent = "No studies loaded yet — add or drop ECG PDFs.";
    list.appendChild(li);
    $("clear-all").hidden = true;
    return;
  }
  $("clear-all").hidden = false;

  studies.forEach((s, i) => {
    const li = document.createElement("li");
    li.className = "study study--stacked";
    if (selected.has(s.id)) li.classList.add("study--selected");
    if (s.error) li.classList.add("study--error");

    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "study__check";
    box.checked = selected.has(s.id);
    box.disabled = !!s.error || !s.summary;
    box.setAttribute("aria-label", `Include ${s.fileName} in the comparison`);
    box.addEventListener("change", () => {
      if (box.checked) selected.add(s.id);
      else selected.delete(s.id);
      renderStudies();
      compare();
    });

    // The colour lives beside the study it identifies, rather than in a legend
    // that has to be read back and forth against the canvas.
    const swatch = document.createElement("input");
    swatch.type = "color";
    swatch.className = "study__colour";
    swatch.value = s.colour;
    swatch.title = `Colour for ${s.fileName}`;
    swatch.setAttribute("aria-label", `Trace colour for ${s.fileName}`);
    swatch.addEventListener("input", () => {
      s.colour = swatch.value;
      // Colour is drawn, not computed. Repainting the snapshot we already have
      // keeps a drag at frame rate instead of re-registering on every event.
      if (lastSnapshot) paintComparison(lastSnapshot);
    });

    const body = document.createElement("div");
    body.className = "study__body";

    const name = document.createElement("div");
    name.className = "study__name";
    name.textContent = s.fileName;
    body.appendChild(name);

    // Timeline position, expressed relative to its neighbours rather than as a
    // date. See docs/decisions/0001.
    const when = document.createElement("div");
    when.className = "study__when";
    if (s.acquiredAt) {
      const parts: string[] = [String(s.acquiredAt.getFullYear())];
      const prev = studies[i - 1];
      if (prev?.offsetSec != null && s.offsetSec != null) {
        parts.push(`+${formatInterval(s.offsetSec - prev.offsetSec)} after previous`);
      } else if (i === 0) {
        parts.push("index study");
      }
      when.textContent = parts.join(" · ");
    } else {
      when.textContent = "no date in filename";
    }
    body.appendChild(when);

    const status = document.createElement("div");
    status.className = "study__status";
    if (s.error) {
      status.classList.add("study__status--error");
      status.textContent = s.error;
    } else if (!s.summary) {
      status.textContent = "analysing…";
    } else {
      const hr = s.summary.hrBpm;
      const bits = [
        `${s.summary.leadNames.length} leads`,
        Number.isFinite(hr) ? `${hr.toFixed(0)} bpm` : "rate n/a",
      ];
      if (s.summary.identityPassed === false) bits.push("identity check failed");
      status.textContent = bits.join(" · ");
      if (s.summary.identityPassed === false) {
        status.classList.add("study__status--warn");
      }
    }
    body.appendChild(status);

    if (s.warnings.length) {
      const warn = document.createElement("details");
      warn.className = "study__warn";
      const sum = document.createElement("summary");
      sum.textContent = `${s.warnings.length} warning${s.warnings.length > 1 ? "s" : ""}`;
      warn.appendChild(sum);
      const ul = document.createElement("ul");
      for (const w of s.warnings) {
        const wli = document.createElement("li");
        wli.textContent = w;
        ul.appendChild(wli);
      }
      warn.appendChild(ul);
      body.appendChild(warn);
    }

    const del = document.createElement("button");
    del.type = "button";
    del.className = "study__remove";
    del.textContent = "×";
    del.title = `Remove ${s.fileName}`;
    del.setAttribute("aria-label", `Remove ${s.fileName}`);
    del.addEventListener("click", () => removeStudy(s.id));

    li.append(box, swatch, body, del);
    list.appendChild(li);
  });
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/**
 * Ask the engine for a comparison, then paint it.
 *
 * Split in two on purpose: `compare` decides *what* to compare and awaits the
 * engine; `paintComparison` turns a snapshot into pixels using only main-thread
 * state. That split is what lets a colour change repaint the last snapshot
 * instead of recomputing it.
 */
function compare(): void {
  const chosen = studies.filter((s) => selected.has(s.id) && s.summary && !s.error);
  const placeholder = $("view-placeholder");
  const panel = $("view-panel");

  if (chosen.length < 2) {
    lastSnapshot = null;
    lastLeads = [];
    lastPrintout = [];
    compareTicket++;
    placeholder.hidden = false;
    panel.hidden = true;
    placeholder.querySelector("p")!.textContent = chosen.length === 1
      ? "Select one more study to compare."
      : "Load two or more ECGs to compare them.";
    render();
    return;
  }
  placeholder.hidden = true;
  panel.hidden = false;

  // The earliest selected study is the reference; every later one is registered
  // against it. Comparing each to the index rather than to its predecessor
  // shows cumulative change, which is what a series is usually read for -- an
  // evolving infarct is a story about distance from baseline.
  const ids = chosen.map((s) => s.id);
  const ticket = ++compareTicket;

  void engine.compare(ids).then(
    (snapshot) => {
      if (ticket !== compareTicket) return;
      lastSnapshot = snapshot;
      paintComparison(snapshot);
    },
    (err: unknown) => {
      if (ticket !== compareTicket) return;
      $("report").textContent = `Comparison failed: ${
        err instanceof Error ? err.message : String(err)
      }`;
    },
  );
}

/** Turn a snapshot plus current UI state into everything the canvases read. */
function paintComparison(snapshot: ComparisonSnapshot): void {
  // The snapshot is positional; recover the studies it refers to. A study
  // removed while the comparison was in flight simply drops out.
  const byId = new Map(studies.map((s) => [s.id, s]));
  const chosen = snapshot.studyIds.map((id) => byId.get(id)).filter((s): s is Study => !!s);
  if (chosen.length !== snapshot.studyIds.length) return;

  const ref = chosen[0]!;

  lastLeads = snapshot.leads.map((l): OverlayLead => {
    if (l.unavailable) return { lead: l.lead, traces: [], unavailable: true };
    return {
      lead: l.lead,
      traces: l.traces.map((tr, i) => ({
        label: chosen[i]?.fileName ?? "",
        colour: chosen[i]?.colour ?? "#888",
        samples: tr.samples,
        sigma: tr.sigma ?? undefined,
        beatsUsed: tr.beatsUsed,
      })),
      differences: l.differences.map((d): OverlayDifference => ({
        samples: d.samples,
        traceIndex: d.traceIndex,
        rmsMv: d.rmsMv,
        implausible: d.implausible,
      })),
      rmsDifferenceMv: l.rmsDifferenceMv,
      morphologyChanged: l.morphologyChanged,
    };
  });

  lastAnchor = snapshot.anchorIndex;
  lastColumnSeconds = snapshot.columnSeconds;
  lastPrintout = snapshot.printouts.map((p, i) => ({
    label: chosen[i]?.fileName ?? "",
    colour: chosen[i]?.colour ?? "#888",
    leads: p.leads,
    rhythm: p.rhythm,
  } satisfies PrintoutStudy));

  render();

  renderFindings(chosen, snapshot.findingSets);
  // The measurements block is a pure function of plain data, so the thresholds
  // it renders against come from the snapshot rather than from anything on this
  // side. `main.ts` supplies only the file names, which are UI state.
  $("measurements").innerHTML = measurementsHtml({
    studies: chosen.map((s) => ({
      name: s.fileName,
      calibration: s.summary!.calibration,
      measurements: s.summary!.measurements,
    })),
    verdictSets: snapshot.verdictSets,
    pairBlockerSets: snapshot.pairBlockerSets,
    clinicalThresholdMv: snapshot.clinicalThresholdMv,
    stDisplayQuantumMv: snapshot.stDisplayQuantumMv,
  });

  const lines: string[] = [
    `reference  ${ref.fileName}   ${fmtHr(ref.summary!.hrBpm)}`,
  ];
  chosen.slice(1).forEach((s) => {
    const gap = ref.offsetSec != null && s.offsetSec != null
      ? `+${formatInterval(s.offsetSec - ref.offsetSec)}`
      : "interval unknown";
    lines.push(`           ${s.fileName}   ${fmtHr(s.summary!.hrBpm)}   ${gap}`);
  });
  lines.push(
    "",
    `leads      ${snapshot.leads.length} compared across ${chosen.length} studies`,
    "",
  );

  // Rank by the largest change any study in the series shows, so a lead that
  // moved late is not buried by averaging.
  const worst = [...snapshot.leads]
    .map((l) => ({ lead: l.lead, rms: l.rmsDifferenceMv }))
    .sort((a, b) => b.rms - a.rms);

  lines.push("largest shape difference by lead, across the series:");
  for (const w of worst) {
    lines.push(`  ${w.lead.padEnd(4)} \u0394rms ${w.rms.toFixed(3)} mV`);
  }

  $("report").textContent = lines.join("\n");
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

/**
 * Render study-level findings above the measurements.
 *
 * These are deliberately not folded into the table. A conduction change means
 * every ST and T delta below carries the new activation sequence as well as any
 * change in repolarisation, and the two cannot be separated — so it has to be
 * read first, not discovered afterwards in a column.
 */
function renderFindings(studies: Study[], findingSets: SerialFinding[][]): void {
  const el = $("serial-findings");
  el.innerHTML = "";

  const any = findingSets.some((f) => f.length > 0);
  el.hidden = !any;
  if (!any) return;

  findingSets.forEach((findings, k) => {
    // findingSets[k] compares studies[k + 1] against the reference.
    const subject = studies[k + 1];
    for (const finding of findings) {
      const equivocal = finding.level === "equivocal";
      const item = document.createElement("div");
      // Equivocal findings get their own, quieter treatment. Rendering them in
      // the same warning colour as a confirmed change would assert something
      // the engine deliberately declined to assert, and the reader cannot be
      // expected to recover the distinction from the prose alone.
      item.className = equivocal ? "findings__item findings__item--equivocal" : "findings__item";

      const label = document.createElement("strong");
      label.className = "findings__label";
      const kind = equivocal ? "Conduction \u2014 equivocal" : "Conduction change";
      label.textContent = studies.length > 2 && subject
        ? `${kind} \u00b7 ${subject.fileName}`
        : kind;
      item.appendChild(label);

      item.appendChild(document.createTextNode(finding.text));
      el.appendChild(item);
    }
  });
}

const fmtHr = (v: number) => Number.isFinite(v) ? `${v.toFixed(0)} bpm` : "rate n/a";

let lastPrintout: PrintoutStudy[] = [];
let lastColumnSeconds = 2.5;

function render(): void {
  const printoutMode = $<HTMLSelectElement>("view").value === "printout";
  $("overlay").hidden = printoutMode;
  $("printout").hidden = !printoutMode;
  $("beat-key").hidden = printoutMode;

  if (printoutMode) {
    if (lastPrintout.length) {
      drawPrintout($<HTMLCanvasElement>("printout"), lastPrintout, {
        ...DEFAULT_PRINTOUT,
        mmPerMv: Number($<HTMLSelectElement>("scale").value),
        columnSeconds: lastColumnSeconds,
      });
    }
    return;
  }

  if (!lastLeads.length) return;
  ({ scale: lastScale } = drawOverlay($<HTMLCanvasElement>("overlay"), lastLeads, {
    ...DEFAULT_OVERLAY,
    anchorIndex: lastAnchor,
    mmPerMv: Number($<HTMLSelectElement>("scale").value),
    showDifference: $<HTMLInputElement>("show-diff").checked,
    showSigma: $<HTMLInputElement>("show-sigma").checked,
    arrangement: "standard",
    columns: 4,
  }));
  tools.redraw();
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function wireIngest(): void {
  const button = $("dropzone");
  const input = $<HTMLInputElement>("file-input");

  button.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    if (input.files?.length) void accept(input.files);
  });

  // The drop target is the whole page now that the studies live in a strip
  // rather than a panel-sized well. Aiming at a small target was never the
  // point, and a page-wide target is what people try first anyway.
  const body = document.body;
  for (const type of ["dragenter", "dragover"]) {
    body.addEventListener(type, (e) => {
      e.preventDefault();
      body.classList.add("dropzone--active");
    });
  }
  for (const type of ["dragleave", "drop"]) {
    body.addEventListener(type, (e) => {
      e.preventDefault();
      body.classList.remove("dropzone--active");
    });
  }
  body.addEventListener("drop", (e) => {
    const files = (e as DragEvent).dataTransfer?.files;
    if (files?.length) void accept(files);
  });

  $("clear-all").addEventListener("click", () => {
    void engine.release(studies.map((s) => s.id));
    studies = [];
    selected.clear();
    lastLeads = [];
    renderStudies();
    compare();
  });
}

/**
 * Redraw whenever a canvas actually changes size.
 *
 * Drawing once on show is not enough: a canvas unhidden in the same frame still
 * reports its pre-layout width, and `requestAnimationFrame` does not fire at all
 * while the document is hidden — so a deferred draw can simply never happen. An
 * observer fires when the size is real, whenever that turns out to be.
 */
function observeCanvases(): void {
  if (typeof ResizeObserver === "undefined") return;
  let last = "";
  const ro = new ResizeObserver((entries) => {
    const key = entries.map((e) => `${e.contentRect.width}`).join("|");
    if (key === last) return;
    last = key;
    render();
  });
  ro.observe($("overlay"));
  ro.observe($("printout"));
}

function wireControls(): void {
  for (const id of ["scale", "view", "show-diff", "show-sigma"]) {
    $(id).addEventListener("change", render);
  }
  // Changing the assumed calibration invalidates every analysis, so re-run.
  for (const id of ["speed", "gain"]) {
    $(id).addEventListener("change", () => void reanalyse());
  }
  globalThis.addEventListener("resize", render);
}

async function reanalyse(): Promise<void> {
  const a = assumptions();
  for (const s of studies) {
    s.assumptions = a;
    s.summary = null;
    s.error = null;
    s.warnings = [];
  }
  renderStudies();
  for (const s of studies) {
    await analyse(s, engine);
    renderStudies();
  }
  compare();
}

function wireTheme(): void {
  $("theme-toggle").addEventListener("click", () => {
    const root = document.documentElement;
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    render();
  });
}

async function boot(): Promise<void> {
  const status = $("engine-status");
  try {
    await engine.ready();
    status.textContent = engine.where === "worker"
      ? "Engine ready \u00b7 worker"
      : "Engine ready \u00b7 main thread";
    status.classList.add("statusbar__item--ok");
  } catch (err) {
    status.textContent = `Engine failed to start: ${
      err instanceof Error ? err.message : err
    }`;
    status.classList.add("statusbar__item--error");
    throw err;
  }
}

wireIngest();
wireControls();
observeCanvases();
wireTheme();
renderStudies();
void boot();

/** The measuring tools, on the same toolbar as the display controls. */
const tools = mountTools({
  canvas: $<HTMLCanvasElement>("overlay"),
  mount: document.querySelector<HTMLElement>(".panel__toolbar, .view-controls")!,
  getScale: () => lastScale,
});

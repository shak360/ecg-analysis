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
import init, { compare_studies, st_deltas_json } from "../wasm/ecg_core.js";
import {
  analyse,
  type Assumptions,
  formatInterval,
  loadFile,
  placeOnTimeline,
  type Study,
} from "./app/study.ts";
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

let studies: Study[] = [];
const selected = new Set<string>();
let lastLeads: OverlayLead[] = [];
let lastAnchor = DEFAULT_OVERLAY.anchorIndex;

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
    await analyse(s);
    if (!s.error && selected.size < 2) selected.add(s.id);
    renderStudies();
    compare();
  }
}

function removeStudy(id: string): void {
  studies = studies.filter((s) => s.id !== id);
  selected.delete(id);
  studies = placeOnTimeline(studies);
  renderStudies();
  compare();
}

// ---------------------------------------------------------------------------
// Study list
// ---------------------------------------------------------------------------

function renderStudies(): void {
  const list = $("study-list");
  list.innerHTML = "";

  if (studies.length === 0) {
    const li = document.createElement("li");
    li.className = "study-list__empty";
    li.textContent = "No studies loaded yet.";
    list.appendChild(li);
    $("clear-all").hidden = true;
    return;
  }
  $("clear-all").hidden = false;

  studies.forEach((s, i) => {
    const li = document.createElement("li");
    li.className = "study";
    if (selected.has(s.id)) li.classList.add("study--selected");
    if (s.error) li.classList.add("study--error");

    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "study__check";
    box.checked = selected.has(s.id);
    box.disabled = !!s.error || !s.analysis;
    box.setAttribute("aria-label", `Include ${s.fileName} in the comparison`);
    box.addEventListener("change", () => {
      if (box.checked) selected.add(s.id);
      else selected.delete(s.id);
      renderStudies();
      compare();
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
    } else if (!s.analysis) {
      status.textContent = "analysing…";
    } else {
      const hr = s.analysis.hr_bpm;
      const bits = [
        `${s.analysis.lead_names.length} leads`,
        Number.isFinite(hr) ? `${hr.toFixed(0)} bpm` : "rate n/a",
      ];
      if (s.identity && !s.identity.passed) bits.push("identity check failed");
      status.textContent = bits.join(" · ");
      if (s.identity && !s.identity.passed) {
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

    li.append(box, body, del);
    list.appendChild(li);
  });
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

function compare(): void {
  const chosen = studies.filter((s) => selected.has(s.id) && s.analysis && !s.error);
  const placeholder = $("view-placeholder");
  const panel = $("view-panel");
  const report = $("report");

  if (chosen.length < 2) {
    placeholder.hidden = false;
    panel.hidden = true;
    placeholder.querySelector("p")!.textContent = chosen.length === 1
      ? "Select one more study to compare."
      : "Load two or more ECGs to compare them.";
    return;
  }
  placeholder.hidden = true;
  panel.hidden = false;

  // The earliest selected study is the reference; every later one is registered
  // against it. Comparing each to the index rather than to its predecessor
  // shows cumulative change, which is what a series is usually read for — an
  // evolving infarct is a story about distance from baseline.
  const [refMaybe, ...rest] = chosen;
  const ref = refMaybe!;
  const registrations = rest.map((s) => ({
    study: s,
    leads: compare_studies(ref.analysis, s.analysis),
  }));

  lastAnchor = ref.analysis.qrs_onset >= 0
    ? ref.analysis.qrs_onset
    : ref.analysis.anchor_index;

  const leadNames: string[] = registrations[0]?.leads.map((c) => c.lead) ??
    Array.from(ref.analysis.lead_names);

  lastLeads = leadNames.map((lead) => {
    const refBeat = ref.analysis.beat(lead);
    if (!refBeat) {
      return { lead, traces: [], unavailable: true } satisfies OverlayLead;
    }

    const traces = [{
      label: ref.fileName,
      samples: refBeat,
      sigma: ref.analysis.sigma(lead),
      beatsUsed: ref.analysis.beats_used(lead),
    }];
    const differences: OverlayDifference[] = [];
    let worstRms = 0;
    let morphologyChanged = false;

    registrations.forEach((reg, k) => {
      const c = reg.leads.find((x) => x.lead === lead);
      if (!c) return;
      traces.push({
        label: reg.study.fileName,
        samples: c.aligned_mv,
        sigma: reg.study.analysis.sigma(lead),
        beatsUsed: reg.study.analysis.beats_used(lead),
      });
      differences.push({
        samples: c.difference_mv,
        traceIndex: k + 1,
        rmsMv: c.rms_difference_mv,
      });
      worstRms = Math.max(worstRms, c.rms_difference_mv);
      if (c.morphology_changed) morphologyChanged = true;
    });

    return {
      lead,
      traces,
      differences,
      rmsDifferenceMv: worstRms,
      morphologyChanged,
    } satisfies OverlayLead;
  });
  render();

  const measures = chosen.map((s) =>
    JSON.parse(s.analysis.measurements_json()) as Measures
  );
  const deltaSets = registrations.map((reg) =>
    (JSON.parse(st_deltas_json(ref.analysis, reg.study.analysis)) as { leads: StDelta[] }).leads
  );
  renderMeasurements(chosen, measures, deltaSets);

  const lines: string[] = [
    `reference  ${ref.fileName}   ${fmtHr(ref.analysis.hr_bpm)}`,
  ];
  registrations.forEach((reg) => {
    const gap = ref.offsetSec != null && reg.study.offsetSec != null
      ? `+${formatInterval(reg.study.offsetSec - ref.offsetSec)}`
      : "interval unknown";
    lines.push(
      `           ${reg.study.fileName}   ${fmtHr(reg.study.analysis.hr_bpm)}   ${gap}`,
    );
  });
  lines.push("", `leads      ${leadNames.length} compared across ${chosen.length} studies`, "");

  // Rank by the largest change any study in the series shows, so a lead that
  // moved late is not buried by averaging.
  const worst = leadNames
    .map((lead) => ({
      lead,
      rms: Math.max(
        0,
        ...registrations.map((r) =>
          r.leads.find((x) => x.lead === lead)?.rms_difference_mv ?? 0
        ),
      ),
    }))
    .sort((a, b) => b.rms - a.rms);

  lines.push("largest shape difference by lead, across the series:");
  for (const w of worst) {
    lines.push(`  ${w.lead.padEnd(4)} Δrms ${w.rms.toFixed(3)} mV`);
  }

  report.textContent = lines.join("\n");
}

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------

interface LeadMeasure {
  lead: string;
  stJ: number | null;
  stJ60: number | null;
  r: number | null;
  s: number | null;
  q: number | null;
  t: number | null;
  sigmaSt: number | null;
  note: string | null;
}

interface Measures {
  hr: number | null;
  qrs: number | null;
  qt: number | null;
  qtcF: number | null;
  qtcB: number | null;
  axis: number | null;
  leads: LeadMeasure[];
}

interface StDelta {
  lead: string;
  delta: number | null;
  mdc: number | null;
  notable: boolean;
  belowLimit: boolean;
}

const num = (v: number | null, digits: number, unit: string) =>
  v === null ? "\u2014" : `${v.toFixed(digits)}${unit ? " " + unit : ""}`;

/**
 * Render the measurements table for a series.
 *
 * Every amplitude carries its uncertainty and every delta its detection limit.
 * A number without an interval is this product's main way of causing harm, so
 * the two are emitted together or not at all.
 *
 * Deltas are against the first study, not the preceding one: a series is read
 * for distance from baseline, and chaining differences would let three small
 * unflagged steps hide one large real change.
 */
function renderMeasurements(
  studies: Study[],
  measures: Measures[],
  deltaSets: StDelta[][],
): void {
  const el = $("measurements");

  const calRows = studies.map((s) =>
    `<div><strong>${s.fileName}</strong> \u2014 ${
      s.calibration?.source === "pulse"
        ? `${s.calibration.mmPerMv} mm/mV measured from the calibration pulse`
        : `${s.calibration?.mmPerMv ?? "?"} mm/mV assumed \u2014 no pulse found`
    }</div>`
  ).join("");

  const head = studies.map((s, i) =>
    `<th scope="col">${i === 0 ? "ref \u00b7 " : ""}${s.fileName.replace(/\.pdf$/i, "")}</th>`
  ).join("");

  const globalRows: [string, (m: Measures) => string][] = [
    ["Heart rate", (m) => num(m.hr, 0, "bpm")],
    ["QRS duration", (m) => num(m.qrs, 0, "ms")],
    ["QT", (m) => num(m.qt, 0, "ms")],
    ["QTc (Fridericia)", (m) => num(m.qtcF, 0, "ms")],
    ["QTc (Bazett)", (m) => num(m.qtcB, 0, "ms")],
    ["Frontal axis", (m) => num(m.axis, 0, "\u00b0")],
  ];
  const globals = globalRows.map(([name, fn]) =>
    `<tr><th scope="row">${name}</th>${measures.map((m) => `<td>${fn(m)}</td>`).join("")}</tr>`
  ).join("");

  const leads = measures[0]?.leads ?? [];

  const stRows = leads.map((la) => {
    const cells = [`<td>${num(la.stJ, 3, "")}</td>`];
    let anyNotable = false;
    let anyUnresolvable = false;

    for (let k = 1; k < measures.length; k++) {
      const lb = measures[k]?.leads.find((x) => x.lead === la.lead);
      const d = deltaSets[k - 1]?.find((x) => x.lead === la.lead);
      let cell = num(lb?.stJ ?? null, 3, "");
      if (d && d.delta !== null) {
        const sign = d.delta >= 0 ? "+" : "";
        if (d.belowLimit) {
          anyUnresolvable = true;
          cell += ` <span class="lim">${sign}${d.delta.toFixed(3)} not resolvable</span>`;
        } else {
          if (d.notable) anyNotable = true;
          cell += ` <span class="${d.notable ? "chg" : "lim"}">${sign}${
            d.delta.toFixed(3)
          } \u00b1 ${d.mdc?.toFixed(3) ?? "?"}</span>`;
        }
      }
      cells.push(`<td>${cell}</td>`);
    }

    const cls = anyNotable ? "notable" : anyUnresolvable ? "unresolvable" : "";
    return `<tr class="${cls}"><th scope="row">${la.lead}</th>${cells.join("")}</tr>`;
  }).join("");

  const rRows = leads.map((la) =>
    `<tr><th scope="row">${la.lead}</th>${
      measures.map((m) =>
        `<td>${num(m.leads.find((x) => x.lead === la.lead)?.r ?? null, 2, "")}</td>`
      ).join("")
    }</tr>`
  ).join("");

  el.innerHTML = `
    <div class="cal-note">${calRows}</div>
    <table class="mtable">
      <caption>Global measurements</caption>
      <thead><tr><th scope="col">Measure</th>${head}</tr></thead>
      <tbody>${globals}</tbody>
    </table>
    <table class="mtable">
      <caption>ST at the J point (mV), each study with its change from the reference</caption>
      <thead><tr><th scope="col">Lead</th>${head}</tr></thead>
      <tbody>${stRows}</tbody>
    </table>
    <table class="mtable">
      <caption>R amplitude (mV)</caption>
      <thead><tr><th scope="col">Lead</th>${head}</tr></thead>
      <tbody>${rRows}</tbody>
    </table>
    <p class="mnote">
      Changes are measured against the <strong>reference</strong>, the earliest study
      selected, not against the preceding one \u2014 three small steps would otherwise
      each escape flagging while together amounting to a large real change.
      A \u0394 is flagged only when it exceeds both the pair's detection limit and the
      0.10 mV clinical threshold. <span class="lim">not resolvable</span> means the
      limit is itself above 0.10 mV, so a clinically significant change can be
      neither confirmed nor excluded \u2014 it does not mean no change.
    </p>`;
}

const fmtHr = (v: number) => Number.isFinite(v) ? `${v.toFixed(0)} bpm` : "rate n/a";

/** Translate the layout selector into overlay options. */
function layoutChoice(): { arrangement: "standard" | "grid"; columns: number } {
  const v = $<HTMLSelectElement>("cols").value;
  return v === "standard"
    ? { arrangement: "standard", columns: 4 }
    : { arrangement: "grid", columns: Number(v) };
}

function render(): void {
  if (!lastLeads.length) return;
  drawOverlay($<HTMLCanvasElement>("overlay"), lastLeads, {
    ...DEFAULT_OVERLAY,
    anchorIndex: lastAnchor,
    mmPerMv: Number($<HTMLSelectElement>("scale").value),
    showDifference: $<HTMLInputElement>("show-diff").checked,
    showSigma: $<HTMLInputElement>("show-sigma").checked,
    ...layoutChoice(),
  });
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function wireIngest(): void {
  const zone = $("dropzone");
  const input = $<HTMLInputElement>("file-input");

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.click();
    }
  });
  for (const type of ["dragenter", "dragover"]) {
    zone.addEventListener(type, (e) => {
      e.preventDefault();
      zone.classList.add("dropzone--active");
    });
  }
  for (const type of ["dragleave", "drop"]) {
    zone.addEventListener(type, (e) => {
      e.preventDefault();
      zone.classList.remove("dropzone--active");
    });
  }
  zone.addEventListener("drop", (e) => {
    const files = (e as DragEvent).dataTransfer?.files;
    if (files?.length) void accept(files);
  });
  input.addEventListener("change", () => {
    if (input.files?.length) void accept(input.files);
  });

  $("clear-all").addEventListener("click", () => {
    studies = [];
    selected.clear();
    lastLeads = [];
    renderStudies();
    compare();
  });
}

function wireControls(): void {
  for (const id of ["scale", "cols", "show-diff", "show-sigma"]) {
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
    s.analysis = null;
    s.error = null;
    s.warnings = [];
  }
  renderStudies();
  for (const s of studies) {
    await analyse(s);
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
    await init();
    status.textContent = "Engine ready";
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
wireTheme();
renderStudies();
void boot();

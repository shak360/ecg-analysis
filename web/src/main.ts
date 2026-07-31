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
import { DEFAULT_OVERLAY, drawOverlay, type OverlayLead } from "./ui/overlay.ts";

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

  const [ref, ...rest] = chosen;
  const cmp = rest[0]!;
  const comparisons = compare_studies(ref!.analysis, cmp.analysis);

  lastAnchor = ref!.analysis.qrs_onset >= 0
    ? ref!.analysis.qrs_onset
    : ref!.analysis.anchor_index;

  lastLeads = comparisons.map((c) => {
    const refBeat = ref!.analysis.beat(c.lead);
    return {
      lead: c.lead,
      traces: refBeat
        ? [
          {
            label: ref!.fileName,
            samples: refBeat,
            sigma: ref!.analysis.sigma(c.lead),
            beatsUsed: ref!.analysis.beats_used(c.lead),
          },
          {
            label: cmp.fileName,
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

  const measA = JSON.parse(ref!.analysis.measurements_json()) as Measures;
  const measB = JSON.parse(cmp.analysis.measurements_json()) as Measures;
  const deltas =
    (JSON.parse(st_deltas_json(ref!.analysis, cmp.analysis)) as { leads: StDelta[] }).leads;
  renderMeasurements(ref!, cmp, measA, measB, deltas);

  const gap = ref!.offsetSec != null && cmp.offsetSec != null
    ? formatInterval(cmp.offsetSec - ref!.offsetSec)
    : null;
  const ranked = [...comparisons].sort((a, b) =>
    b.rms_difference_mv - a.rms_difference_mv
  );

  report.textContent = [
    `earlier    ${ref!.fileName}   ${fmtHr(ref!.analysis.hr_bpm)}`,
    `later      ${cmp.fileName}   ${fmtHr(cmp.analysis.hr_bpm)}`,
    gap ? `interval   ${gap} between them` : `interval   unknown (no date in filenames)`,
    `leads      ${comparisons.length} compared`,
    ``,
    `shape difference by lead, largest first:`,
    ...ranked.map((c) =>
      `  ${c.lead.padEnd(4)} Δrms ${c.rms_difference_mv.toFixed(3)} mV   ` +
      `ρ ${c.rho_qrs.toFixed(3)}` +
      (c.morphology_changed ? "   [QRS morphology differs — not aligned]" : "")
    ),
    ``,
    chosen.length > 2
      ? `note       ${chosen.length} selected; showing the first two. ` +
        `Multi-study overlay is not built yet.`
      : "",
  ].filter(Boolean).join("\n");
}

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
  v === null ? "—" : `${v.toFixed(digits)} ${unit}`;

/**
 * Render the measurements table.
 *
 * Every amplitude carries its uncertainty and every delta its detection limit.
 * A number without an interval is this product's main way of causing harm, so
 * the two are emitted together or not at all.
 */
function renderMeasurements(
  ref: Study,
  cmp: Study,
  a: Measures,
  b: Measures,
  deltas: StDelta[],
): void {
  const el = $("measurements");
  const calNote = (s: Study) =>
    s.calibration?.source === "pulse"
      ? `${s.calibration.mmPerMv} mm/mV measured from the calibration pulse`
      : `${s.calibration?.mmPerMv ?? "?"} mm/mV assumed — no pulse found`;

  const globals = [
    ["Heart rate", num(a.hr, 0, "bpm"), num(b.hr, 0, "bpm")],
    ["QRS duration", num(a.qrs, 0, "ms"), num(b.qrs, 0, "ms")],
    ["QT", num(a.qt, 0, "ms"), num(b.qt, 0, "ms")],
    ["QTc (Fridericia)", num(a.qtcF, 0, "ms"), num(b.qtcF, 0, "ms")],
    ["QTc (Bazett)", num(a.qtcB, 0, "ms"), num(b.qtcB, 0, "ms")],
    ["Frontal axis", num(a.axis, 0, "°"), num(b.axis, 0, "°")],
  ];

  const dmap = new Map(deltas.map((d) => [d.lead, d]));
  const rows = a.leads.map((la) => {
    const lb = b.leads.find((x) => x.lead === la.lead);
    const d = dmap.get(la.lead);
    const cls = d?.notable ? "notable" : d?.belowLimit ? "unresolvable" : "";
    const deltaCell = !d || d.delta === null
      ? "—"
      : d.belowLimit
      ? `${d.delta >= 0 ? "+" : ""}${d.delta.toFixed(3)} <span class="lim">not resolvable (limit ±${
        d.mdc === null ? "∞" : d.mdc.toFixed(2)
      })</span>`
      : `${d.delta >= 0 ? "+" : ""}${d.delta.toFixed(3)} <span class="lim">± ${
        d.mdc?.toFixed(3) ?? "?"
      }</span>`;
    return `<tr class="${cls}">
      <th scope="row">${la.lead}</th>
      <td>${num(la.stJ, 3, "")}</td>
      <td>${num(lb?.stJ ?? null, 3, "")}</td>
      <td class="delta">${deltaCell}</td>
      <td>${num(la.r, 2, "")}</td>
      <td>${num(lb?.r ?? null, 2, "")}</td>
    </tr>`;
  }).join("");

  el.innerHTML = `
    <div class="cal-note">
      <div><strong>${ref.fileName}</strong> — ${calNote(ref)}</div>
      <div><strong>${cmp.fileName}</strong> — ${calNote(cmp)}</div>
    </div>
    <table class="mtable">
      <caption>Global measurements</caption>
      <thead><tr><th scope="col">Measure</th><th scope="col">Earlier</th><th scope="col">Later</th></tr></thead>
      <tbody>${
    globals.map(([k, x, y]) => `<tr><th scope="row">${k}</th><td>${x}</td><td>${y}</td></tr>`).join("")
  }</tbody>
    </table>
    <table class="mtable">
      <caption>Per lead — ST at the J point, and R amplitude (mV)</caption>
      <thead><tr>
        <th scope="col">Lead</th>
        <th scope="col">ST earlier</th><th scope="col">ST later</th><th scope="col">Δ ST</th>
        <th scope="col">R earlier</th><th scope="col">R later</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="mnote">
      Δ is flagged only when it exceeds both the pair's detection limit and the
      0.10 mV clinical threshold. <span class="lim">not resolvable</span> means the
      limit is itself above 0.10 mV, so a clinically significant change can be
      neither confirmed nor excluded — it does not mean no change.
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

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
import init, { compare_studies } from "../wasm/ecg_core.js";
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

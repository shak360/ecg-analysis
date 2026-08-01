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
import { createEngine } from "./engine/client.ts";
import { fetchRecord } from "./ingest/wfdb.ts";
import { DEFAULT_PRINTOUT, drawPrintout, type PrintoutStudy } from "./ui/printout.ts";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const engine = createEngine();
const TRACE = "#1b4a8f";

interface Statement {
  code: string;
  description: string;
  category: string;
  diagnosticClass: string;
  kind: "diagnostic" | "form" | "rhythm";
}

interface Entry {
  ecgId: number;
  age: number | null;
  sex: "M" | "F" | null;
  report: string;
  statements: Statement[];
}

let entries: Entry[] = [];
/** Statement code to the records carrying it. */
let byCode = new Map<string, Entry[]>();
let meta = new Map<string, Statement>();
let openCode: string | null = null;
let lastPrintout: PrintoutStudy[] = [];
let lastColumnSeconds = 10;
/** Guards against an older case landing after a newer one. */
let ticket = 0;

// ---------------------------------------------------------------------------
// The finding list
// ---------------------------------------------------------------------------

function visibleCodes(): Statement[] {
  const kind = $<HTMLSelectElement>("filter-kind").value;
  const cls = $<HTMLSelectElement>("filter-class").value;
  const q = $<HTMLInputElement>("search").value.trim().toLowerCase();

  return [...meta.values()]
    .filter((s) => byCode.get(s.code)?.length)
    .filter((s) => kind === "all" || s.kind === kind)
    .filter((s) => cls === "all" || s.diagnosticClass === cls)
    .filter((s) =>
      !q ||
      s.code.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    )
    .sort((a, b) => a.description.localeCompare(b.description));
}

function renderFindings(): void {
  const list = $("finding-list");
  const shown = visibleCodes();
  list.innerHTML = "";
  $("record-count").textContent = `${shown.length} findings · ${entries.length} cases`;

  if (!shown.length) {
    const li = document.createElement("li");
    li.className = "picker-strip__empty";
    li.textContent = "No findings match that filter.";
    list.appendChild(li);
    return;
  }

  for (const s of shown) {
    const cases = byCode.get(s.code) ?? [];
    const li = document.createElement("li");
    li.className = "study study--stacked";
    if (openCode === s.code) li.classList.add("study--selected");

    const body = document.createElement("div");
    body.className = "study__body";

    const name = document.createElement("div");
    name.className = "study__name";
    name.textContent = s.description || s.code;
    body.appendChild(name);

    const sub = document.createElement("div");
    sub.className = "study__when";
    sub.textContent = `${s.code} · ${s.kind}${
      s.diagnosticClass ? ` · ${s.diagnosticClass}` : ""
    } · ${cases.length} case${cases.length === 1 ? "" : "s"}`;
    body.appendChild(sub);

    li.appendChild(body);

    // The cases sit under the finding rather than in a separate pane: the
    // question a learner asks is "show me some of these", not "show me record
    // 1043".
    const row = document.createElement("div");
    row.className = "study__cases";
    cases.forEach((e, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn--ghost";
      b.textContent = String(i + 1);
      b.title = `Record ${e.ecgId}${e.sex ? `, ${e.sex}` : ""}${
        e.age ? `, ${e.age}` : ""
      }`;
      b.addEventListener("click", () => void openCase(s.code, e));
      row.appendChild(b);
    });
    li.appendChild(row);

    list.appendChild(li);
  }
}

// ---------------------------------------------------------------------------
// One case
// ---------------------------------------------------------------------------

function render(): void {
  if (!lastPrintout.length) return;
  drawPrintout($<HTMLCanvasElement>("printout"), lastPrintout, {
    ...DEFAULT_PRINTOUT,
    mmPerMv: Number($<HTMLSelectElement>("scale").value),
    columnSeconds: lastColumnSeconds,
  });
}

async function openCase(code: string, e: Entry): Promise<void> {
  openCode = code;
  renderFindings();
  const mine = ++ticket;

  $("case-placeholder").hidden = false;
  $("case-panel").hidden = true;
  $("atlas-status").textContent = `Loading record ${e.ecgId}…`;

  try {
    const rec = await fetchRecord(e.ecgId);
    if (mine !== ticket) return;

    const summary = await engine.analyseSignals(`atlas-${e.ecgId}`, rec.leads, rec.fsHz);
    if (mine !== ticket) return;

    // A digital record has no columns — the whole ten seconds is one window per
    // lead, so the printout draws each row continuously rather than as four
    // 2.5 s panels.
    lastColumnSeconds = rec.nSamples / rec.fsHz / 4;
    lastPrintout = [{
      label: `PTB-XL ${e.ecgId}`,
      colour: TRACE,
      leads: rec.leads,
      rhythm: rec.leads.get("II") ?? null,
    }];

    renderLabels(e);
    renderReport(summary);
    $("case-placeholder").hidden = true;
    $("case-panel").hidden = false;
    render();
    await engine.release([`atlas-${e.ecgId}`]);
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
  label.textContent = `PTB-XL record ${e.ecgId}${who ? ` · ${who}` : ""}`;
  item.appendChild(label);

  const ul = document.createElement("ul");
  for (const s of e.statements) {
    const li = document.createElement("li");
    // textContent throughout: the report field is free text from a clinical
    // system and must never be interpolated into markup.
    li.textContent = `${s.description || s.code} (${s.code}, ${s.kind}${
      s.diagnosticClass ? `, ${s.diagnosticClass}` : ""
    })`;
    ul.appendChild(li);
  }
  item.appendChild(ul);

  if (e.report) {
    const rep = document.createElement("div");
    rep.className = "cal-note";
    rep.textContent = `Cardiologist's report: ${e.report}`;
    item.appendChild(rep);
  }

  el.appendChild(item);
}

// deno-lint-ignore no-explicit-any
function renderReport(summary: any): void {
  const m = summary.measurements ?? {};
  const n = (v: number | null | undefined, unit: string, digits = 0) =>
    v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(digits)} ${unit}`;

  const lines = [
    "measured by this tool, not by the cardiologist:",
    `  rate            ${n(summary.hrBpm, "bpm")}`,
    `  QRS duration    ${n(m.qrs, "ms")}`,
    `  QT              ${n(m.qt, "ms")}`,
    `  QTc (Fridericia)${n(m.qtcF, "ms")}`,
    `  frontal axis    ${n(m.axis, "°")}`,
    `  leads recovered ${summary.leadNames?.length ?? 0} of 12`,
  ];

  if (summary.warnings?.length) {
    lines.push("", "warnings:");
    for (const w of summary.warnings.slice(0, 6)) lines.push(`  ${w}`);
  }

  $("case-report").textContent = lines.join("\n");
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

for (const id of ["filter-kind", "filter-class"]) {
  $(id).addEventListener("change", renderFindings);
}
$("search").addEventListener("input", renderFindings);
$("scale").addEventListener("change", render);
globalThis.addEventListener("resize", render);
$("theme-toggle").addEventListener("click", () => {
  const root = document.documentElement;
  root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  render();
});

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

  try {
    const res = await fetch("/corpus/atlas.json");
    if (!res.ok) throw new Error(`atlas.json: HTTP ${res.status}`);
    entries = (await res.json()) as Entry[];
  } catch {
    // The corpus is fetched, not committed, so absence is the expected state on
    // a fresh clone rather than a fault.
    $("atlas-status").textContent =
      "No atlas index found. Run `npm run fetch:ptbxl -- --atlas 6` to build one.";
    $("record-count").textContent = "not fetched";
    return;
  }

  byCode = new Map();
  meta = new Map();
  for (const e of entries) {
    for (const s of e.statements) {
      meta.set(s.code, s);
      const list = byCode.get(s.code) ?? [];
      list.push(e);
      byCode.set(s.code, list);
    }
  }

  $("atlas-status").textContent =
    `${entries.length} human-validated cases across ${meta.size} findings.`;
  renderFindings();
}

void boot();

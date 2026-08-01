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
import { fetchAtlasRecord } from "./ingest/wfdb.ts";
import { DEFAULT_PRINTOUT, drawPrintout, type PrintoutStudy } from "./ui/printout.ts";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const engine = createEngine();
const TRACE = "#1b4a8f";

interface Statement {
  id: string;
  description: string;
  diagnosticClass: string;
  kind: "diagnostic" | "form" | "rhythm";
  sourceCode: string;
}

interface Entry {
  id: string;
  source: string;
  sourceLabel: string;
  /**
   * Whether a human reviewed this label.
   *
   * Only PTB-XL records it. Shown on every case rather than quietly dropped,
   * because the atlas held itself to human-validated labels while it had one
   * corpus, and a learner is entitled to know when that standard no longer
   * applies.
   */
  provenance: "human-validated" | "as-published";
  age: number | null;
  sex: "M" | "F" | null;
  report: string;
  findings: Statement[];
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
  const source = $<HTMLSelectElement>("filter-source").value;

  return [...meta.values()]
    .filter((s) =>
      (byCode.get(s.id) ?? []).some((e) => source === "all" || e.source === source)
    )
    .filter((s) => kind === "all" || s.kind === kind)
    .filter((s) => cls === "all" || s.diagnosticClass === cls)
    .filter((s) =>
      !q ||
      s.id.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.sourceCode.toLowerCase().includes(q)
    )
    .sort((a, b) => a.description.localeCompare(b.description));
}

function renderFindings(): void {
  const list = $("finding-list");
  const shown = visibleCodes();
  list.innerHTML = "";
  // Count what is actually on screen. Reporting the whole corpus while a filter
  // is applied reads as "these 29 findings cover 485 cases", which is false and
  // in the flattering direction.
  const source = $<HTMLSelectElement>("filter-source").value;
  const visibleCases = source === "all"
    ? entries.length
    : entries.filter((e) => e.source === source).length;
  $("record-count").textContent = `${shown.length} findings · ${visibleCases} cases`;

  if (!shown.length) {
    const li = document.createElement("li");
    li.className = "picker-strip__empty";
    li.textContent = "No findings match that filter.";
    list.appendChild(li);
    return;
  }

  for (const s of shown) {
    const source = $<HTMLSelectElement>("filter-source").value;
    const cases = (byCode.get(s.id) ?? []).filter(
      (e) => source === "all" || e.source === source,
    );
    const li = document.createElement("li");
    li.className = "study study--stacked";
    if (openCode === s.id) li.classList.add("study--selected");

    const body = document.createElement("div");
    body.className = "study__body";

    const name = document.createElement("div");
    name.className = "study__name";
    name.textContent = s.description || s.id;
    body.appendChild(name);

    const sub = document.createElement("div");
    sub.className = "study__when";
    sub.textContent = `${s.sourceCode} · ${s.kind}${
      s.diagnosticClass ? ` · ${s.diagnosticClass}` : ""
    } · ${cases.length} case${cases.length === 1 ? "" : "s"}`;
    body.appendChild(sub);

    li.appendChild(body);

    // The cases sit under the finding rather than in a separate pane: the
    // question a learner asks is "show me some of these", not "show me record
    // 1043".
    // A case can carry several findings, so a common one like sinus rhythm
    // accumulates every record that mentions it — hundreds of buttons wrapping
    // into thirty rows. Twelve is as many examples as anyone browses; the rest
    // are reachable by filtering, and the count says they exist.
    const SHOWN = 12;
    const row = document.createElement("div");
    row.className = "study__cases";
    cases.slice(0, SHOWN).forEach((e, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn--ghost";
      b.textContent = String(i + 1);
      b.title = `${e.id}${e.sex ? `, ${e.sex}` : ""}${
        e.age ? `, ${e.age}` : ""
      }`;
      b.addEventListener("click", () => void openCase(s.id, e));
      row.appendChild(b);
    });
    if (cases.length > SHOWN) {
      const more = document.createElement("span");
      more.className = "study__when";
      more.textContent = `+${cases.length - SHOWN} more`;
      row.appendChild(more);
    }
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
  $("atlas-status").textContent = `Loading ${e.id}…`;

  try {
    const rec = await fetchAtlasRecord(e.id);
    if (mine !== ticket) return;

    const summary = await engine.analyseSignals(`atlas-${e.id}`, rec.leads, rec.fsHz);
    if (mine !== ticket) return;

    // A digital record has no columns — the whole ten seconds is one window per
    // lead, so the printout draws each row continuously rather than as four
    // 2.5 s panels.
    lastColumnSeconds = rec.nSamples / rec.fsHz / 4;
    lastPrintout = [{
      label: e.id,
      colour: TRACE,
      leads: rec.leads,
      rhythm: rec.leads.get("II") ?? null,
    }];

    renderLabels(e);
    renderReport(summary);
    $("case-placeholder").hidden = true;
    $("case-panel").hidden = false;
    render();
    await engine.release([`atlas-${e.id}`]);
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

for (const id of ["filter-kind", "filter-class", "filter-source"]) {
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

  // Both corpora, concatenated. Each writes its own index in the same shape, so
  // merging is an append — and either being absent is the ordinary state on a
  // machine that has fetched only one of them, not a fault.
  const sources = ["/corpus/atlas.json", "/corpus-challenge/atlas.json"];
  const loaded = await Promise.all(sources.map(async (u) => {
    try {
      const res = await fetch(u);
      return res.ok ? (await res.json()) as Entry[] : [];
    } catch {
      return [];
    }
  }));
  entries = loaded.flat();

  if (!entries.length) {
    $("atlas-status").textContent =
      "No atlas index found. Run `npm run fetch:ptbxl -- --atlas 6`, " +
      "and optionally `npm run fetch:challenge -- --atlas 4` for the other corpora.";
    $("record-count").textContent = "not fetched";
    return;
  }

  byCode = new Map();
  meta = new Map();
  for (const e of entries) {
    for (const s of e.findings) {
      meta.set(s.id, s);
      const list = byCode.get(s.id) ?? [];
      list.push(e);
      byCode.set(s.id, list);
    }
  }

  // Populate the corpus filter from what actually loaded.
  const bySource = new Map<string, string>();
  for (const e of entries) bySource.set(e.source, e.sourceLabel);
  const sel = $<HTMLSelectElement>("filter-source");
  for (const [id, label] of [...bySource].sort((a, b) => a[1].localeCompare(b[1]))) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = `${label} (${entries.filter((e) => e.source === id).length})`;
    sel.appendChild(opt);
  }

  const reviewed = entries.filter((e) => e.provenance === "human-validated").length;
  $("atlas-status").textContent =
    `${entries.length} cases across ${meta.size} findings, from ${bySource.size} ` +
    `corpora — ${reviewed} with human-reviewed labels.`;
  renderFindings();
}

void boot();

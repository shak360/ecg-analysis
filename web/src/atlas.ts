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
import { CRITERIA, entriesFor, evaluateEntry } from "./criteria/index.ts";
import { evidenceHtml } from "./ui/evidence.ts";

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
/** Full duration in seconds when the record was longer than the shown window. */
let lastTrimmedFrom: number | null = null;
/** Leads the chosen criterion row names, washed on the tracing. */
let markedLeads: string[] = [];
/** Guards against an older case landing after a newer one. */
let ticket = 0;

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
const CATEGORIES: { id: string; label: string; blurb: string }[] = [
  { id: "NORM", label: "Normal", blurb: "the reference every other card is read against" },
  { id: "RHYTHM", label: "Rhythm", blurb: "what is driving the heart, and how regularly" },
  { id: "CD", label: "Conduction", blurb: "blocks, delays and accessory pathways" },
  { id: "MI", label: "Infarction", blurb: "Q waves and the territories they name" },
  { id: "STTC", label: "ST & T", blurb: "repolarisation: elevation, depression, inversion" },
  { id: "HYP", label: "Hypertrophy", blurb: "voltage and chamber enlargement" },
  { id: "OTHER", label: "Other morphology", blurb: "descriptive findings without a diagnosis" },
];

/** Which card a statement belongs under. Every statement lands in exactly one. */
function categoryOf(s: Statement): string {
  if (s.kind === "rhythm") return "RHYTHM";
  if (CATEGORIES.some((c) => c.id === s.diagnosticClass)) return s.diagnosticClass;
  return "OTHER";
}

let openClass: string = CATEGORIES[0]!.id;

/** Statements passing every filter *except* the category, for the fan's counts. */
function filteredCodes(): Statement[] {
  const kind = $<HTMLSelectElement>("filter-kind").value;
  const q = $<HTMLInputElement>("search").value.trim().toLowerCase();
  const source = $<HTMLSelectElement>("filter-source").value;

  return [...meta.values()]
    .filter((s) =>
      (byCode.get(s.id) ?? []).some((e) => source === "all" || e.source === source)
    )
    .filter((s) => kind === "all" || s.kind === kind)
    .filter((s) =>
      !q ||
      s.id.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.sourceCode.toLowerCase().includes(q)
    )
    .sort((a, b) => a.description.localeCompare(b.description));
}

function visibleCodes(): Statement[] {
  return filteredCodes().filter((s) => categoryOf(s) === openClass);
}

/** Cases carrying `code`, honouring the corpus filter. */
function casesFor(code: string): Entry[] {
  const source = $<HTMLSelectElement>("filter-source").value;
  return (byCode.get(code) ?? []).filter((e) => source === "all" || e.source === source);
}

function renderFan(): void {
  const fan = $("class-fan");
  const all = filteredCodes();
  fan.innerHTML = "";

  CATEGORIES.forEach((c, i) => {
    const codes = all.filter((s) => categoryOf(s) === c.id);
    // A category's case count is over distinct records: a record with both
    // CLBBB and IVCD is one ECG under Conduction, not two.
    const cases = new Set<string>();
    for (const s of codes) for (const e of casesFor(s.id)) cases.add(e.id);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fan__card";
    btn.style.setProperty("--i", String(i));
    btn.setAttribute("role", "tab");
    btn.disabled = codes.length === 0;
    btn.setAttribute("aria-selected", String(openClass === c.id));
    if (openClass === c.id) btn.classList.add("fan__card--open");
    if (!codes.length) btn.classList.add("fan__card--empty");

    btn.innerHTML =
      `<span class="fan__label"></span>` +
      `<span class="fan__count"></span>` +
      `<span class="fan__blurb"></span>`;
    btn.querySelector(".fan__label")!.textContent = c.label;
    btn.querySelector(".fan__count")!.textContent = codes.length
      ? `${cases.size} ECG${cases.size === 1 ? "" : "s"} · ${codes.length} finding${
        codes.length === 1 ? "" : "s"
      }`
      : "nothing here under this filter";
    btn.querySelector(".fan__blurb")!.textContent = c.blurb;

    btn.addEventListener("click", () => {
      openClass = c.id;
      openCode = null;
      renderFan();
      renderFindings();
    });
    fan.appendChild(btn);
  });
}

function renderFindings(): void {
  const list = $("finding-list");
  const shown = visibleCodes();
  list.innerHTML = "";

  // Both halves must be the same scope. Pairing the open category's finding
  // count with the whole corpus's case count read as "these 2 findings cover
  // 1,207 cases", which is false and in the flattering direction. The fan gives
  // the per-category breakdown, so this line states the filtered whole.
  const source = $<HTMLSelectElement>("filter-source").value;
  const all = filteredCodes();
  const cases = new Set<string>();
  for (const s of all) for (const e of casesFor(s.id)) cases.add(e.id);
  $("record-count").textContent = `${all.length} findings · ${cases.size} cases` +
    (source === "all" ? "" : " in this corpus");

  if (!shown.length) {
    const li = document.createElement("li");
    li.className = "chip-strip__empty";
    li.textContent = "No findings in this category match that filter.";
    list.appendChild(li);
    return;
  }

  for (const s of shown) {
    const cases = casesFor(s.id);
    const li = document.createElement("li");
    li.className = "chip-strip__item";

    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    if (openCode === s.id) chip.classList.add("chip--open");
    chip.setAttribute("aria-expanded", String(openCode === s.id));
    chip.title = `${s.sourceCode} · ${s.kind}`;
    chip.innerHTML = `<span class="chip__name"></span><span class="chip__n"></span>`;
    chip.querySelector(".chip__name")!.textContent = s.description || s.id;
    chip.querySelector(".chip__n")!.textContent = String(cases.length);

    // One click reaches an ECG. Selecting a finding opens its first case rather
    // than only revealing more buttons — "show me one of these" is the question,
    // and making it two clicks taught nobody anything extra.
    chip.addEventListener("click", () => {
      if (openCode === s.id) return;
      openCode = s.id;
      renderFindings();
      const first = cases[0];
      if (first) void openCase(s.id, first);
    });
    li.appendChild(chip);

    // The chosen finding's cases sit directly beneath its chip. A case can carry
    // several findings, so a common one like sinus rhythm accumulates every
    // record that mentions it — hundreds of buttons wrapping into thirty rows.
    // Twelve is as many examples as anyone browses; the rest are reachable by
    // filtering, and the count on the chip says they exist.
    if (openCode === s.id) {
      const SHOWN = 12;
      const row = document.createElement("div");
      row.className = "chip__cases";
      cases.slice(0, SHOWN).forEach((e, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn--ghost";
        b.textContent = String(i + 1);
        b.title = `${e.id}${e.sex ? `, ${e.sex}` : ""}${e.age ? `, ${e.age}` : ""}`;
        b.addEventListener("click", () => void openCase(s.id, e));
        row.appendChild(b);
      });
      if (cases.length > SHOWN) {
        const more = document.createElement("span");
        more.className = "chip__more";
        more.textContent = `+${cases.length - SHOWN}`;
        row.appendChild(more);
      }
      li.appendChild(row);
    }

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
    emphasiseLeads: markedLeads,
  });
}

/**
 * How much of a record the atlas shows and measures.
 *
 * Every corpus here is a standard resting ECG at 10 seconds — except INCART,
 * which is 30-minute ambulatory Holter at 257 Hz: 462,600 samples per lead,
 * 1,800 times the recording a resting layout is drawn for. Handing that to the
 * engine does not fail, it simply does not come back; the page sat on
 * "Loading st_petersburg_incart:I0004…" indefinitely, which is the least
 * diagnosable way for something to be wrong.
 *
 * Ten seconds is not an arbitrary cap, it is what the printout beneath already
 * claims to be: 25 mm/s across a standard page.
 */
const ATLAS_WINDOW_S = 10;

/**
 * The leading window of a record, and how much was left off.
 *
 * The *first* window rather than a chosen one, because any other rule is a
 * judgement about which part of somebody's Holter is representative, and this
 * page does not make judgements about tracings. The caller says what it did.
 */
function firstWindow(rec: { leads: Map<string, Float32Array>; fsHz: number; nSamples: number }) {
  const want = Math.round(ATLAS_WINDOW_S * rec.fsHz);
  if (rec.nSamples <= want) {
    return { leads: rec.leads, nSamples: rec.nSamples, trimmedFrom: null };
  }
  const leads = new Map<string, Float32Array>();
  for (const [name, samples] of rec.leads) leads.set(name, samples.subarray(0, want));
  return { leads, nSamples: want, trimmedFrom: rec.nSamples / rec.fsHz };
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
      renderEvidence(code, e, summary);
      renderReport(summary);
      render();
      await engine.release([`atlas-${e.id}`]);
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
    rep.className = "cal-note";
    rep.textContent = `Cardiologist's report: ${e.report}`;
    item.appendChild(rep);
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
    findingLabel: meta.get(code)?.description || code,
    results: m ? entries.map((x) => evaluateEntry(x, m, who)) : [],
    // Computed, never written into a string: `atlas.ts` already learned that a
    // hardcoded count drifts and always in the flattering direction.
    coverage: { covered: [...covered].filter((c) => meta.has(c)).length, total: meta.size },
  });
}

/**
 * Marking is one row at a time.
 *
 * A union across several criteria washes most of the page and starts to look
 * like a composite assessment, which is the one reading this panel must not
 * invite.
 */
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
    `  QT              ${n(m.qt, "ms")}`,
    `  QTc (Fridericia)${n(m.qtcF, "ms")}`,
    `  frontal axis    ${n(m.axis, "°")}`,
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
function refresh(): void {
  if (!visibleCodes().length) {
    const fallback = filteredCodes()[0];
    if (fallback) {
      openClass = categoryOf(fallback);
      openCode = null;
    }
  }
  renderFan();
  renderFindings();
}

for (const id of ["filter-kind", "filter-source"]) {
  $(id).addEventListener("change", refresh);
}
$("search").addEventListener("input", refresh);
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
  refresh();
}

void boot();

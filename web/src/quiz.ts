/**
 * Test yourself: read a real ECG, answer, then see what the cardiologist wrote.
 *
 * The questions are generated rather than authored, which is only possible
 * because PTB-XL records carry structured statements. The correct answer is a
 * statement actually on the record; the distractors are statements of the same
 * *kind* that are not.
 *
 * Three things that would quietly ruin this, handled deliberately:
 *
 * **Ambiguity.** A record usually carries several statements, so "what is the
 * diagnosis?" has more than one right answer. Every question is therefore
 * phrased "which of these is present", with exactly one option on the record —
 * true regardless of how many statements it has.
 *
 * **Leakage.** The measurements are hidden until the answer is given. A QRS
 * duration of 154 ms on screen answers a bundle-branch-block question before it
 * is asked, and a learner who reads the number instead of the tracing has
 * learned nothing.
 *
 * **Distractor plausibility.** Drawing distractors from all 71 statements makes
 * most questions guessable by category — "sinus rhythm" against three infarct
 * territories is not a test. Same kind, and where possible the same diagnostic
 * class, so the choice is between things that actually look alike.
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
const STORE_KEY = "ecg-quiz-progress-v1";

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

interface Question {
  kind: string;
  prompt: string;
  options: Statement[];
  answer: Statement;
  chosen?: Statement;
}

/** Per-statement history, the whole of the spaced-repetition state. */
interface Progress {
  [code: string]: { seen: number; right: number };
}

let entries: Entry[] = [];
let allStatements = new Map<string, Statement>();
let current: Entry | null = null;
let questions: Question[] = [];
let lastPrintout: PrintoutStudy[] = [];
let lastColumnSeconds = 2.5;
let ticket = 0;

// ---------------------------------------------------------------------------
// Progress, kept in this browser
// ---------------------------------------------------------------------------

function loadProgress(): Progress {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Progress;
  } catch {
    return {};
  }
}

function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(p));
  } catch {
    // A full or disabled store costs the learner their history and nothing
    // else; the quiz still works.
  }
}

/** Accuracy on a statement, with unseen treated as maximally worth asking. */
function weakness(code: string, p: Progress): number {
  const r = p[code];
  if (!r || r.seen === 0) return 1;
  return 1 - r.right / r.seen;
}

function renderProgress(): void {
  const p = loadProgress();
  const seen = Object.values(p).reduce((a, b) => a + b.seen, 0);
  const right = Object.values(p).reduce((a, b) => a + b.right, 0);
  $("score-line").textContent = seen
    ? `${right} of ${seen} (${Math.round(100 * right / seen)}%)`
    : "not started";

  const weak = Object.entries(p)
    .filter(([, r]) => r.seen >= 2 && r.right < r.seen)
    .sort((a, b) => weakness(b[0], p) - weakness(a[0], p))
    .slice(0, 8);

  const list = $("weak-list");
  list.innerHTML = "";
  if (!weak.length) {
    const li = document.createElement("li");
    li.className = "study-list__empty";
    li.textContent = seen ? "Nothing missed yet." : "Answer a few to see this.";
    list.appendChild(li);
    return;
  }
  for (const [code, r] of weak) {
    const s = allStatements.get(code);
    const li = document.createElement("li");
    li.className = "study";
    const body = document.createElement("div");
    body.className = "study__body";
    const name = document.createElement("div");
    name.className = "study__name";
    name.textContent = s?.description || code;
    const sub = document.createElement("div");
    sub.className = "study__when";
    sub.textContent = `${r.right} of ${r.seen} correct`;
    body.append(name, sub);
    li.appendChild(body);
    list.appendChild(li);
  }
}

// ---------------------------------------------------------------------------
// Building the questions
// ---------------------------------------------------------------------------

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const PROMPT: Record<string, string> = {
  diagnostic: "Which of these diagnoses is present on this ECG?",
  rhythm: "Which of these rhythms is present?",
  form: "Which of these morphological findings is present?",
};

function buildQuestions(e: Entry): Question[] {
  const want = $<HTMLSelectElement>("filter-kind").value;
  const onRecord = new Set(e.statements.map((s) => s.code));

  const pool = e.statements.filter((s) => want === "all" || s.kind === want);
  const out: Question[] = [];

  for (const answer of shuffle(pool).slice(0, 4)) {
    // Same kind, and prefer the same diagnostic class so the options are
    // genuinely confusable rather than separable by category alone.
    const sameKind = [...allStatements.values()].filter(
      (s) => s.kind === answer.kind && !onRecord.has(s.code),
    );
    const sameClass = sameKind.filter(
      (s) => answer.diagnosticClass && s.diagnosticClass === answer.diagnosticClass,
    );
    const distractors = shuffle(sameClass.length >= 3 ? sameClass : sameKind).slice(0, 3);
    if (distractors.length < 3) continue;

    out.push({
      kind: answer.kind,
      prompt: PROMPT[answer.kind] ?? "Which of these is present?",
      options: shuffle([answer, ...distractors]),
      answer,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render(): void {
  if (!lastPrintout.length) return;
  drawPrintout($<HTMLCanvasElement>("printout"), lastPrintout, {
    ...DEFAULT_PRINTOUT,
    mmPerMv: Number($<HTMLSelectElement>("scale").value),
    columnSeconds: lastColumnSeconds,
  });
}

function renderQuestions(): void {
  const el = $("questions");
  el.innerHTML = "";

  questions.forEach((q, qi) => {
    const block = document.createElement("div");
    block.className = "findings__item findings__item--equivocal";

    const label = document.createElement("strong");
    label.className = "findings__label";
    label.textContent = `Question ${qi + 1} of ${questions.length}`;
    block.appendChild(label);

    const prompt = document.createElement("div");
    prompt.textContent = q.prompt;
    block.appendChild(prompt);

    const opts = document.createElement("div");
    opts.className = "study__cases";
    for (const o of q.options) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn--ghost";
      b.textContent = o.description || o.code;
      b.addEventListener("click", () => {
        if (q.chosen) return;
        q.chosen = o;
        record(q);
        renderQuestions();
        if (questions.every((x) => x.chosen)) reveal();
      });
      if (q.chosen) {
        // Mark the truth as well as the choice: a learner who guessed wrong
        // needs to see which one was right, not only that theirs was not.
        if (o.code === q.answer.code) b.classList.add("btn--right");
        else if (o.code === q.chosen.code) b.classList.add("btn--wrong");
        b.disabled = true;
      }
      opts.appendChild(b);
    }
    block.appendChild(opts);
    el.appendChild(block);
  });
}

function record(q: Question): void {
  const p = loadProgress();
  const r = p[q.answer.code] ?? { seen: 0, right: 0 };
  r.seen += 1;
  if (q.chosen?.code === q.answer.code) r.right += 1;
  p[q.answer.code] = r;
  saveProgress(p);
  renderProgress();
}

/** Everything that was hidden while the questions were open. */
async function reveal(): Promise<void> {
  if (!current) return;
  const el = $("reveal");
  el.hidden = false;
  el.innerHTML = "";

  const right = questions.filter((q) => q.chosen?.code === q.answer.code).length;

  const item = document.createElement("div");
  item.className = right === questions.length
    ? "findings__item findings__item--equivocal"
    : "findings__item";

  const label = document.createElement("strong");
  label.className = "findings__label";
  label.textContent = `${right} of ${questions.length} correct · PTB-XL record ${current.ecgId}`;
  item.appendChild(label);

  const ul = document.createElement("ul");
  for (const s of current.statements) {
    const li = document.createElement("li");
    li.textContent = `${s.description || s.code} (${s.code}, ${s.kind})`;
    ul.appendChild(li);
  }
  item.appendChild(ul);

  if (current.report) {
    const rep = document.createElement("div");
    rep.className = "cal-note";
    // textContent: this is free text out of a clinical system.
    rep.textContent = `Cardiologist's report: ${current.report}`;
    item.appendChild(rep);
  }
  el.appendChild(item);

  // Only now the numbers, and only labelled as ours.
  try {
    const rec = await fetchRecord(current.ecgId);
    const s = await engine.analyseSignals(`quiz-${current.ecgId}`, rec.leads, rec.fsHz);
    // deno-lint-ignore no-explicit-any
    const m = (s as any).measurements ?? {};
    const n = (v: number | null | undefined, u: string) =>
      v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(0)} ${u}`;
    const pre = document.createElement("pre");
    pre.className = "report";
    pre.textContent = [
      "measured by this tool, not by the cardiologist:",
      `  rate          ${n(s.hrBpm, "bpm")}`,
      `  QRS duration  ${n(m.qrs, "ms")}`,
      `  QT            ${n(m.qt, "ms")}`,
      `  frontal axis  ${n(m.axis, "°")}`,
    ].join("\n");
    el.appendChild(pre);
    await engine.release([`quiz-${current.ecgId}`]);
  } catch {
    // The numbers are a bonus; the case still taught what it was for.
  }
}

// ---------------------------------------------------------------------------
// Picking the next case
// ---------------------------------------------------------------------------

function pickEntry(): Entry | null {
  const want = $<HTMLSelectElement>("filter-kind").value;
  const p = loadProgress();

  const eligible = entries.filter((e) =>
    e.statements.some((s) => want === "all" || s.kind === want)
  );
  if (!eligible.length) return null;

  // Anki-ish: weight by how badly the learner does on the statements a record
  // carries, so misses come back sooner. Weighted rather than strictly ordered
  // — always serving the single worst finding would be a drill, not a review.
  const scored = eligible.map((e) => ({
    e,
    w: Math.max(...e.statements.map((s) => weakness(s.code, p))) + Math.random() * 0.35,
  }));
  scored.sort((a, b) => b.w - a.w);
  return scored[Math.floor(Math.random() * Math.min(12, scored.length))]!.e;
}

async function nextCase(): Promise<void> {
  const e = pickEntry();
  if (!e) {
    $("quiz-status").textContent = "No cases match that filter.";
    return;
  }
  current = e;
  const mine = ++ticket;

  $("quiz-placeholder").hidden = false;
  $("quiz-panel").hidden = true;
  $("reveal").hidden = true;
  $("quiz-status").textContent = "Loading a case…";

  try {
    const rec = await fetchRecord(e.ecgId);
    if (mine !== ticket) return;

    questions = buildQuestions(e);
    if (!questions.length) {
      $("quiz-status").textContent = "That case had nothing askable; try again.";
      return;
    }

    lastColumnSeconds = rec.nSamples / rec.fsHz / 4;
    lastPrintout = [{
      label: `case ${e.ecgId}`,
      colour: TRACE,
      leads: rec.leads,
      rhythm: rec.leads.get("II") ?? null,
    }];

    // Age and sex are legitimate clinical context and several criteria depend
    // on them, so they are shown; the statements are not.
    $("case-demographics").textContent = [
      e.sex === "F" ? "female" : e.sex === "M" ? "male" : null,
      e.age ? `${e.age} years` : null,
    ].filter(Boolean).join(", ") || "demographics not recorded";

    $("quiz-placeholder").hidden = true;
    $("quiz-panel").hidden = false;
    renderQuestions();
    render();
  } catch (err) {
    if (mine !== ticket) return;
    $("quiz-status").textContent = err instanceof Error ? err.message : String(err);
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

$("next-case").addEventListener("click", () => void nextCase());
$("filter-kind").addEventListener("change", () => void nextCase());
$("scale").addEventListener("change", render);
globalThis.addEventListener("resize", render);
$("reset-score").addEventListener("click", () => {
  saveProgress({});
  renderProgress();
});
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
  }

  try {
    const res = await fetch("/corpus/atlas.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    entries = (await res.json()) as Entry[];
  } catch {
    $("quiz-status").textContent =
      "No atlas index found. Run `npm run fetch:ptbxl -- --atlas 6` to build one.";
    return;
  }

  for (const e of entries) {
    for (const s of e.statements) allStatements.set(s.code, s);
  }
  renderProgress();
  await nextCase();
}

void boot();

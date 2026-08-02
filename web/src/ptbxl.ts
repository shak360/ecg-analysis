/**
 * The PTB-XL corpus browser.
 *
 * PTB-XL's value here is not its size but its shape: 2,111 of its patients have
 * more than one ECG, giving 2,930 consecutive serial pairs. Every other test in
 * this project compares two recordings I synthesised; these are two recordings
 * of one person, months or years apart, with a cardiologist's statement on each.
 *
 * The point of the page is to put the tool's output next to that statement. When
 * PTB-XL says a left bundle branch block appeared between two recordings, this
 * shows what the registration and the measurements make of the same pair — and,
 * just as usefully, what they make of the 2,446 pairs where nothing changed.
 *
 * This is a *digital* path: WFDB samples straight into the engine, no printout,
 * no grid detection, no calibration pulse. That separates "is the measurement
 * path right" from "is the digitisation right", which the PDF path can only ever
 * test together.
 */
import { createEngine } from "./engine/client.ts";
import type { ComparisonSnapshot, SerialFinding } from "./engine/protocol.ts";
import { fetchPairs, fetchRecord, type SerialPair } from "./ingest/wfdb.ts";
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

/** Earlier recording in blue, later in orange — the pairing that survives both greyscale and the common colour-vision deficiencies. */
const BEFORE = "#1b4a8f";
const AFTER = "#c2410c";

/**
 * What each SCP statement means, in one line.
 *
 * Spelled out because the codes are opaque unless you already know them, and
 * the whole purpose of this page is to let the tool's output be read against
 * the statement.
 */
const STATEMENTS: Record<string, string> = {
  CLBBB: "complete left bundle branch block",
  CRBBB: "complete right bundle branch block",
  ILBBB: "incomplete left bundle branch block",
  IRBBB: "incomplete right bundle branch block",
  LAFB: "left anterior fascicular block",
  LPFB: "left posterior fascicular block",
  IVCD: "non-specific intraventricular conduction delay",
  WPW: "Wolff–Parkinson–White pre-excitation",
};

/**
 * Which statements imply the QRS should get longer.
 *
 * The fascicular blocks do not: LAFB and LPFB rotate the frontal axis and leave
 * duration alone, so a duration detector cannot see them and should not be
 * scored as though it failed to. Measured on this corpus, fascicular-only pairs
 * sit with the unchanged controls exactly as that predicts.
 */
const WIDENS = new Set(["CLBBB", "CRBBB", "ILBBB", "IRBBB", "IVCD", "WPW"]);

let pairs: SerialPair[] = [];
let selected: SerialPair | null = null;
let lastLeads: OverlayLead[] = [];
let lastAnchor = DEFAULT_OVERLAY.anchorIndex;
/** Guards against an older comparison landing after a newer one. */
let ticket = 0;

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

function visible(): SerialPair[] {
  const kind = $<HTMLSelectElement>("filter-kind").value;
  const code = $<HTMLSelectElement>("filter-code").value;
  return pairs.filter((p) => {
    if (kind !== "all" && p.kind !== kind) return false;
    if (code !== "all" && !p.change.includes(code)) return false;
    return true;
  });
}

function renderList(): void {
  const list = $("pair-list");
  const shown = visible();
  list.innerHTML = "";
  $("pair-count").textContent = `${shown.length} of ${pairs.length}`;

  // Long lists are slower to build than to scroll, and nobody reads past a
  // couple of hundred; the count above says what was left out.
  if (!shown.length) {
    const li = document.createElement("li");
    li.className = "picker-strip__empty";
    li.textContent = "No pairs match that filter.";
    list.appendChild(li);
    return;
  }

  for (const p of shown.slice(0, 300)) {
    const li = document.createElement("li");
    li.className = "study study--stacked";
    if (selected && selected.before === p.before && selected.after === p.after) {
      li.classList.add("study--selected");
    }

    const body = document.createElement("div");
    body.className = "study__body";

    const name = document.createElement("div");
    name.className = "study__name";
    name.textContent = `${p.before} → ${p.after}`;
    body.appendChild(name);

    const when = document.createElement("div");
    when.className = "study__when";
    when.textContent = p.kind === "unchanged"
      ? "conduction unchanged"
      : `${p.kind}: ${p.change.map((c) => STATEMENTS[c] ?? c).join(", ")}`;
    body.appendChild(when);

    // A device or site change between two recordings is a confound, not a
    // finding — 6% of this corpus's serial pairs were acquired on different
    // hardware. Anything the tool reports on such a pair has to be read with
    // that in mind, so it is said here rather than discovered later.
    if (p.deviceChanged || p.siteChanged) {
      const warn = document.createElement("div");
      warn.className = "study__status study__status--warn";
      warn.textContent = p.deviceChanged && p.siteChanged
        ? "different device and site"
        : p.deviceChanged
        ? "different device"
        : "different site";
      body.appendChild(warn);
    }

    const open = document.createElement("button");
    open.type = "button";
    open.className = "btn btn--ghost";
    open.textContent = "Open";
    open.addEventListener("click", () => void show(p));

    li.append(body, open);
    list.appendChild(li);
  }
}

// ---------------------------------------------------------------------------
// Rendering one pair
// ---------------------------------------------------------------------------

function render(): void {
  if (!lastLeads.length) return;
  drawOverlay($<HTMLCanvasElement>("overlay"), lastLeads, {
    ...DEFAULT_OVERLAY,
    anchorIndex: lastAnchor,
    mmPerMv: Number($<HTMLSelectElement>("scale").value),
    showDifference: $<HTMLInputElement>("show-diff").checked,
    showSigma: $<HTMLInputElement>("show-sigma").checked,
    arrangement: "standard",
    columns: 4,
  });
}

async function show(p: SerialPair): Promise<void> {
  selected = p;
  renderList();
  const mine = ++ticket;

  const placeholder = $("view-placeholder");
  const panel = $("view-panel");
  placeholder.hidden = false;
  panel.hidden = true;
  $("corpus-status").textContent = `Loading ${p.before} and ${p.after}…`;

  try {
    const [a, b] = await Promise.all([fetchRecord(p.before), fetchRecord(p.after)]);
    if (mine !== ticket) return;

    const ids = [`ptbxl-${p.before}`, `ptbxl-${p.after}`];
    const [sa, sb] = await Promise.all([
      engine.analyseSignals(ids[0]!, a.leads, a.fsHz),
      engine.analyseSignals(ids[1]!, b.leads, b.fsHz),
    ]);
    if (mine !== ticket) return;

    const snap = await engine.compare(ids);
    if (mine !== ticket) return;

    paint(p, snap, [sa.hrBpm, sb.hrBpm], [sa.measurements, sb.measurements]);
    placeholder.hidden = true;
    panel.hidden = false;
    render();
  } catch (err) {
    if (mine !== ticket) return;
    $("corpus-status").textContent = err instanceof Error ? err.message : String(err);
  }
}

// deno-lint-ignore no-explicit-any
type Measures = any;

function paint(
  p: SerialPair,
  snap: ComparisonSnapshot,
  hr: number[],
  measures: Measures[],
): void {
  lastAnchor = snap.anchorIndex;
  lastLeads = snap.leads.map((l): OverlayLead => {
    if (l.unavailable) return { lead: l.lead, traces: [], unavailable: true };
    return {
      lead: l.lead,
      traces: l.traces.map((tr, i) => ({
        label: i === 0 ? String(p.before) : String(p.after),
        colour: i === 0 ? BEFORE : AFTER,
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

  renderHeader(p, measures);
  renderFindings(snap.findingSets[0] ?? []);
  renderReport(p, snap, hr, measures);
}

/** What PTB-XL says about this pair, above what the tool says. */
function renderHeader(p: SerialPair, measures: Measures[]): void {
  const el = $("pair-header");
  el.innerHTML = "";

  const item = document.createElement("div");
  item.className = p.kind === "unchanged"
    ? "findings__item findings__item--equivocal"
    : "findings__item";

  const label = document.createElement("strong");
  label.className = "findings__label";
  label.textContent = `PTB-XL · patient ${p.patient} · record ${p.before} → ${p.after}`;
  item.appendChild(label);

  const qrs = measures.map((m) => (m?.qrs == null ? "n/a" : `${Math.round(m.qrs)} ms`));
  const said = p.kind === "unchanged"
    ? "No ventricular conduction statement changed between these two recordings."
    : `Cardiologist statements: ${
      p.change.map((c) => `${c} (${STATEMENTS[c] ?? "unlisted"}) ${p.kind}`).join("; ")
    }.`;
  const expectation = p.kind !== "unchanged" && !p.change.some((c) => WIDENS.has(c))
    ? " These are fascicular — they rotate the axis and leave QRS duration alone, so a " +
      "duration detector is not expected to see them."
    : "";

  item.appendChild(
    document.createTextNode(`${said}${expectation} Measured QRS: ${qrs[0]} then ${qrs[1]}.`),
  );
  el.appendChild(item);
}

function renderFindings(findings: SerialFinding[]): void {
  const el = $("serial-findings");
  el.innerHTML = "";
  el.hidden = findings.length === 0;
  for (const f of findings) {
    const equivocal = f.level === "equivocal";
    const item = document.createElement("div");
    item.className = equivocal
      ? "findings__item findings__item--equivocal"
      : "findings__item";
    const label = document.createElement("strong");
    label.className = "findings__label";
    label.textContent = equivocal ? "Conduction — equivocal" : "Conduction change";
    item.appendChild(label);
    item.appendChild(document.createTextNode(f.text));
    el.appendChild(item);
  }
}

function renderReport(
  p: SerialPair,
  snap: ComparisonSnapshot,
  hr: number[],
  measures: Measures[],
): void {
  const n = (v: number | null | undefined, unit: string, digits = 0) =>
    v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(digits)} ${unit}`;

  const lines = [
    `record        ${p.before}          ${p.after}`,
    `rate          ${n(hr[0], "bpm")}        ${n(hr[1], "bpm")}`,
    `QRS           ${n(measures[0]?.qrs, "ms")}         ${n(measures[1]?.qrs, "ms")}`,
    `QT            ${n(measures[0]?.qt, "ms")}         ${n(measures[1]?.qt, "ms")}`,
    `axis          ${n(measures[0]?.axis, "°")}          ${n(measures[1]?.axis, "°")}`,
    "",
  ];

  // Every verdict on a real pair is currently Unmeasurable, by design — the
  // gate refuses until its preconditions are evidenced. Saying which ones are
  // missing is more useful than twelve identical rows repeating that they are.
  const blockers = snap.pairBlockerSets[0] ?? [];
  if (blockers.length) {
    lines.push("the gate cannot report change on this pair until:");
    for (const b of blockers) lines.push(`  ${b.code}`);
    lines.push("");
  }

  const worst = [...snap.leads]
    .map((l) => ({ lead: l.lead, rms: l.rmsDifferenceMv }))
    .sort((a, b) => b.rms - a.rms);
  lines.push("largest shape difference by lead:");
  for (const w of worst) {
    lines.push(`  ${w.lead.padEnd(4)} Δrms ${w.rms.toFixed(3)} mV`);
  }

  $("report").textContent = lines.join("\n");
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

for (const id of ["scale", "show-diff", "show-sigma"]) {
  $(id).addEventListener("change", render);
}
for (const id of ["filter-kind", "filter-code"]) {
  $(id).addEventListener("change", renderList);
}
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
    pairs = await fetchPairs();
  } catch (err) {
    // The corpus is 140 MB and deliberately not committed, so its absence is
    // the expected state on a fresh clone rather than a fault.
    $("corpus-status").textContent = err instanceof Error ? err.message : String(err);
    $("pair-count").textContent = "not fetched";
    return;
  }

  const codes = [...new Set(pairs.flatMap((p) => p.change))].sort();
  const sel = $<HTMLSelectElement>("filter-code");
  for (const c of codes) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = `${c} — ${STATEMENTS[c] ?? "unlisted"}`;
    sel.appendChild(opt);
  }

  const appeared = pairs.filter((p) => p.kind === "appeared").length;
  const resolved = pairs.filter((p) => p.kind === "resolved").length;
  $("corpus-status").textContent =
    `${pairs.length} pairs loaded — ${appeared} where an abnormality appeared, ` +
    `${resolved} where one resolved, ${pairs.length - appeared - resolved} unchanged.`;
  renderList();
}

void boot();

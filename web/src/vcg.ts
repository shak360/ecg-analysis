/**
 * The vector-loop page: one beat, traced through space and through time at once.
 *
 * A vectorcardiogram drawn as a still picture teaches the shape and hides the
 * thing that makes the shape mean something — that it is a *path*, walked once
 * per beat, and that every point on it is a single instant of all twelve
 * deflections. So the page runs one cursor along the averaged beat and around
 * the loop together. The dot on lead V4 and the dot in the frontal plane are
 * the same sample.
 *
 * That correspondence is only available because the loop is built from the
 * ensemble beats, which is also the only frame on which the twelve leads share
 * a clock. `crates/ecg-core/src/vcg.rs` refuses the cases where they do not.
 */

import { createEngine, type Engine } from "./engine/client.ts";
import type { VcgSnapshot } from "./engine/protocol.ts";
import { type Entry, firstWindow, loadCorpusIndex } from "./app/corpus.ts";
import { fetchAtlasRecord } from "./ingest/wfdb.ts";
import { mountCasePicker } from "./ui/case-picker.ts";
import {
  arcball,
  defaultView,
  drawBeatGrid,
  drawVcg3d,
  drawVcgLoops,
  drawLeadCompass,
  loopSpan,
  planeAt,
  reorthonormalise,
  rotFromPlane,
  rotMul,
  type View3d,
} from "./ui/vcg-loops.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

/** The order the twelve panels are drawn in, as on any printout. */
const LEAD_ORDER = [
  "I", "aVR", "V1", "V4",
  "II", "aVL", "V2", "V5",
  "III", "aVF", "V3", "V6",
] as const;

const engine: Engine = createEngine();

let snapshot: VcgSnapshot | null = null;
let cursor = 0;
let playing = false;
let lastFrameMs: number | null = null;
/** Guards against a slow case landing after the reader moved on. */
let ticket = 0;
/** Where the reader has turned the loop to, and how far in. */
let view: View3d = defaultView();

const dark = () =>
  document.documentElement.dataset.theme === "dark" ||
  (matchMedia("(prefers-color-scheme: dark)").matches &&
    document.documentElement.dataset.theme !== "light");

function render(): void {
  if (!snapshot) return;
  drawBeatGrid($<HTMLCanvasElement>("beats"), snapshot, cursor, LEAD_ORDER, { dark: dark() });
  const shown = {
    dark: dark(),
    showQrs: $<HTMLInputElement>("show-qrs").checked,
    showT: $<HTMLInputElement>("show-t").checked,
  };
  drawVcgLoops($<HTMLCanvasElement>("loops"), snapshot, cursor, shown);
  drawVcg3d($<HTMLCanvasElement>("space"), snapshot, cursor, view, shown);
  drawLeadCompass($<HTMLCanvasElement>("compass"), snapshot.leadAxes, view, {
    dark: shown.dark,
    // The compass shows where this instant points, so it needs the same sample
    // the loop's cursor is on.
    vector: cursor < snapshot.x.length
      ? { x: snapshot.x[cursor]!, y: snapshot.y[cursor]!, z: snapshot.z[cursor]! }
      : null,
  });

  // Milliseconds relative to the R peak, which is what a reader is actually
  // locating — "40 ms after R" means something, "sample 140" does not.
  const ms = ((cursor - snapshot.anchorIndex) / snapshot.fsHz) * 1000;
  const phase = cursor < snapshot.qrsOnset
    ? "before QRS"
    : snapshot.qrsOffset >= 0 && cursor <= snapshot.qrsOffset
    ? "QRS"
    : snapshot.tOffset >= 0 && cursor <= snapshot.tOffset
    ? "ST–T"
    : "after T";
  $("cursor-readout").textContent = `${ms >= 0 ? "+" : ""}${ms.toFixed(0)} ms from R · ${phase}`;
}

function setCursor(i: number): void {
  if (!snapshot) return;
  const span = loopSpan(snapshot);
  const lo = span.from;
  const hi = Math.max(span.to - 1, lo);
  cursor = Math.min(Math.max(i, lo), hi);
  $<HTMLInputElement>("scrub").value = String(cursor);
  render();
}

/**
 * Advance by wall-clock time, not by frame.
 *
 * Tying the step to `requestAnimationFrame` would make the playback speed the
 * display's refresh rate, so "1x real time" would be a different speed on a
 * 120 Hz screen. The label claims real time; it has to mean it.
 */
function tick(nowMs: number): void {
  if (!playing || !snapshot) {
    lastFrameMs = null;
    return;
  }
  const speed = Number($<HTMLSelectElement>("speed").value);
  if (lastFrameMs !== null) {
    // Clamped, because `requestAnimationFrame` does not run in a hidden tab.
    // Backgrounding the page and coming back leaves a gap of however long the
    // reader was away, and an unclamped step would consume it in one frame —
    // the loop would jump, wrap, and land somewhere unrelated to where they
    // left it. A quarter second is longer than any real frame and shorter than
    // any noticeable jump.
    const elapsedS = Math.min((nowMs - lastFrameMs) / 1000, 0.25);
    const advanced = elapsedS * snapshot.fsHz * speed;
    const span = loopSpan(snapshot);
    let next = cursor + advanced;
    if (next >= span.to - 1) next = span.from; // loop, as the heart does
    setCursor(Math.round(next));
  }
  lastFrameMs = nowMs;
  requestAnimationFrame(tick);
}

function setPlaying(on: boolean): void {
  playing = on;
  $("play").textContent = on ? "Pause" : "Play";
  $("play").setAttribute("aria-pressed", String(on));
  if (on) {
    lastFrameMs = null;
    requestAnimationFrame(tick);
  }
}

function showRefusal(v: VcgSnapshot): void {
  const box = $("case-refusal");
  box.hidden = false;
  box.innerHTML = "";

  const note = document.createElement("div");
  note.className = "note";
  const head = document.createElement("strong");
  head.textContent = "No vector loop for this recording. ";
  const body = document.createElement("span");
  body.textContent = v.refusal!.sentence;
  note.append(head, body);
  box.appendChild(note);

  // The whole split is hidden, headings included. An axis cross with no loop
  // reads as a null vector, and a null vector is a finding; a pair of headings
  // over empty space reads as something that failed to load.
  $("split").hidden = true;
  $("play").setAttribute("disabled", "");
  $<HTMLInputElement>("scrub").disabled = true;
  $("cursor-readout").textContent = "";
}

function renderNotes(v: VcgSnapshot): void {
  const box = $("case-notes");
  box.innerHTML = "";
  if (!v.notes.length) return;
  for (const n of v.notes) {
    const p = document.createElement("p");
    p.className = "note";
    p.textContent = n;
    box.appendChild(p);
  }
}

function renderLabels(e: Entry, trimmedFrom: number | null): void {
  const box = $("case-labels");
  box.innerHTML = "";

  const head = document.createElement("p");
  head.className = "findings__label";
  const bits = [e.sourceLabel, e.id];
  if (e.sex || e.age !== null) bits.push(`${e.sex ?? "?"}, ${e.age ?? "?"}`);
  head.textContent = bits.join(" · ");
  box.appendChild(head);

  const list = document.createElement("p");
  list.className = "note";
  list.textContent = e.findings.map((s) => s.description || s.id).join(" · ");
  box.appendChild(list);

  if (trimmedFrom !== null) {
    const t = document.createElement("p");
    t.className = "note";
    t.textContent =
      `This record is ${Math.round(trimmedFrom)} s long; the first 10 s were used. ` +
      `The averaged beat comes from that window only.`;
    box.appendChild(t);
  }
}

async function openCase(_code: string, e: Entry): Promise<void> {
  const mine = ++ticket;
  setPlaying(false);
  $("case-placeholder").hidden = true;
  $("case-panel").hidden = false;
  $("case-refusal").hidden = true;
  $("vcg-status").textContent = `Loading ${e.id}…`;

  const studyId = `vcg-${e.id}`;
  try {
    const rec = await fetchAtlasRecord(e.id);
    if (mine !== ticket) return;
    const win = firstWindow(rec);

    // The corpus's own labels first: they are facts about the case and do not
    // depend on this page succeeding at anything.
    renderLabels(e, win.trimmedFrom);

    await engine.analyseSignals(studyId, win.leads, rec.fsHz);
    if (mine !== ticket) return;
    const v = await engine.vcg(studyId);
    await engine.release([studyId]);
    if (mine !== ticket) return;

    snapshot = v;
    renderNotes(v);

    if (v.refusal) {
      showRefusal(v);
      $("vcg-status").textContent = `${e.id} · ${v.refusal.code}`;
      return;
    }

    $("split").hidden = false;
    $("play").removeAttribute("disabled");
    const scrub = $<HTMLInputElement>("scrub");
    scrub.disabled = false;
    const span = loopSpan(v);
    scrub.min = String(span.from);
    scrub.max = String(Math.max(span.to - 1, span.from));
    setCursor(span.from);
    $("vcg-status").textContent = `${e.id} · loop over ${span.to - span.from} samples`;
    setPlaying(!matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (err) {
    if (mine !== ticket) return;
    await engine.release([studyId]).catch(() => {});
    $("case-refusal").hidden = false;
    $("case-refusal").innerHTML = "";
    const p = document.createElement("p");
    p.className = "note";
    p.textContent = `Could not build a loop for ${e.id}: ${
      err instanceof Error ? err.message : String(err)
    }`;
    $("case-refusal").appendChild(p);
    $("vcg-status").textContent = "";
  }
}

/**
 * Turn the loop.
 *
 * An arcball, not a pair of angles: the pointer is mapped onto a virtual sphere
 * over the canvas and the drag becomes a rotation about whatever axis the
 * gesture implies. Dragging through the middle tips it; dragging around the rim
 * rolls it, which is the third degree of freedom a yaw/pitch gimbal cannot
 * reach at all.
 *
 * Pointer capture, so a drag that leaves the canvas keeps rotating — letting go
 * outside the box is how a gesture ends, not a cancellation.
 */
{
  const space = $<HTMLCanvasElement>("space");

  /** Pointer position in units of the canvas's radius from its centre. */
  const ball = (e: PointerEvent) => {
    const r = space.getBoundingClientRect();
    const radius = Math.min(r.width, r.height) / 2;
    return { x: (e.clientX - (r.left + r.width / 2)) / radius, y: (e.clientY - (r.top + r.height / 2)) / radius };
  };

  let last: { x: number; y: number } | null = null;

  space.addEventListener("pointerdown", (e) => {
    last = ball(e);
    space.setPointerCapture(e.pointerId);
  });
  space.addEventListener("pointermove", (e) => {
    if (!last) return;
    const now = ball(e);
    // Composed onto the current view and re-orthonormalised every time, so a
    // long drag cannot accumulate a shear.
    view = { ...view, rot: reorthonormalise(rotMul(arcball(last, now), view.rot)) };
    last = now;
    render();
  });
  for (const ev of ["pointerup", "pointercancel"]) {
    space.addEventListener(ev, () => {
      last = null;
    });
  }

  // The same three axes from the keyboard, because a control that only answers
  // to a drag is a control some readers do not have. Shift rolls.
  space.addEventListener("keydown", (e) => {
    const d = 0.14;
    const turn: Record<string, [number, number]> = {
      ArrowLeft: [-d, 0],
      ArrowRight: [d, 0],
      ArrowUp: [0, -d],
      ArrowDown: [0, d],
    };
    const t = turn[e.key];
    if (!t) return;
    e.preventDefault();
    const from = e.shiftKey ? { x: 0.85, y: 0 } : { x: 0, y: 0 };
    const to = e.shiftKey ? { x: 0.85, y: t[0] || t[1] } : { x: t[0], y: t[1] };
    view = { ...view, rot: reorthonormalise(rotMul(arcball(from, to), view.rot)) };
    render();
  });

  // Wheel to push in on a small loop. Clamped: past about 6x the trace is wider
  // than the panel and the reader is looking at a fragment with no context.
  space.addEventListener("wheel", (e) => {
    e.preventDefault();
    const next = view.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12);
    view = { ...view, zoom: Math.min(6, Math.max(0.5, next)) };
    render();
  }, { passive: false });
}

/**
 * Click a plane panel to look straight down it.
 *
 * The three flat panels are three particular orientations of the same object,
 * so a click on one is the most direct way to ask the 3D view for that
 * orientation — and having asked, the reader can drag away from it and see how
 * far they have turned.
 */
$("loops").addEventListener("click", (e) => {
  if (!snapshot) return;
  const plane = planeAt($<HTMLCanvasElement>("loops"), e.clientX, e.clientY, snapshot.planes);
  if (!plane) return;
  view = { ...view, rot: rotFromPlane(plane) };
  $("vcg-status").textContent = `Looking down the ${plane.label.toLowerCase()} plane`;
  render();
});

$("reset-view").addEventListener("click", () => {
  view = defaultView();
  render();
});

// A bigger canvas for the same loop, since a drag deserves room.
$("expand-view").addEventListener("click", () => {
  const on = $("case-panel").classList.toggle("vcg--focus");
  $("expand-view").setAttribute("aria-pressed", String(on));
  $("expand-view").textContent = on ? "Show planes" : "Focus";
  render();
});

$("play").addEventListener("click", () => setPlaying(!playing));
$("scrub").addEventListener("input", () => {
  setPlaying(false);
  setCursor(Number($<HTMLInputElement>("scrub").value));
});
for (const id of ["show-qrs", "show-t"]) {
  $(id).addEventListener("change", render);
}
$("theme-toggle").addEventListener("click", () => {
  const root = document.documentElement;
  root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  render();
});
globalThis.addEventListener("resize", render);

async function boot(): Promise<void> {
  const status = $("engine-status");
  try {
    await engine.ready();
    status.textContent = `Engine ready · ${engine.where}`;
    status.classList.add("statusbar__item--ok");
  } catch (err) {
    status.textContent = `Engine failed to start: ${err instanceof Error ? err.message : err}`;
    status.classList.add("statusbar__item--error");
    return;
  }

  const index = await loadCorpusIndex();
  if (!index.entries.length) {
    $("record-count").textContent = "not fetched";
    $("case-placeholder").textContent =
      "No atlas index found. Run `npm run fetch:ptbxl -- --atlas 6`.";
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
}

void boot();

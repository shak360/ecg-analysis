/**
 * The vector loop, as a view of a case rather than a page of its own.
 *
 * A vectorcardiogram drawn as a still picture teaches the shape and hides the
 * thing that makes the shape mean something — that it is a *path*, walked once
 * per beat, and that every point on it is a single instant of all twelve
 * deflections. So one cursor runs along the averaged beat and around the loop
 * together: the dot on lead V4 and the dot in the frontal plane are the same
 * sample.
 *
 * That correspondence exists only because the loop is built from the ensemble
 * beats, which is also the only frame on which the twelve leads share a clock.
 * `crates/ecg-core/src/vcg.rs` refuses the cases where they do not.
 *
 * # Why this is a module and not a page
 *
 * It was a page, and a page needs a case picker, a corpus index, a boot
 * sequence and a `openCase` — every one of which the atlas already had. Two
 * copies of the flow that loads a case is two places for it to drift, and the
 * reader paid for the split as well: choosing a case on one page and wanting
 * the other view meant finding it again from scratch.
 *
 * Like `case-picker`, this takes resolved elements rather than ids, so the ids
 * stay visible to `test/page-wiring.test.ts` in the page's own entry module.
 */

import type { VcgSnapshot } from "../engine/protocol.ts";
import {
  arcball,
  defaultView,
  drawBeatGrid,
  drawLeadCompass,
  drawVcg3d,
  drawVcgLoops,
  loopSpan,
  planeAt,
  reorthonormalise,
  rotFromPlane,
  rotIdentity,
  rotMul,
  type View3d,
} from "./vcg-loops.ts";

/** The order the twelve panels are drawn in, as on any printout. */
const LEAD_ORDER = [
  "I", "aVR", "V1", "V4",
  "II", "aVL", "V2", "V5",
  "III", "aVF", "V3", "V6",
] as const;

export interface VcgViewElements {
  /** Everything that is hidden when there is no loop to show. */
  split: HTMLElement;
  beats: HTMLCanvasElement;
  loops: HTMLCanvasElement;
  space: HTMLCanvasElement;
  compass: HTMLCanvasElement;
  compassLimb: HTMLCanvasElement;
  compassPrec: HTMLCanvasElement;
  play: HTMLButtonElement;
  speed: HTMLSelectElement;
  showQrs: HTMLInputElement;
  showT: HTMLInputElement;
  scrub: HTMLInputElement;
  readout: HTMLElement;
  refusal: HTMLElement;
  notes: HTMLElement;
  expand: HTMLButtonElement;
  reset: HTMLButtonElement;
  /** Gets `vcg--focus` when the loop takes the whole panel. */
  focusHost: HTMLElement;
}

export interface VcgView {
  /** Show a snapshot, or `null` to clear. */
  show(v: VcgSnapshot | null): void;
  /** Repaint at the current cursor — after a theme change or a resize. */
  redraw(): void;
  /** Stop playback, for when the view is hidden. */
  pause(): void;
}

export function mountVcgView(el: VcgViewElements, opts: { dark: () => boolean }): VcgView {
  let snapshot: VcgSnapshot | null = null;
  let cursor = 0;
  let playing = false;
  let lastFrameMs: number | null = null;
  let view: View3d = defaultView();

  function render(): void {
    if (!snapshot || !snapshot.x.length) return;
    const shown = {
      dark: opts.dark(),
      showQrs: el.showQrs.checked,
      showT: el.showT.checked,
    };
    drawBeatGrid(el.beats, snapshot, cursor, LEAD_ORDER, { dark: shown.dark });
    drawVcgLoops(el.loops, snapshot, cursor, shown);
    drawVcg3d(el.space, snapshot, cursor, view, shown);

    // The cursor's vector, shared by all three compasses so they agree.
    const here = cursor < snapshot.x.length
      ? { x: snapshot.x[cursor]!, y: snapshot.y[cursor]!, z: snapshot.z[cursor]! }
      : null;

    // The two fixed references. Their rotations come from the plane definitions
    // the engine supplies, so they cannot drift from the panels above them.
    const planeRot = (id: string) => {
      const p = snapshot!.planes.find((q) => q.id === id);
      return p ? { rot: rotFromPlane(p) } : { rot: rotIdentity() };
    };
    drawLeadCompass(el.compassLimb, snapshot.leadAxes, planeRot("frontal"), {
      dark: shown.dark,
      only: (a) => a.limb,
      vector: here,
      caption: "facing the patient",
    });
    drawLeadCompass(el.compassPrec, snapshot.leadAxes, planeRot("horizontal"), {
      dark: shown.dark,
      only: (a) => !a.limb,
      vector: here,
      caption: "from below",
    });
    drawLeadCompass(el.compass, snapshot.leadAxes, view, { dark: shown.dark, vector: here });

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
    el.readout.textContent = `${ms >= 0 ? "+" : ""}${ms.toFixed(0)} ms from R · ${phase}`;
  }

  function setCursor(i: number): void {
    if (!snapshot || !snapshot.x.length) return;
    const span = loopSpan(snapshot);
    cursor = Math.min(Math.max(i, span.from), Math.max(span.to - 1, span.from));
    el.scrub.value = String(cursor);
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
    if (lastFrameMs !== null) {
      // Clamped, because `requestAnimationFrame` does not run in a hidden tab.
      // Coming back to a backgrounded page would otherwise consume the whole
      // absence in one frame and land somewhere unrelated.
      const elapsedS = Math.min((nowMs - lastFrameMs) / 1000, 0.25);
      const advanced = elapsedS * snapshot.fsHz * Number(el.speed.value);
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
    el.play.textContent = on ? "Pause" : "Play";
    el.play.setAttribute("aria-pressed", String(on));
    if (on) {
      lastFrameMs = null;
      requestAnimationFrame(tick);
    }
  }

  /**
   * Make a canvas turn the loop.
   *
   * An arcball: the pointer is mapped onto a virtual sphere over the canvas and
   * the drag becomes a rotation about whatever axis the gesture implies.
   * Dragging through the middle tips it; dragging around the rim rolls it,
   * which is the third degree of freedom a yaw/pitch gimbal cannot reach.
   *
   * Attached to every canvas that shows the orientation, not just the loop —
   * the compass and the loop are two pictures of one rotation.
   */
  function attachArcball(canvas: HTMLCanvasElement): void {
    const ball = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const radius = Math.min(r.width, r.height) / 2;
      return {
        x: (e.clientX - (r.left + r.width / 2)) / radius,
        y: (e.clientY - (r.top + r.height / 2)) / radius,
      };
    };

    let last: { x: number; y: number } | null = null;

    canvas.addEventListener("pointerdown", (e) => {
      last = ball(e);
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!last) return;
      const now = ball(e);
      // Re-orthonormalised every time, so a long drag cannot accumulate a shear.
      view = { ...view, rot: reorthonormalise(rotMul(arcball(last, now), view.rot)) };
      last = now;
      render();
    });
    for (const ev of ["pointerup", "pointercancel"]) {
      canvas.addEventListener(ev, () => {
        last = null;
      });
    }

    // The same three axes from the keyboard, because a control that only
    // answers to a drag is a control some readers do not have. Shift rolls.
    canvas.addEventListener("keydown", (e) => {
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

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const next = view.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12);
      view = { ...view, zoom: Math.min(6, Math.max(0.5, next)) };
      render();
    }, { passive: false });
  }

  attachArcball(el.space);
  attachArcball(el.compass);

  /**
   * Click a plane panel to look straight down it.
   *
   * The three flat panels are three orientations of the same object, so a click
   * on one is the most direct way to ask the 3D view for that orientation.
   */
  el.loops.addEventListener("click", (e) => {
    if (!snapshot) return;
    const plane = planeAt(el.loops, e.clientX, e.clientY, snapshot.planes);
    if (!plane) return;
    view = { ...view, rot: rotFromPlane(plane) };
    render();
  });

  el.reset.addEventListener("click", () => {
    view = defaultView();
    render();
  });

  el.expand.addEventListener("click", () => {
    const on = el.focusHost.classList.toggle("vcg--focus");
    el.expand.setAttribute("aria-pressed", String(on));
    el.expand.textContent = on ? "Show planes" : "Focus";
    render();
  });

  el.play.addEventListener("click", () => setPlaying(!playing));
  el.scrub.addEventListener("input", () => {
    setPlaying(false);
    setCursor(Number(el.scrub.value));
  });
  for (const c of [el.showQrs, el.showT]) c.addEventListener("change", render);

  function showRefusal(v: VcgSnapshot): void {
    el.refusal.hidden = false;
    el.refusal.innerHTML = "";
    const note = document.createElement("div");
    note.className = "note";
    const head = document.createElement("strong");
    head.textContent = "No vector loop for this recording. ";
    const body = document.createElement("span");
    body.textContent = v.refusal!.sentence;
    note.append(head, body);
    el.refusal.appendChild(note);

    // The whole split is hidden, headings included. An axis cross with no loop
    // reads as a null vector, and a null vector is a finding; a pair of
    // headings over empty space reads as something that failed to load.
    el.split.hidden = true;
    el.play.setAttribute("disabled", "");
    el.scrub.disabled = true;
    el.readout.textContent = "";
  }

  function renderNotes(v: VcgSnapshot): void {
    el.notes.innerHTML = "";
    for (const n of v.notes) {
      const p = document.createElement("p");
      p.className = "note";
      p.textContent = n;
      el.notes.appendChild(p);
    }
  }

  return {
    show(v) {
      setPlaying(false);
      snapshot = v;
      el.refusal.hidden = true;
      el.notes.innerHTML = "";

      if (!v) {
        el.split.hidden = true;
        el.readout.textContent = "";
        return;
      }

      renderNotes(v);
      if (v.refusal) {
        showRefusal(v);
        return;
      }

      el.split.hidden = false;
      el.play.removeAttribute("disabled");
      el.scrub.disabled = false;
      const span = loopSpan(v);
      el.scrub.min = String(span.from);
      el.scrub.max = String(Math.max(span.to - 1, span.from));
      setCursor(span.from);
      setPlaying(!matchMedia("(prefers-reduced-motion: reduce)").matches);
    },
    redraw: render,
    pause: () => setPlaying(false),
  };
}

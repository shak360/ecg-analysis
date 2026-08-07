/**
 * Calipers and a magnifier for any printout canvas.
 *
 * The two things a person does to a paper ECG that a screen otherwise takes
 * away: step a pair of dividers across an interval to read it, and put a lens on
 * a segment to see what the print resolution hid. Both are attached to the
 * canvas from outside, so `printout.ts` keeps knowing nothing about interaction.
 *
 * # Why a caliper and not a readout
 *
 * The tool already prints QRS, QT and rate. A caliper is not a worse version of
 * those — it answers a different question. The engine measures the ensemble
 * beat; a caliper measures *this* complex, the one the reader is looking at, and
 * it can span things the engine has no concept of: the coupling interval of an
 * ectopic, the pause after it, the distance between two P waves marching through
 * a dropped beat. It also lets a learner check the tool, which the atlas's whole
 * framing invites.
 *
 * Readings are in milliseconds and millivolts, derived from the same
 * `mmPerSec`/`mmPerMv` the canvas was drawn with, so a caliper and the grid can
 * never disagree — the alternative, reading pixels and converting with a second
 * copy of the scale, is exactly the kind of duplicate that drifts.
 */

import { darkTheme } from "./theme.ts";

export interface CaliperScale {
  /** Pixels per millimetre, as `drawPrintout` computed it. */
  pxPerMm: number;
  mmPerSec: number;
  mmPerMv: number;
  /**
   * The rectangles that are ECG. Everything else on the canvas is paper.
   *
   * A 3x4 printout is twelve *different* 2.5 s windows, not one strip, so a
   * caliper drawn straight across the canvas measures across a discontinuity in
   * time and lands in the margin on its way. Given these, the caliper is drawn
   * once per panel at the same offset *into* each panel — the same instant in
   * every lead — and never outside one.
   */
  panels?: { x: number; y: number; w: number; h: number }[];
}

type Mode = "off" | "caliper" | "magnify";

/** Which part of a placed caliper the pointer grabbed. */
type Grab = "a" | "b" | "body" | null;

interface Point {
  x: number;
  y: number;
}

const MAG_R = 78;
export const MAG_ZOOM = 3.1;

/**
 * Attach to a canvas. Returns a handle the page uses to change mode, and a
 * `redraw` the page must call after it repaints the canvas — the overlay lives
 * on a sibling layer and cannot know when the tracing underneath changed.
 */
export function attachCalipers(
  canvas: HTMLCanvasElement,
  getScale: () => CaliperScale,
  /**
   * A second rendering of the same tracing, drawn `MAG_ZOOM` times larger.
   *
   * Supplying one turns the magnifier into a real magnifier. Without it the lens
   * can only enlarge the pixels already on screen, which is a photograph of a
   * photograph: the 1 mm grid turns to mush at exactly the scale someone reached
   * for the lens to read. With it, the lens shows the trace re-drawn at
   * `MAG_ZOOM` times the millimetre scale — the fine structure is genuinely
   * there rather than interpolated.
   */
  getHiRes?: () => HTMLCanvasElement | null,
) {
  const layer = document.createElement("canvas");
  layer.className = "caliper-layer";
  canvas.parentElement?.insertBefore(layer, canvas.nextSibling);

  let mode: Mode = "off";
  let anchor: Point | null = null;
  let cursor: Point | null = null;
  /** A finished measurement stays until the next one starts or the mode ends. */
  let held: { a: Point; b: Point } | null = null;
  /**
   * March the interval out across the rest of the strip.
   *
   * This is the manoeuvre the physical instrument exists for. Set the dividers
   * to one R-R and step them along: if the marks keep landing on R waves the
   * rhythm is regular, and where they stop landing is where it is not. It is how
   * a dropped beat, a compensatory pause and a march-out of P waves through
   * complete block are all read, and none of those is a number the engine can
   * hand you.
   */
  let repeat = false;
  /** What the current drag is moving, when it is moving a placed caliper. */
  let grab: Grab = null;
  let grabFrom: Point | null = null;
  let onChange: (() => void) | null = null;

  const at = (e: PointerEvent): Point => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function size(): void {
    const dpr = globalThis.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    layer.width = Math.round(w * dpr);
    layer.height = Math.round(h * dpr);
    layer.style.width = `${w}px`;
    layer.style.height = `${h}px`;
    const ctx = layer.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clear(): void {
    const ctx = layer.getContext("2d")!;
    ctx.clearRect(0, 0, layer.clientWidth || layer.width, layer.clientHeight || layer.height);
  }

  /** The panel containing `x`, or null when it is over paper. */
  function panelAt(x: number, y: number) {
    const ps = getScale().panels;
    if (!ps?.length) return null;
    return ps.find((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) ?? null;
  }

  function drawCaliper(a: Point, b: Point, live: boolean): void {
    const ctx = layer.getContext("2d")!;
    const { pxPerMm, mmPerSec, mmPerMv, panels } = getScale();
    const ms = (Math.abs(b.x - a.x) / pxPerMm / mmPerSec) * 1000;
    const mv = Math.abs(b.y - a.y) / pxPerMm / mmPerMv;
    const dark = darkTheme();
    const ink = dark ? "#7dd3fc" : "#0369a1";
    const band = dark ? "rgba(125,211,252,0.16)" : "rgba(3,105,161,0.15)";

    // Where the caliper sits *within* its panel. That offset is a time, and the
    // same time exists in every panel, which is why the marks appear in all of
    // them at once rather than one line running across the page.
    // Without a home panel there is no offset to replicate, so the caliper is
    // drawn where it was dragged and nowhere else. That happens on a canvas with
    // no panel geometry at all; a press on the margin of one that has it is
    // refused at `pointerdown` instead, so it cannot reach here.
    const home = panelAt(a.x, a.y);
    const boxes = home && panels?.length
      ? panels
      : [{ x: 0, y: 0, w: layer.clientWidth || layer.width, h: layer.clientHeight || layer.height }];
    const originIn = home ? a.x - home.x : a.x;
    const step = b.x - a.x;

    ctx.save();
    ctx.lineWidth = 1.2;

    for (const box of boxes) {
      ctx.save();
      // Clipped to the panel: a caliper only exists in ECG space, never in the
      // margin between panels.
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.w, box.h);
      ctx.clip();

      const x1 = box.x + originIn;
      const x2 = x1 + step;

      // Alternating shaded bands when stepping out: every other interval is
      // filled. The measured span is band 0 and stays clear, the intervals
      // immediately either side are filled, the next pair clear, and so on — so
      // the stripe reads as a ruler you can count along rather than a row of
      // hairlines, and it survives the light theme.
      if (repeat && !live && Math.abs(step) > 6) {
        ctx.fillStyle = band;
        for (let k = -200; k < 200; k++) {
          // Odd bands only. Skipping *even* k is what leaves the measured span
          // clear, since band 0 is the span itself; an earlier version skipped
          // odd k as well and left both neighbours unshaded, which is not an
          // alternation at all.
          if (k % 2 === 0) continue;
          const bx = x1 + step * k;
          if (bx + Math.abs(step) < box.x || bx - Math.abs(step) > box.x + box.w) continue;
          ctx.fillRect(Math.min(bx, bx + step), box.y, Math.abs(step), box.h);
        }
        ctx.strokeStyle = ink;
        ctx.globalAlpha = 0.5;
        ctx.setLineDash([2, 4]);
        for (let k = -200; k < 200; k++) {
          if (k === 0) continue;
          const bx = x1 + step * k;
          if (bx < box.x || bx > box.x + box.w) continue;
          ctx.beginPath();
          ctx.moveTo(bx, box.y);
          ctx.lineTo(bx, box.y + box.h);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }

      ctx.strokeStyle = ink;
      ctx.setLineDash(live ? [4, 3] : []);
      for (const x of [x1, x2]) {
        ctx.beginPath();
        ctx.moveTo(x, box.y);
        ctx.lineTo(x, box.y + box.h);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // The tie and the label belong to the panel the caliper was drawn in.
    const showMv = Math.abs(b.y - a.y) > 4;
    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, a.y);
    ctx.stroke();
    if (showMv) {
      ctx.beginPath();
      ctx.moveTo(b.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    const label = showMv
      ? `${ms.toFixed(0)} ms · ${mv.toFixed(2)} mV`
      : `${ms.toFixed(0)} ms${ms > 0 ? `  (${(60000 / ms).toFixed(0)} bpm)` : ""}`;
    ctx.font = "600 12px ui-monospace, monospace";
    const w = ctx.measureText(label).width + 10;
    const lx = Math.min(Math.max((a.x + b.x) / 2 - w / 2, 2), (layer.clientWidth || 0) - w - 2);
    const ly = Math.max(a.y - 22, 2);
    ctx.fillStyle = dark ? "rgba(18,21,26,0.92)" : "rgba(255,255,255,0.96)";
    ctx.fillRect(lx, ly, w, 18);
    ctx.strokeStyle = ink;
    ctx.strokeRect(lx + 0.5, ly + 0.5, w - 1, 17);
    ctx.fillStyle = ink;
    ctx.fillText(label, lx + 5, ly + 13);
    ctx.restore();
  }

  function drawMagnifier(p: Point): void {
    const ctx = layer.getContext("2d")!;
    const dpr = globalThis.devicePixelRatio || 1;
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, MAG_R, 0, Math.PI * 2);
    ctx.clip();

    const hi = getHiRes?.() ?? null;
    if (hi && hi.width > 0) {
      // The real thing: the same tracing re-drawn at MAG_ZOOM times the
      // millimetre scale, sampled 1:1. `hi` is that many times wider than the
      // canvas on screen, so a point maps across by the same factor.
      const k = hi.width / (canvas.width || 1);
      const src = MAG_R * k;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        hi,
        p.x * dpr * k - src, p.y * dpr * k - src, src * 2, src * 2,
        p.x - MAG_R, p.y - MAG_R, MAG_R * 2, MAG_R * 2,
      );
    } else {
      // Fallback: enlarge what is already on screen. Blurry by construction —
      // there is no more detail in a bitmap than was rasterised into it — and
      // only used where a page has not supplied a high-resolution render.
      const s = MAG_R / MAG_ZOOM;
      ctx.drawImage(
        canvas,
        (p.x - s) * dpr, (p.y - s) * dpr, s * 2 * dpr, s * 2 * dpr,
        p.x - MAG_R, p.y - MAG_R, MAG_R * 2, MAG_R * 2,
      );
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = darkTheme() ? "#7dd3fc" : "#0369a1";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, MAG_R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function render(): void {
    clear();
    if (mode === "caliper") {
      if (anchor && cursor) drawCaliper(anchor, cursor, true);
      else if (held) drawCaliper(held.a, held.b, false);
    } else if (mode === "magnify" && cursor) {
      drawMagnifier(cursor);
    }
  }

  /** What a press at `p` would take hold of on the placed caliper, if anything. */
  function grabAt(p: Point): Grab {
    if (!held) return null;
    const near = (x: number) => Math.abs(p.x - x) <= 7;
    if (near(held.a.x)) return "a";
    if (near(held.b.x)) return "b";
    const lo = Math.min(held.a.x, held.b.x);
    const hi = Math.max(held.a.x, held.b.x);
    return p.x > lo && p.x < hi ? "body" : null;
  }

  layer.addEventListener("pointerdown", (e) => {
    if (mode !== "caliper") return;
    layer.setPointerCapture(e.pointerId);
    const p = at(e);

    // Grab an existing caliper rather than starting a new one. Once a span is
    // set, sliding it along the strip is the point — you set it to one R-R and
    // then walk it, and being forced to re-drag from scratch each time loses the
    // span you were carrying.
    grab = grabAt(p);
    if (grab) {
      grabFrom = p;
      return;
    }

    // A caliper only exists in ECG space. Starting one on the margin would
    // measure from a point that is not on any time axis, and — once the marks
    // are replicated into every panel — from an offset that means nothing in
    // any of them.
    const ps = getScale().panels;
    if (ps?.length && !panelAt(p.x, p.y)) return;

    anchor = p;
    cursor = p;
    held = null;
    render();
  });

  layer.addEventListener("pointermove", (e) => {
    if (mode === "off") return;
    const p = at(e);

    if (grab && held && grabFrom) {
      const dx = p.x - grabFrom.x;
      const dy = p.y - grabFrom.y;
      if (grab === "a") held = { a: { x: held.a.x + dx, y: held.a.y + dy }, b: held.b };
      else if (grab === "b") held = { a: held.a, b: { x: held.b.x + dx, y: held.b.y + dy } };
      else {
        held = {
          a: { x: held.a.x + dx, y: held.a.y + dy },
          b: { x: held.b.x + dx, y: held.b.y + dy },
        };
      }
      grabFrom = p;
      render();
      return;
    }

    cursor = p;
    // A jaw under the pointer is grabbable, and saying so with the cursor is
    // the only hint that a placed caliper can be moved at all.
    if (mode === "caliper" && held && !anchor) {
      const g = grabAt(p);
      layer.style.cursor = g === "body" ? "grab" : g ? "ew-resize" : "crosshair";
    }
    render();
  });

  const finish = (e: PointerEvent) => {
    if (grab) {
      grab = null;
      grabFrom = null;
      return;
    }
    if (mode !== "caliper" || !anchor) return;
    const b = at(e);
    // A click without a drag is a miss, not a zero-width measurement.
    held = Math.hypot(b.x - anchor.x, b.y - anchor.y) > 3 ? { a: anchor, b } : null;
    anchor = null;
    cursor = null;
    render();
    onChange?.();
  };
  layer.addEventListener("pointerup", finish);
  layer.addEventListener("pointercancel", finish);
  layer.addEventListener("pointerleave", () => {
    if (mode === "magnify") {
      cursor = null;
      render();
    }
  });

  return {
    setMode(next: Mode) {
      mode = next;
      anchor = null;
      cursor = null;
      held = null;
      onChange?.();
      layer.classList.toggle("caliper-layer--on", next !== "off");
      layer.dataset.mode = next;
      size();
      render();
    },
    /** March the placed interval out across the strip. */
    setRepeat(on: boolean) {
      repeat = on;
      render();
    },
    /** Whether a measurement is currently placed, for enabling the repeat toggle. */
    hasMeasurement() {
      return held !== null;
    },
    /** Called whenever a measurement appears or is cleared. */
    onMeasurementChange(fn: () => void) {
      onChange = fn;
    },
    /** Call after the tracing is repainted; the overlay cannot detect that. */
    redraw() {
      size();
      render();
    },
  };
}

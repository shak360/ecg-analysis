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

export interface CaliperScale {
  /** Pixels per millimetre, as `drawPrintout` computed it. */
  pxPerMm: number;
  mmPerSec: number;
  mmPerMv: number;
}

type Mode = "off" | "caliper" | "magnify";

/** Which part of a placed caliper the pointer grabbed. */
type Grab = "a" | "b" | "body" | null;

interface Point {
  x: number;
  y: number;
}

const MAG_R = 78;
const MAG_ZOOM = 2.6;

/**
 * Attach to a canvas. Returns a handle the page uses to change mode, and a
 * `redraw` the page must call after it repaints the canvas — the overlay lives
 * on a sibling layer and cannot know when the tracing underneath changed.
 */
export function attachCalipers(
  canvas: HTMLCanvasElement,
  getScale: () => CaliperScale,
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

  function drawCaliper(a: Point, b: Point, live: boolean): void {
    const ctx = layer.getContext("2d")!;
    const { pxPerMm, mmPerSec, mmPerMv } = getScale();
    const ms = Math.abs(b.x - a.x) / pxPerMm / mmPerSec * 1000;
    const mv = Math.abs(b.y - a.y) / pxPerMm / mmPerMv;
    const dark = matchMedia("(prefers-color-scheme: dark)").matches &&
      document.documentElement.dataset.theme !== "light";
    const ink = dark ? "#7dd3fc" : "#0369a1";

    ctx.save();
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = 1.2;

    // Two full-height jaws and a tie between them, which is what dividers on
    // paper look like and what makes the span readable against the grid.
    ctx.setLineDash(live ? [4, 3] : []);
    for (const p of [a, b]) {
      ctx.beginPath();
      ctx.moveTo(p.x, 0);
      ctx.lineTo(p.x, layer.clientHeight || layer.height);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, a.y);
    ctx.stroke();

    // The march-out. Fainter than the jaws so the measurement itself stays the
    // brightest thing, and stepping outward in both directions because the beat
    // you want to check is as often before the pair as after it.
    if (repeat && !live) {
      const step = b.x - a.x;
      if (Math.abs(step) > 6) {
        const h = layer.clientHeight || layer.height;
        const w = layer.clientWidth || layer.width;
        ctx.globalAlpha = 0.42;
        ctx.setLineDash([2, 4]);
        for (const dir of [1, -1]) {
          for (let k = 1; k < 200; k++) {
            const x = (dir > 0 ? b.x : a.x) + dir * step * k;
            if (x < 0 || x > w) break;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
          }
        }
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    }

    // The amplitude arm only when the drag has vertical extent worth reading;
    // otherwise every horizontal measurement carries a meaningless 0.00 mV.
    const showMv = Math.abs(b.y - a.y) > 4;
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
    ctx.fillStyle = dark ? "rgba(18,21,26,0.92)" : "rgba(255,255,255,0.94)";
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

    // Sample the tracing canvas itself, so the lens shows exactly what was
    // drawn — grid included — rather than a second rendering that could differ.
    const s = MAG_R / MAG_ZOOM;
    ctx.drawImage(
      canvas,
      (p.x - s) * dpr, (p.y - s) * dpr, s * 2 * dpr, s * 2 * dpr,
      p.x - MAG_R, p.y - MAG_R, MAG_R * 2, MAG_R * 2,
    );
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = matchMedia("(prefers-color-scheme: dark)").matches ? "#7dd3fc" : "#0369a1";
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
    /** Call after the tracing is repainted; the overlay cannot detect that. */
    redraw() {
      size();
      render();
    },
  };
}

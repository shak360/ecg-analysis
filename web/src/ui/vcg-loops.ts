/**
 * Drawing the loops, and the cursor that ties them to the tracing.
 *
 * Everything numeric lives in the exported pure functions, not in the draw
 * call, because a canvas cannot be asserted about in a test that has no DOM —
 * and the projection is exactly where a sign error would hide. `projectPlane`
 * is the one place the orthogonal leads become screen coordinates, so it is the
 * one place a flipped Z can turn a normal counterclockwise loop into the
 * clockwise one of posterior infarction.
 */

import type { VcgPlane, VcgSnapshot } from "../engine/protocol.ts";

/** Where the cursor's bright tail starts, in milliseconds behind it. */
export const TAIL_MS = 40;

/**
 * One sample of the loop, in a plane's own screen axes.
 *
 * Returns *millivolts*, not pixels: `u` grows rightward and `v` grows downward,
 * matching canvas, so the caller only has to scale and translate. The sign
 * carried on each axis comes from the engine (`vcg_planes_json`), never from
 * here.
 */
export function projectPlane(
  plane: VcgPlane,
  x: number,
  y: number,
  z: number,
): { u: number; v: number } {
  const pick = (axis: "x" | "y" | "z") => (axis === "x" ? x : axis === "y" ? y : z);
  return {
    u: pick(plane.horizontal.axis) * plane.horizontal.sign,
    v: pick(plane.vertical.axis) * plane.vertical.sign,
  };
}

/**
 * The millivolt half-width every plane shares.
 *
 * One scale across all three panels, deliberately. Scaling each to its own
 * extent would make a small loop and a large one look alike, and would stretch
 * a circular loop into an ellipse — which is a morphology finding, not a
 * rendering choice.
 */
export function loopExtent(v: VcgSnapshot, from: number, to: number): number {
  let m = 0;
  const lo = Math.max(0, from);
  const hi = Math.min(v.x.length, to);
  for (let i = lo; i < hi; i++) {
    m = Math.max(m, Math.abs(v.x[i]!), Math.abs(v.y[i]!), Math.abs(v.z[i]!));
  }
  // A floor, so a flat loop does not divide by zero and fill the panel with
  // magnified noise.
  return Math.max(m, 0.1) * 1.15;
}

/** The span of the loop actually worth drawing: QRS onset through T offset. */
export function loopSpan(v: VcgSnapshot): { from: number; to: number } {
  const from = v.qrsOnset >= 0 ? v.qrsOnset : 0;
  const to = v.tOffset >= 0 ? v.tOffset : v.frameLen;
  return { from: Math.min(from, to), to: Math.max(from, to) };
}

export interface LoopTheme {
  ink: string;
  faint: string;
  grid: string;
  qrs: string;
  t: string;
  cursor: string;
  muted: string;
}

export function loopTheme(dark: boolean): LoopTheme {
  // Neither red nor green: on this page as on the printout, those two are
  // reserved and a loop is not a verdict.
  return dark
    ? {
      ink: "#e8eaee",
      faint: "#2c313a",
      grid: "#232830",
      qrs: "#4da3e8",
      t: "#c08bd6",
      cursor: "#e0a63c",
      muted: "#a2aab6",
    }
    : {
      ink: "#16191d",
      faint: "#d8dce2",
      grid: "#eceef1",
      qrs: "#0b6ab8",
      t: "#8b4bab",
      cursor: "#9a6400",
      muted: "#5c646f",
    };
}

/**
 * Draw the three planes side by side, with the cursor at sample `at`.
 *
 * The whole loop is drawn faint so its shape stays visible, then the segment
 * behind the cursor is redrawn bright — a comet, so the direction of travel is
 * readable at a glance. Rotation sense is the reading, and a plain dot does not
 * show it.
 */
export function drawVcgLoops(
  canvas: HTMLCanvasElement,
  v: VcgSnapshot,
  at: number,
  opts: { dark: boolean; showQrs: boolean; showT: boolean },
): void {
  const th = loopTheme(opts.dark);
  const dpr = globalThis.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 900;
  const n = v.planes.length || 3;
  const gap = 14;
  const side = Math.max(80, (cssW - gap * (n - 1)) / n);
  const labelH = 30;
  const cssH = side + labelH;

  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  if (!v.x.length) return;

  const span = loopSpan(v);
  const extent = loopExtent(v, span.from, span.to);
  const tailFrom = Math.max(span.from, at - Math.round((TAIL_MS / 1000) * v.fsHz));

  v.planes.forEach((plane, k) => {
    const x0 = k * (side + gap);
    const cx = x0 + side / 2;
    const cy = labelH + side / 2;
    const r = side / 2 - 10;
    const sx = (mv: number) => cx + (mv / extent) * r;
    const sy = (mv: number) => cy + (mv / extent) * r;

    ctx.fillStyle = th.muted;
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(plane.label, x0, 4);

    // Axis cross and the direction each arm means. Without the labels the
    // reader cannot tell a sagittal panel from a frontal one.
    ctx.strokeStyle = th.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, cy);
    ctx.lineTo(x0 + side, cy);
    ctx.moveTo(cx, labelH);
    ctx.lineTo(cx, labelH + side);
    ctx.stroke();

    ctx.font = "9px system-ui, sans-serif";
    ctx.fillStyle = th.muted;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(plane.horizontal.positiveLabel, x0 + side - 2, cy - 7);
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(plane.vertical.positiveLabel, cx + 22, labelH + side - 2);

    const path = (from: number, to: number, colour: string, width: number) => {
      if (to - from < 2) return;
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (let i = from; i < to; i++) {
        const p = projectPlane(plane, v.x[i]!, v.y[i]!, v.z[i]!);
        const px = sx(p.u);
        const py = sy(p.v);
        if (i === from) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    };

    // The QRS and T portions, faint, as context.
    const qrsTo = v.qrsOffset >= 0 ? v.qrsOffset : span.to;
    if (opts.showQrs) path(span.from, qrsTo, th.qrs, 1.4);
    if (opts.showT && v.qrsOffset >= 0) path(qrsTo, span.to, th.t, 1.4);

    // The comet: the same path re-drawn bright over the last TAIL_MS.
    ctx.globalAlpha = 0.95;
    path(tailFrom, Math.min(at + 1, span.to), th.cursor, 2.6);
    ctx.globalAlpha = 1;

    if (at >= span.from && at < span.to) {
      const p = projectPlane(plane, v.x[at]!, v.y[at]!, v.z[at]!);
      ctx.fillStyle = th.cursor;
      ctx.beginPath();
      ctx.arc(sx(p.u), sy(p.v), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/**
 * The twelve ensemble beats, in the familiar 3x4 grid, with the same cursor.
 *
 * This is the other half of the correspondence: the dot here and the dot on the
 * loops are the same sample index, so a reader watching both sees one instant
 * of twelve deflections become one point in space.
 */
export function drawBeatGrid(
  canvas: HTMLCanvasElement,
  v: VcgSnapshot,
  at: number,
  order: readonly string[],
  opts: { dark: boolean },
): void {
  const th = loopTheme(opts.dark);
  const dpr = globalThis.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 700;
  const cols = 4;
  const rows = 3;
  const gapX = 8;
  const gapY = 6;
  const cellW = (cssW - gapX * (cols - 1)) / cols;
  const cellH = 62;
  const cssH = rows * cellH + gapY * (rows - 1);

  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  if (!v.beats.size) return;

  // One millivolt scale for all twelve, so relative amplitude survives — the
  // whole point of a 12-lead view is comparing leads against each other.
  let peak = 0.5;
  for (const b of v.beats.values()) {
    for (const s of b) peak = Math.max(peak, Math.abs(s));
  }

  order.forEach((lead, k) => {
    const b = v.beats.get(lead);
    const col = k % cols;
    const row = Math.floor(k / cols);
    const x0 = col * (cellW + gapX);
    const y0 = row * (cellH + gapY);
    const mid = y0 + cellH / 2;

    ctx.strokeStyle = th.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, mid);
    ctx.lineTo(x0 + cellW, mid);
    ctx.stroke();

    ctx.fillStyle = th.muted;
    ctx.font = "600 9px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(lead, x0 + 2, y0 + 1);

    if (!b) {
      ctx.fillStyle = th.faint;
      ctx.font = "9px system-ui, sans-serif";
      ctx.fillText("not recorded", x0 + 18, y0 + 1);
      return;
    }

    const px = (i: number) => x0 + (i / (b.length - 1)) * cellW;
    const py = (mv: number) => mid - (mv / peak) * (cellH / 2 - 6);

    ctx.strokeStyle = th.faint;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < b.length; i++) {
      if (i === 0) ctx.moveTo(px(i), py(b[i]!));
      else ctx.lineTo(px(i), py(b[i]!));
    }
    ctx.stroke();

    // Everything up to the cursor in ink, so the reader sees how much of the
    // beat has been traced; the last TAIL_MS bright, matching the loops.
    const tail = Math.max(0, at - Math.round((TAIL_MS / 1000) * v.fsHz));
    ctx.strokeStyle = th.ink;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i <= Math.min(at, b.length - 1); i++) {
      if (i === 0) ctx.moveTo(px(i), py(b[i]!));
      else ctx.lineTo(px(i), py(b[i]!));
    }
    ctx.stroke();

    ctx.strokeStyle = th.cursor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = tail; i <= Math.min(at, b.length - 1); i++) {
      if (i === tail) ctx.moveTo(px(i), py(b[i]!));
      else ctx.lineTo(px(i), py(b[i]!));
    }
    ctx.stroke();

    if (at >= 0 && at < b.length) {
      ctx.fillStyle = th.cursor;
      ctx.beginPath();
      ctx.arc(px(at), py(b[at]!), 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// --- the loop in space -----------------------------------------------------

/**
 * The default oblique view: enough yaw and pitch that the loop reads as a solid
 * object on arrival rather than as one of the flat projections above it.
 */
export const VIEW_YAW = -0.62;
export const VIEW_PITCH = -0.34;

export interface View3d {
  /** Radians about the body's vertical axis. */
  yaw: number;
  /** Radians about the screen's horizontal axis. */
  pitch: number;
}

/**
 * One sample, rotated into the viewer's frame.
 *
 * **Orthographic, deliberately.** A perspective projection would make the near
 * half of a loop larger than the far half, and this is a plot of *magnitudes* —
 * the whole quantity a reader is judging is how far the vector reaches. Adding
 * foreshortening would make a loop's size depend on which way it happened to be
 * pointing.
 *
 * At `yaw = 0, pitch = 0` this reduces exactly to the frontal plane — `u` is X
 * (left positive), `v` is Y (inferior positive) — so the 3D view and the flat
 * frontal panel agree at their shared orientation instead of being two unrelated
 * pictures. `depth` grows away from the viewer and is only a drawing cue.
 */
export function project3d(
  x: number,
  y: number,
  z: number,
  view: View3d,
): { u: number; v: number; depth: number } {
  const cy = Math.cos(view.yaw);
  const sy = Math.sin(view.yaw);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;

  const cp = Math.cos(view.pitch);
  const sp = Math.sin(view.pitch);
  const y1 = y * cp - z1 * sp;
  const z2 = y * sp + z1 * cp;

  return { u: x1, v: y1, depth: z2 };
}

/** The three body axes, as unit vectors with the end each label belongs to. */
const AXES_3D: { v: [number, number, number]; label: string }[] = [
  { v: [1, 0, 0], label: "left" },
  { v: [0, 1, 0], label: "inferior" },
  { v: [0, 0, 1], label: "posterior" },
];

/**
 * Draw the loop as one object in space, rotatable.
 *
 * The three flat panels are the clinical convention and stay the primary
 * reading; this is the thing that makes them make sense — the same path, seen
 * whole, so a reader can turn it and watch each projection fall out of it.
 */
export function drawVcg3d(
  canvas: HTMLCanvasElement,
  v: VcgSnapshot,
  at: number,
  view: View3d,
  opts: { dark: boolean; showQrs: boolean; showT: boolean },
): void {
  const th = loopTheme(opts.dark);
  const dpr = globalThis.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 420;
  const cssH = Math.max(240, Math.min(cssW, 420));

  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  if (!v.x.length) return;

  const span = loopSpan(v);
  const extent = loopExtent(v, span.from, span.to);
  const cx = cssW / 2;
  const cy = cssH / 2;
  const r = Math.min(cssW, cssH) / 2 - 26;
  const sx = (u: number) => cx + (u / extent) * r;
  const sy = (w: number) => cy + (w / extent) * r;

  // The axes first, so the loop sits over them and the reader always knows
  // which way is which while dragging.
  ctx.font = "9px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const ax of AXES_3D) {
    const pos = project3d(ax.v[0] * extent, ax.v[1] * extent, ax.v[2] * extent, view);
    const neg = project3d(-ax.v[0] * extent, -ax.v[1] * extent, -ax.v[2] * extent, view);
    ctx.strokeStyle = th.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx(neg.u), sy(neg.v));
    ctx.lineTo(sx(pos.u), sy(pos.v));
    ctx.stroke();
    ctx.fillStyle = th.muted;
    ctx.fillText(ax.label, sx(pos.u * 1.1), sy(pos.v * 1.1));
  }

  const qrsTo = v.qrsOffset >= 0 ? v.qrsOffset : span.to;

  /**
   * Draw a run segment by segment, fading with depth.
   *
   * Orthographic projection alone gives no sense of which part of the loop is
   * near — a plain outline of a three-dimensional path reads flat. Depth-fading
   * each segment is the cheapest honest cue: it changes nothing about where a
   * point is drawn, only how strongly.
   */
  const path = (from: number, to: number, colour: string, width: number) => {
    for (let i = from + 1; i < to; i++) {
      const a = project3d(v.x[i - 1]!, v.y[i - 1]!, v.z[i - 1]!, view);
      const b = project3d(v.x[i]!, v.y[i]!, v.z[i]!, view);
      const mid = (a.depth + b.depth) / 2;
      ctx.globalAlpha = 0.35 + 0.65 * (1 - Math.min(1, Math.max(0, mid / extent / 2 + 0.5)));
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sx(a.u), sy(a.v));
      ctx.lineTo(sx(b.u), sy(b.v));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  if (opts.showQrs) path(span.from, qrsTo, th.qrs, 1.8);
  if (opts.showT && v.qrsOffset >= 0) path(qrsTo, span.to, th.t, 1.8);

  const tailFrom = Math.max(span.from, at - Math.round((TAIL_MS / 1000) * v.fsHz));
  path(tailFrom, Math.min(at + 1, span.to), th.cursor, 3);

  if (at >= span.from && at < span.to) {
    const p = project3d(v.x[at]!, v.y[at]!, v.z[at]!, view);
    // The vector itself, drawn from the origin: on a loop the reader sees the
    // path, but the quantity is the arrow — where the heart's dipole points at
    // this instant, and how far.
    ctx.strokeStyle = th.cursor;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(sx(0), sy(0));
    ctx.lineTo(sx(p.u), sy(p.v));
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = th.cursor;
    ctx.beginPath();
    ctx.arc(sx(p.u), sy(p.v), 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

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

import type { LeadAxis, VcgPlane, VcgSnapshot } from "../engine/protocol.ts";

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
 * The orientation of the loop, as a rotation matrix.
 *
 * # Why not yaw and pitch
 *
 * The first version of this carried two angles, and two angles cannot express
 * every orientation. A rotation in three dimensions has **three** degrees of
 * freedom; yaw and pitch supply two, and the missing one is *roll* — spin about
 * the direction you are looking. With a yaw/pitch gimbal the body's vertical
 * axis is welded to the screen's vertical, so the loop can be turned to face any
 * direction but never tilted, and near the poles yaw stops doing anything at all
 * (which is why that version had to clamp pitch away from straight down).
 *
 * A matrix has no such preferred axis. Every drag is a rotation about whichever
 * axis the gesture implies, composed onto whatever came before, so the loop
 * turns the way a physical object in the hand does.
 *
 * Row-major, nine numbers, and always orthonormal — see `reorthonormalise`.
 */
export type Rot = readonly number[];

/** No rotation: the frontal plane, looking at the patient's front. */
export function rotIdentity(): Rot {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

/** `a` after `b`. */
export function rotMul(a: Rot, b: Rot): Rot {
  const o = new Array<number>(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      o[r * 3 + c] = a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!;
    }
  }
  return o;
}

/** Rotation of `angle` radians about a unit `axis`, by Rodrigues' formula. */
export function rotAxisAngle(axis: readonly [number, number, number], angle: number): Rot {
  const n = Math.hypot(axis[0], axis[1], axis[2]);
  if (n < 1e-12) return rotIdentity();
  const [x, y, z] = [axis[0] / n, axis[1] / n, axis[2] / n];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return [
    t * x * x + c, t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c,
  ];
}

/**
 * Pull a drifted matrix back onto the rotation group.
 *
 * Every drag multiplies matrices together, and floating-point error accumulates
 * in the product. Left alone for a few thousand drags the rows stop being unit
 * length and stop being perpendicular, which is not a rotation any more — it is
 * a rotation plus a small shear and scale, and it would slowly stretch the loop
 * into a shape the patient does not have. Gram-Schmidt, applied on every
 * composition, costs nothing and makes the drift unrepresentable.
 */
export function reorthonormalise(m: Rot): Rot {
  const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const norm = (a: number[]) => {
    const n = Math.hypot(a[0]!, a[1]!, a[2]!) || 1;
    return [a[0]! / n, a[1]! / n, a[2]! / n];
  };
  let r0 = norm([m[0]!, m[1]!, m[2]!]);
  let r1 = [m[3]!, m[4]!, m[5]!];
  r1 = norm([r1[0]! - dot(r1, r0) * r0[0]!, r1[1]! - dot(r1, r0) * r0[1]!, r1[2]! - dot(r1, r0) * r0[2]!]);
  const r2 = [
    r0[1]! * r1[2]! - r0[2]! * r1[1]!,
    r0[2]! * r1[0]! - r0[0]! * r1[2]!,
    r0[0]! * r1[1]! - r0[1]! * r1[0]!,
  ];
  return [...r0, ...r1, ...r2];
}

/** The starting oblique, chosen so the loop reads as solid on arrival. */
export function defaultRot(): Rot {
  return rotFromYawPitch(-0.62, -0.34);
}

/** The old two-angle construction, kept because it names a view readably. */
export function rotFromYawPitch(yaw: number, pitch: number): Rot {
  return rotMul(rotAxisAngle([1, 0, 0], pitch), rotAxisAngle([0, 1, 0], yaw));
}

/**
 * Map a pointer position to a point on a virtual sphere over the canvas.
 *
 * Inside the sphere the drag tips the loop; outside it the gesture runs along
 * the rim and comes out as **roll**, which is the degree of freedom the gimbal
 * could not reach. That is the whole trick of an arcball: the third axis is not
 * a separate control, it is what a circular drag near the edge already means.
 */
function onSphere(dx: number, dy: number): [number, number, number] {
  const d = dx * dx + dy * dy;
  if (d <= 1) return [dx, dy, Math.sqrt(1 - d)];
  const n = Math.sqrt(d);
  return [dx / n, dy / n, 0];
}

/**
 * The rotation a drag from `from` to `to` implies, both in units of the
 * canvas's radius from its centre.
 */
export function arcball(
  from: { x: number; y: number },
  to: { x: number; y: number },
): Rot {
  const a = onSphere(from.x, from.y);
  const b = onSphere(to.x, to.y);
  const axis: [number, number, number] = [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return rotAxisAngle(axis, Math.acos(dot));
}

export interface View3d {
  rot: Rot;
  /** 1 fills the panel; the reader can push in on a small loop. */
  zoom: number;
}

export function defaultView(): View3d {
  return { rot: defaultRot(), zoom: 1 };
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
 * At the identity rotation this reduces exactly to the frontal plane — `u` is X
 * (left positive), `v` is Y (inferior positive) — so the 3D view and the flat
 * frontal panel agree at their shared orientation instead of being two unrelated
 * pictures. `depth` grows away from the viewer and is only a drawing cue.
 */
export function project3d(
  x: number,
  y: number,
  z: number,
  view: View3d | { rot: Rot },
): { u: number; v: number; depth: number } {
  const m = view.rot;
  return {
    u: m[0]! * x + m[1]! * y + m[2]! * z,
    v: m[3]! * x + m[4]! * y + m[5]! * z,
    depth: m[6]! * x + m[7]! * y + m[8]! * z,
  };
}

/**
 * The three body axes, both ends named.
 *
 * Both ends, because an orthographic projection carries no perspective cue: a
 * line through the origin looks exactly the same whichever end is pointing at
 * you, so labelling only the positive end tells a reader nothing about which
 * way the body is facing. Writing "posterior" on the one visible label and
 * leaving it there invites exactly the wrong reading — that posterior is the
 * end coming out of the screen.
 *
 * `plus` is the positive direction of the axis in the loop's frame; `minus` is
 * what lies at the other end.
 */
const AXES_3D: { v: [number, number, number]; plus: string; minus: string }[] = [
  { v: [1, 0, 0], plus: "left", minus: "right" },
  { v: [0, 1, 0], plus: "inferior", minus: "superior" },
  { v: [0, 0, 1], plus: "posterior", minus: "anterior" },
];

/** Every direction the axes name, for a test that both ends are covered. */
export function axisEndLabels(): string[] {
  return AXES_3D.flatMap((a) => [a.plus, a.minus]);
}

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
  // Square: the loop is a set of directions, so it wants the same room either
  // way, and a wide short box just centres it in empty space.
  const cssH = Math.max(240, cssW);

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
  const r = (Math.min(cssW, cssH) / 2 - 26) * (view.zoom ?? 1);
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

    // Each half drawn separately, and the half coming toward the reader drawn
    // solid while the half going away is dotted and faint. This is the only
    // thing in an orthographic picture that says which way round the body is,
    // and without it "posterior" reads as the end pointing out of the screen.
    for (const end of [pos, neg]) {
      const near = end.depth < 0;
      ctx.strokeStyle = near ? th.muted : th.grid;
      ctx.lineWidth = near ? 1.4 : 1;
      ctx.setLineDash(near ? [] : [2, 3]);
      ctx.beginPath();
      ctx.moveTo(sx(0), sy(0));
      ctx.lineTo(sx(end.u), sy(end.v));
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Both ends labelled, the near one in ink and the far one faint, so the
    // label and the line agree about which is which.
    for (const [end, label] of [[pos, ax.plus], [neg, ax.minus]] as const) {
      const near = end.depth < 0;
      ctx.fillStyle = near ? th.ink : th.faint;
      ctx.fillText(label, sx(end.u * 1.12), sy(end.v * 1.12));
    }
  }

  // Which way the reader is looking, in words, because it is the one fact the
  // picture is least able to state on its own.
  //
  // Three cases, not two. Snap to a plane that holds the front-back axis across
  // the screen — the horizontal and sagittal panels both do — and anterior is
  // neither toward the reader nor away from them. Calling that "from behind"
  // because the depth was not negative would be a confident wrong answer to the
  // one question this line exists to answer.
  const az = project3d(0, 0, -1, view).depth;
  const facing = Math.abs(az) < 1e-6 ? "edge-on" : az < 0 ? "from in front" : "from behind";
  ctx.fillStyle = th.muted;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(facing === "edge-on" ? "front-back axis edge-on" : `viewed ${facing}`, 2, 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

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

// --- looking at a plane ----------------------------------------------------

/**
 * The rotation that makes the 3D view show exactly this plane.
 *
 * Derived from the plane's own definition rather than written as angles: the
 * first row is whichever axis the plane puts across the screen, the second is
 * whichever it puts down it, and the third is their cross product. So the snap
 * cannot drift away from the panel it is named after — change a plane's axes or
 * signs in `vcg_planes_json` and the matching view follows automatically.
 *
 * The cross product for the third row is what keeps the result right-handed. A
 * left-handed matrix would mirror the loop, and a mirrored loop reverses
 * rotation sense, which is a different diagnosis.
 */
export function rotFromPlane(plane: VcgPlane): Rot {
  const unit = (axis: "x" | "y" | "z", sign: number): [number, number, number] => [
    axis === "x" ? sign : 0,
    axis === "y" ? sign : 0,
    axis === "z" ? sign : 0,
  ];
  const r0 = unit(plane.horizontal.axis, plane.horizontal.sign);
  const r1 = unit(plane.vertical.axis, plane.vertical.sign);
  const r2: [number, number, number] = [
    r0[1] * r1[2] - r0[2] * r1[1],
    r0[2] * r1[0] - r0[0] * r1[2],
    r0[0] * r1[1] - r0[1] * r1[0],
  ];
  return [...r0, ...r1, ...r2];
}

/**
 * Which plane panel a point falls in, or null.
 *
 * `drawVcgLoops` lays the panels out left to right in equal columns, so the
 * index follows from the x offset. Kept beside the drawing that decides the
 * layout, because the two have to agree and nothing else would notice if they
 * stopped.
 */
export function planeAt(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  planes: VcgPlane[],
): VcgPlane | null {
  if (!planes.length) return null;
  const r = canvas.getBoundingClientRect();
  if (clientY < r.top || clientY > r.bottom) return null;
  const gap = 14;
  const side = (r.width - gap * (planes.length - 1)) / planes.length;
  const x = clientX - r.left;
  const k = Math.floor(x / (side + gap));
  if (k < 0 || k >= planes.length) return null;
  // Inside the panel proper, not the gutter after it.
  if (x - k * (side + gap) > side) return null;
  return planes[k]!;
}

// --- the lead compass ------------------------------------------------------

/** What each screen direction means, drawn around a compass so it cannot be read
 * backwards. Derived from the rotation, never written per-panel. */
function orientationMarks(
  view: View3d | { rot: Rot },
): { u: number; v: number; label: string; near: boolean }[] {
  const dirs: [[number, number, number], string][] = [
    [[1, 0, 0], "left"],
    [[-1, 0, 0], "right"],
    [[0, 1, 0], "inferior"],
    [[0, -1, 0], "superior"],
    [[0, 0, 1], "posterior"],
    [[0, 0, -1], "anterior"],
  ];
  return dirs.map(([d, label]) => {
    const p = project3d(d[0], d[1], d[2], view);
    return { u: p.u, v: p.v, label, near: p.depth < 0 };
  });
}

export interface CompassOptions {
  dark: boolean;
  /** Which leads to draw. Omit for all twelve. */
  only?: (a: LeadAxis) => boolean;
  /** The cursor's vector, drawn in the cursor colour. */
  vector?: { x: number; y: number; z: number } | null;
  /** Shown top-left; says what the reader is looking at. */
  caption?: string;
}

/**
 * Lead directions, drawn in a given orientation.
 *
 * A vectorcardiogram answers "where is the heart's vector pointing", and the
 * twelve leads are twelve directions that vector gets measured along. Drawn in
 * the loop's own rotated frame, the relationship stops being something a reader
 * has to hold in their head.
 *
 * # Every compass states its own orientation
 *
 * The first version drew lead names and nothing else, which left a reader no way
 * to tell which way the body was facing — and an orthographic projection offers
 * no cue of its own. A diagram of directions that does not say which way is
 * front is not a compass, it is a star. So the six anatomical directions are
 * marked on every one of these, with the ones pointing toward the reader in ink
 * and the ones pointing away faint.
 *
 * Limb leads solid, precordial dashed — the limb angles are definitional, the
 * precordial ones a textbook approximation.
 */
export function drawLeadCompass(
  canvas: HTMLCanvasElement,
  axes: LeadAxis[],
  view: View3d | { rot: Rot },
  opts: CompassOptions,
): void {
  const th = loopTheme(opts.dark);
  const dpr = globalThis.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 220;
  const cssH = cssW;

  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  if (!axes.length) return;

  const cx = cssW / 2;
  const cy = cssH / 2;
  const r = cssW / 2 - 30;

  ctx.strokeStyle = th.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.font = "9px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // The anatomical directions first, outside the circle, so the leads are read
  // against a frame that is already established.
  for (const m of orientationMarks(view)) {
    // An axis lying in the screen plane is the informative case; one pointing
    // straight at the reader collapses to the centre and is dropped rather than
    // stacked on the origin.
    if (Math.hypot(m.u, m.v) < 0.25) continue;
    ctx.fillStyle = m.near ? th.muted : th.faint;
    ctx.fillText(m.label, cx + m.u * (r + 17), cy + m.v * (r + 17));
  }

  const shown = axes.filter((a) => (opts.only ? opts.only(a) : true));
  const drawn = shown
    .map((a) => ({ a, p: project3d(a.v[0], a.v[1], a.v[2], view) }))
    .sort((m, n) => n.p.depth - m.p.depth);

  for (const { a, p } of drawn) {
    const x = cx + p.u * r;
    const y = cy + p.v * r;
    const front = 0.45 + 0.55 * (1 - Math.min(1, Math.max(0, p.depth / 2 + 0.5)));

    ctx.globalAlpha = front;
    ctx.strokeStyle = a.limb ? th.qrs : th.t;
    ctx.setLineDash(a.approximate ? [3, 3] : []);
    ctx.lineWidth = a.limb ? 1.5 : 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = a.limb ? th.ink : th.muted;
    ctx.fillText(a.lead, cx + p.u * (r + 8), cy + p.v * (r + 8));
    ctx.globalAlpha = 1;
  }

  if (opts.vector) {
    const p = project3d(opts.vector.x, opts.vector.y, opts.vector.z, view);
    const n = Math.hypot(opts.vector.x, opts.vector.y, opts.vector.z) || 1;
    const k = r / n;
    ctx.strokeStyle = th.cursor;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + p.u * k, cy + p.v * k);
    ctx.stroke();
    ctx.fillStyle = th.cursor;
    ctx.beginPath();
    ctx.arc(cx + p.u * k, cy + p.v * k, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (opts.caption) {
    ctx.fillStyle = th.muted;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(opts.caption, 2, 2);
  }
}

/**
 * Pure geometry decoding for PDF path data.
 *
 * Deliberately free of any pdf.js import so it can be unit-tested outside a
 * browser. `pdf-paths.ts` supplies the pdf.js-dependent operator-list walk and
 * delegates all the actual coordinate work here.
 */

/** A 6-element PDF transformation matrix `[a, b, c, d, e, f]`. */
export type Matrix = [number, number, number, number, number, number];

/**
 * Path-segment opcodes inside an `OPS.constructPath` payload.
 *
 * pdf.js 6 stopped emitting one operator per segment and now packs a whole path
 * into a flat numeric array tagged with these codes. Mirrored from the private
 * `DrawOPS` table in pdf.mjs and pinned alongside `vendor/pdfjs/VERSION`.
 */
export const DrawOPS = {
  moveTo: 0,
  lineTo: 1,
  curveTo: 2,
  quadraticCurveTo: 3,
  closePath: 4,
} as const;

/** Coordinate count following each DrawOPS code, indexed by opcode. */
export const DRAW_OP_ARITY: readonly number[] = [2, 2, 6, 4, 0];

/** A single stroked subpath, flattened to line segments. */
export interface Polyline {
  /** Interleaved device-space coordinates `[x0, y0, x1, y1, ...]`. */
  points: Float64Array;
  /** Stroke colour as `#rrggbb`, or null when it could not be determined. */
  stroke: string | null;
  /** Perceptual lightness of the stroke in [0, 1]; 0 is black. */
  strokeLightness: number;
  /** Stroke width in device units. */
  lineWidth: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Summed segment length in device units. */
  length: number;
}

/** Graphics state tracked while walking an operator list. */
export interface GState {
  ctm: Matrix;
  lineWidth: number;
  stroke: string | null;
}

/** Parse `#rgb`/`#rrggbb` into perceptual lightness in [0, 1]. Non-hex → 0. */
export function lightnessOf(css: string | null): number {
  if (!css || css[0] !== "#") return 0;
  let r: number, g: number, b: number;
  if (css.length === 4) {
    r = parseInt(css[1]! + css[1]!, 16);
    g = parseInt(css[2]! + css[2]!, 16);
    b = parseInt(css[3]! + css[3]!, 16);
  } else if (css.length === 7) {
    r = parseInt(css.slice(1, 3), 16);
    g = parseInt(css.slice(3, 5), 16);
    b = parseInt(css.slice(5, 7), 16);
  } else {
    return 0;
  }
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return 0;
  // Rec. 709 luma. The grid/trace split is fundamentally a lightness question:
  // grids print in a pale wash, traces in near-black.
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Uniform scale implied by a matrix, for converting line widths to device units. */
export function matrixScale(m: Matrix): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
}

/** Apply a PDF matrix to a point. */
export function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/**
 * Target chord length when flattening curves, in device units (PDF points at
 * scale 1).
 *
 * 0.4 pt is about 0.14 mm, i.e. 0.014 mV at standard gain — comfortably below
 * the ~0.01 mV precision the vector path aims for, so flattening is not the
 * limiting error term. Curves are rare in ECG content streams (carts mostly emit
 * `lineTo`), so the extra points cost little.
 */
const FLATTEN_CHORD = 0.4;

/** Hard cap on subdivisions, so a pathological control polygon cannot hang us. */
const FLATTEN_MAX = 256;

/**
 * Flatten a cubic Bézier into line segments appended to `out`.
 *
 * Segment count follows the control-polygon length so long sweeping curves get
 * more points than short ones. ECG traces are usually pure `lineTo`, but some
 * carts emit smoothed curves, and under-sampling one would round off the R-wave
 * peak and bias amplitude measurements low.
 */
export function flattenCubic(
  out: number[],
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
): void {
  const hull = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) +
    Math.hypot(x3 - x2, y3 - y2);
  const n = Math.min(FLATTEN_MAX, Math.max(2, Math.ceil(hull / FLATTEN_CHORD)));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    out.push(a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3);
  }
}

/** Flatten a quadratic Bézier by promoting it to a cubic. */
export function flattenQuadratic(
  out: number[],
  x0: number, y0: number,
  cx: number, cy: number,
  x1: number, y1: number,
): void {
  flattenCubic(
    out,
    x0, y0,
    x0 + (2 / 3) * (cx - x0), y0 + (2 / 3) * (cy - y0),
    x1 + (2 / 3) * (cx - x1), y1 + (2 / 3) * (cy - y1),
    x1, y1,
  );
}

/** Turn a finished subpath's device-space points into a `Polyline`. */
export function sealSubpath(pts: number[], gs: GState, scale: number): Polyline | null {
  if (pts.length < 4) return null; // need two points to make a line

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let length = 0;
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i]!, y = pts[i + 1]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (i >= 2) length += Math.hypot(x - pts[i - 2]!, y - pts[i - 1]!);
  }

  return {
    points: Float64Array.from(pts),
    stroke: gs.stroke,
    strokeLightness: lightnessOf(gs.stroke),
    lineWidth: gs.lineWidth * scale,
    minX, minY, maxX, maxY,
    length,
  };
}

/**
 * Decode one `constructPath` payload into device-space polylines.
 *
 * The payload is `[op, ...coords, op, ...coords]`; each `moveTo` starts a new
 * subpath. Coordinates arrive in user space and are transformed by `gs.ctm`.
 */
export function decodePath(flat: ArrayLike<number>, gs: GState, out: Polyline[]): void {
  const m = gs.ctm;
  const scale = matrixScale(m);
  const tx = (x: number, y: number) => applyMatrix(m, x, y);

  let pts: number[] = [];
  // Current point in *user* space — the Bézier start point.
  let cx = 0, cy = 0;
  let startX = 0, startY = 0;

  const flush = () => {
    const poly = sealSubpath(pts, gs, scale);
    if (poly) out.push(poly);
    pts = [];
  };

  for (let i = 0; i < flat.length;) {
    const op = flat[i++]!;
    switch (op) {
      case DrawOPS.moveTo: {
        flush();
        cx = flat[i++]!;
        cy = flat[i++]!;
        startX = cx;
        startY = cy;
        pts.push(...tx(cx, cy));
        break;
      }
      case DrawOPS.lineTo: {
        cx = flat[i++]!;
        cy = flat[i++]!;
        pts.push(...tx(cx, cy));
        break;
      }
      case DrawOPS.curveTo: {
        const x1 = flat[i++]!, y1 = flat[i++]!;
        const x2 = flat[i++]!, y2 = flat[i++]!;
        const x3 = flat[i++]!, y3 = flat[i++]!;
        // Flatten in device space so segment count reflects rendered size.
        const [dx0, dy0] = tx(cx, cy);
        const [dx1, dy1] = tx(x1, y1);
        const [dx2, dy2] = tx(x2, y2);
        const [dx3, dy3] = tx(x3, y3);
        if (pts.length === 0) pts.push(dx0, dy0);
        flattenCubic(pts, dx0, dy0, dx1, dy1, dx2, dy2, dx3, dy3);
        cx = x3;
        cy = y3;
        break;
      }
      case DrawOPS.quadraticCurveTo: {
        const x1 = flat[i++]!, y1 = flat[i++]!;
        const x2 = flat[i++]!, y2 = flat[i++]!;
        const [dx0, dy0] = tx(cx, cy);
        const [dx1, dy1] = tx(x1, y1);
        const [dx2, dy2] = tx(x2, y2);
        if (pts.length === 0) pts.push(dx0, dy0);
        flattenQuadratic(pts, dx0, dy0, dx1, dy1, dx2, dy2);
        cx = x2;
        cy = y2;
        break;
      }
      case DrawOPS.closePath: {
        if (pts.length >= 2) pts.push(...tx(startX, startY));
        cx = startX;
        cy = startY;
        break;
      }
      default: {
        // Unknown opcode: without its arity the rest of the payload cannot be
        // parsed, so stop rather than emit garbage coordinates.
        const arity = DRAW_OP_ARITY[op];
        if (arity === undefined) {
          flush();
          return;
        }
        i += arity;
      }
    }
  }
  flush();
}

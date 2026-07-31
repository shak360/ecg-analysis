/**
 * Tests for PDF path decoding.
 *
 * These run outside a browser against `path-decode.ts`, which is why that module
 * carries no pdf.js import. The pdf.js-dependent operator-list walk is covered
 * end-to-end by `web/dev.html` against real fixture PDFs.
 */
import { expect, test } from "vitest";
import { assertDefined } from "./helpers.ts";
import {
  decodePath,
  DrawOPS,
  type GState,
  lightnessOf,
  type Matrix,
  matrixScale,
  type Polyline,
} from "../web/src/ingest/path-decode.ts";

/** Identity-ish state: no transform, black stroke. */
function gs(ctm: Matrix = [1, 0, 0, 1, 0, 0]): GState {
  return { ctm, lineWidth: 1, stroke: "#000000" };
}

function decode(flat: number[], state = gs()): Polyline[] {
  const out: Polyline[] = [];
  decodePath(flat, state, out);
  return out;
}

test("decodes a simple two-point line", () => {
  const [p] = decode([DrawOPS.moveTo, 10, 20, DrawOPS.lineTo, 30, 40]);
  assertDefined(p);
  expect(Array.from(p.points)).toEqual([10, 20, 30, 40]);
  expect(Math.abs((p.length) - (Math.hypot(20, 20)))).toBeLessThanOrEqual(1e-9);
  expect(p.minX).toEqual(10);
  expect(p.maxY).toEqual(40);
});

test("each moveTo starts a new subpath", () => {
  const polys = decode([
    DrawOPS.moveTo, 0, 0, DrawOPS.lineTo, 10, 0,
    DrawOPS.moveTo, 0, 5, DrawOPS.lineTo, 10, 5,
  ]);
  expect(polys.length).toEqual(2);
  expect(Array.from(polys[0]!.points)).toEqual([0, 0, 10, 0]);
  expect(Array.from(polys[1]!.points)).toEqual([0, 5, 10, 5]);
});

test("a lone moveTo produces no polyline", () => {
  // A single point has no length and must not become a zero-length trace that
  // later pollutes grid-pitch statistics.
  expect(decode([DrawOPS.moveTo, 3, 4]).length).toEqual(0);
});

test("applies the CTM to every point", () => {
  // Scale by 2, translate by (100, 50).
  const [p] = decode(
    [DrawOPS.moveTo, 1, 1, DrawOPS.lineTo, 2, 3],
    gs([2, 0, 0, 2, 100, 50]),
  );
  assertDefined(p);
  expect(Array.from(p.points)).toEqual([102, 52, 104, 56]);
});

test("CTM with a y-flip matches PDF-to-device convention", () => {
  // pdf.js viewport transforms look like [1, 0, 0, -1, 0, height].
  const [p] = decode(
    [DrawOPS.moveTo, 0, 0, DrawOPS.lineTo, 10, 100],
    gs([1, 0, 0, -1, 0, 595]),
  );
  assertDefined(p);
  // y=0 (PDF bottom) maps to the device bottom; y=100 maps upward.
  expect(Array.from(p.points)).toEqual([0, 595, 10, 495]);
});

test("closePath returns to the subpath start", () => {
  const [p] = decode([
    DrawOPS.moveTo, 0, 0,
    DrawOPS.lineTo, 10, 0,
    DrawOPS.lineTo, 10, 10,
    DrawOPS.closePath,
  ]);
  assertDefined(p);
  expect(Array.from(p.points)).toEqual([0, 0, 10, 0, 10, 10, 0, 0]);
});

test("flattens a cubic Bezier onto the curve", () => {
  // A straight-line "curve" must stay straight after flattening.
  const [p] = decode([
    DrawOPS.moveTo, 0, 0,
    DrawOPS.curveTo, 10, 0, 20, 0, 30, 0,
  ]);
  assertDefined(p);
  expect(p.points.length / 2 > 4, "should subdivide into several points").toBeTruthy();
  for (let i = 1; i < p.points.length; i += 2) {
    expect(Math.abs((p.points[i]!) - (0))).toBeLessThanOrEqual(1e-9);
  }
  expect(Math.abs((p.points[p.points.length - 2]!) - (30))).toBeLessThanOrEqual(1e-9);
});

/**
 * Distance from a point to a polyline.
 *
 * Measured against the *segments*, not the vertices: the flattener samples at
 * `t = i/n`, so for odd `n` no vertex lands on the curve's midpoint even though
 * the rendered line passes right through it. Vertex distance would measure
 * sampling phase; segment distance measures the approximation error we care about.
 */
function distanceToPolyline(pts: Float64Array, px: number, py: number): number {
  let best = Infinity;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i]!, ay = pts[i + 1]!, bx = pts[i + 2]!, by = pts[i + 3]!;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return best;
}

test("cubic flattening tracks the true curve", () => {
  const [p] = decode([
    DrawOPS.moveTo, 0, 0,
    DrawOPS.curveTo, 0, 10, 10, 10, 10, 0,
  ]);
  assertDefined(p);
  // At t=0.5 this cubic sits at (5, 7.5).
  const err = distanceToPolyline(p.points, 5, 7.5);
  expect(err < 0.05, `flattened cubic deviates from its midpoint by ${err}`).toBeTruthy();
});

test("quadratic Bezier is promoted correctly", () => {
  const [p] = decode([
    DrawOPS.moveTo, 0, 0,
    DrawOPS.quadraticCurveTo, 5, 10, 10, 0,
  ]);
  assertDefined(p);
  // Quadratic apex at t=0.5 is (5, 5); degree elevation must preserve it.
  const err = distanceToPolyline(p.points, 5, 5);
  expect(err < 0.05, `quadratic deviates from its apex by ${err}`).toBeTruthy();
  // Endpoints must be exact regardless of subdivision.
  expect(Math.abs((p.points[0]!) - (0))).toBeLessThanOrEqual(1e-9);
  expect(Math.abs((p.points[p.points.length - 2]!) - (10))).toBeLessThanOrEqual(1e-9);
  expect(Math.abs((p.points[p.points.length - 1]!) - (0))).toBeLessThanOrEqual(1e-9);
});

test("flattening is fine enough not to clip an R-wave peak", () => {
  // A tall narrow curve standing in for a QRS. Under-flattening would cut the
  // apex and bias the reported R amplitude low, so bound the error in mV terms:
  // at 10 mm/mV, 0.1 mV is 1 mm is 2.83 pt. We need to be far inside that.
  const [p] = decode([
    DrawOPS.moveTo, 0, 0,
    DrawOPS.curveTo, 2, -40, 4, -40, 6, 0,
  ]);
  assertDefined(p);
  // Apex of this symmetric cubic at t=0.5 is (3, -30).
  const err = distanceToPolyline(p.points, 3, -30);
  const errMv = (err / (72 / 25.4)) / 10; // pt -> mm -> mV at 10 mm/mV
  expect(errMv < 0.002, `peak clipped by ${errMv.toFixed(4)} mV (${err.toFixed(3)} pt)`).toBeTruthy();
});

test("an unknown opcode truncates rather than emitting garbage", () => {
  // Losing the tail of a path is recoverable; misreading coordinates as opcodes
  // would silently fabricate a waveform.
  const polys = decode([
    DrawOPS.moveTo, 0, 0, DrawOPS.lineTo, 10, 10,
    99, 1, 2, 3,
  ]);
  expect(polys.length).toEqual(1);
  expect(Array.from(polys[0]!.points)).toEqual([0, 0, 10, 10]);
});

test("line width is scaled into device units", () => {
  const out: Polyline[] = [];
  decodePath(
    [DrawOPS.moveTo, 0, 0, DrawOPS.lineTo, 1, 0],
    { ctm: [3, 0, 0, 3, 0, 0], lineWidth: 2, stroke: "#000" },
    out,
  );
  expect(Math.abs((out[0]!.lineWidth) - (6))).toBeLessThanOrEqual(1e-9);
});

test("matrixScale uses the determinant, not a single axis", () => {
  expect(Math.abs((matrixScale([2, 0, 0, 2, 0, 0])) - (2))).toBeLessThanOrEqual(1e-9);
  expect(Math.abs((matrixScale([1, 0, 0, -1, 0, 500])) - (1))).toBeLessThanOrEqual(1e-9);
  // Rotation by 90 degrees preserves scale.
  expect(Math.abs((matrixScale([0, 1, -1, 0, 0, 0])) - (1))).toBeLessThanOrEqual(1e-9);
  // Degenerate matrices must not yield 0 and blow up downstream division.
  expect(matrixScale([0, 0, 0, 0, 0, 0])).toEqual(1);
});

test("lightness separates grid wash from trace ink", () => {
  expect(Math.abs((lightnessOf("#000000")) - (0))).toBeLessThanOrEqual(1e-9);
  expect(Math.abs((lightnessOf("#ffffff")) - (1))).toBeLessThanOrEqual(1e-9);
  // The pale pink of ECG paper must read as light...
  expect(lightnessOf("#fac7c7") > 0.75).toBeTruthy();
  // ...and near-black trace ink as dark.
  expect(lightnessOf("#0d0d17") < 0.1).toBeTruthy();
  // Shorthand hex is accepted.
  expect(Math.abs((lightnessOf("#fff")) - (1))).toBeLessThanOrEqual(1e-9);
  // Unparseable input must not throw.
  expect(lightnessOf(null)).toEqual(0);
  expect(lightnessOf("rgb(1,2,3)")).toEqual(0);
});

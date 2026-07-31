/**
 * Tests for PDF path decoding.
 *
 * These run outside a browser against `path-decode.ts`, which is why that module
 * carries no pdf.js import. The pdf.js-dependent operator-list walk is covered
 * end-to-end by `web/dev.html` against real fixture PDFs.
 */
import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
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

Deno.test("decodes a simple two-point line", () => {
  const [p] = decode([DrawOPS.moveTo, 10, 20, DrawOPS.lineTo, 30, 40]);
  assert(p);
  assertEquals(Array.from(p.points), [10, 20, 30, 40]);
  assertAlmostEquals(p.length, Math.hypot(20, 20), 1e-9);
  assertEquals(p.minX, 10);
  assertEquals(p.maxY, 40);
});

Deno.test("each moveTo starts a new subpath", () => {
  const polys = decode([
    DrawOPS.moveTo, 0, 0, DrawOPS.lineTo, 10, 0,
    DrawOPS.moveTo, 0, 5, DrawOPS.lineTo, 10, 5,
  ]);
  assertEquals(polys.length, 2);
  assertEquals(Array.from(polys[0]!.points), [0, 0, 10, 0]);
  assertEquals(Array.from(polys[1]!.points), [0, 5, 10, 5]);
});

Deno.test("a lone moveTo produces no polyline", () => {
  // A single point has no length and must not become a zero-length trace that
  // later pollutes grid-pitch statistics.
  assertEquals(decode([DrawOPS.moveTo, 3, 4]).length, 0);
});

Deno.test("applies the CTM to every point", () => {
  // Scale by 2, translate by (100, 50).
  const [p] = decode(
    [DrawOPS.moveTo, 1, 1, DrawOPS.lineTo, 2, 3],
    gs([2, 0, 0, 2, 100, 50]),
  );
  assert(p);
  assertEquals(Array.from(p.points), [102, 52, 104, 56]);
});

Deno.test("CTM with a y-flip matches PDF-to-device convention", () => {
  // pdf.js viewport transforms look like [1, 0, 0, -1, 0, height].
  const [p] = decode(
    [DrawOPS.moveTo, 0, 0, DrawOPS.lineTo, 10, 100],
    gs([1, 0, 0, -1, 0, 595]),
  );
  assert(p);
  // y=0 (PDF bottom) maps to the device bottom; y=100 maps upward.
  assertEquals(Array.from(p.points), [0, 595, 10, 495]);
});

Deno.test("closePath returns to the subpath start", () => {
  const [p] = decode([
    DrawOPS.moveTo, 0, 0,
    DrawOPS.lineTo, 10, 0,
    DrawOPS.lineTo, 10, 10,
    DrawOPS.closePath,
  ]);
  assert(p);
  assertEquals(Array.from(p.points), [0, 0, 10, 0, 10, 10, 0, 0]);
});

Deno.test("flattens a cubic Bezier onto the curve", () => {
  // A straight-line "curve" must stay straight after flattening.
  const [p] = decode([
    DrawOPS.moveTo, 0, 0,
    DrawOPS.curveTo, 10, 0, 20, 0, 30, 0,
  ]);
  assert(p);
  assert(p.points.length / 2 > 4, "should subdivide into several points");
  for (let i = 1; i < p.points.length; i += 2) {
    assertAlmostEquals(p.points[i]!, 0, 1e-9);
  }
  assertAlmostEquals(p.points[p.points.length - 2]!, 30, 1e-9);
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

Deno.test("cubic flattening tracks the true curve", () => {
  const [p] = decode([
    DrawOPS.moveTo, 0, 0,
    DrawOPS.curveTo, 0, 10, 10, 10, 10, 0,
  ]);
  assert(p);
  // At t=0.5 this cubic sits at (5, 7.5).
  const err = distanceToPolyline(p.points, 5, 7.5);
  assert(err < 0.05, `flattened cubic deviates from its midpoint by ${err}`);
});

Deno.test("quadratic Bezier is promoted correctly", () => {
  const [p] = decode([
    DrawOPS.moveTo, 0, 0,
    DrawOPS.quadraticCurveTo, 5, 10, 10, 0,
  ]);
  assert(p);
  // Quadratic apex at t=0.5 is (5, 5); degree elevation must preserve it.
  const err = distanceToPolyline(p.points, 5, 5);
  assert(err < 0.05, `quadratic deviates from its apex by ${err}`);
  // Endpoints must be exact regardless of subdivision.
  assertAlmostEquals(p.points[0]!, 0, 1e-9);
  assertAlmostEquals(p.points[p.points.length - 2]!, 10, 1e-9);
  assertAlmostEquals(p.points[p.points.length - 1]!, 0, 1e-9);
});

Deno.test("flattening is fine enough not to clip an R-wave peak", () => {
  // A tall narrow curve standing in for a QRS. Under-flattening would cut the
  // apex and bias the reported R amplitude low, so bound the error in mV terms:
  // at 10 mm/mV, 0.1 mV is 1 mm is 2.83 pt. We need to be far inside that.
  const [p] = decode([
    DrawOPS.moveTo, 0, 0,
    DrawOPS.curveTo, 2, -40, 4, -40, 6, 0,
  ]);
  assert(p);
  // Apex of this symmetric cubic at t=0.5 is (3, -30).
  const err = distanceToPolyline(p.points, 3, -30);
  const errMv = (err / (72 / 25.4)) / 10; // pt -> mm -> mV at 10 mm/mV
  assert(errMv < 0.002, `peak clipped by ${errMv.toFixed(4)} mV (${err.toFixed(3)} pt)`);
});

Deno.test("an unknown opcode truncates rather than emitting garbage", () => {
  // Losing the tail of a path is recoverable; misreading coordinates as opcodes
  // would silently fabricate a waveform.
  const polys = decode([
    DrawOPS.moveTo, 0, 0, DrawOPS.lineTo, 10, 10,
    99, 1, 2, 3,
  ]);
  assertEquals(polys.length, 1);
  assertEquals(Array.from(polys[0]!.points), [0, 0, 10, 10]);
});

Deno.test("line width is scaled into device units", () => {
  const out: Polyline[] = [];
  decodePath(
    [DrawOPS.moveTo, 0, 0, DrawOPS.lineTo, 1, 0],
    { ctm: [3, 0, 0, 3, 0, 0], lineWidth: 2, stroke: "#000" },
    out,
  );
  assertAlmostEquals(out[0]!.lineWidth, 6, 1e-9);
});

Deno.test("matrixScale uses the determinant, not a single axis", () => {
  assertAlmostEquals(matrixScale([2, 0, 0, 2, 0, 0]), 2, 1e-9);
  assertAlmostEquals(matrixScale([1, 0, 0, -1, 0, 500]), 1, 1e-9);
  // Rotation by 90 degrees preserves scale.
  assertAlmostEquals(matrixScale([0, 1, -1, 0, 0, 0]), 1, 1e-9);
  // Degenerate matrices must not yield 0 and blow up downstream division.
  assertEquals(matrixScale([0, 0, 0, 0, 0, 0]), 1);
});

Deno.test("lightness separates grid wash from trace ink", () => {
  assertAlmostEquals(lightnessOf("#000000"), 0, 1e-9);
  assertAlmostEquals(lightnessOf("#ffffff"), 1, 1e-9);
  // The pale pink of ECG paper must read as light...
  assert(lightnessOf("#fac7c7") > 0.75);
  // ...and near-black trace ink as dark.
  assert(lightnessOf("#0d0d17") < 0.1);
  // Shorthand hex is accepted.
  assertAlmostEquals(lightnessOf("#fff"), 1, 1e-9);
  // Unparseable input must not throw.
  assertEquals(lightnessOf(null), 0);
  assertEquals(lightnessOf("rgb(1,2,3)"), 0);
});

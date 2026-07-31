/**
 * Tests for grid/trace classification and grid-pitch estimation.
 *
 * Pitch estimation is load-bearing for clinical correctness: the lattice is 1 mm
 * by definition, so its measured pitch is what converts page coordinates into
 * millivolts. A systematic error here scales every amplitude the app reports.
 */
import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import { classifyPolylines } from "../web/src/ingest/classify.ts";
import type { Polyline } from "../web/src/ingest/path-decode.ts";

/** Build a Polyline from interleaved coordinates. */
function poly(points: number[], stroke = "#000000", lineWidth = 0.5): Polyline {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, length = 0;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i]!, y = points[i + 1]!;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    if (i >= 2) length += Math.hypot(x - points[i - 2]!, y - points[i - 1]!);
  }
  return {
    points: Float64Array.from(points),
    stroke,
    strokeLightness: 0,
    lineWidth,
    minX, minY, maxX, maxY,
    length,
  };
}

/** A lattice of straight rules at `pitch` spacing, like real ECG paper. */
function lattice(pitch: number, count: number, span: number): Polyline[] {
  const out: Polyline[] = [];
  for (let i = 0; i < count; i++) {
    const p = i * pitch;
    out.push(poly([p, 0, p, span])); // vertical
    out.push(poly([0, p, span, p])); // horizontal
  }
  return out;
}

/** A wiggly many-segment path standing in for an ECG trace. */
function trace(x0: number, y0: number, width: number, n = 200): Polyline {
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    pts.push(x0 + (i / n) * width, y0 + Math.sin(i / 4) * 8);
  }
  return poly(pts);
}

Deno.test("separates gridlines from traces", () => {
  const input = [...lattice(2.8346, 40, 120), trace(0, 60, 100)];
  const c = classifyPolylines(input);
  assertEquals(c.traces.length, 1);
  assertEquals(c.grid.length, 80);
  assertEquals(c.other.length, 0);
});

Deno.test("recovers lattice pitch exactly", () => {
  const c = classifyPolylines(lattice(2.8346, 40, 120));
  assert(c.gridPitch, "expected a pitch estimate");
  assertAlmostEquals(c.gridPitch.x, 2.8346, 1e-6);
  assertAlmostEquals(c.gridPitch.y, 2.8346, 1e-6);
});

Deno.test("survives a mixed 1 mm and 5 mm lattice", () => {
  // Real paper draws heavy 5 mm rules on top of light 1 mm rules, so the
  // position list contains near-duplicates. The 1 mm pitch must still win.
  const pitch = 2.8346;
  const input = lattice(pitch, 40, 120);
  for (let i = 0; i < 40; i += 5) {
    const p = i * pitch + 0.02; // heavy rule, marginally offset
    input.push(poly([p, 0, p, 120], "#e08a8a", 0.6));
    input.push(poly([0, p, 120, p], "#e08a8a", 0.6));
  }
  const c = classifyPolylines(input);
  assert(c.gridPitch);
  assertAlmostEquals(c.gridPitch.x, pitch, 0.02);
  assertAlmostEquals(c.gridPitch.y, pitch, 0.02);
});

Deno.test("pitch estimate tolerates missing gridlines", () => {
  // Faint or clipped rules leave gaps; the median gap must ignore them.
  const pitch = 2.8346;
  const all = lattice(pitch, 40, 120);
  const kept = all.filter((_, i) => i % 9 !== 0);
  const c = classifyPolylines(kept);
  assert(c.gridPitch);
  assertAlmostEquals(c.gridPitch.x, pitch, 0.05);
});

Deno.test("returns null pitch when there is no lattice", () => {
  const c = classifyPolylines([trace(0, 50, 200)]);
  assertEquals(c.gridPitch, null);
  assertEquals(c.traces.length, 1);
});

Deno.test("a short step-shaped path is neither grid nor trace", () => {
  // This is the calibration pulse: dark, few segments, spans x and y. It must
  // not be mistaken for a waveform, or it would corrupt the median beat.
  const cal = poly([0, 20, 2, 20, 2, 10, 7, 10, 7, 20, 9, 20]);
  const c = classifyPolylines([...lattice(2.8346, 40, 120), cal]);
  assertEquals(c.traces.length, 0);
  assertEquals(c.other.length, 1);
});

Deno.test("a steep many-segment path is a trace, not a gridline", () => {
  // A QRS upstroke is momentarily near-vertical. Segment count is what
  // distinguishes it from a rule, and getting this wrong would delete the QRS.
  const pts: number[] = [];
  for (let i = 0; i <= 100; i++) pts.push(50 + i * 0.001, i * 0.5);
  const steep = poly(pts);
  const c = classifyPolylines([...lattice(2.8346, 40, 120), steep]);
  // Narrow span keeps it out of `traces`, but it must never land in `grid`
  // where it would corrupt the pitch estimate.
  assertEquals(c.grid.length, 80);
  assert(c.gridPitch);
  assertAlmostEquals(c.gridPitch.x, 2.8346, 1e-6);
});

Deno.test("classification is exhaustive", () => {
  const input = [...lattice(2.8346, 20, 60), trace(0, 30, 50), poly([0, 0, 1, 1])];
  const c = classifyPolylines(input);
  assertEquals(c.grid.length + c.traces.length + c.other.length, input.length);
});

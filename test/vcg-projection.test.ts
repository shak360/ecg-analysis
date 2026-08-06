/**
 * The projection, which is where a sign error would hide.
 *
 * `projectPlane` is the only place the orthogonal leads become screen
 * coordinates. A flipped sign there does not draw anything broken — it draws a
 * smooth loop running the wrong way round, and rotation sense *is* the reading:
 * a normal horizontal QRS loop is counterclockwise, while clockwise is the
 * pattern of posterior infarction and right ventricular hypertrophy.
 *
 * So these tests pin directions in words a clinician would use, not just
 * numbers: leftward must go right on screen, inferior must go down.
 */
import { expect, test } from "vitest";

import {
  loopExtent,
  loopSpan,
  project3d,
  projectPlane,
} from "../web/src/ui/vcg-loops.ts";
import type { VcgPlane, VcgSnapshot } from "../web/src/engine/protocol.ts";

/** The plane definitions as the engine emits them. */
const PLANES: VcgPlane[] = [
  {
    id: "frontal",
    label: "Frontal",
    horizontal: { axis: "x", sign: 1, positiveLabel: "left" },
    vertical: { axis: "y", sign: 1, positiveLabel: "inferior" },
  },
  {
    id: "horizontal",
    label: "Horizontal (transverse)",
    horizontal: { axis: "x", sign: 1, positiveLabel: "left" },
    vertical: { axis: "z", sign: 1, positiveLabel: "posterior" },
  },
  {
    id: "sagittal",
    label: "Left sagittal",
    horizontal: { axis: "z", sign: -1, positiveLabel: "anterior" },
    vertical: { axis: "y", sign: 1, positiveLabel: "inferior" },
  },
];

const byId = (id: string) => PLANES.find((p) => p.id === id)!;

test("a leftward vector goes right on screen in both planes that show X", () => {
  // X is left-positive; canvas u grows rightward. Anatomical left is drawn to
  // the reader's right, which is the convention every VCG figure uses.
  for (const id of ["frontal", "horizontal"]) {
    const p = projectPlane(byId(id), 1, 0, 0);
    expect(p.u, `${id}: leftward must project rightward`).toBeGreaterThan(0);
  }
});

test("an inferior vector goes down on screen", () => {
  // Frank Y is inferior-positive and canvas v grows downward, so these two
  // conventions agree and the sign passes straight through. Two flips that
  // cancel — worth a test so nobody "fixes" one of them.
  for (const id of ["frontal", "sagittal"]) {
    const p = projectPlane(byId(id), 0, 1, 0);
    expect(p.v, `${id}: inferior must project downward`).toBeGreaterThan(0);
  }
});

test("posterior is down in the horizontal plane and left in the sagittal", () => {
  // Z is posterior-positive. The horizontal plane keeps that sign; the sagittal
  // plane inverts it so that *anterior* is to the reader's right. If those two
  // ever agreed, one of the planes would be mirrored front-to-back.
  expect(projectPlane(byId("horizontal"), 0, 0, 1).v).toBeGreaterThan(0);
  expect(projectPlane(byId("sagittal"), 0, 0, 1).u).toBeLessThan(0);
});

test("exactly one axis across the three planes is inverted", () => {
  const signs = PLANES.flatMap((p) => [p.horizontal.sign, p.vertical.sign]);
  expect(signs.filter((s) => s === -1)).toHaveLength(1);
});

test("no plane plots one lead against itself", () => {
  for (const p of PLANES) {
    expect(p.horizontal.axis, `${p.id} is degenerate`).not.toBe(p.vertical.axis);
  }
});

test("a rotation reverses when the vertical sign flips, which is the diagnosis", () => {
  // Walk a quarter turn and check the on-screen sweep changes hand when the
  // sign does. This is the concrete failure the sign conventions guard against.
  const plane = byId("horizontal");
  const mirrored: VcgPlane = { ...plane, vertical: { ...plane.vertical, sign: -1 } };

  const a = projectPlane(plane, 1, 0, 0);
  const b = projectPlane(plane, 0, 0, 1);
  const cross = a.u * b.v - a.v * b.u;

  const ma = projectPlane(mirrored, 1, 0, 0);
  const mb = projectPlane(mirrored, 0, 0, 1);
  const mcross = ma.u * mb.v - ma.v * mb.u;

  expect(Math.sign(cross)).toBe(-Math.sign(mcross));
});

// --- scaling ---------------------------------------------------------------

function snap(over: Partial<VcgSnapshot> = {}): VcgSnapshot {
  const n = 20;
  return {
    studyId: "t",
    beats: new Map(),
    x: new Float32Array(n),
    y: new Float32Array(n),
    z: new Float32Array(n),
    qrsOnset: 2,
    qrsOffset: 8,
    tOffset: 16,
    anchorIndex: 5,
    frameLen: n,
    fsHz: 500,
    refusal: null,
    notes: [],
    alignmentSpreadMs: 0,
    planes: PLANES,
    ...over,
  };
}

test("the extent covers every axis, so one scale serves all three panels", () => {
  const s = snap();
  s.x[4] = 0.3;
  s.z[5] = 1.9; // the largest, and on the axis two panels share
  const e = loopExtent(s, 0, s.frameLen);
  expect(e).toBeGreaterThanOrEqual(1.9);
});

test("a flat loop still gets a usable scale rather than dividing by zero", () => {
  // Without a floor, an isoelectric loop scales noise to fill the panel and
  // draws something that looks like a finding.
  const e = loopExtent(snap(), 0, 20);
  expect(Number.isFinite(e)).toBe(true);
  expect(e).toBeGreaterThan(0);
});

test("the drawn span runs QRS onset to T offset, and survives missing fiducials", () => {
  expect(loopSpan(snap())).toEqual({ from: 2, to: 16 });
  // An unmeasurable fiducial is -1; the span must stay inside the frame rather
  // than indexing backwards off the start.
  const noT = loopSpan(snap({ tOffset: -1 }));
  expect(noT.from).toBeGreaterThanOrEqual(0);
  expect(noT.to).toBeLessThanOrEqual(20);
  const noQrs = loopSpan(snap({ qrsOnset: -1 }));
  expect(noQrs.from).toBeGreaterThanOrEqual(0);
  expect(noQrs.to).toBeGreaterThan(noQrs.from);
});

// --- the loop in space -----------------------------------------------------

test("with no rotation the 3D view is exactly the frontal plane", () => {
  // The two pictures must agree where they overlap. If they did not, a reader
  // turning the 3D loop back to square would find it disagreeing with the panel
  // directly above it, and neither would be obviously the wrong one.
  const flat = projectPlane(byId("frontal"), 0.7, -0.4, 0.9);
  const solid = project3d(0.7, -0.4, 0.9, { yaw: 0, pitch: 0 });
  expect(solid.u).toBeCloseTo(flat.u, 9);
  expect(solid.v).toBeCloseTo(flat.v, 9);
});

test("depth is the axis pointing away, and only that", () => {
  // Unrotated, Z is depth and neither X nor Y contributes to it.
  expect(project3d(0, 0, 1, { yaw: 0, pitch: 0 }).depth).toBeCloseTo(1, 9);
  expect(project3d(1, 0, 0, { yaw: 0, pitch: 0 }).depth).toBeCloseTo(0, 9);
  expect(project3d(0, 1, 0, { yaw: 0, pitch: 0 }).depth).toBeCloseTo(0, 9);
});

test("a quarter turn of yaw brings the posterior axis into view", () => {
  // Turn the body a quarter turn and what was pointing away is now across the
  // screen — this is what makes the horizontal plane fall out of the 3D view.
  const p = project3d(0, 0, 1, { yaw: Math.PI / 2, pitch: 0 });
  expect(p.u).toBeCloseTo(1, 9);
  expect(p.depth).toBeCloseTo(0, 9);
});

test("rotation preserves length, so no view can inflate a vector", () => {
  // The projection is orthographic and the rotation is rigid; a loop must not
  // get bigger because of where the reader turned it. This is the property that
  // would break if a perspective divide were ever added.
  const v: [number, number, number] = [0.6, -0.9, 0.35];
  const norm = Math.hypot(...v);
  for (const yaw of [0, 0.7, -1.9, 3.0]) {
    for (const pitch of [0, 0.4, -1.1]) {
      const p = project3d(v[0], v[1], v[2], { yaw, pitch });
      expect(Math.hypot(p.u, p.v, p.depth)).toBeCloseTo(norm, 6);
    }
  }
});

test("turning all the way round returns to where it started", () => {
  const a = project3d(0.3, 0.8, -0.5, { yaw: 0.4, pitch: 0.2 });
  const b = project3d(0.3, 0.8, -0.5, { yaw: 0.4 + 2 * Math.PI, pitch: 0.2 });
  expect(b.u).toBeCloseTo(a.u, 6);
  expect(b.v).toBeCloseTo(a.v, 6);
});

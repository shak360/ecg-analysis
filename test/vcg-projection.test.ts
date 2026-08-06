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
  arcball,
  axisEndLabels,
  defaultView,
  loopExtent,
  loopSpan,
  project3d,
  projectPlane,
  reorthonormalise,
  rotFromYawPitch,
  rotIdentity,
  rotFromPlane,
  rotMul,
} from "../web/src/ui/vcg-loops.ts";

/** A view at the named orientation, for the readable cases below. */
const at = (yaw: number, pitch: number) => ({ rot: rotFromYawPitch(yaw, pitch) });
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
    leadAxes: [],
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
  const solid = project3d(0.7, -0.4, 0.9, at(0, 0));
  expect(solid.u).toBeCloseTo(flat.u, 9);
  expect(solid.v).toBeCloseTo(flat.v, 9);
});

test("depth is the axis pointing away, and only that", () => {
  // Unrotated, Z is depth and neither X nor Y contributes to it.
  expect(project3d(0, 0, 1, at(0, 0)).depth).toBeCloseTo(1, 9);
  expect(project3d(1, 0, 0, at(0, 0)).depth).toBeCloseTo(0, 9);
  expect(project3d(0, 1, 0, at(0, 0)).depth).toBeCloseTo(0, 9);
});

test("a quarter turn of yaw brings the posterior axis into view", () => {
  // Turn the body a quarter turn and what was pointing away is now across the
  // screen — this is what makes the horizontal plane fall out of the 3D view.
  const p = project3d(0, 0, 1, at(Math.PI / 2, 0));
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
      const p = project3d(v[0], v[1], v[2], at(yaw, pitch));
      expect(Math.hypot(p.u, p.v, p.depth)).toBeCloseTo(norm, 6);
    }
  }
});

test("turning all the way round returns to where it started", () => {
  const a = project3d(0.3, 0.8, -0.5, at(0.4, 0.2));
  const b = project3d(0.3, 0.8, -0.5, at(0.4 + 2 * Math.PI, 0.2));
  expect(b.u).toBeCloseTo(a.u, 6);
  expect(b.v).toBeCloseTo(a.v, 6);
});


// --- the third degree of freedom -------------------------------------------

/** Is this matrix a rotation — orthonormal rows, right-handed? */
function isRotation(m: readonly number[]): boolean {
  const row = (i: number) => [m[i * 3]!, m[i * 3 + 1]!, m[i * 3 + 2]!];
  const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const [r0, r1, r2] = [row(0), row(1), row(2)];
  const unit = [r0, r1, r2].every((r) => Math.abs(Math.hypot(...r) - 1) < 1e-9);
  const perp = Math.abs(dot(r0, r1)) < 1e-9 && Math.abs(dot(r0, r2)) < 1e-9 &&
    Math.abs(dot(r1, r2)) < 1e-9;
  // Right-handed: r0 x r1 == r2, not -r2, so no view is a mirror image. A
  // mirrored loop reverses rotation sense, which is a different diagnosis.
  const cross = [
    r0[1]! * r1[2]! - r0[2]! * r1[1]!,
    r0[2]! * r1[0]! - r0[0]! * r1[2]!,
    r0[0]! * r1[1]! - r0[1]! * r1[0]!,
  ];
  return unit && perp && dot(cross, r2) > 0.999;
}

test("a drag across the rim produces roll, which yaw and pitch cannot", () => {
  // The whole reason this stopped being two angles. A yaw/pitch gimbal welds the
  // body's vertical axis to the screen's vertical, so the loop can face any
  // direction but never tilt. Rolling means the vertical axis leaves the screen's
  // vertical plane — that is exactly what no (yaw, pitch) pair can do.
  const roll = arcball({ x: 0.9, y: -0.45 }, { x: 0.45, y: 0.9 });
  const tilted = project3d(0, 1, 0, { rot: roll });
  expect(Math.abs(tilted.u), "the vertical axis never left the screen's vertical")
    .toBeGreaterThan(0.1);

  // And confirm the gimbal really cannot: under any yaw/pitch, the body's
  // vertical axis stays in the screen's vertical plane, so its `u` is zero.
  for (const yaw of [0, 0.9, -2.2, 3.1]) {
    for (const pitch of [0, 0.5, -1.2]) {
      expect(Math.abs(project3d(0, 1, 0, at(yaw, pitch)).u)).toBeLessThan(1e-9);
    }
  }
});

test("an arcball drag is always a rotation, never a mirror or a stretch", () => {
  for (const [a, b] of [
    [{ x: 0, y: 0 }, { x: 0.4, y: 0.2 }],
    [{ x: -0.7, y: 0.3 }, { x: 0.6, y: -0.8 }],
    [{ x: 1.4, y: 0.2 }, { x: -1.1, y: 0.9 }], // both outside the sphere
    [{ x: 0.2, y: 0.2 }, { x: 0.2, y: 0.2 }], // no movement at all
  ] as const) {
    expect(isRotation(arcball(a, b)), `${JSON.stringify(a)}→${JSON.stringify(b)}`).toBe(true);
  }
});

test("a still pointer rotates by nothing", () => {
  // `acos` of a dot product that floating point nudged past 1 would be NaN, and
  // a NaN matrix erases the loop. The clamp is what stops a click doing that.
  const m = arcball({ x: 0.3, y: -0.6 }, { x: 0.3, y: -0.6 });
  expect(m.every(Number.isFinite)).toBe(true);
  expect(m).toEqual(rotIdentity());
});

test("thousands of drags do not let the loop drift out of shape", () => {
  // Composing matrices accumulates error; unchecked it becomes a shear, and the
  // loop would slowly stretch into a shape the patient does not have.
  let m = rotIdentity();
  for (let i = 0; i < 4000; i++) {
    m = reorthonormalise(rotMul(arcball({ x: 0.11, y: 0.07 }, { x: 0.17, y: -0.05 }), m));
  }
  expect(isRotation(m), "the accumulated view is no longer a rotation").toBe(true);

  const before = Math.hypot(0.6, -0.9, 0.35);
  const p = project3d(0.6, -0.9, 0.35, { rot: m });
  expect(Math.hypot(p.u, p.v, p.depth)).toBeCloseTo(before, 6);
});


// --- looking down a plane --------------------------------------------------

test("snapping to a plane reproduces that plane exactly", () => {
  // The strongest form of this claim: for every plane, and for arbitrary
  // vectors, the 3D view at the snapped rotation and the flat panel agree to
  // floating point. A snap that merely looked close would leave the reader
  // comparing two pictures that disagree slightly for no stated reason.
  const vs: [number, number, number][] = [
    [1, 0, 0], [0, 1, 0], [0, 0, 1], [0.63, -0.21, 0.48], [-0.9, 0.4, -0.15],
  ];
  for (const plane of PLANES) {
    const rot = rotFromPlane(plane);
    for (const [x, y, z] of vs) {
      const flat = projectPlane(plane, x, y, z);
      const solid = project3d(x, y, z, { rot });
      expect(solid.u, `${plane.id} u`).toBeCloseTo(flat.u, 9);
      expect(solid.v, `${plane.id} v`).toBeCloseTo(flat.v, 9);
    }
  }
});

test("every plane snap is a right-handed rotation, so none mirrors the loop", () => {
  // The third row is a cross product precisely so this holds. If a snap were
  // left-handed the loop would come out mirrored, and a mirrored loop runs the
  // other way round — which is a different diagnosis, not a different view.
  for (const plane of PLANES) {
    expect(isRotation(rotFromPlane(plane)), plane.id).toBe(true);
  }
});

test("the frontal snap is the identity, since that is where the 3D view starts", () => {
  expect([...rotFromPlane(byId("frontal"))]).toEqual([...rotIdentity()]);
});

test("no two planes snap to the same view", () => {
  const seen = PLANES.map((p) => rotFromPlane(p).join(","));
  expect(new Set(seen).size).toBe(PLANES.length);
});

// --- which way the body faces ----------------------------------------------

test("the default view looks at the patient from in front", () => {
  // Asked directly, and worth pinning: at the opening orientation anterior must
  // come *toward* the reader and posterior go away, because that is what looking
  // at a patient means. A default that opened from behind would mirror every
  // loop's rotation sense relative to what a clinician expects, and nothing else
  // in the picture would say so.
  const v = defaultView();
  expect(project3d(0, 0, -1, v).depth, "anterior must come toward the viewer")
    .toBeLessThan(0);
  expect(project3d(0, 0, 1, v).depth, "posterior must go away from the viewer")
    .toBeGreaterThan(0);
});

test("both ends of every axis are named", () => {
  // An orthographic projection has no perspective cue, so a line through the
  // origin looks the same whichever end points at you. Labelling only the
  // positive end left the word "posterior" floating on an axis with no way to
  // tell it was the far end — which read as posterior coming out of the screen.
  const labels = axisEndLabels();
  for (const pair of [["left", "right"], ["inferior", "superior"], ["posterior", "anterior"]]) {
    for (const end of pair) {
      expect(labels, `${end} is never drawn`).toContain(end);
    }
  }
  expect(labels).toHaveLength(6);
});

test("each plane snap puts anterior where its own panel says it is", () => {
  // One concrete fact per plane, each taken from that panel's own labels rather
  // than from a rule I assumed applied to all three. My first attempt asserted
  // "anterior is to the right" everywhere and failed on the horizontal panel,
  // where anterior is *up* — the panel was right and the test was wrong.
  const frontal = rotFromPlane(byId("frontal"));
  expect(project3d(0, 0, -1, { rot: frontal }).depth, "frontal looks from the front")
    .toBeLessThan(0);

  // Horizontal: posterior is labelled downward, so anterior is up the screen.
  const horizontal = rotFromPlane(byId("horizontal"));
  expect(project3d(0, 0, -1, { rot: horizontal }).v).toBeLessThan(0);

  // Left sagittal: anterior is labelled to the right.
  const sagittal = rotFromPlane(byId("sagittal"));
  expect(project3d(0, 0, -1, { rot: sagittal }).u).toBeGreaterThan(0);
});

test("anterior and posterior always land on opposite sides of the origin", () => {
  for (const plane of [...PLANES.map(rotFromPlane), defaultView().rot]) {
    const a = project3d(0, 0, -1, { rot: plane });
    const p = project3d(0, 0, 1, { rot: plane });
    expect(a.u).toBeCloseTo(-p.u, 9);
    expect(a.v).toBeCloseTo(-p.v, 9);
    expect(a.depth).toBeCloseTo(-p.depth, 9);
  }
});

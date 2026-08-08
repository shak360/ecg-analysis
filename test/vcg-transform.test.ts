/**
 * The vectorcardiogram, across the engine boundary.
 *
 * `crates/ecg-core/src/vcg.rs` already pins the transform arithmetic. What this
 * covers is the part only reachable from JavaScript: that the refusals survive
 * the wasm boundary intact, and — the one that matters most — that a printout
 * is refused.
 *
 * A 3x4 printout's twelve leads are four *different* 2.5 second columns. A loop
 * built from them is smooth, plausible, and describes no beat that ever
 * happened. The synthetic fixtures here are real 3x4 printouts, so this is the
 * most important refusal firing on the most realistic input available.
 */
import { beforeAll, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { InlineEngine } from "../web/src/engine/client.ts";

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const DEFAULTS = { mmPerSec: 25, mmPerMv: 10 };

let engine: InlineEngine;

beforeAll(async () => {
  engine = new InlineEngine(readFileSync(at("../web/wasm/ecg_core_bg.wasm")));
  await engine.ready();
});

/** Twelve simultaneous leads of a plausible beat, as a WFDB record supplies. */
function simultaneous(fsHz = 500, seconds = 10): Map<string, Float32Array> {
  const n = fsHz * seconds;
  const rr = 60 / 68;
  const g = (dt: number, c: number, w: number, a: number) => {
    const z = (dt - c) / w;
    return a * Math.exp(-0.5 * z * z);
  };
  // Different amplitudes per lead, so X, Y and Z are not degenerate multiples
  // of one another and the loop has a real shape.
  //
  // The four derived limb leads are **not** in this table. Giving them their own
  // scale factors made a fixture that no cart could produce: three electrodes
  // give one plane, so III, aVR, aVL and aVF are fixed combinations of I and II,
  // and inventing independent amplitudes for them describes a body with more
  // than three limbs. It went unnoticed until the geometry gate refused this
  // fixture at 25%, which is the gate working — the fixture was the thing that
  // was wrong. They are derived below, as a cart derives them.
  const scale: Record<string, number> = {
    I: 0.7, II: 1.0,
    V1: -0.5, V2: -0.2, V3: 0.4, V4: 0.9, V5: 1.0, V6: 0.8,
  };
  const leads = new Map<string, Float32Array>();
  for (const [name, k] of Object.entries(scale)) {
    const v = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / fsHz;
      let peak = 0.4;
      let acc = 0;
      while (peak < seconds) {
        const dt = t - peak;
        if (dt > -0.45 && dt < 0.55) {
          acc += g(dt, -0.17, 0.022, 0.15) + g(dt, -0.026, 0.007, -0.05) +
            g(dt, 0, 0.011, 1.05) + g(dt, 0.028, 0.011, -0.08) +
            g(dt, 0.21, 0.048, 0.32);
        }
        peak += rr;
      }
      v[i] = acc * k;
    }
    leads.set(name, v);
  }

  const I = leads.get("I")!;
  const II = leads.get("II")!;
  const derive = (f: (a: number, b: number) => number): Float32Array => {
    const v = new Float32Array(n);
    for (let i = 0; i < n; i++) v[i] = f(I[i]!, II[i]!);
    return v;
  };
  leads.set("III", derive((a, b) => b - a));
  leads.set("aVR", derive((a, b) => -(a + b) / 2));
  leads.set("aVL", derive((a, b) => a - b / 2));
  leads.set("aVF", derive((a, b) => b - a / 2));
  return leads;
}

test("a printout is refused, because its leads were never simultaneous", async () => {
  const bytes = new Uint8Array(readFileSync(at("./fixtures/synthetic/serial-a-baseline.pdf")));
  await engine.analyse("printout", bytes, DEFAULTS);
  const v = await engine.vcg("printout");

  expect(v.refusal, "a 3x4 printout must not yield a loop").not.toBeNull();
  // Either reason is correct and both are about the printout: a column the
  // layout could not recover leaves leads missing; recovered columns are at
  // different offsets. What must never happen is a loop.
  expect(["NotSimultaneous", "LeadsMissing"]).toContain(v.refusal!.code);
  expect(v.refusal!.sentence.length).toBeGreaterThan(40);

  // Empty, not zero-filled. Zeros would draw a dot at the origin, and a null
  // vector is itself a finding.
  expect(v.x.length).toBe(0);
  expect(v.y.length).toBe(0);
  expect(v.z.length).toBe(0);

  await engine.release(["printout"]);
});

test("simultaneous leads yield three loops on the ensemble frame", async () => {
  await engine.analyseSignals("wfdb", simultaneous(), 500);
  const v = await engine.vcg("wfdb");

  expect(v.refusal, v.refusal?.sentence ?? "").toBeNull();
  expect(v.x.length).toBe(v.frameLen);
  expect(v.y.length).toBe(v.frameLen);
  expect(v.z.length).toBe(v.frameLen);

  // The cursor contract: one index addresses the tracing and the loop alike.
  expect(v.anchorIndex).toBeGreaterThan(0);
  expect(v.anchorIndex).toBeLessThan(v.frameLen);
  expect(v.fsHz).toBeGreaterThan(0);

  // A loop that never leaves the origin is not a loop.
  const extent = Math.max(...[...v.x, ...v.y, ...v.z].map(Math.abs));
  expect(extent).toBeGreaterThan(0.05);

  await engine.release(["wfdb"]);
});

test("a missing lead is refused and named, not quietly worked around", async () => {
  const leads = simultaneous();
  leads.delete("V3");
  await engine.analyseSignals("noV3", leads, 500);
  const v = await engine.vcg("noV3");

  expect(v.refusal?.code).toBe("LeadsMissing");
  expect(v.refusal!.leads).toContain("V3");
  expect(v.refusal!.sentence).toContain("V3");
  expect(v.x.length).toBe(0);

  await engine.release(["noV3"]);
});

test("the plane definitions cross the boundary and invert exactly one axis", async () => {
  await engine.analyseSignals("planes", simultaneous(), 500);
  const v = await engine.vcg("planes");

  expect(v.planes.map((p) => p.id).sort()).toEqual(["frontal", "horizontal", "sagittal"]);
  for (const p of v.planes) {
    expect(p.horizontal.axis).not.toBe(p.vertical.axis);
    expect(p.label.length).toBeGreaterThan(0);
  }
  // The sagittal plane reads Z backwards so anterior is to the right. If that
  // sign vanished, every loop would be mirrored front-to-back — which is not a
  // cosmetic difference but a different reading.
  const signs = v.planes.flatMap((p) => [p.horizontal.sign, p.vertical.sign]);
  expect(signs.filter((s) => s === -1).length).toBe(1);

  await engine.release(["planes"]);
});

test("asking for a study the engine does not hold fails loudly", async () => {
  await expect(engine.vcg("never-loaded")).rejects.toThrow(/not loaded/);
});

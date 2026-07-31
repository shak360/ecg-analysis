/**
 * Tests for the synthetic ECG generator.
 *
 * The fixtures are the ground truth the whole digitizer is measured against, so
 * they need to be correct in their own right. In particular the derived limb
 * leads must satisfy the Einthoven and Goldberger identities exactly — the
 * lead-assignment cross-check downstream verifies those same identities, and a
 * fixture that violated them would make a working check look broken.
 */
import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import { BEAT_TIMING, generateEcg, LEAD_IDS } from "../tools/synth/ecg.ts";

const BASE = {
  heartRateBpm: 60,
  durationSec: 10,
  sampleRateHz: 500,
  seed: 42,
};

Deno.test("produces all twelve leads at the requested length", () => {
  const ecg = generateEcg(BASE);
  assertEquals(Object.keys(ecg.leads).sort(), [...LEAD_IDS].sort());
  for (const lead of LEAD_IDS) {
    assertEquals(ecg.leads[lead].length, 5000, `${lead} wrong length`);
  }
});

Deno.test("Einthoven's law holds exactly: III = II - I", () => {
  const { leads } = generateEcg(BASE);
  for (let i = 0; i < leads.I.length; i++) {
    assertAlmostEquals(leads.III[i]!, leads.II[i]! - leads.I[i]!, 1e-5);
  }
});

Deno.test("Goldberger augmented leads are exact", () => {
  const { leads } = generateEcg(BASE);
  for (let i = 0; i < leads.I.length; i += 7) {
    const a = leads.I[i]!, b = leads.II[i]!;
    assertAlmostEquals(leads.aVR[i]!, -(a + b) / 2, 1e-5, `aVR at ${i}`);
    assertAlmostEquals(leads.aVL[i]!, a - b / 2, 1e-5, `aVL at ${i}`);
    assertAlmostEquals(leads.aVF[i]!, b - a / 2, 1e-5, `aVF at ${i}`);
  }
});

Deno.test("aVR is predominantly negative, as in any real ECG", () => {
  // This is the sanity check the lead-assignment step relies on, so the fixture
  // had better exhibit it.
  const { leads, rPeakTimesSec } = generateEcg(BASE);
  const at = (t: number) => leads.aVR[Math.round(t * 500)]!;
  for (const rp of rPeakTimesSec) {
    assert(at(rp) < 0, `aVR should be negative at the R peak (t=${rp}), got ${at(rp)}`);
  }
});

Deno.test("R peaks land where the generator says they do", () => {
  const ecg = generateEcg(BASE);
  const sig = ecg.leads.II;
  for (const rp of ecg.rPeakTimesSec) {
    const centre = Math.round(rp * ecg.sampleRateHz);
    // Search a ±40 ms window for the true maximum.
    let best = centre, bestV = -Infinity;
    for (let i = centre - 20; i <= centre + 20; i++) {
      if (i < 0 || i >= sig.length) continue;
      if (sig[i]! > bestV) {
        bestV = sig[i]!;
        best = i;
      }
    }
    const errMs = Math.abs(best - centre) * 2;
    assert(errMs <= 4, `R peak off by ${errMs} ms at t=${rp}`);
  }
});

Deno.test("heart rate determines beat count", () => {
  const slow = generateEcg({ ...BASE, heartRateBpm: 60 });
  const fast = generateEcg({ ...BASE, heartRateBpm: 120 });
  assertEquals(slow.rPeakTimesSec.length, 10);
  assertEquals(fast.rPeakTimesSec.length, 20);
});

Deno.test("ST shift appears only in the leads asked for", () => {
  const shift = 0.25;
  const ecg = generateEcg({ ...BASE, stShiftMv: { V2: shift, V3: shift } });
  const plain = generateEcg(BASE);

  // Sample the ST segment 60 ms past the J point of the first full beat.
  const rp = ecg.rPeakTimesSec[1]!;
  const idx = Math.round((rp + BEAT_TIMING.jPoint + 0.06) * 500);

  for (const lead of ["V2", "V3"] as const) {
    const delta = ecg.leads[lead][idx]! - plain.leads[lead][idx]!;
    assertAlmostEquals(delta, shift, 0.02, `${lead} should be elevated by ${shift} mV`);
  }
  for (const lead of ["I", "II", "V1", "V5", "V6"] as const) {
    const delta = Math.abs(ecg.leads[lead][idx]! - plain.leads[lead][idx]!);
    assert(delta < 0.01, `${lead} should be unchanged, moved ${delta} mV`);
  }
});

Deno.test("ST shift in a precordial lead does not leak into the limb leads", () => {
  // V-lead changes must not perturb I/II, or the derived limb leads would
  // silently inherit an artefact and the identity check would start failing.
  const ecg = generateEcg({ ...BASE, stShiftMv: { V2: 0.4 } });
  const plain = generateEcg(BASE);
  for (const lead of ["I", "II", "III", "aVR", "aVL", "aVF"] as const) {
    for (let i = 0; i < ecg.leads[lead].length; i += 13) {
      assertAlmostEquals(ecg.leads[lead][i]!, plain.leads[lead][i]!, 1e-6);
    }
  }
});

Deno.test("generation is deterministic for a given seed", () => {
  const a = generateEcg({ ...BASE, noiseMv: 0.03, wanderMv: 0.1, seed: 7 });
  const b = generateEcg({ ...BASE, noiseMv: 0.03, wanderMv: 0.1, seed: 7 });
  for (const lead of LEAD_IDS) {
    assertEquals(a.leads[lead], b.leads[lead], `${lead} differs between runs`);
  }
});

Deno.test("different seeds produce different noise", () => {
  const a = generateEcg({ ...BASE, noiseMv: 0.03, seed: 1 });
  const b = generateEcg({ ...BASE, noiseMv: 0.03, seed: 2 });
  assert(a.leads.II.some((v, i) => v !== b.leads.II[i]));
});

Deno.test("precordial leads show R-wave progression", () => {
  // R amplitude should grow from V1 to V4-V5; losing this is a serial finding
  // the app is meant to detect, so the baseline fixture must have it.
  const { leads, rPeakTimesSec } = generateEcg(BASE);
  const idx = Math.round(rPeakTimesSec[1]! * 500);
  const r = (l: "V1" | "V2" | "V3" | "V4" | "V5") => leads[l][idx]!;
  assert(r("V1") < r("V2"), "V1 should be smaller than V2");
  assert(r("V2") < r("V3"), "V2 should be smaller than V3");
  assert(r("V3") < r("V4"), "V3 should be smaller than V4");
  assert(r("V4") > 1.0, "V4 should be R-dominant");
});

Deno.test("clean signal has a flat isoelectric baseline", () => {
  // Registration zeroes on the PQ segment, so the generator's baseline must be
  // genuinely flat between beats or every amplitude assertion inherits an offset.
  const { leads, rPeakTimesSec } = generateEcg(BASE);
  // TP segment: safely after the T wave, before the next P wave.
  const t = rPeakTimesSec[1]! + 0.45;
  const idx = Math.round(t * 500);
  for (const lead of LEAD_IDS) {
    assertAlmostEquals(leads[lead][idx]!, 0, 0.02, `${lead} baseline not flat`);
  }
});

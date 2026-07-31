/**
 * The whole pipeline, from a PDF on disk to a serial ST delta.
 *
 * `crates/ecg-core/tests/acceptance.rs` already pins the engine, but it feeds
 * the engine synthetic arrays directly. Everything between a file and those
 * arrays — pdf.js operator lists, path decoding, polyline classification, grid
 * detection, gain calibration, layout assignment, resampling to a uniform grid —
 * had no test at all. That is most of the code and all of the fragile parts.
 *
 * It runs through `InlineEngine`, which is the same `EngineCore` the worker
 * hosts. So this also covers the engine boundary itself: if a value the UI needs
 * stopped crossing it, or crossed it wrong, these fail.
 */
import { beforeAll, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { InlineEngine } from "../web/src/engine/client.ts";
import type { Assumptions } from "../web/src/engine/protocol.ts";

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

/** The injected change in `serial-b-followup`, per tools/make-fixtures.ts. */
const INJECTED_ST_MV = 0.25;
const INJECTED_LEADS = ["V2", "V3", "V4"];
const DEFAULTS: Assumptions = { mmPerSec: 25, mmPerMv: 10 };

let engine: InlineEngine;

beforeAll(async () => {
  engine = new InlineEngine(readFileSync(at("../web/wasm/ecg_core_bg.wasm")));
  await engine.ready();
});

function bytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(at(`./fixtures/synthetic/${name}.pdf`)));
}

/** Analyse a fixture under `id`, failing loudly rather than returning a null. */
async function load(id: string, name = id, assumptions = DEFAULTS) {
  const { summary, error } = await engine.analyse(id, bytes(name), assumptions);
  if (error || !summary) throw new Error(`${name} failed to analyse: ${error}`);
  return summary;
}

test("a vector PDF yields twelve leads on a calibrated millimetre grid", async () => {
  const s = await load("baseline", "serial-a-baseline");

  expect(s.leadNames.length).toBe(12);

  // The grid is what every physical unit hangs off. A pitch that is not 1 mm
  // means the millivolt axis is wrong by exactly that factor, silently.
  expect(s.calibration).not.toBeNull();
  expect(s.calibration!.mmPerMv).toBeCloseTo(10, 6);

  // Rate is the one number a reader checks by eye, so it is the cheapest
  // end-to-end sanity check available.
  expect(s.hrBpm).toBeGreaterThan(66);
  expect(s.hrBpm).toBeLessThan(70);
});

test("the injected ST elevation survives the round trip through a PDF", async () => {
  await load("a", "serial-a-baseline");
  const b = await load("b", "serial-b-followup");

  expect(b.hrBpm).toBeGreaterThan(80);
  expect(b.hrBpm).toBeLessThan(84);

  const snap = await engine.compare(["a", "b"]);
  const d = snap.deltaSets[0]!;
  expect(d.length).toBe(12);

  for (const lead of INJECTED_LEADS) {
    const found = d.find((x) => x.lead === lead);
    expect(found, `${lead} missing from the delta report`).toBeDefined();
    // A null delta means unmeasurable, which would make the assertion below
    // vacuous rather than failing. Rule it out explicitly.
    expect(found!.delta, `${lead} delta is unmeasurable`).not.toBeNull();
    // 30 uV of tolerance across pdf.js, path decoding, resampling and the
    // engine. The Rust acceptance test holds the engine alone to 4 uV; the
    // difference is what the ingest path costs.
    expect(found!.delta!, `${lead} delta`).toBeCloseTo(INJECTED_ST_MV, 2);
  }
});

test("the leads that were not touched stay untouched", async () => {
  await load("a", "serial-a-baseline");
  await load("b", "serial-b-followup");
  const snap = await engine.compare(["a", "b"]);

  // The off-target leads are the real test. Recovering the injected change is
  // easy; recovering it *only where it was injected* is the claim the product
  // actually makes.
  const off = snap.deltaSets[0]!.filter((x) => !INJECTED_LEADS.includes(x.lead));
  expect(off.length).toBe(9);
  for (const x of off) {
    expect(x.delta, `${x.lead} delta is unmeasurable`).not.toBeNull();
    expect(Math.abs(x.delta!), `${x.lead} should be quiet`).toBeLessThan(0.03);
  }
});

test("exactly the injected leads are flagged notable", async () => {
  await load("a", "serial-a-baseline");
  await load("b", "serial-b-followup");
  const snap = await engine.compare(["a", "b"]);

  const flagged = snap.deltaSets[0]!.filter((x) => x.notable).map((x) => x.lead).sort();
  expect(flagged).toEqual([...INJECTED_LEADS].sort());
});

test("baseline wander alone is never reported as a change", async () => {
  await load("a", "serial-a-baseline");
  await load("noisy", "noisy-wander");
  const snap = await engine.compare(["a", "noisy"]);

  // Same underlying beat, wander laid over it. The apparent ST shifts are large
  // enough to look real; the uncertainty gate has to refuse every one of them.
  // A single flag here is a false positive in the only direction that matters.
  expect(snap.deltaSets[0]!.filter((x) => x.notable).map((x) => x.lead)).toEqual([]);
});

test("a non-standard paper speed and gain are read off the page, not assumed", async () => {
  // Printed at 50 mm/s and 5 mm/mV. The gain passed in is the default 10, so
  // reading 5 here means the pulse was measured rather than trusted.
  const s = await load("calib", "calib-50mms-5mmmv", { mmPerSec: 50, mmPerMv: 10 });
  expect(s.calibration!.mmPerMv).toBeCloseTo(5, 6);
  expect(s.calibration!.source).toBe("pulse");
});

test("the snapshot carries everything the canvases draw", async () => {
  await load("a", "serial-a-baseline");
  await load("b", "serial-b-followup");
  const snap = await engine.compare(["a", "b"]);

  // The UI cannot reach back into the engine any more, so anything missing here
  // is a blank panel rather than a wrong number — a failure mode worth a test
  // of its own.
  expect(snap.studyIds).toEqual(["a", "b"]);
  expect(snap.leads.length).toBe(12);
  expect(snap.printouts.length).toBe(2);
  expect(snap.columnSeconds).toBeGreaterThan(0);

  for (const lead of snap.leads) {
    expect(lead.traces.length, `${lead.lead} traces`).toBe(2);
    for (const tr of lead.traces) {
      expect(tr.samples.length, `${lead.lead} frame length`).toBe(401);
      expect(tr.beatsUsed).toBeGreaterThan(0);
    }
    expect(lead.differences.length, `${lead.lead} differences`).toBe(1);
  }

  for (const p of snap.printouts) {
    expect(p.leads.size).toBe(12);
    expect(p.rhythm, "a rhythm strip should reach the printout").not.toBeNull();
  }
});

test("releasing a study makes it unavailable to compare", async () => {
  await load("a", "serial-a-baseline");
  await load("b", "serial-b-followup");
  await engine.release(["b"]);

  // Removing a study must actually free it, not merely hide it. Otherwise a
  // long session reloading the same files grows the WASM heap without bound.
  await expect(engine.compare(["a", "b"])).rejects.toThrow(/not loaded/);
});

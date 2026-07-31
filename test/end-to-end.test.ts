/**
 * The whole pipeline, from a PDF on disk to a serial ST delta.
 *
 * `crates/ecg-core/tests/acceptance.rs` already pins the engine, but it feeds
 * the engine synthetic arrays directly. Everything between a file and those
 * arrays — pdf.js operator lists, path decoding, polyline classification, grid
 * detection, gain calibration, layout assignment, resampling to a uniform grid —
 * had no test at all. That is most of the code and all of the fragile parts.
 *
 * This is also the guard for moving compute into a Web Worker. That change
 * reshapes how every one of these stages is called; the numbers below are what
 * must survive it.
 */
import { beforeAll, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import init, { st_deltas_json } from "../web/wasm/ecg_core.js";
import { analyse, type Study } from "../web/src/app/study.ts";

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

/** The injected change in `serial-b-followup`, per tools/make-fixtures.ts. */
const INJECTED_ST_MV = 0.25;
const INJECTED_LEADS = ["V2", "V3", "V4"];

beforeAll(async () => {
  await init({ module_or_path: readFileSync(at("../web/wasm/ecg_core_bg.wasm")) });
});

/**
 * Build the record the app builds from a dropped file.
 *
 * `loadFile` takes a browser `File`; constructing the record directly keeps the
 * test to the part that matters and avoids asserting on Node's File shim.
 */
function studyFrom(name: string): Study {
  return {
    id: name,
    fileName: name,
    bytes: new Uint8Array(readFileSync(at(`./fixtures/synthetic/${name}.pdf`))),
    assumptions: { mmPerSec: 25, mmPerMv: 10 },
    acquiredAt: null,
    layout: null,
    analysis: null,
    identity: null,
    calibration: null,
    warnings: [],
    error: null,
    offsetSec: null,
    colour: "#1b4a8f",
  };
}

async function analysed(name: string): Promise<Study> {
  const s = await analyse(studyFrom(name));
  if (s.error) throw new Error(`${name} failed to analyse: ${s.error}`);
  return s;
}

/** Mirrors the object `st_deltas_json` emits. `delta` is null when unmeasurable. */
interface StDelta {
  lead: string;
  delta: number | null;
  mdc: number | null;
  notable: boolean;
  belowLimit: boolean;
}

function deltas(ref: Study, cmp: Study): StDelta[] {
  return (JSON.parse(st_deltas_json(ref.analysis, cmp.analysis)) as { leads: StDelta[] }).leads;
}

test("a vector PDF yields twelve leads on a calibrated millimetre grid", async () => {
  const s = await analysed("serial-a-baseline");

  expect(s.layout).not.toBeNull();
  expect(s.analysis.lead_names.length).toBe(12);

  // The grid is what every physical unit hangs off. A pitch that is not 1 mm
  // means the millivolt axis is wrong by exactly that factor, silently.
  expect(s.calibration).not.toBeNull();
  expect(s.calibration!.mmPerMv).toBeCloseTo(10, 6);

  // Rate is the one number a reader checks by eye, so it is the cheapest
  // end-to-end sanity check available.
  expect(s.analysis.hr_bpm).toBeGreaterThan(66);
  expect(s.analysis.hr_bpm).toBeLessThan(70);
});

test("the injected ST elevation survives the round trip through a PDF", async () => {
  const [a, b] = await Promise.all([
    analysed("serial-a-baseline"),
    analysed("serial-b-followup"),
  ]);

  expect(b.analysis.hr_bpm).toBeGreaterThan(80);
  expect(b.analysis.hr_bpm).toBeLessThan(84);

  const d = deltas(a, b);
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
  const [a, b] = await Promise.all([
    analysed("serial-a-baseline"),
    analysed("serial-b-followup"),
  ]);

  // The off-target leads are the real test. Recovering the injected change is
  // easy; recovering it *only where it was injected* is the claim the product
  // actually makes.
  const off = deltas(a, b).filter((x) => !INJECTED_LEADS.includes(x.lead));
  expect(off.length).toBe(9);
  for (const x of off) {
    expect(x.delta, `${x.lead} delta is unmeasurable`).not.toBeNull();
    expect(Math.abs(x.delta!), `${x.lead} should be quiet`).toBeLessThan(0.03);
  }
});

test("exactly the injected leads are flagged notable", async () => {
  const [a, b] = await Promise.all([
    analysed("serial-a-baseline"),
    analysed("serial-b-followup"),
  ]);

  const flagged = deltas(a, b).filter((x) => x.notable).map((x) => x.lead).sort();
  expect(flagged).toEqual([...INJECTED_LEADS].sort());
});

test("baseline wander alone is never reported as a change", async () => {
  const [a, noisy] = await Promise.all([
    analysed("serial-a-baseline"),
    analysed("noisy-wander"),
  ]);

  // Same underlying beat, wander laid over it. The apparent ST shifts are large
  // enough to look real; the uncertainty gate has to refuse every one of them.
  // A single flag here is a false positive in the only direction that matters.
  const flagged = deltas(a, noisy).filter((x) => x.notable);
  expect(flagged.map((x) => x.lead)).toEqual([]);
});

test("a non-standard paper speed and gain are read off the page, not assumed", async () => {
  // Printed at 50 mm/s and 5 mm/mV. The assumptions passed in are the *defaults*
  // (25 and 10), so anything that reads correctly here did so by measuring the
  // grid and the calibration pulse rather than trusting what it was told.
  const s = studyFrom("calib-50mms-5mmmv");
  s.assumptions = { mmPerSec: 50, mmPerMv: 10 };
  const done = await analyse(s);

  expect(done.error).toBeNull();
  expect(done.calibration!.mmPerMv).toBeCloseTo(5, 6);
  expect(done.calibration!.source).toBe("pulse");
});

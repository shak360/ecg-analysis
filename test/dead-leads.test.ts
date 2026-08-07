/**
 * A channel recorded as nothing is not a channel recorded as zero.
 *
 * `ningbo:JS10648` declares twelve leads and carries signal in nine. V4, V5 and
 * V6 are identically at baseline for all 5,000 samples, and the header says so
 * plainly — their checksum field is 0 where every other lead's is a real
 * number. It is not an isolated record: 31 of the 45 Ningbo cases in this atlas
 * have at least one such channel, and in every one of them it is a lead the
 * Kors transform reads.
 *
 * Two things went wrong when those arrived as zeros. Drawn, a dead channel is a
 * flat line, and a flat line is a finding. Transformed, it is worse: the
 * regression cannot tell an absent term from a zero one, so it returns a vector
 * loop built partly out of nothing and looking exactly like one that is not.
 *
 * So `decodeWfdb` omits them, which turns a silent wrong answer into the
 * refusal that already existed for a lead that is not there.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { InlineEngine } from "../web/src/engine/client.ts";
import { decodeWfdb } from "../web/src/ingest/wfdb.ts";

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

const HEA = "data/challenge2021/ningbo/JS10648.hea";
const SIG = "data/challenge2021/ningbo/JS10648.mat";
const present = existsSync(HEA) && existsSync(SIG);

function load(): ReturnType<typeof decodeWfdb> {
  const b = readFileSync(SIG);
  return decodeWfdb(
    readFileSync(HEA, "utf8"),
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
  );
}

describe.skipIf(!present)("a record the source published with dead channels", () => {
  test("the three empty channels are named, not delivered as zeros", () => {
    const rec = load();
    expect(rec.deadLeads).toEqual(["V4", "V5", "V6"]);
    for (const lead of ["V4", "V5", "V6"]) expect(rec.leads.has(lead)).toBe(false);
  });

  test("the nine real leads are untouched", () => {
    // The other half of the property: dropping must be exact. A test that only
    // checks the dead ones would pass if every lead were dropped.
    const rec = load();
    expect([...rec.leads.keys()]).toEqual(["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3"]);
    const ii = rec.leads.get("II")!;
    expect(ii.length).toBe(rec.nSamples);
    expect(Math.max(...ii)).toBeGreaterThan(0.5); // a real R wave, not a stub
  });

  test("initValues still describes the file, including the dead channels", () => {
    // It is the header's own integrity check against the byte offset, so it
    // must keep reporting all twelve declared channels even though three of
    // them are no longer offered as leads.
    expect(load().initValues.length).toBe(12);
  });
});

test("a lead that merely touches zero is kept", () => {
  // The bug this guards against is an over-eager rule: every real ECG crosses
  // the isoelectric line constantly, and a lead is only absent when it never
  // leaves it.
  const nSig = 2;
  // Channel-interleaved, so this is I=[0,5,-5,0,120] and II=[3,0,-2,0,8]. Both
  // sit on zero for most of their samples; neither stays there.
  const samples = Int16Array.from([0, 3, 5, 0, -5, -2, 0, 0, 120, 8]);
  const hea = [
    "synthetic 2 500 5",
    "synthetic.dat 16 1000.0(0)/mV 16 0 0 0 0 I",
    "synthetic.dat 16 1000.0(0)/mV 16 0 0 0 0 II",
  ].join("\n");
  const rec = decodeWfdb(hea, samples.buffer.slice(0) as ArrayBuffer);
  expect(rec.deadLeads).toEqual([]);
  expect(rec.leads.size).toBe(nSig);
});

test("a channel pinned to a non-zero baseline is also absent", () => {
  // WFDB's baseline field means "the code that represents 0 mV", so a dead
  // channel padded with its baseline code rather than with 0 is the same
  // situation. Comparing scaled millivolts would catch this too; comparing raw
  // codes says why.
  const samples = Int16Array.from([500, 7, 500, -7, 500, 90]);
  const hea = [
    "synthetic 2 500 3",
    "synthetic.dat 16 1000.0(500)/mV 16 0 500 0 0 I",
    "synthetic.dat 16 1000.0(0)/mV 16 0 7 0 0 II",
  ].join("\n");
  const rec = decodeWfdb(hea, samples.buffer.slice(0) as ArrayBuffer);
  expect(rec.deadLeads).toEqual(["I"]);
  expect(rec.leads.has("II")).toBe(true);
});

describe.skipIf(!present)("what the vector loop does with a dead channel", () => {
  test("it refuses and names the leads, instead of transforming zeros", async () => {
    // The consequence that made this worth chasing. Kors reads I, II and V1-V6;
    // three of those are absent here. Before the leads were dropped they
    // arrived as columns of zeros, the regression could not tell that from a
    // measurement, and it returned a loop — a plausible-looking one, built
    // partly out of a channel that was never recorded.
    const engine = new InlineEngine(readFileSync(at("../web/wasm/ecg_core_bg.wasm")));
    await engine.ready();
    const rec = load();
    await engine.analyseSignals("ningbo", rec.leads, rec.fsHz);
    const v = await engine.vcg("ningbo");

    expect(v.refusal?.code).toBe("LeadsMissing");
    for (const lead of ["V4", "V5", "V6"]) expect(v.refusal!.leads).toContain(lead);
    // A refusal carries empty arrays, never zero-filled ones: a null vector is
    // itself a finding, and drawing one here would be inventing it.
    expect(v.x.length).toBe(0);
    expect(v.y.length).toBe(0);
    expect(v.z.length).toBe(0);

    await engine.release(["ningbo"]);
  }, 30_000);
});

test("a channel pinned to the converter's limits is not a lead", () => {
  // `st_petersburg_incart:I0002` V6, in miniature: an input floating between
  // the supplies rather than a signal. 99.98% of its 462,600 samples sit on
  // one rail or the other. Drawn it is a full-scale square wave; fed to Kors,
  // which reads V6, it swamps every real term in the transform.
  const rail = 32767, floor = -32768;
  const samples = Int16Array.from([
    rail, 10, floor, -8, rail, 12, floor, -6, rail, 9, floor, -11,
  ]);
  const hea = [
    "synthetic 2 500 6",
    "synthetic.dat 16 1000.0(0)/mV 16 0 32767 0 0 V6",
    "synthetic.dat 16 1000.0(0)/mV 16 0 10 0 0 II",
  ].join("\n");
  const rec = decodeWfdb(hea, samples.buffer.slice(0) as ArrayBuffer);
  expect(rec.deadLeads).toEqual(["V6"]);
  expect(rec.leads.has("II")).toBe(true);
});

test("a lead that merely touches a rail once is kept", () => {
  // The negative control. A genuine deflection can clip a sample or two, and
  // discarding the lead for that would throw away a real recording.
  const samples = Int16Array.from([100, 5, 32767, 6, 200, 7, 150, 8, 120, 9, 90, 10]);
  const hea = [
    "synthetic 2 500 6",
    "synthetic.dat 16 1000.0(0)/mV 16 0 100 0 0 V6",
    "synthetic.dat 16 1000.0(0)/mV 16 0 5 0 0 II",
  ].join("\n");
  const rec = decodeWfdb(hea, samples.buffer.slice(0) as ArrayBuffer);
  expect(rec.deadLeads).toEqual([]);
  expect(rec.leads.size).toBe(2);
});

/**
 * Reading WFDB headers, and refusing the ones we cannot read correctly.
 *
 * This reader is deliberately narrow — it understands the slice of the format
 * the corpora actually use and refuses everything else, because a silently
 * mis-scaled ECG looks entirely plausible. The refusals are therefore as much
 * the product as the parsing, and they need tests for the same reason: a refusal
 * that is *too* strict is also silent. The unit check rejected a sixth of the
 * PhysioNet Challenge corpus — every INCART and PTB record — because those two
 * sources write `mv` where PTB-XL writes `mV`, and nothing said so until a case
 * failed to open in the browser.
 */
import { expect, test } from "vitest";

import { decodeWfdb, initValuesMatch } from "../web/src/ingest/wfdb.ts";

/** A one-channel format-16 record whose unit spelling we can vary. */
function header(unitSpec: string, opts: { fmt?: string } = {}): string {
  return [
    `rec 1 500 4`,
    `rec.dat ${opts.fmt ?? "16"} ${unitSpec} 16 0 7 0 0 II`,
  ].join("\n");
}

function samples(values: number[], offset = 0): ArrayBuffer {
  const buf = new ArrayBuffer(offset + values.length * 2);
  new Int16Array(buf, offset).set(values);
  return buf;
}

const DATA = () => samples([7, 20, -30, 40]);

test("the conventional `mV` spelling is read", () => {
  const rec = decodeWfdb(header("1000.0(0)/mV"), DATA());
  expect(rec.leads.get("II")![0]).toBeCloseTo(0.007);
});

test("the lower-case `mv` spelling is read too", () => {
  // INCART and PTB write it this way. Insisting on the capital made 28 of the
  // 161 Challenge atlas cases unopenable, which is how this was found — as
  // "expected millivolts, got 1000.0(0)/mv" under a tracing that never drew.
  const rec = decodeWfdb(header("1000.0(0)/mv"), DATA());
  expect(rec.leads.get("II")![0]).toBeCloseTo(0.007);
});

test("both spellings decode to identical millivolts", () => {
  const upper = decodeWfdb(header("1000.0(0)/mV"), DATA());
  const lower = decodeWfdb(header("1000.0(0)/mv"), DATA());
  expect([...lower.leads.get("II")!]).toEqual([...upper.leads.get("II")!]);
});

test("microvolts are still refused, because the scale would be wrong by 1000", () => {
  // The whole reason the check exists. Relaxing the case must not relax this:
  // a record read as millivolts when it is microvolts produces a tracing that
  // looks like an ECG and is off by three orders of magnitude.
  expect(() => decodeWfdb(header("1000.0(0)/uV"), DATA())).toThrow(/expected millivolts/);
  expect(() => decodeWfdb(header("1000.0(0)/mm"), DATA())).toThrow(/expected millivolts/);
  expect(() => decodeWfdb(header("1000.0(0)/V"), DATA())).toThrow(/expected millivolts/);
});

test("a format other than 16 is refused rather than misread", () => {
  expect(() => decodeWfdb(header("1000.0(0)/mV", { fmt: "212" }), DATA()))
    .toThrow(/format 16/);
});

test("a zero gain is refused, since every amplitude would be wrong", () => {
  expect(() => decodeWfdb(header("0(0)/mV"), DATA())).toThrow(/gain/);
});

test("a byte offset is honoured, so a .mat header is not read as signal", () => {
  // Challenge records are MATLAB v4 matrices: `16x1+24` means skip 24 bytes.
  // Reading at the wrong offset yields a plausible-looking but shifted trace,
  // which is why the header's declared first sample is checked below.
  const h = header("1000.0(0)/mv", { fmt: "16x1+24" });
  const rec = decodeWfdb(h, samples([7, 20, -30, 40], 24));
  expect(rec.leads.get("II")![0]).toBeCloseTo(0.007);
  expect(initValuesMatch(rec, h)).toBe(true);
});

test("a signal file too short for its declared length is refused", () => {
  expect(() => decodeWfdb(header("1000.0(0)/mV"), samples([7, 20])))
    .toThrow(/bytes, expected/);
});

test("the declared first sample catches a wrong offset", () => {
  // `initValue` is 7 in the header; decoding at offset 0 when the data really
  // starts at 24 gives a different first sample, and this is the only cheap way
  // to notice.
  const h = header("1000.0(0)/mv");
  const rec = decodeWfdb(h, samples([99, 20, -30, 40]));
  expect(initValuesMatch(rec, h)).toBe(false);
});

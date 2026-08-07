/**
 * The packed corpus must be lossless, and "lossless" has to be checked against
 * real records rather than smooth synthetic ones.
 *
 * A synthetic ramp round-trips under almost any bug: get the de-interleaving
 * wrong and a single-channel ramp still comes back right; get the delta
 * wrap-around wrong and a signal that never approaches int16's ends never
 * notices. So the byte-for-byte test reads actual PTB-XL and INCART files off
 * disk, and separate cases pin the two properties that real data happens not
 * to exercise: 16-bit wrap-around, and a corrupt container failing loudly.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { gunzip, gzip, pack, unpack } from "../web/src/ingest/packed.ts";
import { decodeWfdb, parseHeader } from "../web/src/ingest/wfdb.ts";

/** Records only exist after `npm run fetch:*`, so skip rather than fail. */
const CASES = [
  { hea: "data/ptbxl/records500/00001_hr.hea", sig: "data/ptbxl/records500/00001_hr.dat" },
  {
    hea: "data/challenge2021/st_petersburg_incart/I0001.hea",
    sig: "data/challenge2021/st_petersburg_incart/I0001.mat",
  },
  {
    hea: "data/challenge2021/chapman_shaoxing/JS00001.hea",
    sig: "data/challenge2021/chapman_shaoxing/JS00001.mat",
  },
].filter((c) => existsSync(c.hea) && existsSync(c.sig));

describe.skipIf(CASES.length === 0)("packing a real record", () => {
  for (const c of CASES) {
    const name = c.sig.split("/").pop()!;

    test(`${name} comes back byte for byte`, () => {
      const headerText = readFileSync(c.hea, "utf8");
      const file = new Uint8Array(readFileSync(c.sig));
      const { nSamples, signals } = parseHeader(headerText);
      const offset = signals[0]!.byteOffset;

      const round = unpack(pack(file, signals.length, nSamples, offset));

      // The signal file may carry trailing bytes the header does not describe;
      // what must be identical is everything the decoder will ever read.
      const declared = offset + nSamples * signals.length * 2;
      expect(round.byteLength).toBe(declared);
      expect(Buffer.compare(Buffer.from(round), Buffer.from(file.subarray(0, declared)))).toBe(0);
    });

    test(`${name} decodes to the same millivolts`, () => {
      // The property that actually matters to a reader: not that the bytes
      // match, but that the trace does.
      const headerText = readFileSync(c.hea, "utf8");
      const file = new Uint8Array(readFileSync(c.sig));
      const { nSamples, signals } = parseHeader(headerText);
      const round = unpack(pack(file, signals.length, nSamples, signals[0]!.byteOffset));

      const a = decodeWfdb(headerText, toBuffer(file));
      const b = decodeWfdb(headerText, toBuffer(round));
      expect([...b.leads.keys()]).toEqual([...a.leads.keys()]);
      for (const [lead, want] of a.leads) {
        expect(Array.from(b.leads.get(lead)!)).toEqual(Array.from(want));
      }
      expect(b.initValues).toEqual(a.initValues);
    });

    test(`${name} is meaningfully smaller once gzipped`, async () => {
      const headerText = readFileSync(c.hea, "utf8");
      const file = new Uint8Array(readFileSync(c.sig));
      const { nSamples, signals } = parseHeader(headerText);
      const packed = await gzip(pack(file, signals.length, nSamples, signals[0]!.byteOffset));
      const plain = await gzip(file);

      // The whole justification for a second format. If de-interleaving and
      // delta stop paying for themselves, plain gzip is simpler and should win.
      //
      // The bound is the *worst* case measured across all seven corpora, not a
      // typical one: Chapman's least compressible record still reaches 87% of
      // its plain-gzip size, while PTB-XL's best reaches 55%. Over the whole
      // atlas the aggregate saving is 46%.
      expect(packed.byteLength).toBeLessThan(plain.byteLength * 0.9);

      // An absolute floor, likewise from the worst source measured. The spread
      // is wide — 1.7x on INCART to 4.7x on Ningbo — and does not follow the
      // sampling rate: PTB at 1000 Hz manages only 2.1-2.4x while PTB-XL at
      // 500 Hz manages 2.9-4.7x. So this asserts the floor rather than a value
      // per source, which would be pinning noise.
      expect(file.byteLength / packed.byteLength).toBeGreaterThan(1.7);
    });
  }
});

test("the extremes of int16 survive the delta, which real signals never reach", () => {
  // -32768 -> 32767 is a difference of 65535, which does not fit in the int16
  // the delta is stored in. It wraps, and the reconstruction has to wrap the
  // same way or these samples come back as their own negation.
  const nSig = 2;
  const values = [-32768, 32767, -32768, 0, 32767, -1, -32768, 32767];
  const nSamples = values.length / nSig;
  const src = Int16Array.from(values);
  const file = new Uint8Array(src.buffer.slice(0));

  const round = new Int16Array(unpack(pack(file, nSig, nSamples, 0)).buffer);
  expect(Array.from(round)).toEqual(values);
});

test("a non-signal byte range is carried through untouched", () => {
  // The 24-byte MATLAB preamble. It is not samples and must not be delta-coded;
  // if it were, a `.mat` would decode at the wrong offset and still look like
  // an ECG, which is precisely the failure the header's init-value check exists
  // to catch.
  const preamble = Uint8Array.from({ length: 24 }, (_, i) => (i * 37) & 0xff);
  const samples = Int16Array.from([10, -10, 20, -20, 30, -30]);
  const file = new Uint8Array(24 + samples.byteLength);
  file.set(preamble);
  file.set(new Uint8Array(samples.buffer), 24);

  const round = unpack(pack(file, 3, 2, 24));
  expect(Array.from(round.subarray(0, 24))).toEqual(Array.from(preamble));
  expect(Array.from(new Int16Array(round.buffer, 24))).toEqual(Array.from(samples));
});

test("a corrupt or truncated container refuses rather than decodes", () => {
  const good = pack(new Uint8Array(new Int16Array([1, 2, 3, 4]).buffer), 2, 2, 0);

  expect(() => unpack(good.subarray(0, 8))).toThrow(/too short|declares/);

  const badMagic = good.slice();
  badMagic[0] = 0;
  expect(() => unpack(badMagic)).toThrow(/bad magic/);

  const badVersion = good.slice();
  badVersion[4] = 99;
  expect(() => unpack(badVersion)).toThrow(/version 99/);

  // A short body is the shape a half-served or half-written file takes, and it
  // is the one that would otherwise read past the end into zeros.
  expect(() => unpack(good.subarray(0, good.byteLength - 2))).toThrow(/declares/);
});

test("pack refuses a file shorter than its header claims", () => {
  expect(() => pack(new Uint8Array(10), 12, 5000, 0)).toThrow(/need/);
});

test("gzip and gunzip are inverse", async () => {
  const bytes = Uint8Array.from({ length: 4096 }, (_, i) => (i * 31) & 0xff);
  expect(Array.from(await gunzip(await gzip(bytes)))).toEqual(Array.from(bytes));
});

function toBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

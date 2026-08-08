/**
 * A vector loop is only meaningful if the twelve channels are a standard
 * 12-lead, and 26 of 1,207 records here are not.
 *
 * Three electrodes give one plane, so III, aVR, aVL and aVF are exact linear
 * combinations of I and II. The Kors regression is a map *from* that geometry;
 * handed channels that are not in it, it still returns a loop — a normal-looking
 * one, with a plausible mean QRS vector — describing a heart in a coordinate
 * frame the recording was not made in, with no outward sign at all.
 *
 * All 25 INCART records fail, by 13.3% to 234.3%, because their twelve channels
 * are recorded independently from Holter electrode positions. `ptbxl:162` fails
 * alone among 1,046, at 31.5%.
 *
 * The threshold is a gap in the data rather than a round number: the next
 * highest record in the whole corpus is `chapman_shaoxing:JS00016` at 8.0%, and
 * the median is 0.60%. The negative control below is the important half — a gate
 * that refused everything would satisfy the positive test on its own.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";

import { InlineEngine } from "../web/src/engine/client.ts";
import { decodeWfdb } from "../web/src/ingest/wfdb.ts";

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

const CASES = {
  incart: ["data/challenge2021/st_petersburg_incart/I0005.hea", "data/challenge2021/st_petersburg_incart/I0005.mat"],
  odd: ["data/ptbxl/records500/00162_hr.hea", "data/ptbxl/records500/00162_hr.dat"],
  control: ["data/ptbxl/records500/00002_hr.hea", "data/ptbxl/records500/00002_hr.dat"],
} as const;

const present = Object.values(CASES).every(([h, s]) => existsSync(h) && existsSync(s));

function load(which: keyof typeof CASES) {
  const [hea, sig] = CASES[which];
  const b = readFileSync(sig);
  return decodeWfdb(
    readFileSync(hea, "utf8"),
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
  );
}

let engine: InlineEngine;
beforeAll(async () => {
  if (!present) return;
  engine = new InlineEngine(readFileSync(at("../web/wasm/ecg_core_bg.wasm")));
  await engine.ready();
});

async function vcgOf(which: keyof typeof CASES) {
  const rec = load(which);
  await engine.analyseSignals(which, rec.leads, rec.fsHz);
  const v = await engine.vcg(which);
  await engine.release([which]);
  return v;
}

describe.skipIf(!present)("the limb-lead geometry gate", () => {
  test("a standard 12-lead still draws its loop", async () => {
    // First, and the one that matters most. Every assertion below would pass
    // against a gate that refused unconditionally.
    const v = await vcgOf("control");
    expect(v.refusal, v.refusal?.sentence ?? "").toBeNull();
    expect(v.x.length).toBe(v.frameLen);
  }, 30_000);

  test("a Holter whose channels are not in that geometry is refused", async () => {
    const v = await vcgOf("incart");
    expect(v.refusal?.code).toBe("LimbLeadGeometry");
    // A refusal carries empty arrays, never zero-filled ones.
    expect(v.x.length).toBe(0);
    expect(v.y.length).toBe(0);
    expect(v.z.length).toBe(0);
  }, 30_000);

  test("the sentence names the lead and the relation it should satisfy", async () => {
    // "no vectorcardiogram" is not something a reader can act on; "aVR differs
    // from -(I + II)/2 by 13%" is.
    const v = await vcgOf("incart");
    expect(v.refusal!.leads.length).toBe(1);
    expect(v.refusal!.sentence).toMatch(/differs from .+ by \d+% of its own amplitude/);
    expect(v.refusal!.sentence).toContain(v.refusal!.leads[0]!);
  }, 30_000);

  test("the one PTB-XL record that fails is refused like any other", async () => {
    // Worth pinning by name. Its III, aVL and I reconcile at 0.1% while aVR is
    // out by 31.5%, so it is a genuine oddity in the source rather than a
    // property of the corpus, and someone will otherwise read it as a bug.
    const v = await vcgOf("odd");
    expect(v.refusal?.code).toBe("LimbLeadGeometry");
  }, 30_000);
});

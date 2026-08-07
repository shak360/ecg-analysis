/**
 * Every way a lead in this corpus fails to be a lead, counted.
 *
 * `ningbo:JS10648` was found by opening it. That is not a method — it found one
 * record out of 1,516 because somebody happened to look at it, and the failure
 * it had (three channels recorded as identical zeros) is only one of several
 * that produce a drawable-but-meaningless trace. A flat line, a clipped one, a
 * duplicated one and a mislabelled one all render without complaint.
 *
 * So this asks every record the same questions, and reports rates rather than
 * examples. Each check is stated as what it would look like on screen, because
 * that is the thing that matters: a defect nobody can see on the tracing is a
 * curiosity, and one that looks like a finding is a hazard.
 *
 *   npx vite-node tools/survey-leads.ts
 *
 * Nothing here mutates anything. It is a survey, in the manner of the `#[ignore]`
 * corpus surveys in `crates/ecg-core/tests/real_serial.rs`.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { decodeWfdb, parseHeader } from "../web/src/ingest/wfdb.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** A lead-level defect, with the record and lead it was seen on. */
interface Hit {
  id: string;
  lead: string;
  detail: string;
}

const hits = new Map<string, Hit[]>();
function note(kind: string, id: string, lead: string, detail: string): void {
  const list = hits.get(kind) ?? [];
  list.push({ id, lead, detail });
  hits.set(kind, list);
}

/**
 * The longest run of one repeated value, in samples.
 *
 * A real lead at 500 Hz sits on a few adjacent codes through the PQ segment, so
 * short plateaus are normal and a long one is not: it means the signal stopped
 * changing, which is an electrode, not a heart.
 */
function longestPlateau(v: Float32Array): { len: number; at: number } {
  let best = 0, bestAt = 0, run = 1;
  for (let i = 1; i < v.length; i++) {
    if (v[i] === v[i - 1]) {
      run++;
      if (run > best) { best = run; bestAt = i - run + 1; }
    } else run = 1;
  }
  return { len: best, at: bestAt };
}

function rms(v: Float32Array | number[]): number {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s / (v.length || 1));
}

/**
 * The limb leads are not six independent measurements.
 *
 * Three electrodes give one plane, so III, aVR, aVL and aVF are exact linear
 * combinations of I and II. A cart computes them, so they should hold to within
 * rounding; a residual that is a noticeable fraction of the signal means the
 * channels are not the leads their labels claim, which is the one defect here
 * that a reader cannot possibly see — every trace looks like an ECG.
 */
const IDENTITIES: [string, (l: (n: string) => Float32Array | undefined) => number[] | null][] = [
  ["III = II - I", (l) => zip(l("III"), l("II"), l("I"), (c, b, a) => c - (b - a))],
  ["aVR = -(I + II)/2", (l) => zip(l("aVR"), l("I"), l("II"), (r, a, b) => r + (a + b) / 2)],
  ["aVL = I - II/2", (l) => zip(l("aVL"), l("I"), l("II"), (x, a, b) => x - (a - b / 2))],
  ["aVF = II - I/2", (l) => zip(l("aVF"), l("II"), l("I"), (f, b, a) => f - (b - a / 2))],
];

function zip(
  a: Float32Array | undefined,
  b: Float32Array | undefined,
  c: Float32Array | undefined,
  f: (x: number, y: number, z: number) => number,
): number[] | null {
  if (!a || !b || !c) return null;
  const n = Math.min(a.length, b.length, c.length);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = f(a[i]!, b[i]!, c[i]!);
  return out;
}

interface Row { id: string; dir: string; stem: string; ext: string }

function corpus(): Row[] {
  const rows: Row[] = [];
  for (const [dir, index] of [
    ["data/ptbxl", "data/ptbxl/atlas.json"],
    ["data/challenge2021", "data/challenge2021/atlas.json"],
  ] as [string, string][]) {
    let entries: { id: string }[];
    try {
      entries = JSON.parse(readFileSync(join(root, index), "utf8")) as { id: string }[];
    } catch { continue; }
    const seen = new Set<string>();
    for (const { id } of entries) {
      if (seen.has(id)) continue;
      seen.add(id);
      const [src, ref] = id.split(":");
      rows.push(src === "ptbxl"
        ? { id, dir, stem: `records500/${String(Number(ref)).padStart(5, "0")}_hr`, ext: ".dat" }
        : { id, dir, stem: `${src}/${ref}`, ext: ".mat" });
    }
  }
  return rows;
}

let scanned = 0;
const perSource = new Map<string, { n: number; bad: number }>();
const identityResiduals: number[] = [];

for (const row of corpus()) {
  let headerText: string, bytes: Buffer;
  try {
    headerText = readFileSync(join(root, row.dir, `${row.stem}.hea`), "utf8");
    bytes = readFileSync(join(root, row.dir, `${row.stem}${row.ext}`));
  } catch { continue; }

  const rec = decodeWfdb(
    headerText,
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  const { signals } = parseHeader(headerText);
  const gainOf = new Map(signals.map((s) => [s.name, s.gain]));
  scanned++;
  const src = row.id.split(":")[0]!;
  const stat = perSource.get(src) ?? { n: 0, bad: 0 };
  stat.n++;
  let recordBad = false;
  const bad = (): void => { recordBad = true; };

  // Channels `decodeWfdb` already refused to hand on.
  for (const lead of rec.deadLeads) { note("dead channel (all at baseline)", row.id, lead, "0 of 0"); bad(); }

  const byContent = new Map<string, string>();
  for (const [lead, v] of rec.leads) {
    let min = Infinity, max = -Infinity, nonFinite = 0;
    for (const x of v) {
      if (!Number.isFinite(x)) { nonFinite++; continue; }
      if (x < min) min = x;
      if (x > max) max = x;
    }
    const pp = max - min;

    if (nonFinite) { note("non-finite samples", row.id, lead, `${nonFinite} of ${v.length}`); bad(); }

    // Constant but not at baseline: the same defect as a dead channel wearing a
    // DC offset, and it draws as a flat line off the isoelectric line.
    if (pp === 0) { note("constant, off baseline", row.id, lead, `${min.toFixed(3)} mV`); bad(); }

    // Essentially no signal. 0.05 mV peak-to-peak is half a small square at
    // 10 mm/mV — below what a reader could call a deflection.
    else if (pp < 0.05) { note("near-flat (<0.05 mV p-p)", row.id, lead, `${pp.toFixed(4)} mV p-p`); bad(); }

    // Clipping. int16 at the header's gain is the hard ceiling; a lead sitting
    // on it has had its peaks removed, which changes every amplitude criterion.
    const gain = gainOf.get(lead) ?? 1000;
    const ceiling = 32767 / gain;
    let atRail = 0;
    for (const x of v) if (Math.abs(x) >= ceiling * 0.999) atRail++;
    if (atRail > 2) { note("clipped at the ADC rail", row.id, lead, `${atRail} samples`); bad(); }

    // A plateau long enough to read as an isoelectric segment rather than as
    // quantisation. Half a second is longer than any real ST segment.
    const plateau = longestPlateau(v);
    if (plateau.len >= rec.fsHz * 0.5 && pp > 0) {
      note("flat run >= 0.5 s", row.id, lead, `${(plateau.len / rec.fsHz).toFixed(2)} s at ${(plateau.at / rec.fsHz).toFixed(1)} s`);
      bad();
    }

    // Two channels carrying identical samples are one channel labelled twice.
    const key = `${v.length}:${v[0]}:${v[(v.length / 3) | 0]}:${v[(v.length / 2) | 0]}:${v[v.length - 1]}`;
    const twin = byContent.get(key);
    if (twin !== undefined && sameSamples(rec.leads.get(twin)!, v)) {
      note("duplicate of another lead", row.id, lead, `identical to ${twin}`);
      bad();
    } else byContent.set(key, lead);
  }

  // The limb-lead identities, checked as a fraction of the signal they relate.
  const l = (n: string) => rec.leads.get(n);
  for (const [name, build] of IDENTITIES) {
    const resid = build(l);
    if (!resid) continue;
    const ref = rec.leads.get(name.split(" ")[0]!)!;
    const scale = rms(ref);
    if (scale < 0.02) continue; // nothing to be wrong about
    const rel = rms(resid) / scale;
    identityResiduals.push(rel);
    if (rel > 0.05) {
      note("limb-lead identity broken", row.id, name, `residual ${(100 * rel).toFixed(1)}% of signal`);
      bad();
    }
  }

  if (recordBad) stat.bad++;
  perSource.set(src, stat);
}

function sameSamples(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// --- report -----------------------------------------------------------------

console.log(`${scanned} records scanned\n`);

const kinds = [...hits.entries()].sort((a, b) => b[1].length - a[1].length);
if (kinds.length === 0) console.log("no lead defects found");
for (const [kind, list] of kinds) {
  const records = new Set(list.map((h) => h.id));
  console.log(`${kind}`);
  console.log(`  ${list.length} lead(s) across ${records.size} record(s)`);
  const bySrc = new Map<string, number>();
  for (const id of records) {
    const s = id.split(":")[0]!;
    bySrc.set(s, (bySrc.get(s) ?? 0) + 1);
  }
  console.log(`  ${[...bySrc].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(", ")}`);
  for (const h of list.slice(0, 3)) console.log(`    e.g. ${h.id} ${h.lead}: ${h.detail}`);
  console.log();
}

console.log("records with at least one defect, by source:");
for (const [src, { n, bad }] of [...perSource].sort((a, b) => b[1].bad - a[1].bad)) {
  console.log(`  ${src.padEnd(22)} ${bad} of ${n} (${(100 * bad / n).toFixed(1)}%)`);
}

if (identityResiduals.length) {
  identityResiduals.sort((a, b) => a - b);
  const q = (p: number) => identityResiduals[Math.min(identityResiduals.length - 1, Math.floor(p * identityResiduals.length))]!;
  console.log("\nlimb-lead identity residual, as a fraction of the lead's own RMS:");
  console.log(`  median ${(100 * q(0.5)).toFixed(3)}%   p95 ${(100 * q(0.95)).toFixed(3)}%   max ${(100 * q(1)).toFixed(2)}%`);
}

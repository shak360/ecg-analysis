/**
 * Reading WFDB records, for the PTB-XL corpus browser.
 *
 * Only the slice of the format PTB-XL actually uses: format 16, one `.dat` per
 * record, all channels interleaved. Deliberately narrow — a general WFDB reader
 * is a project of its own, and every variant this does not understand it
 * refuses rather than misreads. A silently mis-scaled ECG is the worst possible
 * output here, because it looks entirely plausible.
 *
 * This is a *digital* ingest path. Nothing is being recovered from a picture:
 * the millivolts are the ones the cart recorded, so there is no grid to detect,
 * no calibration pulse to measure, and no digitisation uncertainty to carry.
 * That makes it the cleanest possible input to the engine, which is exactly why
 * it is worth having — it separates "is the measurement path right" from "is the
 * digitisation right".
 */

/** Mirrors the Rust reader in `crates/ecg-core/tests/common/mod.rs`. */
export interface WfdbRecord {
  fsHz: number;
  nSamples: number;
  /** Lead name to millivolts, in the order the header declared them. */
  leads: Map<string, Float32Array>;
}

/**
 * PTB-XL writes the augmented leads in capitals.
 *
 * The engine uses the clinical spelling everywhere, and a mismatch here would
 * drop three leads without saying so.
 */
function canonicalLead(name: string): string {
  switch (name.toUpperCase()) {
    case "AVR":
      return "aVR";
    case "AVL":
      return "aVL";
    case "AVF":
      return "aVF";
    default:
      return name.toUpperCase();
  }
}

interface SignalSpec {
  gain: number;
  baseline: number;
  name: string;
}

/**
 * Parse a WFDB header.
 *
 * Line 1 is `record nsig fs nsamp`; then one line per signal, of which we need
 * `filename format gain(baseline)/units ... description`.
 */
function parseHeader(text: string): {
  fsHz: number;
  nSamples: number;
  datName: string;
  signals: SignalSpec[];
} {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (lines.length === 0) throw new Error("empty header");

  const head = lines[0]!.split(/\s+/);
  if (head.length < 4) throw new Error(`malformed header line: ${lines[0]}`);
  const nSig = Number(head[1]);
  const fsHz = Number(head[2]);
  const nSamples = Number(head[3]);
  if (!Number.isFinite(nSig) || !Number.isFinite(fsHz) || !Number.isFinite(nSamples)) {
    throw new Error(`unreadable header numbers: ${lines[0]}`);
  }

  const signals: SignalSpec[] = [];
  let datName = "";
  for (let i = 0; i < nSig; i++) {
    const l = lines[i + 1];
    if (!l) throw new Error("header ended early");
    const f = l.split(/\s+/);
    if (f.length < 2) throw new Error(`malformed signal line: ${l}`);
    if (f[1] !== "16") {
      throw new Error(`only WFDB format 16 is supported, got ${f[1]}`);
    }
    datName = f[0]!;

    // `gain(baseline)/units`, e.g. `1000.0(0)/mV`.
    const spec = f[2] ?? "1";
    const open = spec.indexOf("(");
    const gain = Number(open >= 0 ? spec.slice(0, open) : spec.split("/")[0]);
    const baseline = open >= 0 ? Number(spec.slice(open + 1, spec.indexOf(")"))) : 0;
    if (!Number.isFinite(gain) || gain === 0) {
      throw new Error(`zero or unreadable gain would make every amplitude wrong: ${spec}`);
    }
    // Units must be millivolts. Anything else would be wrong by an unknown
    // factor rather than obviously broken, which is the failure to avoid.
    if (spec.includes("/") && !spec.endsWith("/mV")) {
      throw new Error(`expected millivolts, got ${spec}`);
    }

    signals.push({
      gain,
      baseline: Number.isFinite(baseline) ? baseline : 0,
      name: canonicalLead(f[f.length - 1] ?? "?"),
    });
  }
  return { fsHz, nSamples, datName, signals };
}

/** Decode a record from its header text and the raw `.dat` bytes. */
export function decodeWfdb(headerText: string, dat: ArrayBuffer): WfdbRecord {
  const { fsHz, nSamples, signals } = parseHeader(headerText);
  const nSig = signals.length;

  const expected = nSamples * nSig * 2;
  if (dat.byteLength < expected) {
    throw new Error(
      `signal file is ${dat.byteLength} bytes, expected ${expected} for ` +
        `${nSamples} samples x ${nSig} channels`,
    );
  }

  const raw = new Int16Array(dat, 0, nSamples * nSig);
  const leads = new Map<string, Float32Array>();
  for (let c = 0; c < nSig; c++) {
    const s = signals[c]!;
    const out = new Float32Array(nSamples);
    for (let i = 0; i < nSamples; i++) {
      out[i] = (raw[i * nSig + c]! - s.baseline) / s.gain;
    }
    leads.set(s.name, out);
  }
  return { fsHz, nSamples, leads };
}

/** Fetch and decode one record by PTB-XL `ecg_id`, from the dev corpus mount. */
export async function fetchRecord(ecgId: number, base = "/corpus"): Promise<WfdbRecord> {
  const name = `${String(ecgId).padStart(5, "0")}_hr`;
  const [hea, dat] = await Promise.all([
    fetch(`${base}/records500/${name}.hea`),
    fetch(`${base}/records500/${name}.dat`),
  ]);
  if (!hea.ok || !dat.ok) {
    throw new Error(
      `record ${ecgId} not in the local corpus (${hea.status}/${dat.status}). ` +
        `Run \`npm run fetch:ptbxl\` to populate it.`,
    );
  }
  return decodeWfdb(await hea.text(), await dat.arrayBuffer());
}

/** One serial pair, as `tools/fetch-ptbxl.ts` writes them. */
export interface SerialPair {
  patient: string;
  before: number;
  after: number;
  kind: "appeared" | "resolved" | "unchanged";
  change: string[];
  deviceChanged: boolean;
  siteChanged: boolean;
}

export async function fetchPairs(base = "/corpus"): Promise<SerialPair[]> {
  const res = await fetch(`${base}/serial-pairs.json`);
  if (!res.ok) {
    throw new Error(
      `no serial-pairs.json at ${base} (${res.status}). Run \`npm run fetch:ptbxl\`.`,
    );
  }
  return (await res.json()) as SerialPair[];
}

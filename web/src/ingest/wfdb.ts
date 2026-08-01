/**
 * Reading WFDB records, for the PTB-XL corpus browser.
 *
 * Only the slice of the format the corpora actually use: format 16, one signal
 * file per record, all channels interleaved. Deliberately narrow — a general
 * WFDB reader is a project of its own, and every variant this does not
 * understand it refuses rather than misreads. A silently mis-scaled ECG is the
 * worst possible output here, because it looks entirely plausible.
 *
 * Two things beyond PTB-XL, both from the PhysioNet/CinC Challenge 2021:
 *
 * Its signal files are `.mat`, and the format field reads `16x1+24` — format 16,
 * one sample per frame, **24-byte offset**. The file is a MATLAB v4 matrix
 * (20-byte header plus the 4-byte name `val`), and because MATLAB is
 * column-major a 12xN matrix serialises sample-major, which is exactly WFDB's
 * interleaving. So the offset is all that is needed; no MATLAB parser.
 *
 * And its labels live in header comments — `# Dx: 164889003,59118001` — which a
 * reader that filters `#` lines throws away. They are read here.
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
  /** Whatever the header's `#` comments carried. Empty for PTB-XL. */
  meta: {
    age: number | null;
    sex: "M" | "F" | null;
    /** SNOMED-CT codes from `# Dx:`. */
    dx: string[];
  };
  /** First sample of each channel as the header declares it, for verification. */
  initValues: number[];
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
  /** Bytes to skip before sample data, from a `16x1+24`-style format field. */
  byteOffset: number;
  /** The header's claimed first sample, which is a checksum we can use. */
  initValue: number;
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
  meta: WfdbRecord["meta"];
} {
  const all = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const lines = all.filter((l) => !l.startsWith("#"));
  if (lines.length === 0) throw new Error("empty header");

  // The Challenge 2021 sources carry age, sex and their SNOMED labels in
  // comments. PTB-XL has none, so all three stay empty for it.
  const comment = (key: string): string | null => {
    const l = all.find((x) => x.toLowerCase().startsWith(`# ${key.toLowerCase()}:`));
    return l ? l.slice(l.indexOf(":") + 1).trim() : null;
  };
  const ageRaw = comment("Age");
  const sexRaw = (comment("Sex") ?? "").toLowerCase();
  const meta: WfdbRecord["meta"] = {
    // "Unknown" and "NaN" both appear; anything non-numeric is absent, not zero.
    age: ageRaw && Number.isFinite(Number(ageRaw)) ? Number(ageRaw) : null,
    sex: sexRaw.startsWith("f") ? "F" : sexRaw.startsWith("m") ? "M" : null,
    dx: (comment("Dx") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^\d+$/.test(s)),
  };

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

    // `16`, or `16x1+24`: format, samples-per-frame, byte offset. Only format
    // 16 and one sample per frame are supported; the offset is honoured.
    const fmt = f[1]!;
    const m = /^(\d+)(?:x(\d+))?(?:\+(\d+))?$/.exec(fmt);
    if (!m || m[1] !== "16") {
      throw new Error(`only WFDB format 16 is supported, got ${fmt}`);
    }
    if (m[2] && m[2] !== "1") {
      throw new Error(`only one sample per frame is supported, got ${fmt}`);
    }
    const byteOffset = m[3] ? Number(m[3]) : 0;
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
      byteOffset,
      // Field 6 of a signal line is the first sample. WFDB writes it as a
      // integrity check, and reading a `.mat` at the wrong offset produces a
      // trace that still looks like an ECG, so it is the only cheap way to know
      // the offset was right.
      initValue: Number(f[5] ?? "NaN"),
    });
  }
  return { fsHz, nSamples, datName, signals, meta };
}

/** Decode a record from its header text and the raw `.dat` bytes. */
export function decodeWfdb(headerText: string, dat: ArrayBuffer): WfdbRecord {
  const { fsHz, nSamples, signals, meta } = parseHeader(headerText);
  const nSig = signals.length;

  // One offset for the whole file; a per-channel offset would mean separate
  // files, which this reader does not claim to handle.
  const offset = signals[0]?.byteOffset ?? 0;
  const expected = offset + nSamples * nSig * 2;
  if (dat.byteLength < expected) {
    throw new Error(
      `signal file is ${dat.byteLength} bytes, expected ${expected} for ` +
        `${nSamples} samples x ${nSig} channels at offset ${offset}`,
    );
  }

  const raw = new Int16Array(dat, offset, nSamples * nSig);
  const leads = new Map<string, Float32Array>();
  for (let c = 0; c < nSig; c++) {
    const s = signals[c]!;
    const out = new Float32Array(nSamples);
    for (let i = 0; i < nSamples; i++) {
      out[i] = (raw[i * nSig + c]! - s.baseline) / s.gain;
    }
    leads.set(s.name, out);
  }

  // The header's declared first sample per channel, so a caller can verify the
  // offset was right rather than trusting a plausible-looking trace.
  const initValues = signals.map((_, c) => raw[c] ?? NaN);
  return { fsHz, nSamples, leads, meta, initValues };
}

/** Does the decoded signal start where the header says it does? */
export function initValuesMatch(rec: WfdbRecord, headerText: string): boolean {
  const { signals } = parseHeader(headerText);
  return signals.every((s, c) =>
    !Number.isFinite(s.initValue) || s.initValue === rec.initValues[c]
  );
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

/**
 * Fetch any atlas case by its corpus-qualified id.
 *
 * `ptbxl:1234` and `chapman_shaoxing:JS00001` live in different trees with
 * different file extensions, so the id carries which. Routing on the id rather
 * than probing both keeps a missing record an error instead of a slow retry.
 */
export async function fetchAtlasRecord(caseId: string): Promise<WfdbRecord> {
  const [source, ref] = caseId.split(":");
  if (!source || !ref) throw new Error(`unrecognised case id: ${caseId}`);

  if (source === "ptbxl") return fetchRecord(Number(ref));

  const base = `/corpus-challenge/${source}/${ref}`;
  const [hea, sig] = await Promise.all([fetch(`${base}.hea`), fetch(`${base}.mat`)]);
  if (!hea.ok || !sig.ok) {
    throw new Error(
      `${caseId} not in the local corpus (${hea.status}/${sig.status}). ` +
        `Run \`npm run fetch:challenge\` to populate it.`,
    );
  }
  return decodeWfdb(await hea.text(), await sig.arrayBuffer());
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

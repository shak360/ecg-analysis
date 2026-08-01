/**
 * Fetch a working subset of PTB-XL.
 *
 * PTB-XL is 21,799 ten-second 12-lead records from 18,869 patients, CC BY 4.0,
 * open access with no login. What makes it the right corpus for this project is
 * not its size — it is that 2,111 patients have more than one ECG, giving 2,930
 * consecutive serial pairs. Everything this tool exists to measure is a
 * difference between two recordings of one person, and until now the only such
 * pairs available were synthetic.
 *
 * The full release is 1.7 GB. We do not need it. This downloads the records that
 * make up serial pairs, preferring the ones where a conduction abnormality
 * appeared or resolved between recordings, because those are the cases the
 * measurement path is weakest on and the ones recent fixes target.
 *
 * Nothing fetched here is committed: `data/` is gitignored. This is public,
 * de-identified data — the gitignore rule is about size and licence, not PHI.
 *
 * Two selections, because the site asks two different questions of this corpus.
 *
 *   --unchanged N   serial pairs, for validating change detection
 *   --reindex       rebuild the atlas index from every human-validated record
 *                   already on disk, with no network at all
 *   --atlas N       N human-validated records per statement, for the teaching
 *                   atlas: one browsable example set across all 71 SCP
 *                   statements rather than the eight conduction ones
 *
 * The atlas selection takes only `validated_by_human` records. For a training
 * set an unreviewed label is noise you can average out; in a teaching atlas a
 * mislabelled anterior infarct is a person learning the wrong thing, so the
 * 5,743 unvalidated records are left out entirely.
 *
 * Usage:  npm run fetch:ptbxl [-- --unchanged 300] [-- --atlas 6]
 *         npm run fetch:ptbxl -- --reindex
 */
import { mkdir, readdir, readFile, writeFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const BASE = "https://physionet.org/files/ptb-xl/1.0.3";
const OUT = fileURLToPath(new URL("../data/ptbxl/", import.meta.url));

/** SCP statements that describe ventricular conduction. */
const CONDUCTION = new Set([
  "CLBBB",
  "CRBBB",
  "ILBBB",
  "IRBBB",
  "LAFB",
  "LPFB",
  "IVCD",
  "WPW",
]);

interface Row {
  ecg_id: string;
  patient_id: string;
  recording_date: string;
  scp_codes: string;
  device: string;
  site: string;
  age: string;
  sex: string;
  report: string;
}

/** Parse one CSV line, honouring quoted fields — `report` contains commas. */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** The SCP codes column is a Python dict literal, near enough to JSON. */
function scpCodes(raw: string): Set<string> {
  const keys = new Set<string>();
  for (const m of raw.matchAll(/'([A-Z0-9_/]+)'\s*:/g)) keys.add(m[1]!);
  return keys;
}

async function download(rel: string, dest: string): Promise<number> {
  const res = await fetch(`${BASE}/${rel}`);
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  await writeFile(dest, buf);
  return buf.byteLength;
}

/** PTB-XL lays records out in 1000-record subdirectories. */
function recordPath(ecgId: number): string {
  const bucket = String(Math.floor(ecgId / 1000) * 1000).padStart(5, "0");
  const name = `${String(ecgId).padStart(5, "0")}_hr`;
  return `records500/${bucket}/${name}`;
}

const args = process.argv.slice(2);

/**
 * Read a numeric flag, or fall back.
 *
 * `args[args.indexOf(flag) + 1]` looks harmless and is not: when the flag is
 * absent `indexOf` gives -1, so it reads `args[0]` — some *other* flag — and
 * `Number("--atlas")` is NaN, which `??` does not catch because NaN is not
 * nullish. That silently made the control count NaN and wrote a serial index
 * with no controls in it.
 */
function numArg(flag: string, fallback: number): number {
  const i = args.indexOf(flag);
  if (i < 0) return fallback;
  const v = Number(args[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

const unchangedWanted = numArg("--unchanged", 200);
const atlasPer = args.includes("--atlas") ? numArg("--atlas", 6) : 0;
const reindexOnly = args.includes("--reindex");

await mkdir(OUT, { recursive: true });

// The metadata is small and always fetched; everything else is chosen from it.
const dbPath = `${OUT}ptbxl_database.csv`;
try {
  await stat(dbPath);
} catch {
  console.log("fetching ptbxl_database.csv …");
  await download("ptbxl_database.csv", dbPath);
  await download("scp_statements.csv", `${OUT}scp_statements.csv`);
}

const text = await readFile(dbPath, "utf8");
const lines = text.split("\n").filter((l) => l.trim());
const header = splitCsv(lines[0]!);
const rows: Row[] = lines.slice(1).map((l) => {
  const f = splitCsv(l);
  return Object.fromEntries(header.map((h, i) => [h, f[i] ?? ""])) as unknown as Row;
});

// ---------------------------------------------------------------------------
// Atlas selection
// ---------------------------------------------------------------------------

interface Statement {
  code: string;
  description: string;
  category: string;
  diagnosticClass: string;
  isDiagnostic: boolean;
  isForm: boolean;
  isRhythm: boolean;
}

async function readStatements(): Promise<Map<string, Statement>> {
  const text = await readFile(`${OUT}scp_statements.csv`, "utf8");
  const lines = text.split("\n").filter((l) => l.trim());
  const head = splitCsv(lines[0]!);
  const out = new Map<string, Statement>();
  for (const line of lines.slice(1)) {
    const f = splitCsv(line);
    const get = (name: string) => f[head.indexOf(name)] ?? "";
    // The code is the unnamed first column.
    const code = f[0]!;
    if (!code) continue;
    out.set(code, {
      code,
      description: get("description"),
      category: get("Statement Category"),
      diagnosticClass: get("diagnostic_class"),
      isDiagnostic: get("diagnostic") === "1.0",
      isForm: get("form") === "1.0",
      isRhythm: get("rhythm") === "1.0",
    });
  }
  return out;
}

if (atlasPer > 0 || reindexOnly) {
  const statements = await readStatements();

  // Human-validated only. See the header: an unreviewed label is tolerable in a
  // training set and not in a teaching one.
  const usable = rows.filter((r) => (r as unknown as Record<string, string>).validated_by_human === "True");

  const wanted = new Set<number>();
  let got = 0;

  if (reindexOnly) {
    // Everything already on disk that meets the atlas standard, whichever
    // selection fetched it. The serial-pair fetch pulls records by *pair*
    // structure and the atlas fetch pulls them by *statement*, so the two sets
    // barely overlap: the pairs left 722 human-validated records sitting in
    // records500/ that no atlas index mentioned. Downloading more before
    // indexing what we hold would have been the wrong order of work.
    const onDisk = (await readdir(`${OUT}records500`).catch(() => []))
      .filter((f) => f.endsWith(".hea"))
      .map((f) => Number(f.slice(0, 5)));
    const validated = new Set(usable.map((r) => Number(r.ecg_id)));
    for (const id of onDisk) if (validated.has(id)) wanted.add(id);
    console.log(
      `reindex: ${onDisk.length} records on disk, ${wanted.size} human-validated`,
    );
  } else {
    const chosenByCode = new Map<string, Row[]>();
    for (const r of usable) {
      for (const code of scpCodes(r.scp_codes)) {
        if (!statements.has(code)) continue;
        const list = chosenByCode.get(code) ?? [];
        if (list.length >= atlasPer) continue;
        list.push(r);
        chosenByCode.set(code, list);
      }
    }
    for (const list of chosenByCode.values()) {
      for (const r of list) wanted.add(Number(r.ecg_id));
    }

    console.log(
      `atlas: ${chosenByCode.size} statements covered, ${wanted.size} records ` +
        `(~${(wanted.size * 120_600 / 1e6).toFixed(0)} MB), from ${usable.length} human-validated`,
    );

    await mkdir(`${OUT}records500`, { recursive: true });
    for (const id of [...wanted].sort((a, b) => a - b)) {
      const rel = recordPath(id);
      const flat = rel.split("/").pop()!;
      for (const ext of [".hea", ".dat"]) {
        const dest = `${OUT}records500/${flat}${ext}`;
        try {
          await stat(dest);
          continue;
        } catch { /* not yet fetched */ }
        await download(`${rel}${ext}`, dest);
        got++;
      }
      if (got && got % 200 === 0) console.log(`  ${got} files …`);
    }
  }

  // One entry per record, carrying every statement on it. A record usually has
  // several, and an atlas that showed only the first would teach that an ECG
  // has one finding.
  //
  // Emitted in the shared AtlasCase shape so this index and the Challenge one
  // concatenate. `provenance` is the field that keeps the merge honest: PTB-XL
  // is the only corpus that records whether a human reviewed the label, and
  // only its cases may claim it.
  const byId = new Map(usable.map((r) => [Number(r.ecg_id), r]));
  const entries = [...wanted].sort((a, b) => a - b).map((id) => {
    const r = byId.get(id)!;
    const raw = r as unknown as Record<string, string>;
    // 300 is PTB-XL's sentinel for "over 89", not an age.
    const age = raw.age === "300.0" ? null : Number(raw.age);
    return {
      id: `ptbxl:${id}`,
      source: "ptbxl",
      sourceLabel: "PTB-XL (Germany)",
      provenance: "human-validated" as const,
      age: Number.isFinite(age) ? age : null,
      sex: raw.sex === "1" ? "F" as const : raw.sex === "0" ? "M" as const : null,
      report: raw.report ?? "",
      findings: [...scpCodes(r.scp_codes)]
        .filter((c) => statements.has(c))
        .map((c) => {
          const s = statements.get(c)!;
          return {
            id: c,
            description: s.description,
            kind: (s.isRhythm ? "rhythm" : s.isForm && !s.isDiagnostic ? "form" : "diagnostic") as
              "diagnostic" | "form" | "rhythm",
            diagnosticClass: s.diagnosticClass,
            sourceCode: c,
          };
        }),
    };
  });

  await writeFile(`${OUT}atlas.json`, JSON.stringify(entries, null, 1));
  console.log(`done: ${got} files fetched; atlas index: data/ptbxl/atlas.json`);
  // Each selection writes its own index; running both in one invocation would
  // rewrite the other's, which is how the control set was lost once already.
  process.exit(0);
}

const byPatient = new Map<string, Row[]>();
for (const r of rows) {
  const list = byPatient.get(r.patient_id) ?? [];
  list.push(r);
  byPatient.set(r.patient_id, list);
}

interface Pair {
  patient: string;
  before: Row;
  after: Row;
  kind: "appeared" | "resolved" | "unchanged";
  change: string[];
}

const pairs: Pair[] = [];
for (const [patient, recs] of byPatient) {
  if (recs.length < 2) continue;
  recs.sort((a, b) => a.recording_date.localeCompare(b.recording_date));
  for (let i = 0; i + 1 < recs.length; i++) {
    const before = recs[i]!;
    const after = recs[i + 1]!;
    const ca = [...scpCodes(before.scp_codes)].filter((c) => CONDUCTION.has(c));
    const cb = [...scpCodes(after.scp_codes)].filter((c) => CONDUCTION.has(c));
    const gained = cb.filter((c) => !ca.includes(c));
    const lost = ca.filter((c) => !cb.includes(c));
    if (gained.length) pairs.push({ patient, before, after, kind: "appeared", change: gained });
    else if (lost.length) pairs.push({ patient, before, after, kind: "resolved", change: lost });
    else pairs.push({ patient, before, after, kind: "unchanged", change: [] });
  }
}

// Every conduction change, plus a bounded sample of unchanged pairs to measure
// the false-positive rate against. Controls are as important as cases here: a
// detector that fires on everything is no detector.
const chosen = [
  ...pairs.filter((p) => p.kind !== "unchanged"),
  ...pairs.filter((p) => p.kind === "unchanged").slice(0, unchangedWanted),
];

const needed = new Set<number>();
for (const p of chosen) {
  needed.add(Number(p.before.ecg_id));
  needed.add(Number(p.after.ecg_id));
}

console.log(
  `${pairs.length} serial pairs available; taking ${chosen.length} ` +
    `(${pairs.filter((p) => p.kind === "appeared").length} appeared, ` +
    `${pairs.filter((p) => p.kind === "resolved").length} resolved, ` +
    `${Math.min(unchangedWanted, pairs.filter((p) => p.kind === "unchanged").length)} unchanged controls)`,
);
console.log(`${needed.size} records to fetch, about ${(needed.size * 120_600 / 1e6).toFixed(0)} MB`);

await mkdir(`${OUT}records500`, { recursive: true });
let fetched = 0;
let bytes = 0;
let skipped = 0;
for (const id of [...needed].sort((a, b) => a - b)) {
  const rel = recordPath(id);
  const flat = rel.split("/").pop()!;
  for (const ext of [".hea", ".dat"]) {
    const dest = `${OUT}records500/${flat}${ext}`;
    try {
      await stat(dest);
      skipped++;
      continue;
    } catch { /* not yet fetched */ }
    bytes += await download(`${rel}${ext}`, dest);
    fetched++;
  }
  if (fetched % 100 === 0 && fetched) {
    console.log(`  ${fetched} files, ${(bytes / 1e6).toFixed(0)} MB …`);
  }
}

// The pair index is what the tests read; it keeps the label logic here rather
// than duplicated in Rust.
await writeFile(
  `${OUT}serial-pairs.json`,
  JSON.stringify(
    chosen.map((p) => ({
      patient: p.patient,
      before: Number(p.before.ecg_id),
      after: Number(p.after.ecg_id),
      kind: p.kind,
      change: p.change,
      // Device and site changes are a known confound in this corpus: 6% of
      // serial pairs were recorded on different hardware. A test that finds a
      // difference should be able to ask whether the machine changed too.
      deviceChanged: p.before.device !== p.after.device,
      siteChanged: p.before.site !== p.after.site,
    })),
    null,
    1,
  ),
);

console.log(
  `done: ${fetched} files fetched (${(bytes / 1e6).toFixed(0)} MB), ${skipped} already present`,
);
console.log(`pair index: data/ptbxl/serial-pairs.json`);

/**
 * Fetch a teaching subset of the PhysioNet/CinC Challenge 2021 corpus.
 *
 * One CC BY download covers seven sources — CPSC 2018, CPSC-Extra, INCART, PTB,
 * Georgia, Chapman-Shaoxing and Ningbo — and the reason to want them is not
 * volume. ARIC puts the upper normal ST-J limit at 200 uV in African-American
 * men and 100 uV in women. An atlas built only on PTB-XL teaches one German
 * hospital's population as *the* normal; Chapman and Ningbo are Chinese, Georgia
 * American, INCART Russian.
 *
 * There is no RECORDS index, so the layout is discovered from the directory
 * listings. Headers are about 760 bytes and carry the labels, so they are
 * scanned first and the 240 kB signal files fetched only for chosen records —
 * which is why this costs megabytes rather than the full 88,000-record set.
 *
 * Usage:  npm run fetch:challenge -- [--atlas 4] [--scan 1200]
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  type AtlasCase,
  download,
  ensureDir,
  fetchText,
  numArg,
  parseCsv,
} from "./corpora/shared.ts";
import { classifySnomed, SNOMED_TO_SCP } from "./corpora/vocabulary.ts";

const BASE = "https://physionet.org/files/challenge-2021/1.0.3/training";
const MAPPING =
  "https://raw.githubusercontent.com/physionetchallenges/evaluation-2021/main";
const OUT = fileURLToPath(new URL("../data/challenge2021/", import.meta.url));
const PTBXL = fileURLToPath(new URL("../data/ptbxl/", import.meta.url));

/**
 * PTB-XL is excluded: we already have it, at better label quality, through its
 * own fetcher. Taking it twice would double-count every finding.
 */
const SOURCES: { dir: string; label: string }[] = [
  { dir: "chapman_shaoxing", label: "Chapman-Shaoxing (China)" },
  { dir: "ningbo", label: "Ningbo (China)" },
  { dir: "georgia", label: "Georgia (USA)" },
  { dir: "cpsc_2018", label: "CPSC 2018 (China)" },
  { dir: "cpsc_2018_extra", label: "CPSC-Extra (China)" },
  { dir: "st_petersburg_incart", label: "INCART (Russia)" },
  { dir: "ptb", label: "PTB (Germany)" },
];

const args = process.argv.slice(2);
const perFinding = numArg(args, "--atlas", 4);
const scanLimit = numArg(args, "--scan", 1200);

/** Pull hrefs out of a PhysioNet directory listing. */
function hrefs(html: string, re: RegExp): string[] {
  return [...html.matchAll(re)].map((m) => m[1]!);
}

/** Run `jobs` with bounded concurrency, to stay a polite client. */
async function pooled<T>(jobs: (() => Promise<T>)[], width = 8): Promise<T[]> {
  const out: T[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, jobs.length) }, async () => {
      while (next < jobs.length) {
        const i = next++;
        try {
          out.push(await jobs[i]!());
        } catch {
          // One unreadable record must not end the scan.
        }
      }
    }),
  );
  return out;
}

// --- the finding table ------------------------------------------------------

const dxRows = [
  ...parseCsv(await fetchText(`${MAPPING}/dx_mapping_scored.csv`)),
  ...parseCsv(await fetchText(`${MAPPING}/dx_mapping_unscored.csv`)),
];
const snomedInfo = new Map(
  dxRows.map((r) => [r.SNOMEDCTCode!, { dx: r.Dx!, abbr: r.Abbreviation! }]),
);

/** PTB-XL's own descriptions, so an aliased finding keeps one name. */
const scpInfo = new Map<string, { description: string; kind: string; cls: string }>();
try {
  for (const r of parseCsv(await readFile(`${PTBXL}scp_statements.csv`, "utf8"))) {
    const code = Object.values(r)[0] as string;
    if (!code) continue;
    scpInfo.set(code, {
      description: r.description ?? code,
      kind: r.rhythm === "1.0"
        ? "rhythm"
        : r.form === "1.0" && r.diagnostic !== "1.0"
        ? "form"
        : "diagnostic",
      cls: r.diagnostic_class ?? "",
    });
  }
} catch {
  console.log("note: PTB-XL statements not present, so aliases keep SNOMED names");
}

/** Resolve one SNOMED code to a vocabulary entry, or null if we cannot name it. */
function resolve(snomed: string) {
  const info = snomedInfo.get(snomed);
  if (!info) return null;
  const scp = SNOMED_TO_SCP[snomed];
  if (scp) {
    const s = scpInfo.get(scp);
    return {
      id: scp,
      description: s?.description ?? info.dx,
      kind: (s?.kind ?? classifySnomed(info.dx).kind) as AtlasCase["findings"][0]["kind"],
      diagnosticClass: s?.cls ?? classifySnomed(info.dx).diagnosticClass,
      sourceCode: snomed,
    };
  }
  const c = classifySnomed(info.dx);
  return {
    id: `SNOMED:${snomed}`,
    description: info.dx,
    kind: c.kind,
    diagnosticClass: c.diagnosticClass,
    sourceCode: snomed,
  };
}

// --- scan ------------------------------------------------------------------

interface Scanned {
  source: string;
  sourceLabel: string;
  group: string;
  name: string;
  header: string;
}

const scanned: Scanned[] = [];
for (const src of SOURCES) {
  let listing: string;
  try {
    listing = await fetchText(`${BASE}/${src.dir}/`);
  } catch {
    console.log(`  ${src.dir}: unreachable, skipped`);
    continue;
  }
  const groups = hrefs(listing, /href="(g\d+)\//g);
  const names: { group: string; name: string }[] = [];
  for (const g of groups) {
    if (names.length >= scanLimit) break;
    const gl = await fetchText(`${BASE}/${src.dir}/${g}/`).catch(() => "");
    for (const h of hrefs(gl, /href="([^"]+)\.hea"/g)) {
      names.push({ group: g, name: h });
      if (names.length >= scanLimit) break;
    }
  }
  const got = await pooled(
    names.map(({ group, name }) => async () => ({
      source: src.dir,
      sourceLabel: src.label,
      group,
      name,
      header: await fetchText(`${BASE}/${src.dir}/${group}/${name}.hea`),
    })),
  );
  scanned.push(...got);
  console.log(`  ${src.dir}: scanned ${got.length} headers`);
}

// --- select -----------------------------------------------------------------

function dxOf(header: string): string[] {
  const l = header.split("\n").find((x) => x.trim().toLowerCase().startsWith("# dx:"));
  return l
    ? l.slice(l.indexOf(":") + 1).split(",").map((s) => s.trim()).filter((s) => /^\d+$/.test(s))
    : [];
}

const perFindingCount = new Map<string, number>();
const unmapped = new Map<string, number>();
const chosen: Scanned[] = [];

for (const rec of scanned) {
  const codes = dxOf(rec.header);
  let wanted = false;
  for (const code of codes) {
    const f = resolve(code);
    if (!f) {
      unmapped.set(code, (unmapped.get(code) ?? 0) + 1);
      continue;
    }
    const n = perFindingCount.get(f.id) ?? 0;
    if (n < perFinding) {
      perFindingCount.set(f.id, n + 1);
      wanted = true;
    }
  }
  if (wanted) chosen.push(rec);
}

console.log(
  `\n${scanned.length} headers scanned, ${chosen.length} records selected across ` +
    `${perFindingCount.size} findings (~${(chosen.length * 0.24).toFixed(0)} MB)`,
);

// Unmapped codes are printed, never dropped in silence. A long list here means
// the vocabulary is incomplete, which is a different problem from bad data.
if (unmapped.size) {
  const top = [...unmapped].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log(`\n${unmapped.size} SNOMED codes had no vocabulary entry; most frequent:`);
  for (const [code, n] of top) {
    console.log(`  ${code}  x${n}  ${snomedInfo.get(code)?.dx ?? "(absent from the mapping table)"}`);
  }
}

// --- fetch and index --------------------------------------------------------

let bytes = 0;
for (const rec of chosen) {
  const dir = `${OUT}${rec.source}/`;
  await ensureDir(dir);
  for (const ext of ["hea", "mat"]) {
    bytes += await download(
      `${BASE}/${rec.source}/${rec.group}/${rec.name}.${ext}`,
      `${dir}${rec.name}.${ext}`,
    );
  }
}

const cases: AtlasCase[] = chosen.map((rec) => {
  const findings = dxOf(rec.header)
    .map(resolve)
    .filter((f): f is NonNullable<typeof f> => f !== null);
  const age = /# Age:\s*(\d+)/.exec(rec.header)?.[1];
  const sex = /# Sex:\s*(\w+)/.exec(rec.header)?.[1]?.toLowerCase() ?? "";
  return {
    id: `${rec.source}:${rec.name}`,
    source: rec.source,
    sourceLabel: rec.sourceLabel,
    // No source here records whether a human reviewed the label, so none of
    // them may claim it. PTB-XL can and does.
    provenance: "as-published",
    age: age ? Number(age) : null,
    sex: sex.startsWith("f") ? "F" : sex.startsWith("m") ? "M" : null,
    report: "",
    findings,
  };
});

await ensureDir(OUT);
await writeFile(`${OUT}atlas.json`, JSON.stringify(cases, null, 1));
console.log(
  `\ndone: ${(bytes / 1e6).toFixed(0)} MB fetched, ${cases.length} cases -> ` +
    `data/challenge2021/atlas.json`,
);

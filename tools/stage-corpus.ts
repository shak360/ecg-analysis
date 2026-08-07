/**
 * Build the corpus the deployed site serves.
 *
 * Development mounts `data/` straight off disk through a Vite middleware, which
 * is 428 MB across 1,207 records. That cannot ship. This turns it into 44 MB
 * without discarding anything the site shows, by doing two things:
 *
 *  1. **Trim to the displayed window.** `firstWindow` already takes the leading
 *     `ATLAS_WINDOW_S` of every record at runtime and reports what it left off.
 *     Doing that at build time is not a new editorial decision — it is the same
 *     one, moved earlier — and it matters enormously for INCART, whose 25
 *     records are 30-minute Holters and 65% of the whole corpus by size. A
 *     reader downloads 62 KB instead of 11 MB for a case that displayed ten
 *     seconds either way.
 *  2. **Pack and gzip the samples** (see `web/src/ingest/packed.ts`).
 *
 * Both steps carry real weight, and the first carries more than one would
 * guess. Measured over the whole atlas: 428 MB raw; 296 MB under plain gzip
 * (1.4x, because interleaved channels hide their own redundancy); 81 MB once
 * trimmed (5.3x); 44 MB trimmed and packed (9.7x).
 *
 * A trimmed record gets a rewritten header: the sample count changes, and each
 * channel's checksum is recomputed over the samples that remain. The init value
 * is left alone because a *leading* window still starts at the same sample —
 * which is also why the window has to be the leading one for this to be a
 * rewrite rather than a fabrication.
 *
 * Run as part of `npm run build:site`; nothing in dev depends on it.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ATLAS_WINDOW_S } from "../web/src/app/corpus.ts";
import { gzip, pack, PACKED_EXT } from "../web/src/ingest/packed.ts";
import { parseHeader } from "../web/src/ingest/wfdb.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "dist");

interface Source {
  /** Directory the atlas index lives in. */
  dir: string;
  /** URL prefix the site fetches these under. */
  mount: string;
  /** Extra files copied verbatim next to the index. */
  extras: string[];
}

const SOURCES: Source[] = [
  { dir: "data/ptbxl", mount: "corpus", extras: ["atlas.json", "serial-pairs.json"] },
  { dir: "data/challenge2021", mount: "corpus-challenge", extras: ["atlas.json"] },
];

/** Where a case id's two files live, relative to its source directory. */
function pathsFor(id: string): { hea: string; sig: string } | null {
  const [source, ref] = id.split(":");
  if (!source || !ref) return null;
  if (source === "ptbxl") {
    const name = `records500/${String(Number(ref)).padStart(5, "0")}_hr`;
    return { hea: `${name}.hea`, sig: `${name}.dat` };
  }
  return { hea: `${source}/${ref}.hea`, sig: `${source}/${ref}.mat` };
}

/**
 * A WFDB checksum: the low 16 bits of the running sum of a channel's samples,
 * as a signed value. Recomputed rather than dropped, so a trimmed record stays
 * a valid record and not one carrying a checksum for data it no longer holds.
 */
function checksum(samples: Int16Array, channel: number, nSig: number, n: number): number {
  let sum = 0;
  for (let i = 0; i < n; i++) sum = (sum + samples[i * nSig + channel]!) | 0;
  return ((sum & 0xffff) << 16) >> 16;
}

/** Rewrite a header for a leading window of `n` samples. */
function trimHeader(text: string, n: number, samples: Int16Array, nSig: number): string {
  const lines = text.split("\n");
  let seen = 0;
  return lines
    .map((line) => {
      const t = line.trim();
      if (!t || t.startsWith("#")) return line;
      const f = t.split(/\s+/);
      if (seen === 0) {
        // Record line: name nSig fs nSamples [...]
        seen++;
        if (f.length >= 4) f[3] = String(n);
        return f.join(" ");
      }
      // Signal line; field 6 is the checksum, field 5 the init value.
      const c = seen - 1;
      seen++;
      if (f.length >= 7 && c < nSig) f[6] = String(checksum(samples, c, nSig, n));
      return f.join(" ");
    })
    .join("\n");
}

function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from)) {
    const src = join(from, entry);
    const dst = join(to, entry);
    if (statSync(src).isDirectory()) copyTree(src, dst);
    else writeFileSync(dst, readFileSync(src));
  }
}

async function main(): Promise<void> {
  // Staging writes into `dist/`, and `vite build` has `emptyOutDir: true`, so
  // running these the wrong way round silently deletes everything this tool
  // produced. `build:site` orders them correctly; a hand-run gate is where it
  // goes wrong, and it goes wrong quietly — the corpus is simply not there
  // afterwards, which looks exactly like a stage that was never run.
  if (!existsSync(join(OUT, "index.html"))) {
    console.error("dist/ has no index.html, so `vite build` has not run yet.");
    console.error("  Staging now would be undone by the build, which empties the directory.");
    console.error("  Run `npm run build:site`, which does both in the right order.");
    process.exitCode = 1;
    return;
  }

  let staged = 0;
  let skipped = 0;
  let trimmed = 0;
  let bytesIn = 0;
  let bytesOut = 0;
  const missing: string[] = [];
  const perSource = new Map<string, number>();

  for (const source of SOURCES) {
    const dir = join(root, source.dir);
    const outDir = join(OUT, source.mount);
    let index: { id: string }[];
    try {
      index = JSON.parse(readFileSync(join(dir, "atlas.json"), "utf8")) as { id: string }[];
    } catch {
      // Not a warning. This tool only ever runs to produce a deployable site,
      // and a corpus whose index is absent is not "a corpus this machine did
      // not fetch" — it is most of the site missing.
      //
      // Skipping with a warning is what published 313 of 1,207 cases behind a
      // green tick: `npm run fetch:ptbxl` writes `serial-pairs.json` and only
      // writes `atlas.json` when given `--atlas`, so CI fetched 149 MB of
      // PTB-XL records and produced no index for them. Everything downstream
      // was correct about a corpus that was three quarters absent.
      console.error(`\n${source.dir}/atlas.json is missing.`);
      console.error("  Nothing from this corpus can be staged without it, so the site would");
      console.error("  deploy with a picker full of cases it cannot load.");
      console.error(source.dir.includes("ptbxl")
        ? "  Run `npm run fetch:ptbxl -- --atlas` (the bare form writes only the pair index)."
        : "  Run `npm run fetch:challenge`.");
      process.exitCode = 1;
      continue;
    }

    mkdirSync(outDir, { recursive: true });
    for (const extra of source.extras) {
      try {
        writeFileSync(join(outDir, extra), readFileSync(join(dir, extra)));
      } catch {
        /* serial-pairs.json only exists for PTB-XL */
      }
    }

    // The atlas index is not the whole of what the site serves.
    //
    // `serial-pairs.json` names its own before/after records, chosen by a
    // different selection in the same fetch tool, and 309 of the 1,095 it
    // references are in no atlas entry. Staging only the atlas index left the
    // Serial pairs page listing 604 pairs of which more than a quarter 404 when
    // opened — and, unlike a missing index, that failure is per-case and only
    // shows up when a reader clicks the wrong one.
    const wanted = index.map((e) => e.id);
    for (const extra of source.extras) {
      if (extra !== "serial-pairs.json") continue;
      try {
        const pairs = JSON.parse(readFileSync(join(dir, extra), "utf8")) as
          { before: number; after: number }[];
        for (const p of pairs) wanted.push(`ptbxl:${p.before}`, `ptbxl:${p.after}`);
      } catch {
        /* absent, and already reported by the copy above */
      }
    }

    const seen = new Set<string>();
    for (const id of wanted) {
      if (seen.has(id)) continue;
      seen.add(id);
      const p = pathsFor(id);
      if (!p) continue;

      let headerText: string;
      let file: Uint8Array;
      try {
        headerText = readFileSync(join(dir, p.hea), "utf8");
        file = new Uint8Array(readFileSync(join(dir, p.sig)));
      } catch {
        missing.push(id);
        skipped++;
        continue;
      }
      // fallthrough: the record is on disk and will be staged
      bytesIn += file.byteLength;

      const { fsHz, nSamples, signals } = parseHeader(headerText);
      const nSig = signals.length;
      const offset = signals[0]?.byteOffset ?? 0;
      const want = Math.round(ATLAS_WINDOW_S * fsHz);
      const n = Math.min(nSamples, want);

      let outHeader = headerText;
      if (n < nSamples) {
        const all = new Int16Array(nSamples * nSig);
        new Uint8Array(all.buffer).set(file.subarray(offset, offset + nSamples * nSig * 2));
        outHeader = trimHeader(headerText, n, all, nSig);
        trimmed++;
      }

      const packed = await gzip(pack(file, nSig, n, offset));
      bytesOut += packed.byteLength + outHeader.length;

      const dest = join(outDir, p.sig);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(join(outDir, p.hea), outHeader);
      writeFileSync(`${dest}${PACKED_EXT}`, packed);
      staged++;
      perSource.set(source.mount, (perSource.get(source.mount) ?? 0) + 1);
    }
  }

  // The synthetic PDFs the `try` and `dev` pages fetch under `/fixtures/`.
  //
  // They live in `test/fixtures`, which the dev server maps onto that URL
  // through the `fixtures()` plugin in vite.config.ts — there is no `public/`
  // directory, and a build does not copy them. Those two pages are blank
  // without this, which is why it warns rather than passing quietly: they are
  // generated by `npm run fixtures` and gitignored, so an absent directory
  // means a step was skipped, not that the files do not exist.
  const fixtures = join(root, "test/fixtures");
  try {
    if (!statSync(fixtures).isDirectory()) throw new Error("not a directory");
    copyTree(fixtures, join(OUT, "fixtures"));
  } catch {
    console.warn("  no test/fixtures — `try` and `dev` will have nothing to load.");
    console.warn("  Run `npm run fixtures` before building the site.");
  }

  const mb = (b: number) => `${(b / 1e6).toFixed(1)} MB`;
  // Per source, not just the total: an aggregate looks healthy while one corpus
  // is entirely absent, which is exactly the failure this reporting missed.
  for (const [name, n] of perSource) console.log(`  ${name.padEnd(18)} ${n} records`);
  console.log(`staged ${staged} records (${trimmed} trimmed to ${ATLAS_WINDOW_S}s)`);
  console.log(`  ${mb(bytesIn)} on disk -> ${mb(bytesOut)} served  (${(bytesIn / bytesOut).toFixed(1)}x)`);
  if (skipped) {
    console.warn(`  ${skipped} records referenced by an atlas index but absent from data/:`);
    console.warn(`    ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", ..." : ""}`);
    console.warn("  The deployed site will show those cases in the picker and fail to load them.");
    process.exitCode = 1;
  }
}

await main();

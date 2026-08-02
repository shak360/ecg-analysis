/**
 * Machinery shared by every corpus fetcher.
 *
 * Extracted from `fetch-ptbxl.ts` when the second corpus arrived, because two
 * copies of a CSV parser is how one of them ends up without the quoted-field
 * handling and silently truncates a report at its first comma.
 */
import { mkdir, stat, writeFile } from "node:fs/promises";

/** Parse one CSV line, honouring quoted fields. */
export function splitCsv(line: string): string[] {
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

/** Parse a whole CSV into records keyed by header name. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const head = splitCsv(lines[0]!);
  return lines.slice(1).map((l) => {
    const f = splitCsv(l);
    return Object.fromEntries(head.map((h, i) => [h, f[i] ?? ""]));
  });
}

/**
 * Read a numeric flag, or fall back.
 *
 * `args[args.indexOf(flag) + 1]` looks harmless and is not: when the flag is
 * absent `indexOf` gives -1, so it reads `args[0]` — some *other* flag — and
 * `Number("--atlas")` is NaN, which `??` does not catch because NaN is not
 * nullish. That once wrote a serial index with no controls in it.
 */
export function numArg(args: string[], flag: string, fallback: number): number {
  const i = args.indexOf(flag);
  if (i < 0) return fallback;
  const v = Number(args[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return await res.text();
}

/** Download one file, returning its size. Skips anything already present. */
export async function download(url: string, dest: string): Promise<number> {
  try {
    await stat(dest);
    return 0;
  } catch { /* not yet fetched */ }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  await writeFile(dest, buf);
  return buf.byteLength;
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/**
 * One case in the atlas index, whatever corpus it came from.
 *
 * `provenance` is the field that keeps this honest. PTB-XL is the only source
 * that records whether a human reviewed the label; the Challenge sources ship
 * theirs as published. Rather than quietly dropping the standard the atlas held
 * itself to, each case says which it is, and the page shows it.
 */
export interface AtlasCase {
  /** Unique across corpora: `ptbxl:1234`, `chapman:JS00001`. */
  id: string;
  source: string;
  sourceLabel: string;
  provenance: "human-validated" | "as-published";
  age: number | null;
  sex: "M" | "F" | null;
  report: string;
  findings: {
    id: string;
    description: string;
    kind: "diagnostic" | "form" | "rhythm";
    diagnosticClass: string;
    /** The code as the source corpus wrote it, kept so a case is traceable. */
    sourceCode: string;
  }[];
}

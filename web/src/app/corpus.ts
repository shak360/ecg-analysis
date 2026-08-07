/**
 * The atlas corpus index, and the window of a record any page shows.
 *
 * Three pages now load the same two JSON indexes and trim the same ten seconds
 * off the front of a record. Two copies were already a hazard; a third is where
 * the contract starts drifting, and the drift would be silent — a page that
 * forgot to trim would draw thirty minutes of Holter as if it were a printout
 * and look merely wrong rather than broken.
 */

import { assetUrl } from "./site.ts";

export interface Statement {
  id: string;
  description: string;
  diagnosticClass: string;
  kind: "diagnostic" | "form" | "rhythm";
  sourceCode: string;
}

export interface Entry {
  id: string;
  source: string;
  sourceLabel: string;
  /**
   * Whether a human reviewed this label.
   *
   * Only PTB-XL records it. Shown on every case rather than quietly dropped,
   * because the atlas held itself to human-validated labels while it had one
   * corpus, and a learner is entitled to know when that standard no longer
   * applies.
   */
  provenance: "human-validated" | "as-published";
  age: number | null;
  sex: "M" | "F" | null;
  report: string;
  findings: Statement[];
}

export interface CorpusIndex {
  entries: Entry[];
  /** Cases carrying each statement id. */
  byCode: Map<string, Entry[]>;
  /** Every statement seen, by id. */
  meta: Map<string, Statement>;
  /** Corpus id to its human label, for a filter. */
  sources: Map<string, string>;
}

/** Where the indexes live. Either being absent is ordinary, not a fault. */
const SOURCES = ["corpus/atlas.json", "corpus-challenge/atlas.json"];

/**
 * Load every corpus index that is present.
 *
 * Each corpus writes its own index in the same shape, so merging is an append.
 * A machine that has fetched only one of them is the common case, so a missing
 * file yields nothing rather than throwing.
 */
export async function loadCorpusIndex(): Promise<CorpusIndex> {
  const loaded = await Promise.all(SOURCES.map(async (u) => {
    try {
      const res = await fetch(assetUrl(u));
      return res.ok ? (await res.json()) as Entry[] : [];
    } catch {
      return [];
    }
  }));
  return indexEntries(loaded.flat());
}

/** Build the lookups. Separated so a test can supply entries directly. */
export function indexEntries(entries: Entry[]): CorpusIndex {
  const byCode = new Map<string, Entry[]>();
  const meta = new Map<string, Statement>();
  const sources = new Map<string, string>();

  for (const e of entries) {
    sources.set(e.source, e.sourceLabel);
    for (const s of e.findings) {
      meta.set(s.id, s);
      const list = byCode.get(s.id) ?? [];
      list.push(e);
      byCode.set(s.id, list);
    }
  }
  return { entries, byCode, meta, sources };
}

/**
 * Ten seconds, which is not an arbitrary cap: it is what a standard printout
 * already claims to be at 25 mm/s across a page.
 */
export const ATLAS_WINDOW_S = 10;

export interface Window {
  leads: Map<string, Float32Array>;
  nSamples: number;
  /** Record length in seconds, when it was longer than the window. */
  trimmedFrom: number | null;
}

/**
 * The leading window of a record, and how much was left off.
 *
 * The *first* window rather than a chosen one, because any other rule is a
 * judgement about which part of somebody's Holter is representative, and these
 * pages do not make judgements about tracings. The caller says what it did.
 */
export function firstWindow(
  rec: { leads: Map<string, Float32Array>; fsHz: number; nSamples: number },
): Window {
  const want = Math.round(ATLAS_WINDOW_S * rec.fsHz);
  if (rec.nSamples <= want) {
    return { leads: rec.leads, nSamples: rec.nSamples, trimmedFrom: null };
  }
  const leads = new Map<string, Float32Array>();
  for (const [name, samples] of rec.leads) leads.set(name, samples.subarray(0, want));
  return { leads, nSamples: want, trimmedFrom: rec.nSamples / rec.fsHz };
}

// --- finding classes -------------------------------------------------------

export const CATEGORIES: { id: string; label: string; blurb: string }[] = [
  { id: "NORM", label: "Normal", blurb: "the reference every other card is read against" },
  { id: "RHYTHM", label: "Rhythm", blurb: "what is driving the heart, and how regularly" },
  { id: "CD", label: "Conduction", blurb: "blocks, delays and accessory pathways" },
  { id: "MI", label: "Infarction", blurb: "Q waves and the territories they name" },
  { id: "STTC", label: "ST & T", blurb: "repolarisation: elevation, depression, inversion" },
  { id: "HYP", label: "Hypertrophy", blurb: "voltage and chamber enlargement" },
  { id: "OTHER", label: "Other morphology", blurb: "descriptive findings without a diagnosis" },
];

/** Which card a statement belongs under. Every statement lands in exactly one. */
export function categoryOf(s: Statement): string {
  if (s.kind === "rhythm") return "RHYTHM";
  if (CATEGORIES.some((c) => c.id === s.diagnosticClass)) return s.diagnosticClass;
  return "OTHER";
}

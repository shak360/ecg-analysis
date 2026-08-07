/**
 * Resolvable identifiers for the works the criteria cite.
 *
 * Every entry already carried a full reference in prose, gathered by hand and
 * flagged where a primary source could not be read. What none of them carried
 * was anything a reader could follow, so checking a threshold against its source
 * meant retyping a citation into a search box — which, in a teaching tool whose
 * whole argument is "here is where this number comes from", is the point at
 * which most readers stop.
 *
 * The identifiers are **not** written here from memory. `tools/verify-citations.ts`
 * searches PubMed for each work and accepts a record only if its journal, year,
 * volume and pages agree with what the criteria already state, then writes
 * `references.json`. A DOI recalled rather than resolved is the exact failure
 * `types.ts` is built around — a wrong number rendered authoritatively — and a
 * link is worse than plain text when it is wrong, because it *looks* checked.
 *
 * All 18 resolved. Re-run the tool after adding a work:
 *
 *   npx vite-node tools/verify-citations.ts
 */
import data from "./references.json";

export interface Reference {
  pmid: string;
  doi: string | null;
  journal: string;
  year: number;
  volume: string;
  pages: string;
}

export const REFERENCES: Readonly<Record<string, Reference>> = data as Record<string, Reference>;

/**
 * Where to send a reader for one work.
 *
 * DOI first, because it resolves to the publisher's own copy of record; PubMed
 * otherwise, which always exists here since a PMID is what made the entry
 * verifiable in the first place. Both are stable identifiers rather than the
 * publisher URLs that rot.
 */
export function referenceUrl(ref: Reference): string {
  return ref.doi ? `https://doi.org/${ref.doi}` : `https://pubmed.ncbi.nlm.nih.gov/${ref.pmid}/`;
}

/** `Circulation 2009;119:e251-61` — the locus, for a link's visible text. */
export function referenceLabel(ref: Reference): string {
  return `${ref.journal} ${ref.year};${ref.volume}${ref.pages ? `:${ref.pages}` : ""}`;
}

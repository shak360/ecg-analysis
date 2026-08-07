/**
 * The citation links, checked without a network.
 *
 * `tools/verify-citations.ts` is what proves an identifier points at the right
 * paper — it asks PubMed and compares journal, year, volume and pages against
 * what the criteria state. That check needs the network and is run by hand, the
 * same arrangement as the `#[ignore]` corpus surveys in Rust.
 *
 * What is left for a fast offline test is everything that can rot *between*
 * those runs: an entry tagged with a key that no longer exists, a reference
 * whose year contradicts the entry citing it, a malformed identifier, or a work
 * that stopped being cited by anything. Those are all silent failures — a
 * missing key renders as no link at all, which looks identical to a source that
 * genuinely has none.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

import { CRITERIA } from "../web/src/criteria/index.ts";
import { REFERENCES, referenceLabel, referenceUrl } from "../web/src/criteria/references.ts";

test("every key an entry cites exists", () => {
  // The failure this catches renders as a missing link, not an error, so
  // nothing about the page would look wrong.
  const missing: string[] = [];
  for (const e of CRITERIA) {
    for (const k of e.refs) if (!REFERENCES[k]) missing.push(`${e.title} -> ${k}`);
  }
  expect(missing).toEqual([]);
});

test("every reference is cited by something", () => {
  // The other direction. A reference nobody uses is either a leftover or a
  // tagging mistake, and both are worth knowing about.
  const used = new Set(CRITERIA.flatMap((e) => e.refs));
  const orphans = Object.keys(REFERENCES).filter((k) => !used.has(k));

  // These three are cited outside the criteria panel rather than by a
  // `CriterionEntry`: Kors on the vector-loop view, Fridericia on the QTc row,
  // PTB-XL in the atlas disclaimer. They are listed rather than excused, so a
  // reference that quietly stops being used anywhere still shows up here.
  expect(orphans.sort()).toEqual(["fridericia-1920", "kors-1990", "wagner-2020-ptbxl"]);
  for (const k of orphans) {
    const cited = ["web/src/ui/vcg-view.ts", "web/src/ui/measurements.ts", "web/index.html"]
      .some((f) => readFileSync(f, "utf8").includes(k) || readFileSync(f, "utf8").includes(REFERENCES[k]!.doi ?? "\u0000"));
    expect(cited, `${k} is cited by no criterion and by no page`).toBe(true);
  }
});

test("identifiers are well formed", () => {
  for (const [key, r] of Object.entries(REFERENCES)) {
    expect(r.pmid, key).toMatch(/^\d{7,8}$/);
    if (r.doi !== null) expect(r.doi, key).toMatch(/^10\.\d{4,9}\//);
    expect(r.year, key).toBeGreaterThan(1900);
    expect(r.year, key).toBeLessThan(2100);
    expect(r.journal, key).not.toBe("");
  }
});

test("a link goes to the DOI when there is one, and PubMed otherwise", () => {
  const withDoi = Object.values(REFERENCES).find((r) => r.doi);
  expect(referenceUrl(withDoi!)).toBe(`https://doi.org/${withDoi!.doi}`);

  const noDoi = { pmid: "18107386", doi: null, journal: "Am Heart J", year: 1949, volume: "37", pages: "161-86" };
  expect(referenceUrl(noDoi)).toBe("https://pubmed.ncbi.nlm.nih.gov/18107386/");
});

test("every key is a work the entry's own prose names", () => {
  // The check that catches a mis-tag, which is the failure that matters here: a
  // link rendered under a criterion it does not support reads as evidence for
  // that criterion.
  //
  // Comparing against the entry's `source` text works because that text is a
  // full bibliographic citation, so the first author's surname is in it if the
  // work is being cited at all. Accents are folded because the prose spells
  // Pérez-Riera correctly and a key cannot.
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const unnamed: string[] = [];

  for (const e of CRITERIA) {
    const prose = fold(e.source);
    for (const k of e.refs) {
      const surname = k.split("-")[0]!;
      if (!prose.includes(surname)) unnamed.push(`${e.title} -> ${k} ("${surname}" not in source)`);
    }
  }
  expect(unnamed).toEqual([]);
});

test("a later work may be cited by an earlier definition, which is the norm here", () => {
  // Worth pinning as intended rather than leaving it to look like a bug. An
  // entry's `year` is the year of the *definition*, so it orders rival
  // definitions against each other; the works it cites are frequently later,
  // because that is how this document was assembled — a 1949 criterion read
  // through the AHA's 2009 table, a 1985 criterion with its 1987 autopsy
  // validation, a paywalled 2009 statement verified against a 2019 guideline.
  const later = CRITERIA.flatMap((e) =>
    e.refs.filter((k) => (REFERENCES[k]?.year ?? 0) > e.year).map((k) => `${e.year}->${k}`),
  );
  expect(later.length).toBeGreaterThan(0);
});

test("the label names the locus a reader is being sent to", () => {
  const r = REFERENCES["hancock-2009-partv"]!;
  expect(referenceLabel(r)).toBe(`${r.journal} ${r.year};${r.volume}:${r.pages}`);
  expect(referenceLabel(r)).toContain("2009");
});

test("the Minnesota Code entries carry no reference, deliberately", () => {
  // It is a printed manual with no DOI and no PubMed record. Linking it to a
  // paper *about* the code would send a reader somewhere that does not contain
  // the criterion they clicked, so empty is the correct answer and this pins it
  // as a decision rather than an oversight.
  const minnesota = CRITERIA.filter((e) => /Minnesota Code/.test(e.title));
  expect(minnesota.length).toBeGreaterThan(0);
  for (const e of minnesota) expect(e.refs, e.title).toEqual([]);
});

test("every entry that names a journal has something to click", () => {
  // The converse of the test above, and the one that catches a new entry added
  // without tagging: if the source prose cites a journal, a reader should not
  // have to retype it.
  const untagged = CRITERIA
    .filter((e) => e.refs.length === 0 && !/Minnesota Code/.test(e.title))
    .map((e) => e.title);
  expect(untagged).toEqual([]);
});

test("the DOIs hardcoded into page markup match the verified ones", () => {
  // HTML cannot import `references.json`, so the two links written directly
  // into `index.html` — the corpus paper and the axis claim — are the one place
  // an identifier is duplicated. Duplicated is fine; drifting is not, and it
  // would drift silently, since a stale DOI still resolves to *a* paper.
  const html = readFileSync("web/index.html", "utf8");
  const inMarkup = [...html.matchAll(/https:\/\/doi\.org\/([^"\s]+)/g)].map((m) => m[1]!);
  expect(inMarkup.length).toBeGreaterThan(0);

  const verified = new Set(Object.values(REFERENCES).map((r) => r.doi).filter(Boolean));
  for (const doi of inMarkup) expect(verified, doi).toContain(doi);
});

test("every page link carries rel=noopener with its target=_blank", () => {
  // A `target="_blank"` without it hands the opened page a handle back to this
  // one. Cheap to get wrong by hand, and these links go to publishers.
  const html = readFileSync("web/index.html", "utf8");
  const blanks = [...html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)].map((m) => m[0]);
  expect(blanks.length).toBeGreaterThan(0);
  for (const tag of blanks) expect(tag, tag.slice(0, 80)).toContain('rel="noopener"');
});

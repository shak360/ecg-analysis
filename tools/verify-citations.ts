/**
 * Resolve every published work the criteria cite to a PMID and a DOI, and check
 * that what resolved is what was cited.
 *
 * The criteria already carry full references, gathered by hand and flagged
 * where a primary source could not be read. What they do not carry is anything
 * a reader can click, and that is the gap this closes.
 *
 * It closes it by *derivation rather than recall*. A DOI written from memory is
 * exactly the failure `criteria/types.ts` is built to avoid — a wrong number
 * rendered authoritatively — and it is worse than a plain-text citation,
 * because a link that resolves to the wrong paper looks more trustworthy than
 * no link at all. So nothing here is typed in from what a DOI "usually looks
 * like": each work is searched for by title in PubMed, and the identifier is
 * accepted only if the record that comes back agrees with the journal, year,
 * volume and pages the criteria already state.
 *
 * A work that does not resolve is reported as unresolved and stays plain text.
 * Guidelines reprinted in several journals, and the Minnesota Code manual, are
 * expected to be among them.
 *
 *   npx vite-node tools/verify-citations.ts
 *
 * Writes `web/src/criteria/references.json`, which the app imports.
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

/**
 * The works the criteria cite, keyed by the short name used in prose.
 *
 * `expect` is what the criteria already assert about each: it is the check, not
 * the query. A search that returns a plausible-but-different paper fails here
 * rather than shipping.
 */
interface Work {
  key: string;
  /** Searched for verbatim. */
  title: string;
  /**
   * A candidate to check when the title search finds nothing.
   *
   * Some records are simply not reachable through PubMed's title index —
   * Fridericia's 1920 paper, reprinted in translation in 2003, is one — and
   * refusing to link it because the *search* failed would be letting a quirk of
   * an index decide what a reader can look up. This changes only how the
   * candidate is found. It is verified against `expect` exactly like a searched
   * one, so a mistyped id fails here rather than shipping a wrong link.
   */
  pmidHint?: string;
  expect: { journal: RegExp; year: number; volume?: string; pages?: RegExp };
}

const WORKS: Work[] = [
  {
    key: "sokolow-lyon-1949",
    title:
      "The ventricular complex in left ventricular hypertrophy as obtained by unipolar precordial and limb leads",
    expect: { journal: /Am Heart J/i, year: 1949, volume: "37", pages: /161/ },
  },
  {
    key: "hancock-2009-partv",
    // PubMed truncates the subtitle differently from the printed citation, so
    // the search is on the stable stem and the check does the rest.
    title: "AHA/ACCF/HRS recommendations for the standardization and interpretation of the electrocardiogram: part V",
    expect: { journal: /Circulation/i, year: 2009, volume: "119", pages: /e251/ },
  },
  {
    key: "surawicz-2009-partiii",
    title:
      "AHA/ACCF/HRS recommendations for the standardization and interpretation of the electrocardiogram: part III: intraventricular conduction disturbances",
    expect: { journal: /Circulation|J Am Coll Cardiol/i, year: 2009 },
  },
  {
    key: "casale-1985",
    title:
      "Electrocardiographic detection of left ventricular hypertrophy: development and prospective validation of improved criteria",
    expect: { journal: /J Am Coll Cardiol/i, year: 1985, volume: "6", pages: /572/ },
  },
  {
    key: "casale-1987",
    title:
      "Improved sex-specific criteria of left ventricular hypertrophy for clinical and computer interpretation of electrocardiograms: validation with autopsy findings",
    expect: { journal: /Circulation/i, year: 1987, volume: "75", pages: /565/ },
  },
  {
    key: "molloy-1992",
    title:
      "Electrocardiographic detection of left ventricular hypertrophy by the simple QRS voltage-duration product",
    expect: { journal: /J Am Coll Cardiol/i, year: 1992, volume: "20", pages: /1180/ },
  },
  {
    key: "okin-1995",
    title:
      "Electrocardiographic identification of increased left ventricular mass by simple voltage-duration products",
    expect: { journal: /J Am Coll Cardiol/i, year: 1995, volume: "25", pages: /417/ },
  },
  {
    key: "strauss-2011",
    title: "Defining left bundle branch block in the era of cardiac resynchronization therapy",
    expect: { journal: /Am J Cardiol/i, year: 2011, volume: "107", pages: /927/ },
  },
  {
    key: "baranchuk-2015",
    title:
      "Differential diagnosis of rSr' pattern in leads V1-V2. Comprehensive review and proposed algorithm",
    expect: { journal: /Ann Noninvasive Electrocardiol/i, year: 2015, volume: "20" },
  },
  {
    key: "kusumoto-2019",
    title:
      "2018 ACC/AHA/HRS Guideline on the Evaluation and Management of Patients With Bradycardia and Cardiac Conduction Delay",
    expect: { journal: /Heart Rhythm|Circulation|J Am Coll Cardiol/i, year: 2019 },
  },
  {
    key: "glikson-2021",
    title: "2021 ESC Guidelines on cardiac pacing and cardiac resynchronization therapy",
    expect: { journal: /Eur Heart J/i, year: 2021, volume: "42", pages: /3427/ },
  },
  {
    key: "brignole-2013",
    title: "2013 ESC Guidelines on cardiac pacing and cardiac resynchronization therapy",
    expect: { journal: /Eur Heart J/i, year: 2013, volume: "34", pages: /2281/ },
  },
  {
    key: "zareba-2011",
    title:
      "Effectiveness of cardiac resynchronization therapy by QRS morphology in the Multicenter Automatic Defibrillator Implantation Trial-Cardiac Resynchronization Therapy (MADIT-CRT)",
    expect: { journal: /Circulation/i, year: 2011, volume: "123", pages: /1061/ },
  },
  {
    key: "kong-2022",
    title: "Cardiac resynchronization considerations in left bundle branch block",
    expect: { journal: /Front Physiol/i, year: 2022, volume: "13" },
  },
  {
    key: "perez-riera-2019",
    title:
      "Left bundle branch block: Epidemiology, etiology, anatomic features, electrovectorcardiography, and classification proposal",
    expect: { journal: /Ann Noninvasive Electrocardiol/i, year: 2019, volume: "24" },
  },
  {
    key: "kors-1990",
    title:
      "Reconstruction of the Frank vectorcardiogram from standard electrocardiographic leads: diagnostic comparison of different methods",
    expect: { journal: /Eur Heart J/i, year: 1990, volume: "11", pages: /1083/ },
  },
  {
    key: "wagner-2020-ptbxl",
    title: "PTB-XL, a large publicly available electrocardiography dataset",
    expect: { journal: /Sci Data/i, year: 2020, volume: "7" },
  },
  {
    key: "fridericia-1920",
    // Published 1920 in Acta Medica Scandinavica; PubMed indexes the 2003
    // English translation in Ann Noninvasive Electrocardiol, which is the copy
    // a reader can actually reach.
    // PubMed appends the original year to reprinted classics, and the phrase
    // search will not match across that boundary.
    title: "The duration of systole in an electrocardiogram in normal humans and in patients with heart disease. 1920",
    pmidHint: "14516292",
    expect: { journal: /Ann Noninvasive Electrocardiol/i, year: 2003, volume: "8", pages: /343/ },
  },
];

interface Resolved {
  key: string;
  pmid: string | null;
  doi: string | null;
  title: string;
  journal: string;
  year: number | null;
  volume: string;
  pages: string;
  /** Why it was rejected, if it was. */
  rejected?: string;
}

/**
 * One E-utilities call, retried through NCBI's rate limiter.
 *
 * Without this the tool is silently non-deterministic: an unauthenticated
 * caller gets HTTP 429 under load, the lookup fails, and the reference is
 * simply absent from the output. Nothing downstream can tell that apart from a
 * work that genuinely has no PubMed record, so a link would disappear from the
 * site because a server was briefly busy.
 */
async function eutils(path: string, params: Record<string, string>): Promise<unknown> {
  const q = new URLSearchParams({ ...params, retmode: "json", tool: "ecg-atlas", email: "noreply@example.org" });
  let wait = 1000;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${EUTILS}/${path}?${q}`);
    if (res.ok) return await res.json();
    if (res.status !== 429 && res.status < 500) {
      throw new Error(`${path} returned HTTP ${res.status}`);
    }
    await new Promise((r) => setTimeout(r, wait));
    wait *= 2;
  }
  throw new Error(`${path} still rate-limited after 5 attempts`);
}

async function resolveWork(w: Work): Promise<Resolved> {
  const blank: Resolved = {
    key: w.key, pmid: null, doi: null, title: w.title, journal: "", year: null, volume: "", pages: "",
  };

  const search = (await eutils("esearch.fcgi", {
    db: "pubmed",
    term: `${w.title}[Title]`,
    // Broad candidate set, strict check. A guideline's own record often ranks
    // below the letters and commentaries that cite it by name, so a short list
    // sorted by relevance can omit the very paper being looked for. Widening
    // costs one request and cannot loosen anything: `expect` still decides.
    retmax: "25",
  })) as { esearchresult?: { idlist?: string[] } };
  const ids = search.esearchresult?.idlist ?? [];
  if (ids.length === 0 && w.pmidHint) ids.push(w.pmidHint);
  if (ids.length === 0) return { ...blank, rejected: "no PubMed record matched the title" };

  const summary = (await eutils("esummary.fcgi", { db: "pubmed", id: ids.join(",") })) as {
    result?: Record<string, {
      title?: string; source?: string; pubdate?: string; volume?: string; pages?: string;
      articleids?: { idtype: string; value: string }[];
    }>;
  };

  for (const id of ids) {
    const r = summary.result?.[id];
    if (!r) continue;
    const year = Number((r.pubdate ?? "").slice(0, 4));
    const journal = r.source ?? "";
    const volume = r.volume ?? "";
    const pages = r.pages ?? "";

    // Every stated field must agree. A near-miss is a different paper.
    if (!w.expect.journal.test(journal)) continue;
    if (Math.abs(year - w.expect.year) > 1) continue;
    if (w.expect.volume && volume !== w.expect.volume) continue;
    if (w.expect.pages && !w.expect.pages.test(pages)) continue;

    const doi = r.articleids?.find((a) => a.idtype === "doi")?.value ?? null;
    return { key: w.key, pmid: id, doi, title: r.title ?? w.title, journal, year, volume, pages };
  }

  const first = summary.result?.[ids[0]!];
  return {
    ...blank,
    rejected:
      `${ids.length} record(s) matched the title but none agreed with the stated ` +
      `journal/year/volume/pages (top hit: ${first?.source} ${first?.pubdate} ` +
      `${first?.volume}:${first?.pages})`,
  };
}

const out: Resolved[] = [];
for (const w of WORKS) {
  try {
    out.push(await resolveWork(w));
  } catch (e) {
    out.push({
      key: w.key, pmid: null, doi: null, title: w.title, journal: "", year: null,
      volume: "", pages: "", rejected: `lookup failed: ${(e as Error).message}`,
    });
  }
  // NCBI asks for no more than three requests a second without an API key.
  await new Promise((r) => setTimeout(r, 400));
}

const ok = out.filter((r) => r.pmid);
const brokeDown = out.filter((r) => r.rejected?.startsWith("lookup failed"));
console.log(`resolved ${ok.length} of ${out.length} works\n`);
for (const r of out) {
  if (r.pmid) {
    console.log(`  OK   ${r.key.padEnd(22)} PMID ${r.pmid.padEnd(9)} ${r.doi ?? "(no DOI)"}`);
    console.log(`       ${r.journal} ${r.year};${r.volume}:${r.pages}`);
  } else {
    console.log(`  --   ${r.key.padEnd(22)} ${r.rejected}`);
  }
}

const dest = resolve(root, "web/src/criteria/references.json");
writeFileSync(
  dest,
  JSON.stringify(
    Object.fromEntries(
      ok.map((r) => [r.key, { pmid: r.pmid, doi: r.doi, journal: r.journal, year: r.year, volume: r.volume, pages: r.pages }]),
    ),
    null,
    2,
  ) + "\n",
);
console.log(`\nwrote ${dest}`);

// A work with no PubMed record is a fact about the literature — the Minnesota
// Code manual is a book, not a paper — and is fine. A work whose lookup *broke*
// is a fact about the network, and writing the file anyway would quietly drop a
// citation that exists. Those are opposite situations and must not share a
// silent exit code.
if (brokeDown.length) {
  console.error(`\n${brokeDown.length} lookup(s) failed for transport reasons, not because the`);
  console.error("work is unindexed. references.json is incomplete — re-run before committing:");
  for (const r of brokeDown) console.error(`  ${r.key}: ${r.rejected}`);
  process.exitCode = 1;
}

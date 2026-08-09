/**
 * "Show, never judge", made executable.
 *
 * The evidence panel puts published criteria beside this tool's measurements for
 * a label a cardiologist assigned. Whether it stays on the right side of that
 * line is a property of its *wording and markup*, not of its logic, and wording
 * decays quietly: nothing breaks when a well-meaning edit adds a tick, a green
 * class, or the word "meets". These tests exist so that edit fails the build.
 *
 * The first test is the load-bearing one. Everything else is a detail beside it.
 */
import { expect, test } from "vitest";

import { evidenceHtml } from "../web/src/ui/evidence.ts";
import { evaluateEntry } from "../web/src/criteria/evaluate.ts";
import { CRITERIA } from "../web/src/criteria/index.ts";
import type { LeadMeasure, Measures } from "../web/src/criteria/types.ts";

const lead = (name: string, p: Partial<LeadMeasure> = {}): LeadMeasure => ({
  lead: name, stJ: null, stJ60: null, r: null, s: null, q: null, t: null,
  sigmaSt: null, note: null, ...p,
});
const measures = (leads: LeadMeasure[], g: Partial<Measures> = {}): Measures => ({
  hr: null, qrs: null, qt: null, qtNote: null, qtcF: null, qtcB: null, axis: null, axisNote: null, leads, ...g,
});

const sokolow = CRITERIA.find((c) => c.title.includes("Sokolow-Lyon precordial"))!;
const MALE = { sex: "M" as const, age: 60 };

/** Sokolow-Lyon is SV1 + max(RV5, RV6); the threshold is 3.5 mV. */
const at = (mv: number) =>
  measures([lead("V1", { s: -mv / 2 }), lead("V5", { r: mv / 2 })]);

const render = (m: Measures) =>
  evidenceHtml({
    findingLabel: "left ventricular hypertrophy",
    results: [evaluateEntry(sokolow, m, MALE)],
    coverage: { covered: 65, total: 120 },
  });

test("a value above the threshold and one below render identically but for the digits", () => {
  // The whole promise, as a string comparison. 5.0 mV is well above the 3.5 mV
  // criterion and 1.0 mV is well below it; if the page treats those two cases
  // differently in any way — a class, a word, an ordering — it has told the
  // reader which one is "right", which is the judgement it exists not to make.
  const above = render(at(5.0));
  const below = render(at(1.0));
  const strip = (s: string) => s.replace(/measured [\d.]+ mV/g, "measured N mV");
  expect(strip(above)).toBe(strip(below));
});

test("no verdict vocabulary appears in this module's own wording", () => {
  // Scoped to the wording this module writes, not to the criteria text it
  // quotes. The source document legitimately contains "100% met ESC 2013" —
  // that is a published finding being reported, and censoring a quotation would
  // be a different kind of dishonesty. What must never appear is *this page*
  // saying it. So the entries are rendered with their quoted prose blanked, and
  // what is left is ours.
  const bare = { ...sokolow, disagreement: undefined, notComputable: undefined,
    source: "", rows: sokolow.rows.map((r) => ({ ...r, quantity: "", leads: "",
      printed: "", qualifier: "" })) };
  const only = (m: Measures) => evidenceHtml({
    findingLabel: "x", results: [evaluateEntry(bare, m, MALE)],
    coverage: { covered: 65, total: 120 },
  });
  const banned = [
    "meets", "met", "fails", "failed", "satisfies", "satisfied", "confirms",
    "confirmed", "rules out", "ruled out", "correct", "incorrect", "consistent with",
    "inconsistent", "agrees", "disagrees", "positive for", "negative for", "diagnosis of",
    "✓", "✗", "✔", "✘",
  ];
  const html = (only(at(5.0)) + only(at(1.0))).toLowerCase();
  for (const w of banned) {
    expect(html.includes(w.toLowerCase()), `rendered the word "${w}"`).toBe(false);
  }
});

test("no criterion row is coloured by its outcome", () => {
  // Green and red mean right and wrong. The only permitted modifier mutes a row
  // that could not be checked at all.
  for (const html of [render(at(5.0)), render(at(1.0))]) {
    expect(html).not.toMatch(/--ok|--error|--warn/);
    const mods = [...html.matchAll(/class="evidence__row([^"]*)"/g)].map((m) => m[1]!.trim());
    for (const m of mods) expect(["", "evidence__row--unmeasured"]).toContain(m);
  }
});

test("the standing caveat is present whether or not anything disagrees", () => {
  // If it appeared only when a number fell short, its presence would itself be
  // the verdict it is written to avoid.
  for (const m of [at(5.0), at(1.0), measures([])]) {
    expect(render(m)).toContain("Neither is offered as a check on the other");
  }
});

test("an unmeasurable row is shown, not hidden, and both its columns are muted", () => {
  // A hidden row reads as a satisfied one. Muting only the measured column would
  // let "unmeasured" read as "the measurement failed on the one that disagreed".
  const html = render(measures([]));
  expect(html).toContain("evidence__row--unmeasured");
  // Scoped to the row. Entries are switched with `hidden` by the definition
  // picker, which is a different thing from concealing a criterion line.
  const rowMarkup = /<button type="button" class="evidence__row[^>]*>/.exec(html)![0];
  expect(rowMarkup).not.toContain("hidden");
  expect(html).toContain("not established on this recording");
});

test("every criterion states how many of its rows were actually checked", () => {
  const html = render(measures([]));
  expect(html).toMatch(/Checked 0 of \d+ rows/);
  expect(html).toContain("Not checked is not the same as not present");
});

test("a finding with no criteria says so as a gap in the page, not a fact about the ECG", () => {
  const html = evidenceHtml({
    findingLabel: "first degree AV block",
    results: [],
    coverage: { covered: 65, total: 120 },
  });
  expect(html).toContain("65 of its 120 findings");
  expect(html).toContain("a gap in this page, not a statement about the ECG");
});

test("criterion text from the source document is escaped, not interpolated raw", () => {
  const html = render(at(5.0));
  // The document is markdown prose containing `<`, `>` and `&`. An apostrophe is
  // deliberately not escaped: it is inert in text and in the double-quoted
  // attributes this module writes, and escaping it would only make the criteria
  // harder to read in the source.
  expect(html).not.toMatch(/<script|<img|onerror=/i);
  expect(html).toContain("&gt;= 35 mm"); // the doc's ">= 35 mm", escaped
  const injected = evidenceHtml({
    findingLabel: "<img src=x onerror=alert(1)>",
    results: [], coverage: { covered: 1, total: 2 },
  });
  expect(injected).not.toContain("<img");
  expect(injected).toContain("&lt;img");
});

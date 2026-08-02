/**
 * The hand-written criteria table, checked against the document it came from.
 *
 * `web/src/criteria/*` carries published thresholds as numbers a comparison can
 * use. Those numbers were converted by hand, from cells that publish them in
 * millimetres while this tool measures in millivolts — so the number a criterion
 * needs is usually a tenth of the first number printed in its cell. Get that
 * wrong and the page renders `35 mV` with a Sokolow-Lyon citation attached: a
 * confident falsehood in a teaching tool, which is the worst thing this codebase
 * can produce.
 *
 * These tests are the reason hand-writing is safe. The unit test in particular
 * makes the decimal slip impossible rather than merely unlikely, and the
 * verbatim test catches the slower failure — a table that was right when written
 * and drifted when the document was edited underneath it.
 */
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";

import { CRITERIA } from "../web/src/criteria/index.ts";
import type { Check } from "../web/src/criteria/types.ts";

const DOC = readFileSync(
  new URL("../docs/ecg-diagnostic-criteria.md", import.meta.url),
  "utf8",
);

/** Every 4-column table row in the document, as raw cells. */
const docRows = DOC.split("\n")
  .filter((l) => l.startsWith("|") && !l.includes("---"))
  .map((l) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()))
  .filter((c) => c.length === 4 && c[0] !== "quantity");

const allRows = CRITERIA.flatMap((e) => e.rows.map((r) => ({ entry: e, row: r })));

test("the table is not empty, so the tests below are not vacuous", () => {
  expect(allRows.length).toBeGreaterThan(0);
  expect(docRows.length).toBeGreaterThan(allRows.length);
});

/** The document rows belonging to one entry, scoped to its own `###` block. */
function docRowsFor(title: string): string[][] {
  const at = DOC.indexOf(`### ${title}`);
  if (at < 0) return [];
  const end = DOC.indexOf("\n### ", at + 1);
  return (end < 0 ? DOC.slice(at) : DOC.slice(at, end)).split("\n")
    .filter((l) => l.startsWith("|") && !l.includes("---"))
    .map((l) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()))
    .filter((c) => c.length === 4 && c[0] !== "quantity");
}

test("every quantity, leads, threshold and qualifier is the document's own cell", () => {
  // Scoped to the entry's own block. Matching across the whole document found
  // the *first* row with the same quantity and threshold, which for the
  // conduction section is a different entry with a different lead set — the
  // test failed on data that was correct.
  for (const { entry, row } of allRows) {
    const match = docRowsFor(entry.title)
      .find((c) => c[2] === row.printed && c[0] === row.quantity);
    expect(match, `${entry.title}\n  no document row matches: ${row.printed}`)
      .toBeDefined();
    expect(match![1]).toBe(row.leads);
    expect(match![3]).toBe(row.qualifier);
  }
});

test("every hand-converted threshold still renders into its printed cell", () => {
  // The decimal-slip catcher, and the single most valuable assertion here.
  //
  // It must pin the number to *its own unit*. An earlier version of this test
  // asked only whether the value appeared somewhere in the cell, in any unit —
  // which the classic mm/mV slip sails straight through: coding `35 mV` against
  // ">= 35 mm (>= 3.5 mV)" passed, because 35 is right there as the millimetre
  // figure. Verified by injecting exactly that error and watching it go green.
  // So the value must appear *adjacent to* the unit it claims to be in.
  const num = (n: number) => {
    const r = Math.round(n * 1e6) / 1e6; // 2.8 * 10 is 28.000000000000004
    return Number.isInteger(r) ? String(r) : String(r);
  };
  const forms = (c: Check): [string, string][] => {
    switch (c.unit) {
      case "mV":
        return [[num(c.value), "mV"], [num(c.value * 10), "mm"]];
      case "mV·ms":
        return [[num(c.value), "mV·ms"], [num(c.value * 10), "mm·ms"]];
      case "ms":
        return [[num(c.value), "ms"], [num(c.value / 1000), "s"]];
      case "deg":
        return [[num(c.value), "degree"], [num(c.value), "°"]];
      default:
        return [[num(c.value), c.unit]];
    }
  };

  for (const { entry, row } of allRows) {
    if (!row.check) continue;
    const hit = forms(row.check).some(([n, unit]) =>
      new RegExp(
        `(?<![\\d.])${n.replace(".", "\\.")}\\s*${unit.replace(/[.*+?^${}()|[\]\\·°]/g, "\\$&")}`,
      ).test(row.printed)
    );
    expect(hit, `${entry.title}\n  ${row.check.value} ${row.check.unit} does not ` +
      `appear, with its unit, in: ${row.printed}`).toBe(true);
  }
});

test("the inequality direction matches the one printed", () => {
  // AHA prints '> 35 mm' where the systematic reviews print '>= 3.5 mV'. Those
  // differ for exactly one value, which is why the document records both and why
  // silently flipping one is a real error rather than a rounding detail.
  for (const { entry, row } of allRows) {
    if (!row.check) continue;
    const first = /(>=|<=|>|<)/.exec(row.printed)?.[1];
    expect(first, `${entry.title}: no inequality in "${row.printed}"`).toBeDefined();
    expect(first, `${entry.title}\n  printed "${row.printed}" but coded ` +
      `"${row.check.relation}"`).toBe(row.check.relation);
  }
});

test("no row is both comparable and excused", () => {
  for (const { entry, row } of allRows) {
    const both = row.check && row.notEvaluable;
    const neither = !row.check && !row.notEvaluable;
    expect(both, `${entry.title}: row has a check and a reason`).toBeFalsy();
    expect(neither, `${entry.title}: row has neither`).toBeFalsy();
  }
});

test("no entry drops a row the document publishes", () => {
  // A row quietly omitted would shrink the panel's own denominator, so
  // "checked 2 of 2" could be shown for a criterion with six published rows.
  for (const entry of CRITERIA) {
    const heading = DOC.indexOf(`### ${entry.title}`);
    expect(heading, `heading not found: ${entry.title}`).toBeGreaterThan(-1);
    const block = DOC.slice(heading, DOC.indexOf("\n### ", heading + 1));
    const published = block.split("\n")
      .filter((l) => l.startsWith("|") && !l.includes("---"))
      .map((l) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()))
      .filter((c) => c.length === 4 && c[0] !== "quantity");
    expect(entry.rows.length, `${entry.title}`).toBe(published.length);
  }
});

test("every tagged code is a real atlas finding id", () => {
  // `MI` and `STTC` are PTB-XL superclasses rather than statement ids, and
  // tagging an entry with one would file it under a finding no case carries.
  const NOT_A_FINDING = new Set(["MI", "STTC", "BRUG"]);
  for (const e of CRITERIA) {
    for (const c of e.codes) {
      expect(NOT_A_FINDING.has(c), `${e.title}: ${c} is not a finding id`).toBe(false);
    }
  }
});

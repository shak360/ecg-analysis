/**
 * Placing a measured value beside a published threshold — and nothing more.
 *
 * This module returns positions, not judgements: `above`, `below`,
 * `atThreshold`, `unmeasurable`, `demographicsRequired`. It never returns a
 * boolean, never scores an entry, and never says whether a finding is present.
 * The label being explained is the reporting cardiologist's, and the page exists
 * to show what the published criteria say — not to mark their work.
 *
 * That is a design constraint, not a disclaimer. A boolean here would be
 * rendered somewhere, and once rendered it is a verdict; the only way to keep
 * the promise is for the verdict never to exist.
 */

import { evaluateQuantity } from "./quantities.ts";
import type {
  Check,
  CriterionEntry,
  CriterionRow,
  EntryResult,
  Measures,
  Relation,
  RowResult,
} from "./types.ts";

export interface Demographics {
  sex: "M" | "F" | null;
  age: number | null;
}

/**
 * How close counts as "on the threshold".
 *
 * Two independent reasons, and they happen to agree on the same treatment.
 * Our own resolution is finite: intervals come off a 500 Hz grid, so 2 ms is one
 * sample and a difference smaller than that is not a difference. And the
 * guidelines themselves disagree about the inequality — AHA Part V prints
 * `> 35 mm` where Pewsner's review prints `>= 3.5 mV`, which differ for exactly
 * one value — so reporting a boundary case as decided would invent a distinction
 * the sources do not agree on.
 */
const GRAIN = { ms: 2, mV: 0.025, "mV·ms": 25, deg: 1, bpm: 1 } as const;

function applies(check: Check, who: Demographics): boolean | "unknown" {
  const a = check.appliesTo;
  if (!a) return true;
  if (a.sex) {
    if (who.sex === null) return "unknown";
    if (who.sex !== a.sex) return false;
  }
  if (a.ageMin !== undefined || a.ageMax !== undefined) {
    if (who.age === null) return "unknown";
    if (a.ageMin !== undefined && who.age < a.ageMin) return false;
    if (a.ageMax !== undefined && who.age > a.ageMax) return false;
  }
  return true;
}

function place(value: number, check: Check): Relation {
  const grain = GRAIN[check.unit as keyof typeof GRAIN] ?? 0;
  if (Math.abs(value - check.value) <= grain) return "atThreshold";
  const bigger = check.relation === ">" || check.relation === ">=";
  return value > check.value === bigger ? "above" : "below";
}

export function evaluateRow(
  row: CriterionRow,
  m: Measures,
  who: Demographics,
): RowResult {
  if (!row.check) return { row, relation: "unmeasurable", measured: null };

  const scope = applies(row.check, who);
  // A row written for women is not evidence about a patient whose sex we do not
  // know, and the nearest available threshold is not a substitute for the right
  // one. Refuse rather than pick.
  if (scope === "unknown") {
    return { row, relation: "demographicsRequired", measured: null };
  }
  if (scope === false) return { row, relation: "unmeasurable", measured: null };

  const value = evaluateQuantity(row.check.expr, m);
  if (value === null) return { row, relation: "unmeasurable", measured: null };

  return { row, relation: place(value, row.check), measured: value };
}

export function evaluateEntry(
  entry: CriterionEntry,
  m: Measures,
  who: Demographics,
): EntryResult {
  const rows = entry.rows.map((r) => evaluateRow(r, m, who));
  return {
    entry,
    rows,
    // Counted from what actually produced a comparison, so the panel's
    // "checked N of M" moves when the data does. A hardcoded numerator here
    // would be the flattering kind of wrong.
    checked: rows.filter((r) => r.relation !== "unmeasurable" &&
      r.relation !== "demographicsRequired").length,
  };
}

/**
 * Every entry tagged with `code`, ordered for reading.
 *
 * Conventions come first — they change what the numbers below them mean — then
 * rival definitions oldest first, then everything else. Ordering definitions by
 * publication year rather than by how many rows this tool can check is
 * deliberate: our surface is good at duration and blind to notching, so a
 * checkability sort would put AHA 2009 above ESC 2021 and teach that LBBB is
 * "QRS >= 120 ms", which is exactly the falsehood the source document was
 * assembled to prevent.
 */
export function entriesFor(
  entries: readonly CriterionEntry[],
  code: string,
): CriterionEntry[] {
  const rank = { convention: 0, definition: 1, gate: 2, modifier: 3, background: 4 };
  return entries
    .filter((e) => e.codes.includes(code))
    .sort((a, b) => rank[a.role] - rank[b.role] || a.year - b.year);
}

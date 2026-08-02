/**
 * Placing a measured value beside a published threshold.
 *
 * Most of these assert a refusal. That is the shape of the problem: the ways
 * this can go wrong are all ways of producing a number where there should be
 * none — a sum that treats a missing S wave as 0 mV, a female threshold applied
 * to a patient whose sex is unrecorded, a Q wave made of baseline wander. Each
 * would render as an ordinary row, indistinguishable from a real comparison.
 */
import { expect, test } from "vitest";

import { evaluateQuantity, Q_FLOOR_MV } from "../web/src/criteria/quantities.ts";
import { evaluateEntry, evaluateRow } from "../web/src/criteria/evaluate.ts";
import { CRITERIA } from "../web/src/criteria/index.ts";
import type { LeadMeasure, Measures, QuantityExpr } from "../web/src/criteria/types.ts";

const lead = (name: string, p: Partial<LeadMeasure> = {}): LeadMeasure => ({
  lead: name, stJ: null, stJ60: null, r: null, s: null, q: null, t: null,
  sigmaSt: null, note: null, ...p,
});

const measures = (leads: LeadMeasure[], g: Partial<Measures> = {}): Measures => ({
  hr: null, qrs: null, qt: null, qtcF: null, qtcB: null, axis: null, leads, ...g,
});

const EMPTY = measures([]);

const find = (title: string) => {
  const e = CRITERIA.find((c) => c.title.includes(title));
  if (!e) throw new Error(`no entry matching ${title}`);
  return e;
};

const MALE = { sex: "M" as const, age: 60 };
const FEMALE = { sex: "F" as const, age: 60 };
const UNKNOWN = { sex: null, age: null };

test("nothing measured yields no comparison at all", () => {
  // Never `below`, which would read as "this criterion is not met" — a claim
  // made from an ECG nobody could measure.
  for (const entry of CRITERIA) {
    for (const r of evaluateEntry(entry, EMPTY, MALE).rows) {
      expect(r.relation, `${entry.title}: ${r.row.printed}`).not.toBe("above");
      expect(r.relation, `${entry.title}: ${r.row.printed}`).not.toBe("below");
      expect(r.measured).toBeNull();
    }
    expect(evaluateEntry(entry, EMPTY, MALE).checked).toBe(0);
  }
});

test("a sum with one term missing is not a smaller sum", () => {
  const expr: QuantityExpr = {
    k: "sum",
    terms: [{ k: "rMv", lead: "aVL" }, { k: "sMv", lead: "V3" }],
  };
  expect(evaluateQuantity(expr, measures([lead("aVL", { r: 1.2 }), lead("V3")])))
    .toBeNull();
  expect(evaluateQuantity(expr, measures([lead("aVL", { r: 1.2 }), lead("V3", { s: -1.0 })])))
    .toBeCloseTo(2.2);
});

test("S and Q depths are read as magnitudes, not as the negatives they arrive as", () => {
  // The engine reports both signed negative. A criterion comparing a depth of
  // -1.8 mV against >= 3.5 mV would find every ECG unremarkable.
  expect(evaluateQuantity({ k: "sMv", lead: "V1" }, measures([lead("V1", { s: -1.8 })])))
    .toBeCloseTo(1.8);
});

test("Sokolow-Lyon takes the taller of V5 and V6, and tolerates one being absent", () => {
  const row = find("Sokolow-Lyon precordial").rows[0]!;
  const m = measures([
    lead("V1", { s: -2.0 }), lead("V5", { r: 1.4 }), lead("V6", { r: 1.9 }),
  ]);
  expect(evaluateRow(row, m, MALE).measured).toBeCloseTo(3.9);
  expect(evaluateRow(row, m, MALE).relation).toBe("above");
});

test("a sex-specific threshold is refused when sex is unknown, never guessed", () => {
  // Cornell is 2.8 mV in men and 2.0 in women. A patient measuring 2.4 is above
  // one and below the other, so picking either — or splitting the difference —
  // manufactures a result.
  const cornell = find("Cornell voltage (sex");
  const m = measures([lead("aVL", { r: 1.2 }), lead("V3", { s: -1.2 })]);
  for (const r of evaluateEntry(cornell, m, UNKNOWN).rows) {
    expect(r.relation).toBe("demographicsRequired");
    expect(r.measured).toBeNull();
  }
});

test("a woman is measured against the female threshold and not the male one", () => {
  const cornell = find("Cornell voltage (sex");
  const m = measures([lead("aVL", { r: 1.3 }), lead("V3", { s: -1.1 })]); // 2.4 mV
  const female = evaluateEntry(cornell, m, FEMALE);
  const compared = female.rows.filter((r) => r.measured !== null);
  expect(compared).toHaveLength(1);
  expect(compared[0]!.row.qualifier.startsWith("WOMEN")).toBe(true);
  expect(compared[0]!.relation).toBe("above"); // 2.4 > 2.0
  expect(evaluateEntry(cornell, m, MALE).rows.find((r) => r.measured !== null)!
    .relation).toBe("below"); // 2.4 < 2.8
});

test("a value on the threshold is reported as on it, not decided", () => {
  // The sources disagree about the inequality itself — AHA prints '> 35 mm'
  // where the reviews print '>= 3.5 mV' — so exactly 3.5 mV is a case the
  // literature does not resolve, and neither should this.
  const row = find("Sokolow-Lyon precordial").rows[0]!;
  const m = measures([lead("V1", { s: -2.0 }), lead("V5", { r: 1.5 })]);
  expect(evaluateRow(row, m, MALE).relation).toBe("atThreshold");
});

test("a Q wave below the amplitude floor is absent, not small", () => {
  // measure.rs counts any run of negative samples before R as a Q wave, with no
  // amplitude condition, so baseline wander is reported as a Q wave with a
  // duration. Passing that on would turn noise into evidence of infarction.
  const tiny = measures([lead("V2", { q: -0.02 })]);
  expect(evaluateQuantity({ k: "qMv", lead: "V2" }, tiny)).toBeNull();
  const real = measures([lead("V2", { q: -(Q_FLOOR_MV + 0.05) })]);
  expect(evaluateQuantity({ k: "qMv", lead: "V2" }, real)).toBeCloseTo(0.15);
});

test("no evaluation ever produces Infinity or NaN", () => {
  const weird = measures([
    lead("V1", { s: 0 }), lead("V3", { s: -0 }), lead("aVL", { r: 0 }),
    lead("V5", { r: 0 }), lead("V6", { r: 0 }),
  ], { qrs: 0 });
  for (const entry of CRITERIA) {
    for (const r of evaluateEntry(entry, weird, MALE).rows) {
      if (r.measured !== null) expect(Number.isFinite(r.measured)).toBe(true);
    }
  }
});

test("the checked count is the number of rows that actually compared", () => {
  // The panel prints this as a denominator. If it counted rows rather than
  // comparisons, "checked 4 of 4" could appear for a criterion where nothing was
  // measurable — the flattering direction.
  const cornell = find("Cornell voltage (sex");
  expect(evaluateEntry(cornell, EMPTY, MALE).checked).toBe(0);
  const m = measures([lead("aVL", { r: 1.3 }), lead("V3", { s: -1.1 })]);
  expect(evaluateEntry(cornell, m, MALE).checked).toBe(1); // the male row only
});

/**
 * The shape of a published diagnostic criterion, for the evidence view.
 *
 * `docs/ecg-diagnostic-criteria.md` is the human source of truth: 121 entries
 * gathered from the primary guidelines, kept in full because the disagreements
 * between them are the load-bearing part. This module is the machine-readable
 * companion to that prose, and the relationship between the two is deliberate
 * and inverted from the obvious one.
 *
 * # Why the numbers are hand-written and the doc is not parsed
 *
 * The `threshold` column is not a grammar. Real cells read:
 *
 *   >= 35 mm (>= 3.5 mV); AHA Part V Table 1 prints '> 35 mm'
 *   > 11 mm (> 1.1 mV) per AHA Part V Table 1; commonly stated as >= 11 mm
 *   q absent (0 mV); a narrow q is permitted in aVL only
 *
 * Thresholds are published in **millimetres** and this tool measures in
 * **millivolts**, so the first number in a cell is usually ten times the one a
 * comparison needs. A parser that takes it produces `35 mV` with a Sokolow-Lyon
 * citation attached — a wrong number, rendered authoritatively, in a teaching
 * tool. That is the worst outcome available here, and it is not worth risking to
 * save typing.
 *
 * So the conversion is done by hand and *checked* by machine: every `Check`
 * carries `printed`, the doc's cell verbatim, and `test/criteria-doc.test.ts`
 * asserts both that `printed` still matches the document character for character
 * and that `value` renders into `printed` in one of its two units. A mistake
 * then produces a red test rather than a confident falsehood.
 *
 * This is `tools/corpora/vocabulary.ts`'s pattern — hand-write only the part
 * that needs judgement, derive the rest — applied where the judgement is unit
 * conversion and inequality direction.
 */

import type { LeadMeasure, Measures } from "../engine/protocol.ts";

/**
 * What an entry *is*, relative to the finding it is tagged with.
 *
 * Several entries share a code without competing: `CLBBB` is tagged on five
 * rival definitions, but also on a measurement convention, on a rule for reading
 * infarction underneath a conduction disturbance, on Sgarbossa, and on an LVH
 * interaction. Rendering all of those as "definitions of LBBB" would present
 * Sgarbossa as a sixth way to diagnose left bundle branch block.
 */
export type EntryRole =
  /** A rival definition of the finding itself. These are the ones that disagree. */
  | "definition"
  /** How to measure something the definitions depend on. Read before them. */
  | "convention"
  /** When this finding blocks or voids the reading of another. */
  | "gate"
  /** How to read another finding *given* this one. Sgarbossa, LVH under LBBB. */
  | "modifier"
  /** Reference values and mechanics that are not criteria at all. */
  | "background";

/** Why a published row cannot be checked against what this tool measures. */
export type NotEvaluableReason =
  | "needsPWave"
  | "needsRPeakTime"
  | "needsNotchSlur"
  | "needsPerWaveDuration"
  | "needsPerBeat"
  | "needsPacingDetection"
  | "needsExtraLeads"
  | "needsPriorStudy"
  | "needsClinicalContext"
  | "needsBodyHabitus"
  | "needsAncestry"
  /** The source states a pattern but publishes no number to compare against. */
  | "noThresholdPublished"
  /** The primary source could not be obtained; see the entry's FLAG note. */
  | "sourceUnobtainable"
  /** The doc itself refuses this row — a lost sign, an undefined denominator. */
  | "notImplementable";

/**
 * A quantity this tool can compute, as an expression over `Measures`.
 *
 * A closed union on purpose, so a new leaf forces every `switch` to fail
 * compilation — the same reasoning as `VerdictState` in `protocol.ts`. Nothing
 * is added here without a row in the document that needs it.
 *
 * Amplitudes are named for what the criteria mean. `s` and `q` arrive signed
 * negative from the engine, and every published criterion is stated as a depth,
 * so the accessor takes the absolute value once and no caller ever does.
 */
export type QuantityExpr =
  | { k: "qrsMs" }
  | { k: "qtMs" }
  | { k: "qtcFMs" }
  | { k: "hrBpm" }
  | { k: "axisDeg" }
  /** Depth of the S wave in one lead, positive. */
  | { k: "sMv"; lead: string }
  /** Height of the R wave in one lead. */
  | { k: "rMv"; lead: string }
  /** Depth of the Q wave in one lead, positive. */
  | { k: "qMv"; lead: string }
  | { k: "tMv"; lead: string }
  | { k: "stJmv"; lead: string }
  | { k: "stJ60mv"; lead: string }
  /** Sum of terms. Null if **any** term is null; there is no partial sum. */
  | { k: "sum"; terms: QuantityExpr[] }
  /** The largest of several, e.g. the taller of R in V5 and V6. */
  | { k: "max"; terms: QuantityExpr[] }
  /** A product, for the voltage-duration criteria. */
  | { k: "product"; terms: QuantityExpr[] }
  /** A fixed addend, e.g. the Cornell product's female millimetre offset. */
  | { k: "constant"; value: number };

export type Unit = "ms" | "mV" | "deg" | "bpm" | "mV·ms";

/** Who a row applies to. A row with none applies to everyone. */
export interface AppliesTo {
  sex?: "M" | "F";
  ageMin?: number;
  ageMax?: number;
}

/** A row that can be compared against a measurement. */
export interface Check {
  expr: QuantityExpr;
  relation: ">=" | ">" | "<=" | "<";
  /** In `unit`, converted by hand from `printed`. Verified against it by test. */
  value: number;
  unit: Unit;
  appliesTo?: AppliesTo;
}

/** One row of a criterion's published table. */
export interface CriterionRow {
  /** The doc's `quantity` cell, verbatim. */
  quantity: string;
  /** The doc's `leads` cell, verbatim. */
  leads: string;
  /** The doc's `threshold` cell, verbatim. The diff target for the doc test. */
  printed: string;
  /** The doc's `qualifier` cell, verbatim. */
  qualifier: string;
  /** The leads to mark on the tracing. Empty for a global quantity. */
  marks: string[];
  /** Exactly one of these. A row is either comparable or explained, never both. */
  check?: Check;
  notEvaluable?: NotEvaluableReason;
}

export interface CriterionEntry {
  /** The doc's `###` heading, verbatim, minus the trailing code list. */
  title: string;
  /** Atlas finding ids this entry is tagged with. */
  codes: string[];
  role: EntryRole;
  /** Publication year, for ordering rival definitions. Never order by how many
   *  rows this tool happens to be able to check — that promotes the loosest
   *  definition simply because our measurement surface suits it. */
  year: number;
  /** Short source attribution, shown with every row. */
  source: string;
  /** The doc's "Guidelines disagree" paragraph, if it has one. */
  disagreement?: string;
  /** The doc's "Not computable from samples" paragraph, if it has one. */
  notComputable?: string;
  rows: CriterionRow[];
}

/**
 * How a measured value sits relative to a threshold.
 *
 * Never a boolean. `atThreshold` exists because the guidelines disagree about
 * the inequality itself — AHA prints `> 35 mm` where Pewsner prints `>= 3.5 mV`,
 * which differ for exactly one value — and because our own resolution is finite.
 * Reporting a boundary case as decided would manufacture a distinction the
 * evidence does not support.
 */
export type Relation =
  | "above"
  | "below"
  | "atThreshold"
  | "unmeasurable"
  /** Sex- or age-specific, and we do not have it. Never guess a threshold. */
  | "demographicsRequired";

export interface RowResult {
  row: CriterionRow;
  relation: Relation;
  /** The measured value in the row's unit, or null. */
  measured: number | null;
}

export interface EntryResult {
  entry: CriterionEntry;
  rows: RowResult[];
  /** Rows carrying a `check` that produced a comparison. The denominator the
   *  panel shows, so a reader can never mistake one checked row for a verdict. */
  checked: number;
}

export type { LeadMeasure, Measures };

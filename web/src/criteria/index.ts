/**
 * Every published criterion this tool carries, and what it deliberately omits.
 *
 * Authored in tranches, one file per section of
 * `docs/ecg-diagnostic-criteria.md`, so a reviewer diffs one section against one
 * file. The document holds 121 entries across 68 codes covering 65 of the
 * atlas's 120 findings; what is here is a subset, and the panel states the
 * subset's size rather than implying the rest were checked and found absent.
 *
 * # Deliberately NOT included
 *
 * Following `tools/corpora/vocabulary.ts`, the omissions are listed with their
 * reasons, because a silent omission is indistinguishable from an oversight.
 *
 *   **Romhilt-Estes point score.** The document records that a total assembled
 *     from partially-measurable components systematically under-counts, and the
 *     4-versus-5-point boundary is where the diagnosis turns. A score that can
 *     only ever be too low is worse than no score.
 *
 *   **Selvester QRS score.** The weighting table could not be obtained; the
 *     entry carries a FLAG saying so.
 *
 *   **RVH as a conclusion.** AHA Part V states no single criterion or limited
 *     set can be recommended. Individual criteria may be shown; the word must
 *     not be emitted as a finding.
 *
 *   **The RVH ratio-of-ratios criterion**, which divides by a quantity the
 *     source never defines, and **the Lewis-index RVH row**, which the document
 *     itself says appears to have a lost negative sign and must not be
 *     implemented.
 *
 *   **Race and body-habitus adjustment of any threshold.** AHA reports
 *     direction-of-effect for both and publishes no adjusted cut. PTB-XL has no
 *     ancestry field, and height and weight are present for under half the
 *     records. An adjustment invented here would be this tool's, wearing a
 *     guideline's citation.
 */

import { CONDUCTION } from "./conduction.ts";
import { HYPERTROPHY } from "./hypertrophy.ts";
import type { CriterionEntry } from "./types.ts";

export const CRITERIA: readonly CriterionEntry[] = [...CONDUCTION, ...HYPERTROPHY];

/** Atlas finding ids that have at least one entry. */
export const COVERED_CODES: ReadonlySet<string> = new Set(
  CRITERIA.flatMap((e) => e.codes),
);

export * from "./types.ts";
export { entriesFor, evaluateEntry, evaluateRow } from "./evaluate.ts";
export { evaluateQuantity, leadsOf, Q_FLOOR_MV } from "./quantities.ts";

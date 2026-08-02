/**
 * What the published criteria say about a label somebody else assigned.
 *
 * This module returns a string, like `measurements.ts`, and for the same reason:
 * every hard decision here is a wording decision, and wording is testable only if
 * it is not tangled up with the DOM.
 *
 * # The constraint
 *
 * The label belongs to the reporting cardiologist. This page shows the published
 * definitions of that term beside what this tool measured, and **never says
 * whether the label is right**. That is harder than it sounds, because putting
 * "criterion: QRS >= 120 ms" next to "measured: 96 ms" contradicts a clinician
 * without using a single word. Four things keep the promise:
 *
 * 1. A row whose number lands on the criterion's side and one whose number does
 *    not are rendered **identically** — same markup, same class, same sentence.
 *    Only the digits differ. `test/evidence.test.ts` asserts that as a string
 *    comparison. The reader does the comparing; that is the teaching.
 * 2. No verdict vocabulary and no verdict colour. No `--ok`, no `--error`, no
 *    tick, no cross. Green and red mean right and wrong.
 * 3. Never one definition where the sources have several, and never ordered by
 *    how many rows this tool can check — that would promote the loosest
 *    definition because our measurement surface happens to suit it.
 * 4. The standing paragraph at the foot appears whether or not anything
 *    disagrees, so its presence carries no signal.
 *
 * Rows this tool cannot check are shown, not hidden. They are most of the
 * teaching content, and a hidden row reads as a satisfied one.
 */

import type { CriterionEntry, EntryResult, RowResult } from "../criteria/types.ts";
import { esc } from "./measurements.ts";

/** How a measured value is stated. Never "meets", never "fails". */
function measuredLine(r: RowResult, unit: string): string {
  switch (r.relation) {
    case "unmeasurable":
      return r.row.notEvaluable
        ? "not checked here — this tool does not measure that quantity"
        : "not established on this recording";
    case "demographicsRequired":
      return "not checked — this row is specific to a sex or age this record does not record";
    default:
      // `above`, `below` and `atThreshold` all render through this one branch on
      // purpose. Three sentences would be three different framings, and the
      // difference between them is exactly the judgement being withheld.
      return `measured ${r.measured!.toFixed(r.measured! < 10 ? 2 : 0)} ${unit}`;
  }
}

function rowHtml(r: RowResult): string {
  const unit = r.row.check?.unit ?? "";
  const muted = r.relation === "unmeasurable" || r.relation === "demographicsRequired";
  // A button, not a div: marking is an action, and a learner on a touch screen
  // or a keyboard has to be able to take it. `data-leads` is what the page reads
  // back — the row does not know what a canvas is.
  return `<button type="button" class="evidence__row${muted ? " evidence__row--unmeasured" : ""}" ` +
    `data-leads="${esc(r.row.marks.join(","))}" ` +
    `title="Mark the leads this line names">` +
    `<div class="evidence__what">${esc(r.row.quantity)}</div>` +
    `<div class="evidence__where">${esc(r.row.leads)}</div>` +
    `<div class="evidence__printed">${esc(r.row.printed)}</div>` +
    `<div class="evidence__measured">${esc(measuredLine(r, unit))}</div>` +
    (r.row.qualifier && r.row.qualifier.toLowerCase() !== "none"
      ? `<div class="evidence__qualifier">${esc(r.row.qualifier)}</div>`
      : "") +
    `</button>`;
}

function entryHtml(res: EntryResult): string {
  const e = res.entry;
  return `<article class="evidence__entry">` +
    `<h4 class="evidence__title">${esc(e.title)}</h4>` +
    `<p class="evidence__source">${esc(e.source)}</p>` +
    (e.disagreement
      ? `<p class="evidence__note"><strong>Published definitions of this finding do not ` +
        `agree with each other.</strong> ${esc(e.disagreement)}</p>`
      : "") +
    (e.notComputable
      ? `<p class="evidence__note">Parts of this definition cannot be evaluated from the ` +
        `samples at all. ${esc(e.notComputable)}</p>`
      : "") +
    res.rows.map(rowHtml).join("") +
    // The denominator, always. "Checked 1 of 6" is the single line that stops a
    // reader mistaking one comparison for an assessment of the whole criterion.
    `<p class="evidence__tally">Checked ${res.checked} of ${res.rows.length} ` +
    `row${res.rows.length === 1 ? "" : "s"} in this criterion. The rest are listed ` +
    `above with the reason each was not checked. Not checked is not the same as ` +
    `not present.</p>` +
    `</article>`;
}

/** The standing caveat. Present unconditionally, so its presence says nothing. */
const FOOTER =
  `<p class="evidence__standing">Where a measured figure and the recorded label point in ` +
  `different directions, nothing on this page resolves that. The label was made by a ` +
  `clinician reading the whole tracing. These figures come from one automated pass over ` +
  `the samples and have not been validated against a reference standard. Neither is ` +
  `offered as a check on the other.</p>`;

export interface EvidenceView {
  /** The finding this is about, as the corpus names it. */
  findingLabel: string;
  results: EntryResult[];
  /** Findings covered by the criteria file, and findings in the atlas. */
  coverage: { covered: number; total: number };
}

export function evidenceHtml(v: EvidenceView): string {
  const head = `<h3 class="evidence__head">What published criteria say about ` +
    `${esc(v.findingLabel)}</h3>` +
    `<p class="evidence__intro">The label is the reporting cardiologist's. Below are the ` +
    `published definitions of that term and what this tool measured on the same tracing, ` +
    `shown together because a learner should be able to see both — not because the ` +
    `measurement checks the label.</p>`;

  if (!v.results.length) {
    return `<section class="evidence">${head}` +
      `<p class="evidence__note">No published criteria for this finding are recorded in ` +
      `this atlas — ${v.coverage.covered} of its ${v.coverage.total} findings have them. ` +
      `That is a gap in this page, not a statement about the ECG. The label stands as the ` +
      `cardiologist recorded it.</p>${FOOTER}</section>`;
  }

  return `<section class="evidence">${head}` +
    v.results.map(entryHtml).join("") + FOOTER + `</section>`;
}

export type { CriterionEntry };

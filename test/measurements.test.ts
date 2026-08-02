/**
 * What the measurements block is allowed to say.
 *
 * These tests are about copy and style, which is unusual for a test suite and
 * deliberate here: spec §8 risk 10 is a rendering risk, not an arithmetic one.
 * The gate can be perfectly correct and the screen can still reassure a
 * clinician at 3 a.m., either by printing a millivolt figure the pair could not
 * resolve or by letting a suppressed metric look like an empty column with
 * nothing to report.
 *
 * `measurementsHtml` is a pure function of plain data, so all of this runs
 * without a DOM. The verdicts below are hand-built rather than taken from the
 * engine on purpose: three of the five states are unreachable on the real
 * pipeline today, and they are exactly the three whose rendering matters most.
 */
import { expect, test } from "vitest";
import { formatInterval } from "../web/src/app/study.ts";

import {
  changeCell,
  changeCells,
  levelCell,
  measurementsHtml,
  type MeasurementsStudy,
  type MeasurementsView,
} from "../web/src/ui/measurements.ts";
import type { LeadMeasure, Measures, Verdict } from "../web/src/engine/protocol.ts";

/** The two constants the engine supplies; nothing here may hardcode them. */
const THRESHOLD_MV = 0.1;
const QUANTUM_MV = 0.05;
const NAMES = { reference: "2019.pdf", comparison: "2024.pdf" };

const lead = (name: string, stJ: number | null, sigmaSt: number | null): LeadMeasure => ({
  lead: name,
  stJ,
  stJ60: null,
  r: 1.0,
  s: null,
  q: null,
  t: null,
  sigmaSt,
  note: null,
});

const measures = (leads: LeadMeasure[]): Measures => ({
  hr: 68,
  qrs: 92,
  qt: 380,
  qtcF: 400,
  qtcB: 410,
  axis: 30,
  leads,
});

const study = (name: string, leads: LeadMeasure[]): MeasurementsStudy => ({
  name,
  calibration: {
    mmPerMv: 10,
    source: "pulse",
    pulseCount: 4,
    rowSpread: 0,
    relativeUncertainty: 0.015,
  },
  measurements: measures(leads),
});

const verdict = (v: Partial<Verdict> & Pick<Verdict, "state">): Verdict => ({
  reason: null,
  mdcMv: null,
  ciMv: null,
  boundMv: null,
  confounders: [],
  limiter: null,
  ...v,
});

const SIGNIFICANT = verdict({
  state: "Significant",
  mdcMv: 0.06,
  ciMv: [0.1903, 0.3103],
});
const INDETERMINATE = verdict({
  state: "Indeterminate",
  reason: "SubThreshold",
  mdcMv: 0.06,
  limiter: { study: "comparison", sigmaMv: 0.041, ratio: 3.4, dominant: true },
});
const BELOW_LIMIT = verdict({
  state: "BelowDetectionLimit",
  mdcMv: 0.13,
  limiter: { study: "reference", sigmaMv: 0.052, ratio: 1.1, dominant: false },
});
const NO_CHANGE = verdict({ state: "NoChange", boundMv: 0.0637 });
const UNMEASURABLE = verdict({ state: "Unmeasurable", reason: "CoverageUnmeasured" });
const LEAD_ABSENT = verdict({ state: "Unmeasurable", reason: "LeadAbsent" });

/** Plain text of an HTML fragment, with the tags taken out. */
const text = (html: string) =>
  html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/**
 * Every rendered line of the ST table, one string each.
 *
 * Per line rather than per cell, deliberately. A cell holds a level and up to
 * two change lines, and checking the cell as a whole would let a bandless
 * figure pass on the strength of a band belonging to the line above it — which
 * is the exact arrangement a reader misreads.
 *
 * The split is on the two top-level span classes; `st-band`, `st-band-name` and
 * `st-why` are nested inside a line and stay with it.
 */
function stLines(html: string): string[] {
  const table = html.slice(html.indexOf(`class="mtable mtable--st"`));
  const body = table.slice(0, table.indexOf("</table>"));
  return [...body.matchAll(/<td>([\s\S]*?)<\/td>/g)]
    .flatMap((m) => m[1]!.split(/(?=<span class="st-(?:level|change))/))
    .map(text)
    .filter((s) => s.length > 0);
}

/** Every `st-change` class attribute in the row for `lead`. */
function changeClasses(html: string, name: string): string[] {
  const row = [...html.matchAll(/<tr[\s\S]*?<\/tr>/g)]
    .map((m) => m[0])
    .find((r) => r.includes(`>${name}</th>`));
  expect(row, `no row for ${name}`).toBeDefined();
  return [...row!.matchAll(/class="(st-change[^"]*)"/g)].map((m) => m[1]!);
}

/**
 * A rendered figure either has no millivolt number in it, or carries the
 * interval that number is uncertain by.
 *
 * The markers are the four ways a band reaches the screen: a σ on a level, a
 * confidence interval, a detection limit, and `NoChange`'s exclusion bound. A
 * fifth way of writing a number, added without a band, fails here.
 */
function carriesItsBand(figure: string): boolean {
  if (!/\d/.test(figure)) return true;
  return /±|95% CI|detection limit|no change beyond/.test(figure);
}

function view(rows: Array<{ lead: string; delta: number | null; dig: Verdict; bio: Verdict }>) {
  const leads = rows.map((r) => lead(r.lead, 0.123, 0.021));
  return {
    studies: [study("2019.pdf", leads), study("2024.pdf", leads)],
    verdictSets: [
      rows.map((r) => ({
        lead: r.lead,
        deltaMv: r.delta,
        digitization: r.dig,
        withBio: r.bio,
      })),
    ],
    pairBlockerSets: [[]],
    clinicalThresholdMv: THRESHOLD_MV,
    stDisplayQuantumMv: QUANTUM_MV,
  } satisfies MeasurementsView;
}

// ---------------------------------------------------------------------------

test("no rendered ST number appears without the band it is uncertain by", () => {
  const html = measurementsHtml(view([
    { lead: "V1", delta: 0.2503, dig: SIGNIFICANT, bio: SIGNIFICANT },
    { lead: "V2", delta: 0.07, dig: INDETERMINATE, bio: INDETERMINATE },
    { lead: "V3", delta: 0.24, dig: BELOW_LIMIT, bio: BELOW_LIMIT },
    { lead: "V4", delta: 0.01, dig: NO_CHANGE, bio: NO_CHANGE },
    { lead: "V5", delta: 0.02, dig: UNMEASURABLE, bio: UNMEASURABLE },
  ]));

  const lines = stLines(html);
  // Five leads: two levels each, plus one change line on the comparison column.
  expect(lines.length, "every line accounted for").toBe(15);
  for (const line of lines) {
    expect(carriesItsBand(line), `bare number on a rendered line: ${line}`).toBe(true);
  }

  // And the same rule one level down, on the figures themselves, so that a cell
  // whose *level* carries a σ cannot smuggle a bandless delta in beside it.
  for (
    const v of [SIGNIFICANT, INDETERMINATE, BELOW_LIMIT, NO_CHANGE, UNMEASURABLE]
  ) {
    const cell = changeCell(v, 0.2503, QUANTUM_MV, THRESHOLD_MV, NAMES);
    expect(carriesItsBand(cell.text), `bare number in a ${v.state} figure`).toBe(true);
  }
});

test("a verdict that arrives without its interval withholds the figure too", () => {
  // The engine should never emit this. It is rendered fail-closed anyway,
  // because the way it would arrive is a renamed JSON field parsing as
  // undefined — silent, and the number is the part that gets acted on.
  const noInterval = changeCell(
    verdict({ state: "Significant", mdcMv: 0.06 }),
    0.2503,
    QUANTUM_MV,
    THRESHOLD_MV,
    NAMES,
  );
  expect(noInterval.text).not.toMatch(/0\.25/);
  expect(noInterval.text).toMatch(/withheld/);

  const noLimit = changeCell(
    verdict({ state: "Indeterminate", reason: "NotResolved" }),
    0.07,
    QUANTUM_MV,
    THRESHOLD_MV,
    NAMES,
  );
  expect(noLimit.text).not.toMatch(/0\.0?7/);
  expect(noLimit.text).toMatch(/withheld/);
});

test("a level whose uncertainty is unestimable is withheld rather than printed bare", () => {
  // This is the single-beat lead, and the lead that returned before it was
  // measured. Its ST number is real and its band does not exist, so printing it
  // would render identically to one backed by ten beats.
  const withoutSigma = levelCell(0.123, null);
  expect(withoutSigma.text).toBe("—");
  expect(withoutSigma.note).toMatch(/no uncertainty estimate/);

  const withSigma = levelCell(0.123, 0.021);
  expect(withSigma.text).toBe("0.123");
  expect(withSigma.band).toBe("± 0.021");
});

test("the two suppressed states render in the same muted style", () => {
  // Spec §8 risk 10: a suppressed metric that looks different from a refused one
  // invites the reader to rank them, and the lighter of the two then reads as
  // reassurance. They are one style, and this is the test that keeps them one.
  const html = measurementsHtml(view([
    { lead: "V1", delta: 0.24, dig: BELOW_LIMIT, bio: BELOW_LIMIT },
    { lead: "V2", delta: null, dig: UNMEASURABLE, bio: UNMEASURABLE },
    { lead: "V3", delta: 0.01, dig: NO_CHANGE, bio: NO_CHANGE },
  ]));

  const below = changeClasses(html, "V1");
  const refused = changeClasses(html, "V2");
  expect(below.length).toBe(1);
  expect(below).toEqual(refused);
  expect(below[0]).toContain("st-change--suppressed");

  // The state that positively asserts something is the one that must not share
  // it: "no change beyond 0.07 mV" is a claim, and the other two are absences.
  expect(changeClasses(html, "V3")[0]).not.toContain("st-change--suppressed");
});

test("a change below the detection limit is withheld rather than printed", () => {
  const cell = changeCell(BELOW_LIMIT, 0.2412, QUANTUM_MV, THRESHOLD_MV, NAMES);

  // Decision 50: the pair cannot resolve the clinical threshold, so its delta
  // carries nothing a reader could act on — and a number on the screen is acted
  // on. The detection limit stays, because that is the fact worth having.
  expect(cell.text).not.toMatch(/0\.24/);
  expect(cell.text).toMatch(/withheld/);
  expect(cell.text).toMatch(/detection limit ±0\.13 mV/);
  expect(cell.sentence).toMatch(/neither confirmed nor excluded/);
});

test("an indeterminate verdict says outright what cannot be concluded, and names the limiting study", () => {
  const cell = changeCell(INDETERMINATE, 0.07, QUANTUM_MV, THRESHOLD_MV, NAMES);

  expect(cell.sentence).toMatch(
    /A clinically significant change can be neither confirmed nor excluded\./,
  );
  // The limiter is dominant, so the pair has one study to re-acquire and the
  // copy has to say which. "Jointly limited" here would send the reader after
  // the wrong file.
  expect(cell.sentence).toContain("2024.pdf");
  expect(cell.sentence).toMatch(/3\.4×/);
});

test("a limit no single study dominates is not blamed on either of them", () => {
  const cell = changeCell(BELOW_LIMIT, 0.24, QUANTUM_MV, THRESHOLD_MV, NAMES);
  expect(cell.sentence).toMatch(/Neither study dominates/);
  expect(cell.sentence).not.toContain("2019.pdf");
});

test("no change states the magnitude it excluded", () => {
  const cell = changeCell(NO_CHANGE, 0.01, QUANTUM_MV, THRESHOLD_MV, NAMES);

  // "No change" without the bound is the reassurance decision 44 exists to
  // prevent. The bound rounds outward — 0.0637 up to 0.07 — because rounding a
  // limit inward claims an exclusion the arithmetic did not make.
  expect(cell.text).toBe("no change beyond 0.07 mV");
  expect(cell.tone).toBe("excluded");
});

test("a significant change carries the interval that produced it", () => {
  const cell = changeCell(SIGNIFICANT, 0.2503, QUANTUM_MV, THRESHOLD_MV, NAMES);

  // The delta is snapped to the engine's display quantum (decision 49: never
  // more precision than the band), and the interval's ends round outward, so
  // rendering can only ever widen the interval and never narrow it.
  expect(cell.text).toBe("Δ +0.25 mV · 95% CI 0.19 to 0.32 mV");
  expect(cell.tone).toBe("significant");
});

test("both uncertainty bands are shown whenever they disagree", () => {
  // §5.3's whole point: a pair can clear the digitisation-only band and fail
  // once the repeat-recording variation nobody controls is included. Showing
  // the narrow one alone is the failure that section warns about.
  const both = changeCells(
    { lead: "V2", deltaMv: 0.2503, digitization: SIGNIFICANT, withBio: BELOW_LIMIT },
    QUANTUM_MV,
    THRESHOLD_MV,
    NAMES,
  );
  expect(both.length).toBe(2);
  expect(both[0]!.band).toBe("digitisation only");
  expect(both[1]!.band).toBe("incl. repeat-recording variation");
  expect(both[0]!.tone).toBe("significant");
  expect(both[1]!.tone).toBe("suppressed");

  // When they say the same thing, one line stands for both: a second identical
  // sentence is noise, and on the real pipeline it would be noise twelve times.
  const agreed = changeCells(
    { lead: "V2", deltaMv: null, digitization: UNMEASURABLE, withBio: UNMEASURABLE },
    QUANTUM_MV,
    THRESHOLD_MV,
    NAMES,
  );
  expect(agreed.length).toBe(1);
  expect(agreed[0]!.band).toBe("");
});

test("a lead is emphasised only when the wider band also calls it significant", () => {
  const html = measurementsHtml(view([
    { lead: "V1", delta: 0.2503, dig: SIGNIFICANT, bio: SIGNIFICANT },
    { lead: "V2", delta: 0.2503, dig: SIGNIFICANT, bio: BELOW_LIMIT },
  ]));

  const rows = [...html.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) => m[0]);
  const v1 = rows.find((r) => r.includes(">V1</th>"))!;
  const v2 = rows.find((r) => r.includes(">V2</th>"))!;

  // Colouring on the digitisation band alone would highlight changes that
  // electrode repositioning by itself can produce.
  expect(v1).toContain(`class="significant"`);
  expect(v2).not.toContain(`class="significant"`);
});

test("the reason the pair cannot be gated is stated once, above the table", () => {
  const v = view([{ lead: "V1", delta: 0.02, dig: UNMEASURABLE, bio: UNMEASURABLE }]);
  const html = measurementsHtml({
    ...v,
    pairBlockerSets: [[{
      code: "CoverageUnmeasured",
      sentence: "ST-window coverage is not measured yet, so no serial ST change can be confirmed or excluded.",
    }]],
  });

  expect(html).toContain("ST-window coverage is not measured yet");
  // Once. Twelve copies of one fact is a block a reader learns to scroll past,
  // and this is the only thing on the screen they can act on.
  expect(html.match(/is not measured yet/g)!.length).toBe(1);
  expect(html).toContain("No serial ST change can be gated");
});

test("a study name cannot inject markup into the table", () => {
  const v = view([{ lead: "V1", delta: 0.02, dig: UNMEASURABLE, bio: UNMEASURABLE }]);
  v.studies[0]!.name = `<script>x</script>&.pdf`;

  // File names come from whatever the user dropped on the page. An unescaped
  // one does not merely look wrong: an unbalanced tag swallows the rest of the
  // table, and a table that renders as half its rows is indistinguishable from
  // a comparison that found nothing in the others.
  const html = measurementsHtml(v);
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("&amp;");
});

test("the clinical threshold in the copy comes from the engine, not from this file", () => {
  // Decision 0004. If the threshold were written here it would silently
  // disagree with the gate the moment `config.rs` changed, and the UI would
  // explain a verdict against a number the engine no longer used.
  const v = view([{ lead: "V1", delta: 0.07, dig: INDETERMINATE, bio: INDETERMINATE }]);
  const html = measurementsHtml({ ...v, clinicalThresholdMv: 0.25 });

  expect(html).toContain("0.25 mV clinical threshold");
  expect(html).not.toContain("0.10 mV clinical threshold");
});

test("a lead the reference could not build is reported rather than omitted", () => {
  // The engine drops a panel that fails timing verification from that study's
  // measurements, but the gate still returns a verdict for all twelve leads.
  // Keying the rows off the reference's measured leads deleted the row, so the
  // lead vanished from the table entirely — the "absent is indistinguishable
  // from nothing to report" failure, and asymmetric besides: the same lead
  // missing from the comparison still got a row.
  const v = view([
    { lead: "V2", delta: 0.02, dig: NO_CHANGE, bio: NO_CHANGE },
    { lead: "V3", delta: null, dig: LEAD_ABSENT, bio: LEAD_ABSENT },
    { lead: "V4", delta: 0.02, dig: NO_CHANGE, bio: NO_CHANGE },
  ]);
  v.studies[0]!.measurements.leads = v.studies[0]!.measurements.leads
    .filter((l) => l.lead !== "V3");

  const html = measurementsHtml(v);
  const rows = [...html.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) => m[0]);
  const v3 = rows.filter((r) => r.includes(">V3</th>"));

  // One row in each of the two per-lead tables, ST and R amplitude.
  expect(v3.length).toBe(2);
  expect(v3[0]).toContain("lead absent from one study");
});

// --- formatInterval ---------------------------------------------------------

test("formatInterval never carries a full unit into the remainder", () => {
  // It used to floor the larger unit and round the remainder, which carries:
  // 86,399 s rendered as "23 h 60 min" and 172,799 s as "47 h 60 min". Both are
  // arithmetically absurd and both look plausible enough to survive a review.
  for (const s of [86399, 172799, 3599, 7199, 90000, 86401, 3661]) {
    const out = formatInterval(s);
    expect(out, `${s} s`).not.toMatch(/\b60 min\b/);
    expect(out, `${s} s`).not.toMatch(/\b24 h\b(?! )/);
  }
});

test("formatInterval rounds to the nearest minute rather than truncating", () => {
  expect(formatInterval(86399)).toBe("24 h 0 min");
  expect(formatInterval(3661)).toBe("1 h 1 min");
  expect(formatInterval(59)).toBe("59 s");
});

test("formatInterval carries correctly into days", () => {
  // The same bug one branch down would have produced "1 d 24 h".
  expect(formatInterval(48 * 3600 + 86399)).toBe("3 d");
  expect(formatInterval(48 * 3600)).toBe("2 d");
});

/**
 * The measurements block: levels, intervals, and the five-state serial verdict.
 *
 * This is a pure function from plain data to a string of HTML. It is separate
 * from `main.ts` because `main.ts` wires the whole document on import — one
 * `getElementById` away from a thrown error under Node — and the rendering of a
 * verdict is the thing most worth testing without a browser in the way. What
 * the tests exercise here is exactly what the page shows.
 *
 * # The rule the layout exists to enforce
 *
 * **No millivolt figure is rendered without the band it is uncertain by.** Spec
 * §8 risk 10: a bare "0.15 mV new ST elevation" against a pair that could not
 * resolve 0.06 mV is the artifact this product must not produce, and it is the
 * one a reader is most likely to act on. So a level is drawn with its σ or not
 * at all, and a difference is drawn with its detection limit, its confidence
 * interval, or its exclusion bound — never on its own.
 *
 * # Why two of the five states share one style
 *
 * `BelowDetectionLimit` and `Unmeasurable` render in the same muted style,
 * because risk 10's failure is that a suppressed metric reads as reassurance:
 * "no significant change" and "no change" are the same sentence to a tired
 * clinician at 3 a.m., and an empty-looking cell is worse than either.
 * `Indeterminate` joins them, for the same reason and one more — it establishes
 * nothing either, and the only state on this screen that positively asserts
 * something is `NoChange`, which is therefore the only one that reads as a
 * statement rather than as an absence.
 *
 * # Why there are no numbers in this file
 *
 * The clinical threshold and the display quantum arrive in the snapshot, from
 * `config.rs`. Decision 0004: a threshold changed in Rust and stale in
 * TypeScript produces a UI that gates against a value the engine no longer
 * uses, and nothing errors — the numbers just disagree. The prose below names
 * conditions, never magnitudes.
 */
import { citeHtml } from "./cite.ts";
import type {
  CalibrationSummary,
  LeadVerdict,
  Measures,
  PairBlocker,
  Verdict,
  VerdictLimiter,
} from "../engine/protocol.ts";

/** One study's column in the tables. */
export interface MeasurementsStudy {
  name: string;
  calibration: CalibrationSummary | null;
  measurements: Measures;
}

/** Everything the block draws. `studies[0]` is the reference. */
export interface MeasurementsView {
  studies: MeasurementsStudy[];
  /** `verdictSets[k]` compares `studies[k + 1]` against the reference. */
  verdictSets: LeadVerdict[][];
  /** `pairBlockerSets[k]` is why that pair could not be gated at all. */
  pairBlockerSets: PairBlocker[][];
  clinicalThresholdMv: number;
  stDisplayQuantumMv: number;
}

/**
 * How a change cell reads, and therefore which style it carries.
 *
 * `suppressed` is deliberately shared by every state that establishes nothing.
 * Keeping them apart would let one of them acquire a lighter weight than the
 * others and start reading as an answer.
 */
export type ChangeTone = "significant" | "excluded" | "suppressed";

/** One study's serial change in one lead, in one uncertainty band, as rendered. */
export interface ChangeCell {
  /**
   * Which of the two bands this line reports, or empty when both agree and one
   * line stands for both.
   */
  band: string;
  /** The change and its band, or the reason there is neither. Never bare. */
  text: string;
  /** The sentence that says what may and may not be concluded. May be empty. */
  sentence: string;
  tone: ChangeTone;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Decimal places implied by the engine's display quantum.
 *
 * Derived rather than chosen, so that changing `ST_DISPLAY_QUANTUM_MV` in
 * `config.rs` changes the rendering here and nothing has to be remembered.
 */
function decimalsFor(quantumMv: number): number {
  if (!(quantumMv > 0)) return 3;
  return Math.max(0, Math.ceil(-Math.log10(quantumMv)));
}

/**
 * A point estimate, snapped to the quantum the engine says it may be shown at.
 *
 * Decision 49: never display more precision than the band. A difference printed
 * to three decimals against a detection limit an order of magnitude wider is a
 * claim about the third decimal that nothing in the pipeline supports.
 */
function quantised(mv: number, quantumMv: number, signed = true): string {
  const q = quantumMv > 0 ? Math.round(mv / quantumMv) * quantumMv : mv;
  const text = q.toFixed(decimalsFor(quantumMv));
  // `toFixed` on a negative zero gives "-0.00", which reads as a measured
  // downward change that rounding invented.
  const clean = Number(q) === 0 ? Math.abs(q).toFixed(decimalsFor(quantumMv)) : text;
  return signed && q > 0 ? `+${clean}` : clean;
}

/**
 * A band edge, rounded away from the estimate it brackets.
 *
 * Rounding a limit inward is the one direction that manufactures significance:
 * it narrows the interval a reader compares the difference against without
 * moving the difference. So a lower bound floors, an upper bound ceils, and a
 * half-width always ceils.
 */
function outward(mv: number, quantumMv: number, up: boolean): string {
  const d = decimalsFor(quantumMv);
  const p = 10 ** d;
  const v = up ? Math.ceil(mv * p) / p : Math.floor(mv * p) / p;
  return v.toFixed(d);
}

/** HTML-escape. Study names come from file names, which users control. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// The gate's vocabulary, in English
// ---------------------------------------------------------------------------

/**
 * A short label per `Refusal` variant, for the cell.
 *
 * The full sentence lives in Rust and reaches the screen through
 * `pairBlockers`, once, above the table — twelve copies of one fact is noise a
 * reader scrolls past. These labels are the same fact in three words, so the
 * empty cell has a cause attached to it rather than looking like a lead with
 * nothing to report.
 *
 * An unrecognised code falls through to the code itself. A refusal variant
 * added in Rust and unknown here must still be visible; silently dropping it
 * would make a new refusal look like a lead that simply had no change.
 */
const REFUSAL_LABEL: Record<string, string> = {
  LeadAbsent: "lead absent from one study",
  TooFewBeats: "too few beats to estimate spread",
  LowCoverage: "ST window mostly interpolated",
  CoverageUnmeasured: "ST-window coverage not measured",
  IdentityFailed: "lead-identity check failed",
  IdentityUnchecked: "lead identity not checked",
  GainUnconfirmed: "gain assumed, not measured",
  GainNotRecorded: "no gain recorded",
  FilterMismatch: "high-pass filters differ",
  RateMismatch: "heart rates too far apart",
  LeadReversalMismatch: "electrode arrangements differ",
  LeadReversalUndetermined: "electrode arrangement not determined",
  NoStLevel: "no ST level measured",
  NoUncertainty: "no uncertainty estimate",
};

/**
 * A short label per `Confounder` variant.
 *
 * Every one is phrased as "not shown to be" rather than as a positive finding,
 * because the payload cannot tell the two apart: the gate emits the same
 * variant whether a screen ran and found the confounder or never ran at all. A
 * label reading "PQ baseline is not flat" would state as measured something no
 * code in this pipeline has measured.
 */
const CONFOUNDER_LABEL: Record<string, string> = {
  SourceTierMismatch: "source quality not shown to match",
  PaperSpeedUnverified: "paper speed not verified",
  ZeroSumResidualHigh: "limb-lead sum residual not shown to be low",
  HeartRateMismatch: "heart rates differ",
  BeatsLessThanThree: "fewer than three beats in one study",
  PqBaselineNotFlat: "PQ baseline not shown to be flat",
  PossiblePrecordialElectrodeShift: "precordial electrode shift not excluded",
  LvhOrLbbbOrPaced: "LVH, LBBB or pacing not excluded",
  RhythmClassChanged: "change of rhythm class not excluded",
  ConductionChanged: "ventricular conduction not shown to be unchanged",
};

const label = (table: Record<string, string>, code: string): string => table[code] ?? code;

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

/**
 * An ST level with its 1 SD band, or nothing.
 *
 * A level whose uncertainty is unestimable is withheld rather than printed
 * bare. That case is not a slightly worse measurement: it is a lead built from
 * one beat, or one that returned before it was measured at all, and the number
 * it carries would render identically to one backed by ten beats.
 */
export function levelCell(
  stJMv: number | null,
  sigmaStMv: number | null,
): { text: string; band: string; note: string } {
  if (stJMv === null || !Number.isFinite(stJMv)) return { text: "—", band: "", note: "" };
  if (sigmaStMv === null || !Number.isFinite(sigmaStMv)) {
    return { text: "—", band: "", note: "level found, no uncertainty estimate" };
  }
  return { text: stJMv.toFixed(3), band: `± ${sigmaStMv.toFixed(3)}`, note: "" };
}

/** Which study limits the pair, said in words. */
function limiterSentence(limiter: VerdictLimiter | null, names: PairNames): string {
  if (!limiter) return "";
  const who = limiter.study === "reference" ? names.reference : names.comparison;
  // Below the asymmetry threshold the engine reports `dominant: false`, and
  // naming a study there would invite re-acquiring the one that was not
  // actually the problem.
  return limiter.dominant
    ? `Limited by ${who}, whose own uncertainty is ${limiter.ratio.toFixed(1)}× the other study's.`
    : `Neither study dominates the limit.`;
}

/** The two study names a verdict may need to name. */
export interface PairNames {
  reference: string;
  comparison: string;
}

/**
 * One study's serial change in one lead, rendered from its verdict.
 *
 * `band` here is whichever interval the state defines: a confidence interval on
 * `Significant`, a detection limit on the two indeterminate states, an
 * exclusion bound on `NoChange`. Every branch emits one, and the branch that
 * cannot emit one emits no number either.
 */
export function changeCell(
  verdict: Verdict,
  deltaMv: number | null,
  quantumMv: number,
  thresholdMv: number,
  names: PairNames,
): ChangeCell {
  const d = decimalsFor(quantumMv);
  const threshold = `${thresholdMv.toFixed(d)} mV`;
  // The one sentence risk 10 requires wherever nothing was established. It is
  // repeated across the indeterminate states on purpose: this is the sentence
  // whose absence lets a muted cell read as reassurance.
  const neither = "A clinically significant change can be neither confirmed nor excluded.";

  /*
   * A difference and the interval it is uncertain by, or neither of them.
   *
   * The pairing is enforced here rather than trusted at each call site, so that
   * a payload missing an interval — a state the engine should never emit, and
   * the kind of thing a future field rename produces silently — withholds the
   * figure instead of printing it alone. Fail-closed on the rendering side too:
   * the number is the part that gets acted on.
   */
  const figure = (band: string | null): string =>
    band === null || deltaMv === null
      ? `Δ withheld${band ? ` · ${band}` : ""}`
      : `Δ ${quantised(deltaMv, quantumMv)} mV · ${band}`;

  switch (verdict.state) {
    case "Significant": {
      // The interval is the uncorrected one that produced the verdict, per
      // §5.5: a reader interrogating a lead they already suspect is not
      // performing twelve tests, and no multiplicity correction is applied.
      const ci = verdict.ciMv;
      return {
        band: "",
        text: figure(
          ci
            ? `95% CI ${outward(ci[0], quantumMv, false)} to ${
              outward(ci[1], quantumMv, true)
            } mV`
            : null,
        ),
        sentence: `Exceeds both the pair's detection limit and the ${threshold} clinical threshold.`,
        tone: "significant",
      };
    }

    case "NoChange": {
      // The only state that asserts. What it asserts is the bound, not the
      // difference — "no change" without the magnitude it excluded is the
      // reassurance decision 44 exists to prevent.
      const bound = verdict.boundMv;
      return {
        band: "",
        text: bound === null
          ? "no change"
          : `no change beyond ${outward(Math.abs(bound), quantumMv, true)} mV`,
        sentence: `A change of ${threshold} is positively excluded.`,
        tone: "excluded",
      };
    }

    case "BelowDetectionLimit": {
      // Decision 50: the difference is withheld, not printed bare. This pair
      // cannot resolve the clinical threshold, so its Δ carries no information
      // a reader could act on — and a number on the screen will be acted on.
      const mdc = verdict.mdcMv;
      const band = mdc === null ? null : `detection limit ±${outward(mdc, quantumMv, true)} mV`;
      return {
        band: "",
        text: `Δ withheld${band ? ` · ${band}` : ""}`,
        sentence: [
          neither,
          `The pair's detection limit is wider than the ${threshold} threshold, so the difference is not shown.`,
          limiterSentence(verdict.limiter, names),
        ].filter(Boolean).join(" "),
        tone: "suppressed",
      };
    }

    case "Indeterminate": {
      const mdc = verdict.mdcMv;
      const band = mdc === null ? null : `detection limit ±${outward(mdc, quantumMv, true)} mV`;
      const why = verdict.reason === "SubThreshold"
        ? `The difference is resolved but does not reach the ${threshold} clinical threshold.`
        : verdict.reason === "Confounded"
        ? `Confounded by: ${
          verdict.confounders.map((c) => label(CONFOUNDER_LABEL, c)).join("; ")
        }.`
        : "";
      return {
        band: "",
        text: figure(band),
        sentence: [neither, why, limiterSentence(verdict.limiter, names)].filter(Boolean).join(" "),
        tone: "suppressed",
      };
    }

    case "Unmeasurable": {
      // No band exists, so no number is shown. The reason is the whole content
      // of the cell; the sentence behind it is stated once above the table.
      return {
        band: "",
        text: `not gated · ${label(REFUSAL_LABEL, verdict.reason ?? "")}`,
        sentence: "",
        tone: "suppressed",
      };
    }
  }
}

/**
 * Both bands for one lead, as the lines the cell will show.
 *
 * §5.3 requires both to be visible by default: a pair can be `Significant` on
 * digitisation error alone and `Indeterminate` once the repeat-recording
 * variation nobody controls is included, and showing only the first is exactly
 * the failure that section warns about. So the wider band is never dropped —
 * the two are collapsed to one line only when they render identically, where a
 * second copy of the same sentence would be noise rather than information.
 */
export function changeCells(
  v: LeadVerdict,
  quantumMv: number,
  thresholdMv: number,
  names: PairNames,
): ChangeCell[] {
  const digitization = changeCell(v.digitization, v.deltaMv, quantumMv, thresholdMv, names);
  const withBio = changeCell(v.withBio, v.deltaMv, quantumMv, thresholdMv, names);
  const same = digitization.text === withBio.text &&
    digitization.sentence === withBio.sentence &&
    digitization.tone === withBio.tone;
  if (same) return [digitization];
  return [
    { ...digitization, band: "digitisation only" },
    { ...withBio, band: "incl. repeat-recording variation" },
  ];
}

/**
 * A lead is emphasised only when the change survives the wider of the two bands.
 *
 * The with-`σ_bio` band is never narrower than the digitisation band, so a
 * change significant there is significant in both — this is the same rule
 * `significant_st_leads` applies in Rust, expressed as the one comparison that
 * implies the other rather than as a second copy of the policy. Emphasising on
 * the narrow band alone would colour changes that repeat-recording variation
 * alone can produce.
 */
export function isEmphasised(v: LeadVerdict): boolean {
  return v.withBio.state === "Significant";
}

// ---------------------------------------------------------------------------
// The block
// ---------------------------------------------------------------------------

const num = (v: number | null, digits: number, unit: string) =>
  v === null || !Number.isFinite(v)
    ? "—"
    : `${v.toFixed(digits)}${unit ? " " + unit : ""}`;

/** The ST cell for one study in one lead: its level, and its change if it has one. */
function stCell(
  study: MeasurementsStudy,
  lead: string,
  verdict: LeadVerdict | undefined,
  view: MeasurementsView,
  names: PairNames,
): string {
  const m = study.measurements.leads.find((x) => x.lead === lead);
  const level = levelCell(m?.stJ ?? null, m?.sigmaSt ?? null);

  const parts = [
    `<span class="st-level">${level.text}${
      level.band ? ` <span class="st-band">${level.band}</span>` : ""
    }</span>`,
  ];
  if (level.note) {
    parts.push(`<span class="st-change st-change--suppressed">${esc(level.note)}</span>`);
  }

  if (verdict) {
    for (
      const cell of changeCells(
        verdict,
        view.stDisplayQuantumMv,
        view.clinicalThresholdMv,
        names,
      )
    ) {
      parts.push(
        `<span class="st-change st-change--${cell.tone}">${
          cell.band ? `<span class="st-band-name">${esc(cell.band)}</span> ` : ""
        }${esc(cell.text)}${
          cell.sentence ? ` <span class="st-why">${esc(cell.sentence)}</span>` : ""
        }</span>`,
      );
    }
  }
  return parts.join("");
}

/**
 * Render the measurements block for a series.
 *
 * Changes are against the first study, not the preceding one: a series is read
 * for distance from baseline, and chaining differences would let three small
 * unflagged steps hide one large real change.
 */
export function measurementsHtml(view: MeasurementsView): string {
  const { studies, verdictSets, pairBlockerSets } = view;
  const reference = studies[0];
  if (!reference) return "";

  const calRows = studies.map((s) =>
    `<div><strong>${esc(s.name)}</strong> — ${
      s.calibration?.source === "pulse"
        ? `${s.calibration.mmPerMv} mm/mV measured from the calibration pulse`
        : `${s.calibration?.mmPerMv ?? "?"} mm/mV assumed — no pulse found`
    }</div>`
  ).join("");

  const head = studies.map((s, i) =>
    `<th scope="col">${i === 0 ? "ref · " : ""}${esc(s.name.replace(/\.pdf$/i, ""))}</th>`
  ).join("");

  // Both corrections are shown because they disagree, and the row label is the
  // only place the page says which formula produced a number. Fridericia's is
  // linked: it is a 1920 result the reader is being asked to trust, and the
  // English translation is the copy they can actually reach. Bazett's 1920
  // paper has no PubMed record to link to.
  const globalRows: [string, (m: Measures) => string, string?][] = [
    ["Heart rate", (m) => num(m.hr, 0, "bpm")],
    ["QRS duration", (m) => num(m.qrs, 0, "ms")],
    // The reason travels with the blank. An empty cell reads as "we did not
    // say"; the engine always knows which boundary it could not find, and 155
    // of 1,355 corpus records land here.
    ["QT", (m) => m.qt == null && m.qtNote
      ? `<span class="measure__absent" title="${esc(m.qtNote)}">not established</span>`
      : num(m.qt, 0, "ms")],
    ["QTc (Fridericia)", (m) => num(m.qtcF, 0, "ms"), "fridericia-1920"],
    ["QTc (Bazett)", (m) => num(m.qtcB, 0, "ms")],
    ["Frontal axis", (m) => m.axis == null && m.axisNote
      ? `<span class="measure__absent" title="${esc(m.axisNote)}">not comparable</span>`
      : num(m.axis, 0, "°")],
  ];
  const globals = globalRows.map(([name, fn, ref]) =>
    `<tr><th scope="row">${name}${ref ? ` ${citeHtml(ref, "source")}` : ""}</th>${
      studies.map((s) => `<td>${fn(s.measurements)}</td>`).join("")
    }</tr>`
  ).join("");

  /*
   * The pair-level refusals, stated once above the table.
   *
   * Every one of these is a fact about the pair that the reader can act on —
   * re-acquire, re-scan, check the cable — and every one of them is why the
   * column beside it is empty. Without this block the table reads as twelve
   * leads with nothing to report.
   */
  const blockerBlock = pairBlockerSets.map((blockers, k) => {
    if (!blockers.length) return "";
    const subject = studies[k + 1];
    const who = studies.length > 2 && subject ? ` · ${esc(subject.name)}` : "";
    return `<div class="blockers">
      <strong class="blockers__label">No serial ST change can be gated${who}</strong>
      <ul>${blockers.map((b) => `<li>${esc(b.sentence)}</li>`).join("")}</ul>
    </div>`;
  }).join("");

  /*
   * The row list is the gate's canonical twelve, not the reference's measured
   * leads.
   *
   * A panel the reference could not verify never reaches `measurements.leads` —
   * `analyze` drops it and says so only inside that study's collapsed warnings —
   * so keying the rows off the reference deletes the row here while the verdicts
   * still carry `Unmeasurable { LeadAbsent }` for that lead. A deleted row is
   * exactly the "absent is indistinguishable from nothing to report" failure that
   * `gate_all` returns twelve rows to prevent, and it is asymmetric: the same
   * lead missing from the *comparison* still gets its row, so nothing on screen
   * would hint that the other direction is being hidden.
   *
   * Leads a study measured but no verdict names are appended, so a single study
   * with no comparison — where `verdictSets` is empty — still renders every row
   * it has.
   */
  const canonical = verdictSets[0]?.map((v) => v.lead) ?? [];
  const extra = studies.flatMap((s) => s.measurements.leads.map((l) => l.lead))
    .filter((l) => !canonical.includes(l));
  const leads = [...canonical, ...new Set(extra)];

  const stRows = leads.map((la) => {
    const names = (k: number): PairNames => ({
      reference: reference.name,
      comparison: studies[k]?.name ?? "the comparison study",
    });
    const cells = studies.map((s, k) =>
      `<td>${stCell(s, la, k === 0 ? undefined : verdictSets[k - 1]?.find((x) => x.lead === la), view, names(k))}</td>`
    );
    const emphasised = verdictSets.some((set) => {
      const v = set.find((x) => x.lead === la);
      return !!v && isEmphasised(v);
    });
    return `<tr class="${
      emphasised ? "significant" : ""
    }"><th scope="row">${esc(la)}</th>${cells.join("")}</tr>`;
  }).join("");

  const rRows = leads.map((la) =>
    `<tr><th scope="row">${esc(la)}</th>${
      studies.map((s) =>
        `<td>${num(s.measurements.leads.find((x) => x.lead === la)?.r ?? null, 2, "")}</td>`
      ).join("")
    }</tr>`
  ).join("");

  const d = decimalsFor(view.stDisplayQuantumMv);
  const threshold = `${view.clinicalThresholdMv.toFixed(d)} mV`;

  return `
    <div class="note">${calRows}</div>
    ${blockerBlock}
    <table class="mtable">
      <caption>Global measurements</caption>
      <thead><tr><th scope="col">Measure</th>${head}</tr></thead>
      <tbody>${globals}</tbody>
    </table>
    <table class="mtable mtable--st">
      <caption>ST at the J point (mV, ± 1 SD), each study with its change from the reference</caption>
      <thead><tr><th scope="col">Lead</th>${head}</tr></thead>
      <tbody>${stRows}</tbody>
    </table>
    <table class="mtable">
      <caption>R amplitude (mV)</caption>
      <thead><tr><th scope="col">Lead</th>${head}</tr></thead>
      <tbody>${rRows}</tbody>
    </table>
    <p class="mnote">
      Changes are measured against the <strong>reference</strong>, the earliest study
      selected, not against the preceding one — three small steps would otherwise
      each escape flagging while together amounting to a large real change.
      A change is called significant only when it exceeds both the pair's own
      detection limit and the ${threshold} clinical threshold, and no confounder is
      present or unscreened. Everything short of that says what could not be
      established, in the same muted style, because a suppressed number is not
      reassurance.
    </p>`;
}

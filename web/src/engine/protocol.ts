/**
 * The engine boundary: everything that crosses between the UI and the compute.
 *
 * The one rule that shapes all of this: a `wasm_bindgen` object is a handle into
 * a specific WebAssembly heap. It cannot be structured-cloned, so it cannot
 * cross a worker boundary — and `compare_studies(a, b)` needs *two* of them
 * alive in the *same* heap at once. So the worker owns every handle for its
 * whole lifetime, keyed by study id, and the main thread never sees one. What
 * crosses is plain data only: numbers, strings, and `Float32Array`s.
 *
 * That constraint turns out to be a feature. Because the UI can only ask for
 * snapshots, it cannot accidentally reach back into the engine mid-render, and
 * the draw path stays a pure function of plain arrays.
 *
 * Note what is deliberately absent: colour and label. Those are UI state, they
 * change while the user drags a colour picker, and routing them through the
 * engine would mean re-running the registration on every pointer event. The
 * main thread zips them onto the snapshot by index instead.
 */

export interface Assumptions {
  mmPerSec: number;
  mmPerMv: number;
}

/** Gain, as measured or as assumed. Mirrors `ingest/calibrate.ts`. */
export interface CalibrationSummary {
  mmPerMv: number;
  source: "pulse" | "assumed";
  pulseCount: number;
  rowSpread: number | null;
  relativeUncertainty: number;
}

/** One lead's measurements. Mirrors a row of `measurements_json`. */
export interface LeadMeasure {
  lead: string;
  stJ: number | null;
  stJ60: number | null;
  r: number | null;
  s: number | null;
  q: number | null;
  t: number | null;
  sigmaSt: number | null;
  note: string | null;
}

/** Mirrors `measurements_json`. Nulls mean unmeasurable, never zero. */
export interface Measures {
  hr: number | null;
  qrs: number | null;
  qt: number | null;
  qtcF: number | null;
  qtcB: number | null;
  axis: number | null;
  leads: LeadMeasure[];
}

/**
 * Everything the study list and the report need about one analysed study.
 *
 * This is the plain-data replacement for what used to be a live `StudyAnalysis`
 * handle sitting on the `Study` record.
 */
export interface StudySummary {
  leadNames: string[];
  hrBpm: number;
  /** Frame indices; negative means the fiducial was not measurable. */
  qrsOnset: number;
  qrsOffset: number;
  tOffset: number;
  anchorIndex: number;
  frameLen: number;
  /** How far pass 2 moved the QRS onset. Large values mean pass 1 was wrong. */
  onsetShiftMs: number;
  /** Seconds each 3x4 column covers, from the detected layout. */
  columnSeconds: number | null;
  identityPassed: boolean | null;
  calibration: CalibrationSummary | null;
  warnings: string[];
  measurements: Measures;
}

/** One study's contribution to one lead's overlay. */
export interface SnapshotTrace {
  samples: Float32Array;
  sigma: Float32Array | null;
  beatsUsed: number;
}

export interface SnapshotDifference {
  samples: Float32Array;
  /** Index into `traces`; 0 is always the reference. */
  traceIndex: number;
  rmsMv: number;
}

export interface SnapshotLead {
  lead: string;
  /** No usable beat in the reference — the panel is drawn empty, not omitted. */
  unavailable: boolean;
  traces: SnapshotTrace[];
  differences: SnapshotDifference[];
  rmsDifferenceMv: number;
  morphologyChanged: boolean;
}

/** One study's continuous signals, for the full-printout view. */
export interface SnapshotPrintout {
  leads: Map<string, Float32Array>;
  rhythm: Float32Array | null;
}

/**
 * The five states of `serial::gate::Verdict`, as strings.
 *
 * A union of literals rather than an enum, because this is what arrives over
 * the wire and the compiler should reject a state the engine cannot emit. If
 * Rust ever grows a sixth state, every `switch` over this union fails to
 * compile — which is the failure we want, rather than a state falling through
 * to whatever the last branch happened to render.
 */
export type VerdictState =
  | "Significant"
  | "Indeterminate"
  | "BelowDetectionLimit"
  | "NoChange"
  | "Unmeasurable";

/** Which study constrains the pair, and by how much. Mirrors `gate::Limiter`. */
export interface VerdictLimiter {
  study: "reference" | "comparison";
  sigmaMv: number;
  ratio: number;
  /** One study is unambiguously the constraint, so the UI must name it. */
  dominant: boolean;
}

/**
 * One band's verdict on one lead. Mirrors `gate::Verdict` through `verdict_json`.
 *
 * Every numeric field is null where the state does not define it, never zero. A
 * zero `mdcMv` on a refusal is the exact lie the gate was built to remove: it
 * renders as a detection limit of nothing, which reads as certainty about a
 * lead nobody measured.
 */
export interface Verdict {
  state: VerdictState;
  /** The `Refusal` or `Indeterminacy` variant name; null on the other states. */
  reason: string | null;
  mdcMv: number | null;
  /** Two-element interval on `Significant` only. */
  ciMv: [number, number] | null;
  /** What `NoChange` positively excluded; set on that state only. */
  boundMv: number | null;
  /** `Confounder` variant names that downgraded the verdict. */
  confounders: string[];
  limiter: VerdictLimiter | null;
}

/**
 * One lead's serial ST result, in both bands. Mirrors one row of
 * `st_verdicts_json`, which always carries all twelve leads.
 *
 * Both bands are here because §5.3 requires both to be visible by default: a
 * pair can be `Significant` on digitisation error alone and `Indeterminate`
 * once repeat-recording variation is included, and showing only the first is
 * the failure that section exists to warn about.
 */
export interface LeadVerdict {
  lead: string;
  /** null when either study lacks the lead or could not measure its level. */
  deltaMv: number | null;
  /** Digitisation only: what this pipeline validates and controls. */
  digitization: Verdict;
  /** Plus σ_bio, the repeat-recording variation nobody controls. */
  withBio: Verdict;
}

/**
 * A precondition the pair as a whole fails, with the sentence that explains it.
 *
 * Stated once above the table rather than repeated in twelve identical rows —
 * twelve copies of one fact is noise a reader learns to scroll past, and this is
 * the one thing on the screen they can act on (re-acquire, re-scan, check the
 * cable).
 */
export interface PairBlocker {
  code: string;
  sentence: string;
}

/**
 * The result of one comparison, in draw order.
 *
 * `studyIds[0]` is the reference; `verdictSets[k]` compares `studyIds[k + 1]`
 * against it. Everything is positional, so the main thread can zip its own
 * labels and colours on without another round trip.
 */
export interface ComparisonSnapshot {
  studyIds: string[];
  leads: SnapshotLead[];
  printouts: SnapshotPrintout[];
  /** Twelve verdicts per comparison study, in canonical lead order. */
  verdictSets: LeadVerdict[][];
  /** Why the pair itself is ungateable, one list per comparison study. */
  pairBlockerSets: PairBlocker[][];
  /**
   * Study-level findings, one list per comparison study against the reference.
   *
   * These outrank the per-lead deltas and must be shown above them. A change in
   * QRS duration means ST and T differences carry the new activation sequence as
   * well as any change in repolarisation, so every number below is conditional
   * on it.
   */
  findingSets: string[][];
  anchorIndex: number;
  columnSeconds: number;
  /**
   * mV a serial difference must also exceed to be worth reporting, and the mV
   * grain a difference may be rendered at.
   *
   * Both come from `config.rs` through the payload. Neither may acquire a
   * literal on this side of the boundary: a threshold changed in Rust and stale
   * in TypeScript produces a UI that gates against a number the engine no
   * longer uses, silently (decision 0004).
   */
  clinicalThresholdMv: number;
  stDisplayQuantumMv: number;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export type Request =
  | { kind: "analyse"; id: string; studyId: string; bytes: Uint8Array; assumptions: Assumptions }
  | { kind: "compare"; id: string; studyIds: string[] }
  | { kind: "release"; id: string; studyIds: string[] };

export type Response =
  | { kind: "analysed"; id: string; summary: StudySummary | null; error: string | null }
  | { kind: "compared"; id: string; snapshot: ComparisonSnapshot }
  | { kind: "released"; id: string }
  | { kind: "failed"; id: string; error: string };

/**
 * Collect the buffers worth transferring rather than copying.
 *
 * A comparison carries roughly a quarter of a megabyte of `Float32Array`; the
 * copy is not expensive enough to matter on its own, but the worker rebuilds
 * every one of these arrays from the WASM heap on each call, so nothing on the
 * worker side needs them afterwards. Transferring is free correctness — and it
 * means a future raster path, which will carry whole images, already has the
 * right shape.
 */
export function snapshotTransfers(s: ComparisonSnapshot): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  const seen = new Set<ArrayBuffer>();
  const push = (a: Float32Array | null) => {
    if (!a) return;
    const b = a.buffer as ArrayBuffer;
    // A detached-twice buffer throws, and views can share one.
    if (seen.has(b)) return;
    seen.add(b);
    out.push(b);
  };
  for (const lead of s.leads) {
    for (const t of lead.traces) {
      push(t.samples);
      push(t.sigma);
    }
    for (const d of lead.differences) push(d.samples);
  }
  for (const p of s.printouts) {
    for (const sig of p.leads.values()) push(sig);
    push(p.rhythm);
  }
  return out;
}

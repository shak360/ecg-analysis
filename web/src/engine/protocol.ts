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
  /**
   * Why there is no QT, when there is none.
   *
   * Non-null exactly when `qt` is null. The reasons are the engine's own
   * `Unmeasurable` variants — a flat T, a shallow tangent, a T running past the
   * search window — which existed and were named long before anything carried
   * them out here.
   */
  qtNote: string | null;
  qtcF: number | null;
  qtcB: number | null;
  axis: number | null;
  /**
   * Why there is no frontal axis, when there is none.
   *
   * Set on exactly the condition the vector loop is refused on: the angle is
   * measured in a frontal plane the limb electrodes define, and where they are
   * not in standard geometry the number is not comparable with one from a
   * standard recording.
   */
  axisNote: string | null;
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
  /**
   * The alignment search wanted a shift larger than `XSTUDY_CLAMP_MS`, so it was
   * clamped to zero and these two beats were never registered.
   *
   * Per comparison rather than per lead, because a series may hold one study
   * that aligned and another that did not, and suppressing both would hide a
   * good result to report a bad one.
   */
  implausible: boolean;
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
 * A study-level finding, with how firmly it can be asserted.
 *
 * `equivocal` exists because the QRS-duration distributions of changed and
 * unchanged pairs genuinely overlap; see `config::QRS_DURATION_EQUIVOCAL_MS`.
 * The UI must render the two differently — an equivocal item in the same colour
 * as a confirmed one asserts something the engine deliberately did not.
 */
export interface SerialFinding {
  level: "changed" | "equivocal";
  text: string;
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
  findingSets: SerialFinding[][];
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
  // Already-digital recordings: WFDB corpora, cart exports. Millivolts go
  // straight in, so there is no grid, no calibration pulse and no columns.
  | {
    kind: "analyseSignals";
    id: string;
    studyId: string;
    leads: Map<string, Float32Array>;
    fsHz: number;
  }
  | { kind: "compare"; id: string; studyIds: string[] }
  | { kind: "vcg"; id: string; studyId: string; mode: VcgMode }
  | { kind: "release"; id: string; studyIds: string[] };

export type Response =
  | { kind: "analysed"; id: string; summary: StudySummary | null; error: string | null }
  | { kind: "compared"; id: string; snapshot: ComparisonSnapshot }
  | { kind: "vcgDerived"; id: string; vcg: VcgSnapshot }
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


/**
 * How one plane maps the orthogonal leads onto two screen axes.
 *
 * Supplied by the engine rather than chosen here. The sign on the Z axis decides
 * whether a horizontal loop reads clockwise or counterclockwise, and that is a
 * clinical reading — a normal horizontal QRS loop runs counterclockwise, while
 * clockwise is the pattern of posterior infarction and right ventricular
 * hypertrophy. A drawing module is the wrong place to keep a fact like that,
 * and decision 0004 already says so.
 */
export interface VcgPlane {
  id: "frontal" | "horizontal" | "sagittal";
  label: string;
  horizontal: { axis: "x" | "y" | "z"; sign: 1 | -1; positiveLabel: string };
  vertical: { axis: "x" | "y" | "z"; sign: 1 | -1; positiveLabel: string };
}

/** Why a study has no loop. `code` is stable; `sentence` is for the reader. */
export interface VcgRefusal {
  code: string;
  sentence: string;
  leads: string[];
}

/**
 * One study's vectorcardiogram, or the reason it has none.
 *
 * `x`/`y`/`z` are on the same frame as every lead's ensemble beat, so sample `i`
 * here and sample `i` of the tracing are the same instant. That is what lets one
 * cursor run along the ECG and around the loop at once.
 */
export interface VcgSnapshot {
  studyId: string;
  /**
   * The ensemble beats the loop was derived from, by lead.
   *
   * Shipped alongside rather than fetched separately so the correspondence is
   * structural: sample `i` of any of these and sample `i` of `x`/`y`/`z` came
   * from the same call on the same frame, and no later change can quietly put
   * the tracing and the loop on different clocks.
   *
   * Empty on a refusal, like the loops.
   */
  beats: Map<string, Float32Array>;
  /** Empty on a refusal. Never zero-filled: a loop of zeros is a null vector. */
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  /** Frame indices; negative means that fiducial was not measurable. */
  qrsOnset: number;
  qrsOffset: number;
  tOffset: number;
  anchorIndex: number;
  frameLen: number;
  fsHz: number;
  refusal: VcgRefusal | null;
  /** Facts a reader needs that are not refusals. */
  notes: string[];
  /** Largest inter-lead alignment difference, milliseconds. */
  alignmentSpreadMs: number;
  planes: VcgPlane[];
  /** Where each of the twelve leads points, for the compass. */
  leadAxes: LeadAxis[];
  /**
   * R-peak sample indices, when the loop was taken from the recording as it
   * stands. Empty for the averaged loop, which is one beat by construction.
   */
  beatSamples: number[];
  /** Which of the two the caller asked for. */
  mode: VcgMode;
}

/**
 * Averaged, or every beat.
 *
 * `"averaged"` combines the window's beats into one and needs the rhythm to
 * have held steady for that to describe anything. `"raw"` transforms the leads
 * as recorded, so beat-to-beat variation is visible rather than averaged away —
 * which is the whole finding for an ectopic beat or a run of VT, and is why
 * that mode carries no stationarity gate.
 */
export type VcgMode = "averaged" | "raw";

/**
 * One lead's positive direction, in the loop's own frame.
 *
 * `approximate` is true for the precordial six: their real directions depend on
 * the chest they were recorded from, so the diagram must not present them with
 * the same authority as the limb leads, whose angles are definitional.
 */
export interface LeadAxis {
  lead: string;
  v: [number, number, number];
  limb: boolean;
  approximate: boolean;
}

/**
 * The three orthogonal leads, transferred rather than copied.
 *
 * Each is a fresh slice out of the WASM heap, so nothing worker-side needs them
 * afterwards — the same argument `snapshotTransfers` makes.
 */
export function vcgTransfers(v: VcgSnapshot): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  const seen = new Set<ArrayBuffer>();
  for (const a of [v.x, v.y, v.z, ...v.beats.values()]) {
    // A refusal carries no samples, and a detached-twice buffer throws.
    if (!a.length) continue;
    const b = a.buffer as ArrayBuffer;
    if (seen.has(b)) continue;
    seen.add(b);
    out.push(b);
  }
  return out;
}

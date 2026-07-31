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

/** Mirrors one row of `st_deltas_json`. `delta` is null when unmeasurable. */
export interface StDelta {
  lead: string;
  delta: number | null;
  mdc: number | null;
  notable: boolean;
  belowLimit: boolean;
}

/**
 * The result of one comparison, in draw order.
 *
 * `studyIds[0]` is the reference; `deltaSets[k]` compares `studyIds[k + 1]`
 * against it. Everything is positional, so the main thread can zip its own
 * labels and colours on without another round trip.
 */
export interface ComparisonSnapshot {
  studyIds: string[];
  leads: SnapshotLead[];
  printouts: SnapshotPrintout[];
  deltaSets: StDelta[][];
  anchorIndex: number;
  columnSeconds: number;
  clinicalThresholdMv: number;
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

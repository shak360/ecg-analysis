/**
 * Assigning recovered traces to leads on a standard 3×4 printout.
 *
 * Geometry proposes the assignment: four 2.5 s columns left to right, three rows
 * top to bottom, plus one full-width rhythm strip. That ordering is fixed by
 * convention, so on a standard layout the mapping is unambiguous.
 *
 * It is not, however, *verified* by geometry — a Cabrera-sequence printout has
 * the same rectangles in the same places with different leads in them. So the
 * assignment is checked against electrophysiology, which cannot be fooled by
 * where a rectangle sits. Comparing V2 in one study against V3 in another is a
 * patient-safety failure, not a cosmetic one.
 */
import type { Polyline } from "./path-decode.ts";

export const LEAD_ORDER_3X4: readonly (readonly string[])[] = [
  ["I", "II", "III"],
  ["aVR", "aVL", "aVF"],
  ["V1", "V2", "V3"],
  ["V4", "V5", "V6"],
];

export interface Panel {
  lead: string;
  /** Column index, 0-based left to right. */
  column: number;
  /** Row index, 0-based top to bottom. */
  row: number;
  /** Start of this panel's window within the record, seconds. */
  timeOffsetSec: number;
  trace: Polyline;
}

export interface Layout {
  panels: Panel[];
  rhythm: Polyline | null;
  /** Seconds each column covers, from its measured width and the paper speed. */
  columnSeconds: number;
  warnings: string[];
}

/**
 * Group traces into the 3×4 grid plus rhythm strip.
 *
 * The rhythm strip is the trace spanning substantially more width than the rest;
 * on a standard printout it is the only one crossing column boundaries.
 */
export function detectLayout(
  traces: Polyline[],
  pxPerMm: { x: number; y: number },
  mmPerSec: number,
): Layout {
  const warnings: string[] = [];
  if (traces.length === 0) {
    return { panels: [], rhythm: null, columnSeconds: 0, warnings: ["no traces found"] };
  }

  const widths = traces.map((t) => t.maxX - t.minX);
  const maxWidth = Math.max(...widths);

  // A panel is roughly a quarter of the strip's width; anything above 60% of the
  // widest trace is treated as full-width.
  const rhythmIdx = widths.findIndex((w) => w >= 0.6 * maxWidth && w > 0);
  const panelTraces = traces.filter((_, i) => i !== rhythmIdx);
  const rhythm = rhythmIdx >= 0 ? traces[rhythmIdx]! : null;

  if (panelTraces.length !== 12) {
    warnings.push(
      `expected 12 lead panels, found ${panelTraces.length} — layout may not be 3×4`,
    );
  }

  // Cluster by x to find columns, then order within each column by y.
  const byX = [...panelTraces].sort((a, b) => a.minX - b.minX);
  const columns: Polyline[][] = [];
  for (const t of byX) {
    const last = columns[columns.length - 1];
    // Same column when the left edges are within a third of a panel width.
    const tol = (t.maxX - t.minX) / 3;
    if (last && Math.abs(last[0]!.minX - t.minX) <= tol) last.push(t);
    else columns.push([t]);
  }

  const panelWidthPt = panelTraces.length
    ? panelTraces.reduce((s, t) => s + (t.maxX - t.minX), 0) / panelTraces.length
    : 0;
  const columnSeconds = panelWidthPt / pxPerMm.x / mmPerSec;

  const panels: Panel[] = [];
  columns.forEach((col, c) => {
    col.sort((a, b) => a.minY - b.minY);
    col.forEach((trace, r) => {
      const lead = LEAD_ORDER_3X4[c]?.[r];
      if (!lead) {
        warnings.push(`trace at column ${c} row ${r} has no lead in the standard order`);
        return;
      }
      panels.push({ lead, column: c, row: r, timeOffsetSec: c * columnSeconds, trace });
    });
  });

  if (columns.length !== 4) {
    warnings.push(`expected 4 columns, found ${columns.length}`);
  }

  return { panels, rhythm, columnSeconds, warnings };
}


/**
 * Convert a polyline in PDF points to `(seconds, millivolts)` within its panel.
 *
 * `baselineY` is the panel's isoelectric row in page coordinates. Passing the
 * trace's own median is adequate for display; the measurement path re-derives it
 * from PQ anchors.
 */
export function toPhysical(
  poly: Polyline,
  pxPerMm: { x: number; y: number },
  mmPerSec: number,
  mmPerMv: number,
  baselineY?: number,
): { t: Float64Array; v: Float32Array } {
  const n = poly.points.length / 2;
  let base = baselineY;
  if (base === undefined) {
    const ys: number[] = [];
    for (let i = 0; i < n; i++) ys.push(poly.points[i * 2 + 1]!);
    ys.sort((a, b) => a - b);
    base = ys[ys.length >> 1]!;
  }

  const t = new Float64Array(n);
  const v = new Float32Array(n);
  const x0 = poly.minX;
  for (let i = 0; i < n; i++) {
    t[i] = (poly.points[i * 2]! - x0) / pxPerMm.x / mmPerSec;
    // Page y grows downward; millivolts grow upward.
    v[i] = -(poly.points[i * 2 + 1]! - base) / pxPerMm.y / mmPerMv;
  }
  return { t, v };
}

/** Resample a panel onto a uniform grid, for the identity check only. */
export function sampleUniform(
  t: Float64Array,
  v: Float32Array,
  fs = 500,
): Float32Array {
  if (t.length < 2) return new Float32Array(0);
  const span = t[t.length - 1]! - t[0]!;
  const n = Math.max(1, Math.floor(span * fs));
  const out = new Float32Array(n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const tt = t[0]! + i / fs;
    while (k + 2 < t.length && t[k + 1]! < tt) k++;
    const t0 = t[k]!, t1 = t[k + 1] ?? t0 + 1e-9;
    const f = t1 > t0 ? (tt - t0) / (t1 - t0) : 0;
    out[i] = v[k]! + ((v[k + 1] ?? v[k]!) - v[k]!) * Math.max(0, Math.min(1, f));
  }
  return out;
}

/**
 * Sorts recovered polylines into grid lattice, waveform traces, and everything
 * else (calibration pulses, tick marks, borders, decorations).
 *
 * The separation matters twice over. Obviously we need the traces. Less
 * obviously, the *grid* is what tells us the millimetre scale: its pitch is
 * 1 mm by definition on every ECG ever printed, so measuring it converts page
 * coordinates into millivolts and seconds without trusting a printed
 * "25 mm/s" annotation that may be wrong or absent.
 */
// Imported from the pdf.js-free module so this file stays testable outside a browser.
import type { Polyline } from "./path-decode.ts";

export interface Classification {
  grid: Polyline[];
  traces: Polyline[];
  other: Polyline[];
  /**
   * Median spacing of the detected lattice, in device units, along each axis.
   * Null when too few gridlines were found to be confident.
   */
  gridPitch: { x: number; y: number } | null;
  /** How many distinct gridlines backed each pitch estimate. */
  gridLineCount: { x: number; y: number };
}

export interface ClassifyOptions {
  /** A polyline flatter than this (device units) counts as axis-aligned. */
  straightTolerance?: number;
  /** Minimum segments before a path can be considered a waveform. */
  minTraceSegments?: number;
  /** Minimum horizontal span (device units) before a path can be a waveform. */
  minTraceSpan?: number;
  /** Gridlines must be at least this many to trust a pitch estimate. */
  minGridLines?: number;
}

const DEFAULTS: Required<ClassifyOptions> = {
  straightTolerance: 0.6,
  // A 2.5 s panel at 500 Hz is ~1250 points. Calibration pulses and tick marks
  // are under ten. Anything in between is ambiguous and lands in `other`.
  minTraceSegments: 40,
  minTraceSpan: 20,
  minGridLines: 8,
};

/** Median of a numeric array. Returns NaN when empty. */
function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Estimate lattice pitch from a set of line positions along one axis.
 *
 * Takes the median of consecutive gaps rather than the mean, because a printout
 * usually mixes 1 mm and 5 mm rules: the heavy 5 mm lines are drawn *on top of*
 * the light ones, so the position list contains duplicates and occasional wide
 * gaps at panel boundaries. The median gap survives both.
 */
function estimatePitch(positions: number[], minLines: number): { pitch: number; count: number } {
  if (positions.length < minLines) return { pitch: NaN, count: positions.length };

  const sorted = [...positions].sort((a, b) => a - b);
  const distinct: number[] = [];
  for (const p of sorted) {
    const last = distinct[distinct.length - 1];
    // Collapse coincident lines (a 5 mm rule drawn over a 1 mm rule).
    if (last === undefined || p - last > 0.15) distinct.push(p);
  }
  if (distinct.length < minLines) return { pitch: NaN, count: distinct.length };

  const gaps: number[] = [];
  for (let i = 1; i < distinct.length; i++) gaps.push(distinct[i]! - distinct[i - 1]!);

  const med = median(gaps);
  if (!(med > 0)) return { pitch: NaN, count: distinct.length };

  // Refine: average only the gaps close to the median, discarding panel-edge
  // outliers and any missed duplicate.
  const keep = gaps.filter((g) => Math.abs(g - med) < med * 0.25);
  const pitch = keep.length ? keep.reduce((a, b) => a + b, 0) / keep.length : med;
  return { pitch, count: distinct.length };
}

export function classifyPolylines(
  polylines: Polyline[],
  opts: ClassifyOptions = {},
): Classification {
  const o = { ...DEFAULTS, ...opts };

  const grid: Polyline[] = [];
  const traces: Polyline[] = [];
  const other: Polyline[] = [];
  const vxs: number[] = []; // x positions of vertical gridlines
  const hys: number[] = []; // y positions of horizontal gridlines

  for (const p of polylines) {
    const w = p.maxX - p.minX;
    const h = p.maxY - p.minY;
    const segments = p.points.length / 2 - 1;

    const isVertical = w <= o.straightTolerance && h > o.straightTolerance;
    const isHorizontal = h <= o.straightTolerance && w > o.straightTolerance;

    // Gridlines are simple straight rules. A trace can momentarily be vertical
    // (a steep QRS upstroke) but never with only a couple of segments.
    if ((isVertical || isHorizontal) && segments <= 3) {
      grid.push(p);
      if (isVertical) vxs.push((p.minX + p.maxX) / 2);
      else hys.push((p.minY + p.maxY) / 2);
      continue;
    }

    if (segments >= o.minTraceSegments && w >= o.minTraceSpan) {
      traces.push(p);
      continue;
    }

    other.push(p);
  }

  const px = estimatePitch(vxs, o.minGridLines);
  const py = estimatePitch(hys, o.minGridLines);
  const gridPitch = Number.isFinite(px.pitch) && Number.isFinite(py.pitch)
    ? { x: px.pitch, y: py.pitch }
    : null;

  return {
    grid,
    traces,
    other,
    gridPitch,
    gridLineCount: { x: px.count, y: py.count },
  };
}

/**
 * Reading calibration from the tracing instead of assuming it.
 *
 * The calibration pulse is a 1 mV step, and it is 1 mV *whatever the gain
 * setting was* — that is the whole point of printing it. So its height in
 * millimetres measures mm/mV directly, which is strictly better than trusting a
 * printed "10 mm/mV" annotation or a user's guess.
 *
 * This matters more than any other single number in the pipeline. A 2× gain
 * error leaves the tracing looking perfectly normal and every amplitude wrong by
 * a factor of two, which is enough to fabricate LVH, or an entire anterior
 * infarct evolution, out of an unremarkable ECG.
 */
import type { Polyline } from "./path-decode.ts";

/** Gains a cart can be set to, in mm/mV. */
const PLAUSIBLE_GAINS = [2.5, 5, 10, 20] as const;

/** A measured pulse must land within this fraction of a plausible gain. */
const SNAP_TOLERANCE = 0.12;

/** Pulse plateau width, millimetres. Typically 5 mm (200 ms at 25 mm/s). */
const WIDTH_RANGE_MM = [1.5, 12] as const;

/** Minimum pulse height worth trusting, millimetres. */
const MIN_HEIGHT_MM = 3;

/** Spread of the plateau about its mean, above which it is not a flat top. */
const FLATNESS_MAX_MM = 0.4;

export type GainSource = "pulse" | "assumed";

export interface Calibration {
  /** Millimetres per millivolt. */
  mmPerMv: number;
  source: GainSource;
  /** Pulses found and agreeing, when measured. */
  pulseCount: number;
  /** Spread between per-row pulses, as a fraction. Split-gain printouts show up here. */
  rowSpread: number | null;
  /** Relative uncertainty in the gain, propagated into every amplitude. */
  relativeUncertainty: number;
  notes: string[];
}

interface PulseCandidate {
  heightMm: number;
  widthMm: number;
  yMm: number;
}

/**
 * Measure one candidate polyline as a calibration pulse.
 *
 * The shape is a step up, a flat plateau, and a step down. Requiring an actual
 * flat top is what separates a pulse from a tall narrow QRS that happens to be
 * in the leftover bucket.
 */
function measurePulse(
  poly: Polyline,
  pxPerMm: { x: number; y: number },
): PulseCandidate | null {
  const n = poly.points.length / 2;
  if (n < 4 || n > 40) return null;

  const heightMm = (poly.maxY - poly.minY) / pxPerMm.y;
  const spanMm = (poly.maxX - poly.minX) / pxPerMm.x;
  if (heightMm < MIN_HEIGHT_MM || spanMm < WIDTH_RANGE_MM[0] || spanMm > WIDTH_RANGE_MM[1] * 2) {
    return null;
  }

  // Page y grows downward, so the plateau is the *lowest* y values.
  const plateauCut = poly.minY + 0.25 * (poly.maxY - poly.minY);
  const plateau: number[] = [];
  let plateauX0 = Infinity;
  let plateauX1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const y = poly.points[i * 2 + 1]!;
    if (y <= plateauCut) {
      plateau.push(y);
      const x = poly.points[i * 2]!;
      plateauX0 = Math.min(plateauX0, x);
      plateauX1 = Math.max(plateauX1, x);
    }
  }
  if (plateau.length < 2) return null;

  const mean = plateau.reduce((a, b) => a + b, 0) / plateau.length;
  const spread = Math.sqrt(
    plateau.reduce((a, b) => a + (b - mean) ** 2, 0) / plateau.length,
  ) / pxPerMm.y;
  if (spread > FLATNESS_MAX_MM) return null;

  const widthMm = (plateauX1 - plateauX0) / pxPerMm.x;
  if (widthMm < WIDTH_RANGE_MM[0] || widthMm > WIDTH_RANGE_MM[1]) return null;

  return { heightMm, widthMm, yMm: mean / pxPerMm.y };
}

/** Median of a numeric array. */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Derive the gain from calibration pulses, falling back to the assumed value.
 *
 * `candidates` are the polylines classification could not place — the leftover
 * bucket, which is where pulses land.
 */
export function calibrateGain(
  candidates: Polyline[],
  pxPerMm: { x: number; y: number },
  assumedMmPerMv: number,
): Calibration {
  const notes: string[] = [];
  const pulses = candidates
    .map((p) => measurePulse(p, pxPerMm))
    .filter((p): p is PulseCandidate => p !== null);

  if (pulses.length === 0) {
    return {
      mmPerMv: assumedMmPerMv,
      source: "assumed",
      pulseCount: 0,
      rowSpread: null,
      // An unverified gain is the largest error the pipeline can carry. 10% is
      // a deliberately pessimistic stand-in for "we did not check".
      relativeUncertainty: 0.10,
      notes: [
        "No calibration pulse found. Gain is the value you set, not a measurement — " +
        "amplitudes are conditional on it being correct.",
      ],
    };
  }

  const heights = pulses.map((p) => p.heightMm);
  const measured = median(heights);
  const lo = Math.min(...heights);
  const hi = Math.max(...heights);
  const rowSpread = measured > 0 ? (hi - lo) / measured : null;

  // Snap to a gain a cart can actually be set to; a measurement between the
  // settings means we mis-measured, not that the cart was set to 7.3 mm/mV.
  let snapped: number | null = null;
  for (const g of PLAUSIBLE_GAINS) {
    if (Math.abs(measured / g - 1) <= SNAP_TOLERANCE) {
      snapped = g;
      break;
    }
  }

  if (snapped === null) {
    notes.push(
      `Calibration pulse measures ${measured.toFixed(1)} mm, which is not within ` +
        `${(SNAP_TOLERANCE * 100).toFixed(0)}% of any standard gain ` +
        `(${PLAUSIBLE_GAINS.join(", ")} mm/mV). Falling back to the assumed value.`,
    );
    return {
      mmPerMv: assumedMmPerMv,
      source: "assumed",
      pulseCount: pulses.length,
      rowSpread,
      relativeUncertainty: 0.10,
      notes,
    };
  }

  if (rowSpread !== null && rowSpread > 0.08) {
    notes.push(
      `Calibration pulses differ by ${(rowSpread * 100).toFixed(0)}% between rows. ` +
        `Split-gain printouts (limb 10, chest 5 mm/mV) are routine; per-row gain is ` +
        `not applied yet, so amplitudes in some rows may be scaled wrongly.`,
    );
  }

  if (Math.abs(snapped - assumedMmPerMv) > 0.01) {
    notes.push(
      `Gain measured from the calibration pulse as ${snapped} mm/mV, overriding the ` +
        `assumed ${assumedMmPerMv} mm/mV.`,
    );
  }

  // Residual uncertainty: how far the measurement sat from the snapped value,
  // floored by what a pulse-height reading can resolve.
  const residual = Math.abs(measured / snapped - 1);
  return {
    mmPerMv: snapped,
    source: "pulse",
    pulseCount: pulses.length,
    rowSpread,
    relativeUncertainty: Math.max(0.015, residual),
    notes,
  };
}

/**
 * Synthetic 12-lead ECG generator.
 *
 * Exists to give the digitizer a ground truth. We render one of these to a PDF
 * or an image, run it back through extraction, and compare — which is the only
 * way to state an error bar honestly without a corpus of real ECGs.
 *
 * The generator derives III/aVR/aVL/aVF from I and II using the Einthoven and
 * Goldberger identities rather than drawing them independently. That is not just
 * tidiness: the lead-assignment cross-check downstream verifies exactly those
 * identities, so a fixture that satisfies them by construction lets us tell a
 * broken check from a broken fixture.
 */

export const LEAD_IDS = [
  "I", "II", "III", "aVR", "aVL", "aVF",
  "V1", "V2", "V3", "V4", "V5", "V6",
] as const;

export type LeadId = typeof LEAD_IDS[number];

/** Peak amplitudes in mV of each wave component. Negative points downward. */
export interface BeatParams {
  p: number;
  q: number;
  r: number;
  s: number;
  t: number;
}

export interface EcgSpec {
  heartRateBpm: number;
  durationSec: number;
  sampleRateHz: number;
  /** Baseline-to-peak amplitudes for the eight independent leads. */
  beats?: Partial<Record<LeadId, BeatParams>>;
  /** ST-segment offset in mV applied between J point and T onset. */
  stShiftMv?: Partial<Record<LeadId, number>>;
  /** Gaussian noise amplitude in mV (standard deviation). */
  noiseMv?: number;
  /** Sinusoidal baseline wander amplitude in mV. */
  wanderMv?: number;
  /**
   * Broaden the depolarisation waves by this factor, 1 being unchanged.
   *
   * Only Q, R and S are scaled; P, T and the ST injection keep their timing. So
   * this changes conduction without moving the thing being measured, which is
   * what makes it a clean test of whether a conduction change is detected
   * separately from an ST change. 1.3 is roughly a new bundle branch block.
   */
  qrsScale?: number;
  seed?: number;
}

/** Wave component timings relative to the R peak, in seconds. */
const TIMING = {
  pCenter: -0.17, pWidth: 0.022,
  qCenter: -0.026, qWidth: 0.007,
  rCenter: 0.0, rWidth: 0.011,
  sCenter: 0.028, sWidth: 0.011,
  tCenter: 0.21, tWidth: 0.048,
  /** J point, i.e. end of QRS, relative to R. */
  jPoint: 0.052,
} as const;

/**
 * Normal-ish resting morphology for the independent leads.
 *
 * V1 through V6 carry the classic R-wave progression: a small r with a deep S
 * anteriorly, transitioning around V3, becoming R-dominant laterally. Getting
 * this right matters because "loss of R-wave progression" is one of the serial
 * changes the app is meant to surface.
 */
const DEFAULT_BEATS: Record<string, BeatParams> = {
  I: { p: 0.10, q: -0.04, r: 0.62, s: -0.06, t: 0.20 },
  II: { p: 0.15, q: -0.05, r: 1.05, s: -0.08, t: 0.32 },
  V1: { p: 0.06, q: 0.0, r: 0.18, s: -0.95, t: -0.08 },
  V2: { p: 0.08, q: 0.0, r: 0.35, s: -1.35, t: 0.35 },
  V3: { p: 0.09, q: -0.02, r: 0.72, s: -0.78, t: 0.42 },
  V4: { p: 0.10, q: -0.05, r: 1.35, s: -0.35, t: 0.45 },
  V5: { p: 0.10, q: -0.07, r: 1.42, s: -0.14, t: 0.38 },
  V6: { p: 0.09, q: -0.06, r: 1.10, s: -0.07, t: 0.28 },
};

/** Deterministic PRNG so fixtures are byte-reproducible across runs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(t: number, center: number, width: number, amp: number): number {
  if (amp === 0) return 0;
  const z = (t - center) / width;
  return amp * Math.exp(-0.5 * z * z);
}

/**
 * One cardiac cycle sampled at `t` seconds relative to the R peak.
 *
 * The ST offset is applied with a smooth ramp from the J point into the T wave
 * rather than as a step, because a hard discontinuity would be trivially
 * detectable and would flatter the digitizer's edge handling.
 */
function beatValueMv(
  t: number,
  b: BeatParams,
  stShiftMv: number,
  qrsScale = 1,
): number {
  const k = qrsScale;
  let v = gaussian(t, TIMING.pCenter, TIMING.pWidth, b.p) +
    gaussian(t, TIMING.qCenter * k, TIMING.qWidth * k, b.q) +
    gaussian(t, TIMING.rCenter, TIMING.rWidth * k, b.r) +
    gaussian(t, TIMING.sCenter * k, TIMING.sWidth * k, b.s) +
    gaussian(t, TIMING.tCenter, TIMING.tWidth, b.t);

  if (stShiftMv !== 0) {
    // Full offset from the J point, tapering out as the T wave ends.
    const start = TIMING.jPoint;
    const end = TIMING.tCenter + 2 * TIMING.tWidth;
    if (t >= start && t <= end) {
      const ramp = t < start + 0.02 ? (t - start) / 0.02 : 1;
      const fade = t > end - 0.05 ? (end - t) / 0.05 : 1;
      v += stShiftMv * Math.max(0, Math.min(1, ramp)) * Math.max(0, Math.min(1, fade));
    }
  }
  return v;
}

export interface SyntheticEcg {
  sampleRateHz: number;
  durationSec: number;
  heartRateBpm: number;
  /** R-peak times in seconds, exact by construction. */
  rPeakTimesSec: number[];
  leads: Record<LeadId, Float32Array>;
  /** ST offsets actually applied, for assertions. */
  stShiftMv: Record<LeadId, number>;
}

/** Generate a full 12-lead record in millivolts. */
export function generateEcg(spec: EcgSpec): SyntheticEcg {
  const { heartRateBpm, durationSec, sampleRateHz } = spec;
  const n = Math.round(durationSec * sampleRateHz);
  const rr = 60 / heartRateBpm;
  const rand = mulberry32(spec.seed ?? 12345);

  // First R peak offset far enough in to leave room for the preceding P wave.
  const rPeakTimesSec: number[] = [];
  for (let t = 0.35; t < durationSec; t += rr) rPeakTimesSec.push(t);

  const beats: Record<string, BeatParams> = { ...DEFAULT_BEATS, ...(spec.beats ?? {}) };
  const st = spec.stShiftMv ?? {};

  const independent: LeadId[] = ["I", "II", "V1", "V2", "V3", "V4", "V5", "V6"];
  const raw = {} as Record<LeadId, Float32Array>;

  for (const lead of independent) {
    const b = beats[lead]!;
    const shift = st[lead] ?? 0;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sampleRateHz;
      let v = 0;
      // Only nearby beats contribute; the Gaussians die off well inside ±0.5 s.
      for (const rp of rPeakTimesSec) {
        const dt = t - rp;
        if (dt > -0.45 && dt < 0.55) v += beatValueMv(dt, b, shift, spec.qrsScale);
      }
      out[i] = v;
    }
    raw[lead] = out;
  }

  // Derive the remaining limb leads exactly.
  const I = raw.I, II = raw.II;
  const III = new Float32Array(n);
  const aVR = new Float32Array(n);
  const aVL = new Float32Array(n);
  const aVF = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = I[i]!, b = II[i]!;
    III[i] = b - a;
    aVR[i] = -(a + b) / 2;
    aVL[i] = a - b / 2;
    aVF[i] = b - a / 2;
  }
  raw.III = III;
  raw.aVR = aVR;
  raw.aVL = aVL;
  raw.aVF = aVF;

  // Noise and wander go on last so the derived-lead identities hold on the clean
  // signal, then degrade realistically — exactly like a real recording.
  const noise = spec.noiseMv ?? 0;
  const wander = spec.wanderMv ?? 0;
  if (noise > 0 || wander > 0) {
    for (const lead of LEAD_IDS) {
      const sig = raw[lead];
      const phase = rand() * Math.PI * 2;
      const freq = 0.15 + rand() * 0.2; // Hz, respiratory range
      for (let i = 0; i < n; i++) {
        let v = sig[i]!;
        if (wander > 0) v += wander * Math.sin(2 * Math.PI * freq * (i / sampleRateHz) + phase);
        if (noise > 0) {
          // Box-Muller for Gaussian noise.
          const u1 = Math.max(1e-9, rand());
          const u2 = rand();
          v += noise * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        }
        sig[i] = v;
      }
    }
  }

  const stShiftMv = {} as Record<LeadId, number>;
  for (const lead of LEAD_IDS) stShiftMv[lead] = st[lead] ?? 0;

  return { sampleRateHz, durationSec, heartRateBpm, rPeakTimesSec, leads: raw, stShiftMv };
}

/** Timing constants, exported so tests can assert against the same fiducials. */
export const BEAT_TIMING = TIMING;

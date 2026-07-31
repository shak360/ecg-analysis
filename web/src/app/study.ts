/**
 * Loading one ECG into an analysed study, and placing it on the timeline.
 *
 * Shared by the app and the comparison harness so there is one ingestion path
 * rather than two that can drift.
 */
import { StudyBuilder } from "../../wasm/ecg_core.js";
import { extractPageGeometry } from "../ingest/pdf-paths.ts";
import { classifyPolylines } from "../ingest/classify.ts";
import { type Calibration, calibrateGain } from "../ingest/calibrate.ts";
import {
  checkIdentities,
  detectLayout,
  type Layout,
  sampleUniform,
  toPhysical,
} from "../ingest/layout.ts";

export interface Assumptions {
  mmPerSec: number;
  mmPerMv: number;
}

export interface Study {
  id: string;
  fileName: string;
  bytes: Uint8Array;
  assumptions: Assumptions;
  /** Acquisition instant, when the filename encodes one. */
  acquiredAt: Date | null;
  layout: Layout | null;
  // deno-lint-ignore no-explicit-any
  analysis: any | null;
  identity: ReturnType<typeof checkIdentities> | null;
  /** Gain as measured from the calibration pulse, or the assumed fallback. */
  calibration: Calibration | null;
  warnings: string[];
  error: string | null;
  /** Position on the shared timeline, seconds from the index study. */
  offsetSec: number | null;
}

let nextId = 1;

/**
 * Parse an acquisition instant out of a filename.
 *
 * Carts and export tools very often name files `YYYYMMDDHHMMSS`, which is both
 * the acquisition time and — per `docs/decisions/0001` — something we must not
 * store. It is read here to *order* studies and compute intervals between them;
 * only the year and the offsets survive into anything persistent.
 */
export function parseTimestamp(fileName: string): Date | null {
  const m = fileName.match(/(20\d{2})(\d{2})(\d{2})[_-]?(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number) as unknown as number[];
  if (!y || !mo || !d) return null;
  const dt = new Date(y, mo - 1, d, h ?? 0, mi ?? 0, s ?? 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * Render an interval the way a clinician reads it.
 *
 * The unit follows the magnitude, because two ECGs four hours apart during an
 * infarct are a different situation from two on the same calendar day, and
 * rounding the first to "0 days" erases the distinction.
 */
export function formatInterval(seconds: number): string {
  const s = Math.abs(Math.round(seconds));
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (s < 2 * 3600) return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
  const hours = s / 3600;
  if (s < 48 * 3600) {
    const h = Math.floor(hours);
    return `${h} h ${Math.round((hours - h) * 60)} min`;
  }
  const days = s / 86400;
  if (days < 90) {
    const d = Math.floor(days);
    const h = Math.round((days - d) * 24);
    return h ? `${d} d ${h} h` : `${d} d`;
  }
  const months = days / 30.44;
  return months < 24
    ? `${months.toFixed(1)} months`
    : `${(days / 365.25).toFixed(1)} years`;
}

/** Sort by acquisition time where known, then by load order, and assign offsets. */
export function placeOnTimeline(studies: Study[]): Study[] {
  const dated = studies.filter((s) => s.acquiredAt);
  dated.sort((a, b) => a.acquiredAt!.getTime() - b.acquiredAt!.getTime());
  const undated = studies.filter((s) => !s.acquiredAt);

  const ordered = [...dated, ...undated];
  const anchor = dated[0]?.acquiredAt ?? null;
  for (const s of ordered) {
    s.offsetSec = anchor && s.acquiredAt
      ? (s.acquiredAt.getTime() - anchor.getTime()) / 1000
      : null;
  }
  return ordered;
}

/** Create a pending study record from a dropped file. */
export async function loadFile(file: File, assumptions: Assumptions): Promise<Study> {
  return {
    id: `s${nextId++}`,
    fileName: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
    assumptions,
    acquiredAt: parseTimestamp(file.name),
    layout: null,
    analysis: null,
    identity: null,
    calibration: null,
    warnings: [],
    error: null,
    offsetSec: null,
  };
}

/**
 * Extract, lay out, and analyse a study in place.
 *
 * Failures are recorded on the study rather than thrown, so one unreadable file
 * does not take the others down with it.
 */
export function analyse(study: Study): Promise<Study> {
  return (async () => {
    try {
      // pdf.js transfers the buffer it is given, so hand it a copy and keep the
      // original for a re-run under different assumptions.
      const geom = await extractPageGeometry(study.bytes.slice(), 1, 1);
      if (!geom.isVector) {
        study.error = geom.imageOps > 0
          ? `This is a raster PDF (${geom.imageOps} embedded images). The image ` +
            `pipeline is not built yet, so its tracing cannot be recovered.`
          : `No vector geometry found in this PDF.`;
        return study;
      }

      const cls = classifyPolylines(geom.polylines);
      if (!cls.gridPitch) {
        study.error = `No grid lattice detected, so the millimetre scale is unknown. ` +
          `Refusing to guess — every amplitude would inherit the error.`;
        return study;
      }

      const a = study.assumptions;

      // Read the gain from the calibration pulse where one exists. The pulse is
      // 1 mV whatever the cart's gain setting was, so its height measures
      // mm/mV directly -- strictly better than trusting the user's assumption.
      const cal = calibrateGain(cls.other, cls.gridPitch, a.mmPerMv);
      study.calibration = cal;
      const mmPerMv = cal.mmPerMv;

      const layout = detectLayout(cls.traces, cls.gridPitch, a.mmPerSec);
      study.layout = layout;
      study.warnings = [...layout.warnings, ...cal.notes];

      const sampled = new Map<string, Float32Array>();
      for (const p of layout.panels) {
        const { t, v } = toPhysical(p.trace, cls.gridPitch, a.mmPerSec, mmPerMv);
        sampled.set(p.lead, sampleUniform(t, v));
      }
      study.identity = checkIdentities(sampled);
      study.warnings.push(...study.identity.notes);

      const builder = new StudyBuilder();
      for (const p of layout.panels) {
        const { t, v } = toPhysical(p.trace, cls.gridPitch, a.mmPerSec, mmPerMv);
        builder.add_lead(p.lead, t, v, p.timeOffsetSec);
      }
      if (layout.rhythm) {
        const { t, v } = toPhysical(layout.rhythm, cls.gridPitch, a.mmPerSec, mmPerMv);
        builder.set_rhythm(t, v);
      } else {
        study.warnings.push("No rhythm strip found — rate and beat timing unavailable.");
      }

      study.analysis = builder.analyze(true);
      // Hand the measured calibration quality to the engine so it can propagate
      // gain error into every amplitude's uncertainty.
      study.analysis.set_calibration_quality(cal.relativeUncertainty, 0.002);
      if (study.analysis.lead_names.length === 0) {
        study.error = "No lead produced a usable beat. The tracing may be too short " +
          "or too noisy to digitize.";
      }
    } catch (err) {
      study.error = err instanceof Error ? err.message : String(err);
    }
    return study;
  })();
}

/**
 * Loading one ECG into an analysed study, and placing it on the timeline.
 *
 * Shared by the app and the comparison harness so there is one ingestion path
 * rather than two that can drift.
 */
import type { Engine } from "../engine/client.ts";
import type { Assumptions, StudySummary } from "../engine/protocol.ts";

export type { Assumptions };

export interface Study {
  id: string;
  fileName: string;
  bytes: Uint8Array;
  assumptions: Assumptions;
  /** Acquisition instant, when the filename encodes one. */
  acquiredAt: Date | null;
  /**
   * The analysed result, as plain data.
   *
   * This used to be a live `StudyAnalysis` handle into the WASM heap, which the
   * UI reached into during rendering. It cannot be, now that the heap lives on
   * another thread — and it should not have been: the engine now hands back a
   * snapshot, and the draw path is a pure function of it.
   */
  summary: StudySummary | null;
  warnings: string[];
  error: string | null;
  /** Position on the shared timeline, seconds from the index study. */
  offsetSec: number | null;
  /** Colour this study is drawn in, everywhere. User-changeable. */
  colour: string;
}

/**
 * Default trace colours, oldest to newest.
 *
 * Ordered so that *consecutive* entries are maximally separable, not so that the
 * full list forms a smooth ramp. Two studies is the common case, and a ramp puts
 * two near-identical blues on screen for it. Blue against orange is the pairing
 * that survives both greyscale and the common colour-vision deficiencies.
 */
export const STUDY_COLOURS = [
  "#1b4a8f", // deep blue
  "#c2410c", // burnt orange
  "#3fb0a5", // teal
  "#8b2f8b", // purple
  "#d98c1f", // amber
  "#2e7fbf", // light blue
] as const;

export function defaultColour(index: number): string {
  return STUDY_COLOURS[index % STUDY_COLOURS.length]!;
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
    summary: null,
    warnings: [],
    error: null,
    offsetSec: null,
    colour: defaultColour(nextId - 2),
  };
}

/**
 * Analyse a study in place, via the engine.
 *
 * Failures are recorded on the study rather than thrown, so one unreadable file
 * does not take down the others loaded alongside it. The ingest itself now
 * lives in `engine/core.ts`, on whichever thread the engine chose.
 */
export async function analyse(study: Study, engine: Engine): Promise<Study> {
  const { summary, error } = await engine.analyse(study.id, study.bytes, study.assumptions);
  study.summary = summary;
  study.error = error;
  study.warnings = summary?.warnings ?? [];
  return study;
}

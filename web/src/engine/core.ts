/**
 * The engine: ingest and analysis, with every WASM handle kept inside.
 *
 * This is the only module that touches `wasm/ecg_core.js`. It runs unchanged on
 * a worker thread or on the main thread — `worker.ts` wraps it in a message
 * loop, `client.ts` can call it directly — which is what lets the tests exercise
 * the real thing under Node, where there is no `Worker`.
 *
 * It owns a `Map` of study id to `StudyAnalysis`. Those handles never leave; the
 * only things that come out are the plain-data types in `protocol.ts`.
 */
import init, {
  compare_studies,
  serial_findings,
  st_deltas_json,
  StudyBuilder,
} from "../../wasm/ecg_core.js";
import { extractPageGeometry } from "../ingest/pdf-paths.ts";
import { classifyPolylines } from "../ingest/classify.ts";
import { calibrateGain } from "../ingest/calibrate.ts";
import { checkIdentities, detectLayout, sampleUniform, toPhysical } from "../ingest/layout.ts";
import type {
  Assumptions,
  ComparisonSnapshot,
  Measures,
  SnapshotDifference,
  SnapshotLead,
  SnapshotPrintout,
  SnapshotTrace,
  StDelta,
  StudySummary,
} from "./protocol.ts";

/** Raised for the expected failures — a raster PDF, no grid — not for bugs. */
export class IngestError extends Error {}

// deno-lint-ignore no-explicit-any
type Analysis = any;

/** A live handle plus the few layout facts the snapshot needs alongside it. */
interface Held {
  analysis: Analysis;
  columnSeconds: number;
}

export class EngineCore {
  #ready: Promise<void> | null = null;
  #studies = new Map<string, Held>();

  /**
   * Start the WASM module.
   *
   * `wasmBytes` is for Node, where there is no fetch-relative-to-module-URL to
   * hang the default loader off. The browser and the worker both pass nothing.
   */
  ready(wasmBytes?: BufferSource): Promise<void> {
    this.#ready ??= wasmBytes
      ? init({ module_or_path: wasmBytes }).then(() => {})
      : init().then(() => {});
    return this.#ready;
  }

  /**
   * Ingest one PDF and analyse it, keeping the handle under `studyId`.
   *
   * Re-analysing an id replaces what was there, which is what a change of
   * assumed paper speed does to every loaded study.
   */
  async analyse(
    studyId: string,
    bytes: Uint8Array,
    assumptions: Assumptions,
  ): Promise<StudySummary> {
    await this.ready();
    this.release([studyId]);

    // pdf.js takes ownership of the buffer it is handed, so give it a copy —
    // the original has to survive for a re-run under different assumptions.
    const geom = await extractPageGeometry(bytes.slice(), 1, 1);
    if (!geom.isVector) {
      throw new IngestError(
        geom.imageOps > 0
          ? `This is a raster PDF (${geom.imageOps} embedded images). The image ` +
            `pipeline is not built yet, so its tracing cannot be recovered.`
          : `No vector geometry found in this PDF.`,
      );
    }

    const cls = classifyPolylines(geom.polylines);
    if (!cls.gridPitch) {
      throw new IngestError(
        `No grid lattice detected, so the millimetre scale is unknown. ` +
          `Refusing to guess — every amplitude would inherit the error.`,
      );
    }

    // The calibration pulse is 1 mV whatever the cart's gain was set to, so its
    // height measures mm/mV directly — strictly better than the user's guess.
    const cal = calibrateGain(cls.other, cls.gridPitch, assumptions.mmPerMv);
    const layout = detectLayout(cls.traces, cls.gridPitch, assumptions.mmPerSec);
    const warnings = [...layout.warnings, ...cal.notes];

    // One conversion per panel, used for both the identity check and the
    // builder. Doing it twice was harmless but invited the two to drift.
    const physical = layout.panels.map((p) => ({
      lead: p.lead,
      offset: p.timeOffsetSec,
      ...toPhysical(p.trace, cls.gridPitch!, assumptions.mmPerSec, cal.mmPerMv),
    }));

    const sampled = new Map<string, Float32Array>();
    for (const p of physical) sampled.set(p.lead, sampleUniform(p.t, p.v));
    const identity = checkIdentities(sampled);
    warnings.push(...identity.notes);

    const builder = new StudyBuilder();
    for (const p of physical) builder.add_lead(p.lead, p.t, p.v, p.offset);
    if (layout.rhythm) {
      const r = toPhysical(layout.rhythm, cls.gridPitch, assumptions.mmPerSec, cal.mmPerMv);
      builder.set_rhythm(r.t, r.v);
    } else {
      warnings.push("No rhythm strip found — rate and beat timing unavailable.");
    }

    const analysis = builder.analyze(true);
    warnings.push(...(analysis.warnings as string[]));
    // Hand the measured gain quality to the engine so it propagates into every
    // amplitude's uncertainty rather than being silently assumed exact.
    analysis.set_calibration_quality(cal.relativeUncertainty, 0.002);

    if (analysis.lead_names.length === 0) {
      throw new IngestError(
        "No lead produced a usable beat. The tracing may be too short or too " +
          "noisy to digitize.",
      );
    }

    this.#studies.set(studyId, { analysis, columnSeconds: layout.columnSeconds });

    return {
      leadNames: Array.from(analysis.lead_names as string[]),
      hrBpm: analysis.hr_bpm,
      qrsOnset: analysis.qrs_onset,
      qrsOffset: analysis.qrs_offset,
      tOffset: analysis.t_offset,
      anchorIndex: analysis.anchor_index,
      frameLen: analysis.frame_len,
      onsetShiftMs: analysis.onset_shift_ms,
      columnSeconds: layout.columnSeconds || null,
      identityPassed: identity.passed,
      calibration: {
        mmPerMv: cal.mmPerMv,
        source: cal.source,
        pulseCount: cal.pulseCount,
        rowSpread: cal.rowSpread,
        relativeUncertainty: cal.relativeUncertainty,
      },
      warnings,
      measurements: JSON.parse(analysis.measurements_json()) as Measures,
    };
  }

  /**
   * Register every study after the first against the first, and snapshot it.
   *
   * Comparing each study to the index rather than to its predecessor is what
   * makes a series read as distance from baseline, which is how an evolving
   * infarct is actually followed.
   */
  compare(studyIds: string[]): ComparisonSnapshot {
    if (studyIds.length < 2) throw new Error("a comparison needs at least two studies");
    const held = studyIds.map((id) => {
      const h = this.#studies.get(id);
      if (!h) throw new Error(`study ${id} is not loaded in the engine`);
      return h;
    });
    const handles = held.map((h) => h.analysis);

    const [ref, ...rest] = handles as [Analysis, ...Analysis[]];
    const registrations = rest.map((h) => compare_studies(ref, h));

    const leadNames: string[] = registrations[0]
      ? registrations[0].map((c: Analysis) => c.lead)
      : Array.from(ref.lead_names as string[]);

    const leads: SnapshotLead[] = leadNames.map((lead) => {
      const refBeat = ref.beat(lead);
      if (!refBeat) {
        return {
          lead,
          unavailable: true,
          traces: [],
          differences: [],
          rmsDifferenceMv: 0,
          morphologyChanged: false,
        };
      }

      const traces: SnapshotTrace[] = [{
        samples: refBeat,
        sigma: ref.sigma(lead) ?? null,
        beatsUsed: ref.beats_used(lead),
      }];
      const differences: SnapshotDifference[] = [];
      let worstRms = 0;
      let morphologyChanged = false;

      registrations.forEach((regLeads, k) => {
        const c = regLeads.find((x: Analysis) => x.lead === lead);
        if (!c) return;
        traces.push({
          samples: c.aligned_mv,
          sigma: handles[k + 1]!.sigma(lead) ?? null,
          beatsUsed: handles[k + 1]!.beats_used(lead),
        });
        differences.push({
          samples: c.difference_mv,
          traceIndex: k + 1,
          rmsMv: c.rms_difference_mv,
        });
        worstRms = Math.max(worstRms, c.rms_difference_mv);
        if (c.morphology_changed) morphologyChanged = true;
      });

      return { lead, unavailable: false, traces, differences, rmsDifferenceMv: worstRms, morphologyChanged };
    });

    const printouts: SnapshotPrintout[] = handles.map((h) => {
      const map = new Map<string, Float32Array>();
      for (const name of leadNames) {
        const sig = h.lead_signal(name);
        if (sig) map.set(name, sig);
      }
      const rhythm = h.rhythm_signal;
      return { leads: map, rhythm: rhythm && rhythm.length ? rhythm : null };
    });

    // Study-level findings, one list per comparison. Computed here rather than
    // in the UI because they read the global fiducials, which never leave the
    // engine.
    const findingSets: string[][] = rest.map((h) => Array.from(serial_findings(ref, h)));

    let clinicalThresholdMv = 0.1;
    const deltaSets: StDelta[][] = rest.map((h) => {
      const parsed = JSON.parse(st_deltas_json(ref, h)) as {
        clinicalThresholdMv: number;
        leads: StDelta[];
      };
      clinicalThresholdMv = parsed.clinicalThresholdMv;
      return parsed.leads;
    });

    return {
      studyIds: [...studyIds],
      leads,
      printouts,
      deltaSets,
      findingSets,
      anchorIndex: ref.qrs_onset >= 0 ? ref.qrs_onset : ref.anchor_index,
      columnSeconds: held[0]!.columnSeconds || 2.5,
      clinicalThresholdMv,
    };
  }

  /** Drop handles so the WASM heap does not grow with every reload. */
  release(studyIds: string[]): void {
    for (const id of studyIds) {
      const h = this.#studies.get(id);
      if (!h) continue;
      // wasm-bindgen objects hold heap memory until explicitly freed; letting
      // GC do it is not guaranteed and, on a long session of reloading the same
      // files, is the difference between steady and unbounded memory.
      h.analysis.free?.();
      this.#studies.delete(id);
    }
  }

  has(studyId: string): boolean {
    return this.#studies.has(studyId);
  }
}

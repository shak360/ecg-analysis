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
  serial_findings_json,
  st_verdicts_json,
  StudyBuilder,
  vcg_lead_axes_json,
  vcg_planes_json,
} from "../../wasm/ecg_core.js";
/**
 * The PDF ingest path is loaded on first use, not at import time.
 *
 * It reaches pdf.js, which is 477 KB — larger than everything else the app
 * ships put together. Every page that touches the engine was paying for it,
 * including the atlas and the quiz, which read WFDB records and have no way to
 * open a PDF at all. Static imports here meant the corpus pages downloaded and
 * parsed a PDF engine before they could draw their first tracing.
 *
 * Module evaluation is cached, so only the first `analyse()` waits.
 */
async function pdfIngest() {
  const [paths, classify, calibrate, layout] = await Promise.all([
    import("../ingest/pdf-paths.ts"),
    import("../ingest/classify.ts"),
    import("../ingest/calibrate.ts"),
    import("../ingest/layout.ts"),
  ]);
  return {
    extractPageGeometry: paths.extractPageGeometry,
    classifyPolylines: classify.classifyPolylines,
    calibrateGain: calibrate.calibrateGain,
    checkIdentities: layout.checkIdentities,
    detectLayout: layout.detectLayout,
    sampleUniform: layout.sampleUniform,
    toPhysical: layout.toPhysical,
  };
}
import type {
  Assumptions,
  ComparisonSnapshot,
  LeadVerdict,
  Measures,
  PairBlocker,
  SnapshotDifference,
  SnapshotLead,
  SnapshotPrintout,
  SerialFinding,
  SnapshotTrace,
  StudySummary,
  LeadAxis,
  VcgMode,
  VcgPlane,
  VcgRefusal,
  VcgSnapshot,
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

    const {
      calibrateGain,
      checkIdentities,
      classifyPolylines,
      detectLayout,
      extractPageGeometry,
      sampleUniform,
      toPhysical,
    } = await pdfIngest();

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
    // Tell the engine *how* the millivolt scale was established, not just how
    // uncertain it is. The same relative sigma read off a calibration pulse and
    // guessed from the speed/gain selector is the same float and a different
    // claim, and only the measured one satisfies the gate's gain precondition —
    // so the boolean is the load-bearing argument here, not the number.
    //
    // No bias crosses this boundary any more. Bias follows from the source
    // tier, which nothing measures yet, and the 0.002 mV that used to be passed
    // from here was a clinical constant living in TypeScript (decision 0004).
    analysis.set_gain(cal.source === "pulse", cal.relativeUncertainty);

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
   * Analyse an already-digital recording: leads in millivolts, no printout.
   *
   * This is the path for WFDB corpora and cart exports, and it differs from
   * `analyse` in what it does *not* have to do. There is no grid to detect and
   * no calibration pulse to measure, because the millivolts are the ones the
   * cart recorded. There are also no columns: every lead ran at once, for the
   * full length, so each goes in at offset zero.
   *
   * That last point is why this path is worth having beyond the corpus browser.
   * It separates "is the measurement path right" from "is the digitisation
   * right", which are otherwise only ever testable together.
   */
  async analyseSignals(
    studyId: string,
    leads: Map<string, Float32Array>,
    fsHz: number,
    rhythmLead = "II",
  ): Promise<StudySummary> {
    await this.ready();
    this.release([studyId]);

    if (leads.size === 0) throw new IngestError("no leads in this recording");

    const n = Math.max(...[...leads.values()].map((v) => v.length));
    const t = new Float64Array(n);
    for (let i = 0; i < n; i++) t[i] = i / fsHz;

    const warnings: string[] = [];
    const builder = new StudyBuilder();
    for (const [name, v] of leads) {
      builder.add_lead(name, t.subarray(0, v.length), v, 0);
    }

    // The rhythm strip is the timing authority. Here it is simply one of the
    // leads at full length — lead II by convention, since that is what a cart
    // prints and what the rest of the pipeline expects.
    const rhythm = leads.get(rhythmLead) ?? leads.values().next().value;
    if (rhythm) {
      builder.set_rhythm(t.subarray(0, rhythm.length), rhythm);
    } else {
      warnings.push("No rhythm lead — rate and beat timing unavailable.");
    }

    const analysis = builder.analyze(true);
    warnings.push(...(analysis.warnings as string[]));

    // The millivolt scale is established, not assumed: it came off the cart's
    // own converter. The residual is ADC quantisation, which at PTB-XL's
    // 1 uV/LSB is a tenth of a percent of a 1 mV deflection — small, but not
    // claimed as zero, because a stated exact-zero uncertainty is a claim no
    // measurement can support.
    analysis.set_gain(true, 0.001);

    if (analysis.lead_names.length === 0) {
      throw new IngestError("No lead produced a usable beat in this recording.");
    }

    // A digital record has no columns; the whole thing is one window.
    this.#studies.set(studyId, { analysis, columnSeconds: n / fsHz });

    return {
      leadNames: Array.from(analysis.lead_names as string[]),
      hrBpm: analysis.hr_bpm,
      qrsOnset: analysis.qrs_onset,
      qrsOffset: analysis.qrs_offset,
      tOffset: analysis.t_offset,
      anchorIndex: analysis.anchor_index,
      frameLen: analysis.frame_len,
      onsetShiftMs: analysis.onset_shift_ms,
      columnSeconds: n / fsHz,
      identityPassed: null,
      calibration: {
        mmPerMv: 10,
        source: "pulse",
        pulseCount: 0,
        rowSpread: null,
        relativeUncertainty: 0.001,
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
          implausible: c.align_implausible,
        });
        // A clamped alignment means the two beats were never registered, so its
        // RMS is the distance between two arbitrarily-placed frames rather than
        // a change in the patient. Leaving it in `worstRms` would let the one
        // unusable comparison set the number shown for the whole lead.
        if (!c.align_implausible) worstRms = Math.max(worstRms, c.rms_difference_mv);
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
    const findingSets: SerialFinding[][] = rest.map(
      (h) => JSON.parse(serial_findings_json(ref, h)) as SerialFinding[],
    );

    // The five-state verdict, per lead and per comparison, plus the pair-level
    // preconditions the gate could not satisfy.
    //
    // Nothing here is recomputed on this side. The UI holds no copy of the gate
    // — it cannot, or it would eventually render a verdict the engine would not
    // reach, and the disagreement would be invisible. Both thresholds come out
    // of the same payload for the same reason.
    let clinicalThresholdMv = Number.NaN;
    let stDisplayQuantumMv = Number.NaN;
    const pairBlockerSets: PairBlocker[][] = [];
    const verdictSets: LeadVerdict[][] = rest.map((h) => {
      const parsed = JSON.parse(st_verdicts_json(ref, h)) as {
        clinicalThresholdMv: number;
        stDisplayQuantumMv: number;
        pairBlockers: PairBlocker[];
        leads: LeadVerdict[];
      };
      clinicalThresholdMv = parsed.clinicalThresholdMv;
      stDisplayQuantumMv = parsed.stDisplayQuantumMv;
      pairBlockerSets.push(parsed.pairBlockers);
      return parsed.leads;
    });

    return {
      studyIds: [...studyIds],
      leads,
      printouts,
      verdictSets,
      pairBlockerSets,
      findingSets,
      anchorIndex: ref.qrs_onset >= 0 ? ref.qrs_onset : ref.anchor_index,
      columnSeconds: held[0]!.columnSeconds || 2.5,
      clinicalThresholdMv,
      stDisplayQuantumMv,
    };
  }

  /** Drop handles so the WASM heap does not grow with every reload. */
  /**
   * One study's vectorcardiogram.
   *
   * A second call against a handle the engine still holds, in the shape
   * `compare` already established — rather than folding three `Float32Array`s
   * into every `analysed` reply, which would make four pages that never want a
   * loop pay to structured-clone one.
   */
  vcg(studyId: string, mode: VcgMode = "averaged"): VcgSnapshot {
    const held = this.#studies.get(studyId);
    if (!held) throw new Error(`study ${studyId} is not loaded in the engine`);

    const v = mode === "raw" ? held.analysis.vcg_raw() : held.analysis.vcg();
    try {
      const refusal = JSON.parse(v.refusal_json() as string) as VcgRefusal | null;

      // The beats the loop came from. Withheld on a refusal for the same reason
      // the loops are: half a picture invites the reader to build the other
      // half by eye, which is the error the refusal exists to prevent.
      const beats = new Map<string, Float32Array>();
      if (!refusal) {
        for (const lead of held.analysis.lead_names as string[]) {
          const b = held.analysis.beat(lead) as Float32Array | undefined;
          if (b) beats.set(lead, b);
        }
      }

      return {
        studyId,
        beats,
        x: v.x_mv as Float32Array,
        y: v.y_mv as Float32Array,
        z: v.z_mv as Float32Array,
        qrsOnset: v.qrs_onset as number,
        qrsOffset: v.qrs_offset as number,
        tOffset: v.t_offset as number,
        anchorIndex: v.anchor_index as number,
        frameLen: v.frame_len as number,
        fsHz: v.fs_hz as number,
        refusal,
        notes: Array.from(v.notes as string[]),
        alignmentSpreadMs: v.alignment_spread_ms as number,
        planes: JSON.parse(vcg_planes_json() as string) as VcgPlane[],
        leadAxes: JSON.parse(vcg_lead_axes_json() as string) as LeadAxis[],
        beatSamples: Array.from((v.beat_samples ?? []) as Uint32Array),
        mode,
      };
    } finally {
      // A wasm-bindgen struct holds heap memory until it is freed.
      (v as { free?: () => void }).free?.();
    }
  }

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

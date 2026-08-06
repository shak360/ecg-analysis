/**
 * Talking to the engine, from the main thread.
 *
 * Two implementations of one interface. `WorkerEngine` posts messages to a
 * worker; `InlineEngine` calls the same `EngineCore` directly on whatever thread
 * it is constructed on.
 *
 * The inline path is not a vestigial fallback kept alive out of caution — it is
 * how the tests run the real pipeline under Node, where there is no `Worker` at
 * all, and it is what the harness pages use. Both paths therefore stay
 * exercised, which is the only way a fallback is ever trustworthy.
 */
import { EngineCore } from "./core.ts";
import {
  type Assumptions,
  type ComparisonSnapshot,
  type Request,
  type Response,
  type StudySummary,
  type VcgSnapshot,
} from "./protocol.ts";

/**
 * A request minus its correlation id, which `#send` assigns.
 *
 * Written distributively rather than as `Omit<Request, "id">`, because `Omit`
 * collapses a union into the intersection of its keys — which here means every
 * request looks like it has no fields at all.
 */
type RequestBody = Request extends infer T ? T extends { id: string } ? Omit<T, "id"> : never
  : never;

export interface AnalyseResult {
  summary: StudySummary | null;
  /** An expected failure — raster PDF, no grid — not a crash. */
  error: string | null;
}

export interface Engine {
  ready(): Promise<void>;
  analyse(studyId: string, bytes: Uint8Array, assumptions: Assumptions): Promise<AnalyseResult>;
  /** Analyse an already-digital recording. Throws rather than returning an
   * error record: unlike a dropped file, a corpus record that will not parse is
   * a fault in this code, not an ordinary thing a user did. */
  analyseSignals(
    studyId: string,
    leads: Map<string, Float32Array>,
    fsHz: number,
  ): Promise<StudySummary>;
  compare(studyIds: string[]): Promise<ComparisonSnapshot>;
  /** One study's vectorcardiogram, or the reason it has none. */
  vcg(studyId: string): Promise<VcgSnapshot>;
  release(studyIds: string[]): Promise<void>;
  /** Where the compute is actually running, for the status bar. */
  readonly where: "worker" | "inline";
}

// ---------------------------------------------------------------------------

export class InlineEngine implements Engine {
  readonly where = "inline" as const;
  #core = new EngineCore();
  #wasmBytes?: BufferSource;

  constructor(wasmBytes?: BufferSource) {
    this.#wasmBytes = wasmBytes;
  }

  ready(): Promise<void> {
    return this.#core.ready(this.#wasmBytes);
  }

  async analyse(
    studyId: string,
    bytes: Uint8Array,
    assumptions: Assumptions,
  ): Promise<AnalyseResult> {
    try {
      return { summary: await this.#core.analyse(studyId, bytes, assumptions), error: null };
    } catch (err) {
      return { summary: null, error: err instanceof Error ? err.message : String(err) };
    }
  }

  analyseSignals(
    studyId: string,
    leads: Map<string, Float32Array>,
    fsHz: number,
  ): Promise<StudySummary> {
    return this.#core.analyseSignals(studyId, leads, fsHz);
  }

  async compare(studyIds: string[]): Promise<ComparisonSnapshot> {
    await this.ready();
    return this.#core.compare(studyIds);
  }

  async vcg(studyId: string): Promise<VcgSnapshot> {
    await this.ready();
    return this.#core.vcg(studyId);
  }

  release(studyIds: string[]): Promise<void> {
    this.#core.release(studyIds);
    return Promise.resolve();
  }
}

// ---------------------------------------------------------------------------

export class WorkerEngine implements Engine {
  readonly where = "worker" as const;
  #worker: Worker;
  #next = 1;
  #pending = new Map<string, { resolve: (r: Response) => void; reject: (e: Error) => void }>();

  constructor() {
    this.#worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.#worker.addEventListener("message", (e: MessageEvent<Response>) => {
      const msg = e.data;
      const slot = this.#pending.get(msg.id);
      if (!slot) return;
      this.#pending.delete(msg.id);
      if (msg.kind === "failed") slot.reject(new Error(msg.error));
      else slot.resolve(msg);
    });
    // A worker that dies takes every outstanding request with it. Failing them
    // loudly beats leaving the UI waiting on promises that can never settle.
    this.#worker.addEventListener("error", (e) => {
      const err = new Error(`engine worker failed: ${e.message}`);
      for (const [, slot] of this.#pending) slot.reject(err);
      this.#pending.clear();
    });
  }

  #send(req: RequestBody, transfer: Transferable[] = []): Promise<Response> {
    const id = `r${this.#next++}`;
    const full = { ...req, id } as Request;
    return new Promise<Response>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#worker.postMessage(full, transfer);
    });
  }

  async ready(): Promise<void> {
    // The worker initialises WASM lazily on its first real request; there is no
    // separate handshake to wait on, and inventing one would only add a way for
    // the two sides to disagree about whether it happened.
  }

  async analyse(
    studyId: string,
    bytes: Uint8Array,
    assumptions: Assumptions,
  ): Promise<AnalyseResult> {
    // A copy, transferred: the caller keeps the original so a change of assumed
    // paper speed can re-analyse without re-reading the file.
    const copy = bytes.slice();
    try {
      const r = await this.#send(
        { kind: "analyse", studyId, bytes: copy, assumptions },
        [copy.buffer],
      );
      if (r.kind !== "analysed") throw new Error(`unexpected reply ${r.kind}`);
      return { summary: r.summary, error: r.error };
    } catch (err) {
      return { summary: null, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async analyseSignals(
    studyId: string,
    leads: Map<string, Float32Array>,
    fsHz: number,
  ): Promise<StudySummary> {
    // A `Map` of `Float32Array` is structured-cloneable as it stands. The
    // buffers are not transferred: the caller may still want the samples, and
    // detaching them under it would be a surprise for a few hundred kilobytes.
    const r = await this.#send({ kind: "analyseSignals", studyId, leads, fsHz });
    if (r.kind !== "analysed") throw new Error(`unexpected reply ${r.kind}`);
    if (!r.summary) throw new Error(r.error ?? "analysis failed");
    return r.summary;
  }

  async compare(studyIds: string[]): Promise<ComparisonSnapshot> {
    const r = await this.#send({ kind: "compare", studyIds });
    if (r.kind !== "compared") throw new Error(`unexpected reply ${r.kind}`);
    return r.snapshot;
  }

  async vcg(studyId: string): Promise<VcgSnapshot> {
    const r = await this.#send({ kind: "vcg", studyId });
    if (r.kind !== "vcgDerived") throw new Error(`unexpected reply ${r.kind}`);
    return r.vcg;
  }

  async release(studyIds: string[]): Promise<void> {
    await this.#send({ kind: "release", studyIds });
  }
}

/**
 * Pick an engine.
 *
 * `?engine=inline` forces the in-process path, which is the switch to reach for
 * when a worker-only failure needs to be told apart from a real one.
 */
export function createEngine(): Engine {
  const forced = typeof location !== "undefined" &&
    new URLSearchParams(location.search).get("engine");
  if (forced === "inline" || typeof Worker === "undefined") return new InlineEngine();
  return new WorkerEngine();
}

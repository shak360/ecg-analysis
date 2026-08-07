/**
 * The engine, running off the main thread.
 *
 * A message loop around `EngineCore` and nothing else. All the interesting code
 * is in `core.ts`, so that the same logic runs here and inline — a worker whose
 * behaviour differed from the fallback would be a worker nobody could debug.
 *
 * On pdf.js: importing `core.ts` pulls in the vendored pdf.js, which normally
 * spawns its *own* worker for parsing. It cannot do that from in here without a
 * nested worker, which Safari only gained in 16.4 while `vite.config.ts` still
 * targets 15.4. pdf.js handles this itself — its worker setup touches
 * `window.location`, which does not exist on this thread, so it falls back to
 * its in-thread "fake worker". That is the outcome we want: the parse is
 * already off the main thread by virtue of being in here, and a nested worker
 * would buy nothing but a compatibility cliff.
 */
import { EngineCore } from "./core.ts";
import {
  type Request,
  type Response,
  snapshotTransfers,
  vcgTransfers,
} from "./protocol.ts";

const core = new EngineCore();

const reply = (msg: Response, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(msg, transfer);

self.addEventListener("message", (e: MessageEvent<Request>) => {
  const req = e.data;
  void (async () => {
    try {
      switch (req.kind) {
        case "analyse": {
          try {
            const summary = await core.analyse(req.studyId, req.bytes, req.assumptions);
            reply({ kind: "analysed", id: req.id, summary, error: null });
          } catch (err) {
            // An unreadable file is an expected outcome, reported on the study
            // rather than thrown, so that one bad PDF does not take down the
            // others loaded alongside it.
            reply({
              kind: "analysed",
              id: req.id,
              summary: null,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          return;
        }
        case "analyseSignals": {
          try {
            const summary = await core.analyseSignals(req.studyId, req.leads, req.fsHz);
            reply({ kind: "analysed", id: req.id, summary, error: null });
          } catch (err) {
            reply({
              kind: "analysed",
              id: req.id,
              summary: null,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          return;
        }
        case "compare": {
          const snapshot = core.compare(req.studyIds);
          reply({ kind: "compared", id: req.id, snapshot }, snapshotTransfers(snapshot));
          return;
        }
        case "vcg": {
          const vcg = core.vcg(req.studyId, req.mode);
          reply({ kind: "vcgDerived", id: req.id, vcg }, vcgTransfers(vcg));
          return;
        }
        case "release": {
          core.release(req.studyIds);
          reply({ kind: "released", id: req.id });
          return;
        }
      }
    } catch (err) {
      reply({
        kind: "failed",
        id: (req as { id: string }).id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
});

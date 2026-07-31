/**
 * The single place that touches the vendored pdf.js.
 *
 * Kept in plain JS with a sibling `.d.ts` so TypeScript gets types without
 * trying to typecheck pdf.js's 1 MB bundle, and so the `../vendor/...`
 * specifier — which esbuild leaves external — resolves correctly from both
 * `web/src/` and the bundle's home in `web/dist/`.
 */
import { getDocument, GlobalWorkerOptions, OPS, Util } from "../vendor/pdfjs/pdf.mjs";

GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.mjs", import.meta.url).href;

export { getDocument, OPS, Util };

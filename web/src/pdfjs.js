/**
 * The single place that touches the vendored pdf.js.
 *
 * Kept in plain JS with a sibling `.d.ts` so TypeScript gets types without
 * trying to typecheck pdf.js's 1 MB bundle, and so the `../vendor/...`
 * specifier — which esbuild leaves external — resolves correctly from both
 * `web/src/` and the bundle's home in `web/dist/`.
 */
// Must precede the pdf.js import: pdf.js calls a method Node 20 and browsers
// older than Chrome 114 / Safari 16.4 / Firefox 122 do not have, and does not
// polyfill it itself. See `compat.ts`. Import order is the load order here, so
// this line is load-bearing rather than stylistic.
import "./compat.ts";

import { getDocument, GlobalWorkerOptions, OPS, Util } from "../vendor/pdfjs/pdf.mjs";

// The worker gets the shim from the vendored file itself — see
// `web/vendor/pdfjs/PATCHES.md`. It cannot get it from here: a worker has its
// own global scope, so patching `ArrayBuffer.prototype` on the thread that
// creates one does nothing inside it.
GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.mjs", import.meta.url).href;

export { getDocument, OPS, Util };

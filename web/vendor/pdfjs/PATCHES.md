# Local patches to the vendored pdf.js

pdf.js 6.2.108, vendored from the upstream release build. One patch is applied.
Re-vendoring means re-applying it; `test/compat.test.ts` fails if it is missing,
so this cannot be forgotten silently.

## 1. `transferToFixedLength` shim in `pdf.worker.mjs`

**Where.** Prepended to `pdf.worker.mjs`, between the markers
`ecg-analysis vendor patch: transferToFixedLength` and `end vendor patch`.

**Why.** pdf.js bundles core-js polyfills for roughly forty modern APIs — you can
see them as `// \`X\` method` comments through both files, covering
`Promise.withResolvers`, the `Set` methods, the iterator helpers and more. It
calls exactly one modern API bare, with no feature detection and no polyfill:

```
pdf.worker.mjs  compileSystemFontInfo()  return buffer.transferToFixedLength(offset);
pdf.worker.mjs  compileFontInfo()        return buffer.transferToFixedLength(offset);
```

`ArrayBuffer.prototype.transferToFixedLength` shipped in **Chrome 114,
Safari 16.4, Firefox 122 and Node 21**. Below those it throws — and because both
call sites are in *font* compilation, which every ECG printout reaches through
its lead labels and its `25 mm/s` annotation, the failure is not rare. pdf.js
catches the error inside `getOperatorList` and returns an empty operator list, so
what the application sees is `No lead produced a usable beat`: a digitisation
error message for a missing method, several layers from the cause.

**Why here and not in `web/src/compat.ts`.** Both. The application module covers
the main thread and our own engine worker. This file covers pdf.js's *own*
worker, which has a separate global scope that a `ArrayBuffer.prototype` patch
made on the creating thread does not reach. Verified on the Compare page: the
network log shows `pdf.worker.mjs` fetched from a worker context.

Routing `workerSrc` through a wrapper module that imports the shim first was
tried and rejected: pdf.js's *fake worker* path — used wherever a real `Worker`
cannot be constructed, including Node — imports `workerSrc` and reads
`WorkerMessageHandler` off it, which a Vite-bundled worker artefact does not
export. It failed as `Setting up fake worker failed`. Patching the vendored file
keeps one code path for every environment.

**Consequence of dropping it.** The test suite fails on Node 20, and the Compare
page silently produces nothing on every browser below the versions above —
including browsers `vite.config.ts` explicitly lists as supported
(`chrome100`, `firefox100`, `safari15.4`, `edge100`).

**Upstream.** Remove once pdf.js polyfills this itself or stops calling it.

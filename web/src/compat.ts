/**
 * The one runtime gap the vendored pdf.js does not fill for itself.
 *
 * pdf.js 6.2.108 ships a large core-js polyfill set — `Promise.withResolvers`,
 * the `Set` methods, the iterator helpers, `Math.sumPrecise` and about forty
 * more — so it runs well below the newest engines. It calls exactly one modern
 * API bare, with no feature detection and no polyfill of its own:
 *
 *   web/vendor/pdfjs/pdf.worker.mjs:26831  return buffer.transferToFixedLength(offset);
 *   web/vendor/pdfjs/pdf.worker.mjs:26940  return buffer.transferToFixedLength(offset);
 *
 * Both sites are in **font** compilation, which every ECG printout reaches — the
 * lead labels, the "25 mm/s" annotation. When the call throws, pdf.js swallows
 * it inside `getOperatorList` and returns an empty operator list, so the failure
 * arrives as "No lead produced a usable beat" rather than as a missing method.
 * That is a long way from the cause, which is why this file is worth its length.
 *
 * `ArrayBuffer.prototype.transferToFixedLength` shipped in Chrome 114,
 * Safari 17.4, Firefox 122 and Node 21. Without this shim the Compare page is
 * broken on every browser below those, and the test suite is broken on Node 20.
 *
 * It removes that bound and no other. An audit of the rest found three further
 * constraints, none of them pdf.js's fault and none fixed here: `color-mix()`
 * in our own stylesheet (Chrome 111), module workers in `engine/client.ts`
 * (Firefox 114), and a class static block in the vendored worker, which ships
 * untranspiled (Safari 16.4). `vite.config.ts` now states the resulting floor
 * instead of the older, wishful one.
 *
 * Imported for side effects only, and installed in every scope that can reach
 * pdf.js: the main thread, our own engine worker, and pdf.js's worker.
 * Feature-detected and idempotent, so importing it three times costs nothing and
 * a browser that already has the method keeps its native one.
 */

interface TransferableArrayBuffer {
  transferToFixedLength?: (newLength?: number) => ArrayBuffer;
}

/**
 * The replacement, exported so it can be tested where the native method exists.
 *
 * Without this export the shim would only ever be exercised on a runtime old
 * enough to need it. Every modern engine would install the native method and
 * skip this code entirely, so a mistake in it — or its outright deletion —
 * would show up nowhere until someone opened the app in an older browser. The
 * tests call this directly, so its semantics are pinned on every runtime.
 */
export function transferToFixedLength(this: ArrayBuffer, newLength?: number): ArrayBuffer {
  const len = newLength === undefined ? this.byteLength : Math.trunc(newLength);
  if (!(len >= 0)) throw new RangeError("transferToFixedLength: invalid length");

  // Reading through a view throws TypeError on an already-detached buffer,
  // which is what the specification requires — so this is the detach check as
  // well as the copy.
  const src = new Uint8Array(this, 0, Math.min(len, this.byteLength));
  const out = new ArrayBuffer(len);
  new Uint8Array(out).set(src);

  // The spec detaches the source. A plain copy would leave it alive, and pdf.js
  // does not read it again — but a shim that quietly diverges from the method it
  // replaces is how the *next* caller gets surprised. `structuredClone` with a
  // transfer list is the only way to detach from userland, and it is available
  // in Node 17+ and in every browser that lacks the method being replaced.
  structuredClone(this, { transfer: [this] });

  return out;
}

if (typeof (ArrayBuffer.prototype as TransferableArrayBuffer).transferToFixedLength !== "function") {
  Object.defineProperty(ArrayBuffer.prototype, "transferToFixedLength", {
    configurable: true,
    writable: true,
    enumerable: false,
    value: transferToFixedLength,
  });
}

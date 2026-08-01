/**
 * The runtime shim pdf.js needs, pinned against the specification.
 *
 * These call `transferToFixedLength` as a plain function rather than through
 * `ArrayBuffer.prototype`, on purpose. On any runtime new enough to have the
 * native method the shim is never installed, so testing through the prototype
 * would test V8 and not us — and the shim could be broken, or deleted outright,
 * with every test still green. That is exactly the failure this file exists to
 * prevent, because the code it guards only runs on machines the developer does
 * not have.
 *
 * The expectations below were checked against the native implementation on
 * Node 24: running the same six cases through `ArrayBuffer.prototype`'s own
 * method produced these values, so this is the real contract and not a guess at
 * it.
 */
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";

import { transferToFixedLength } from "../web/src/compat.ts";

const filled = (bytes: number[]) => {
  const buf = new ArrayBuffer(bytes.length);
  new Uint8Array(buf).set(bytes);
  return buf;
};
const call = (buf: ArrayBuffer, len?: number) => transferToFixedLength.call(buf, len);

test("a shorter length truncates, keeping the leading bytes", () => {
  const out = call(filled([1, 2, 3, 4, 5, 6, 7, 8]), 4);
  expect([...new Uint8Array(out)]).toEqual([1, 2, 3, 4]);
});

test("a longer length zero-fills the tail rather than reading past the source", () => {
  const out = call(filled([9, 9]), 4);
  expect([...new Uint8Array(out)]).toEqual([9, 9, 0, 0]);
});

test("an omitted length keeps the buffer's own size", () => {
  const out = call(filled([7, 7, 7]));
  expect([...new Uint8Array(out)]).toEqual([7, 7, 7]);
});

test("the source is detached, as the specification requires", () => {
  // The whole point of the method is that ownership moves. A copy that left the
  // source alive would work for pdf.js and mislead the next caller.
  const src = filled([1, 2, 3, 4]);
  call(src, 2);
  expect(src.byteLength).toBe(0);
});

test("transferring an already-detached buffer throws TypeError", () => {
  const src = filled([1, 2, 3, 4]);
  call(src, 2);
  expect(() => call(src, 2)).toThrow(TypeError);
});

test("the result is fixed length, not resizable", () => {
  // "ToFixedLength" is the half of the name that distinguishes this from
  // `transfer`, so it is worth asserting rather than assuming.
  const out = call(filled([1, 2]), 2) as ArrayBuffer & { resizable?: boolean };
  expect(out.resizable ?? false).toBe(false);
});

test("a negative length is refused", () => {
  expect(() => call(filled([1, 2]), -1)).toThrow(RangeError);
});

test("the vendored pdf.js worker still carries its shim, ahead of both call sites", () => {
  // Structural, and the most load-bearing test in this file. The shim inside
  // `pdf.worker.mjs` is a local patch (see web/vendor/pdfjs/PATCHES.md); the
  // obvious way to lose it is to re-vendor pdf.js and not re-apply it. That
  // would break nothing a developer on a current browser could see, and would
  // break the Compare page for everyone on an older one.
  const worker = readFileSync(
    new URL("../web/vendor/pdfjs/pdf.worker.mjs", import.meta.url),
    "utf8",
  );

  const shim = worker.indexOf('defineProperty(ArrayBuffer.prototype, "transferToFixedLength"');
  expect(shim, "vendor patch missing — see web/vendor/pdfjs/PATCHES.md").toBeGreaterThan(-1);

  // Installed before anything can call it. A shim that loads after the first
  // use is no shim at all.
  const calls = [...worker.matchAll(/buffer\.transferToFixedLength\(/g)].map((m) => m.index!);
  expect(calls.length).toBeGreaterThan(0);
  expect(shim).toBeLessThan(Math.min(...calls));
});

test("the vendored copy of the shim has not drifted from the tested one", () => {
  // There are necessarily two copies — one importable module for our own scopes,
  // one inlined in the vendored worker, which cannot import anything. Only the
  // first is covered by the tests above, so the risk is that the second decays
  // into a plain copy: it would still satisfy pdf.js, still pass every test, and
  // silently stop matching the method it stands in for.
  const patched = readFileSync(
    new URL("../web/vendor/pdfjs/pdf.worker.mjs", import.meta.url),
    "utf8",
  ).slice(0, 4000);
  const source = readFileSync(new URL("../web/src/compat.ts", import.meta.url), "utf8");

  for (const invariant of [
    "structuredClone(this, { transfer: [this] })", // detaches, rather than merely copying
    'throw new RangeError("transferToFixedLength: invalid length")',
    "Math.min(len, this.byteLength)", // no read past the end when growing
  ]) {
    expect(source, `compat.ts lost: ${invariant}`).toContain(invariant);
    expect(patched, `vendor patch lost: ${invariant}`).toContain(invariant);
  }
});

/**
 * Minimal browser-shape stubs so the vendored pdf.js can be imported in Node.
 *
 * The vendored build is the *browser* build, which is correct — it is what ships.
 * Importing it under Node evaluates `display/canvas.js`, whose module scope
 * constructs a `DOMMatrix` and a `Path2D` at load time.
 *
 * We never rasterise. The ingest path reads operator lists and does its own
 * coordinate maths in `path-decode.ts`, which imports no pdf.js at all. So these
 * only have to exist for module evaluation to complete; if a code path ever
 * actually *used* one, that would be a bug in our ingest, and a stub that threw
 * would be the honest way to find out. Hence the throwing methods rather than
 * plausible-looking no-ops — a silent wrong answer is worse than a stack trace.
 */

/**
 * The application's own runtime shim, not a test-local one.
 *
 * pdf.js calls `ArrayBuffer.prototype.transferToFixedLength`, which Node gained
 * in 21; on Node 20 every PDF test failed as "No lead produced a usable beat".
 * Importing the shipped module rather than redefining the method here is the
 * point: a test-only copy would go green against code that is not the code that
 * runs, and the two would drift. See `web/src/compat.ts`.
 */
import "../web/src/compat.ts";

class StubDOMMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: number[] | string) {
    if (Array.isArray(init) && init.length >= 6) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = init as [
        number,
        number,
        number,
        number,
        number,
        number,
      ];
    }
  }

  // Anything beyond construction means something is trying to render, which the
  // ingest path must never do.
  scale(): never {
    throw new Error("DOMMatrix.scale called: the ingest path must not rasterise");
  }
  translate(): never {
    throw new Error("DOMMatrix.translate called: the ingest path must not rasterise");
  }
}

class StubPath2D {
  addPath(): never {
    throw new Error("Path2D.addPath called: the ingest path must not rasterise");
  }
}

const g = globalThis as Record<string, unknown>;
g.DOMMatrix ??= StubDOMMatrix;
g.Path2D ??= StubPath2D;

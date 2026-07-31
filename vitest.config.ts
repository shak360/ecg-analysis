import { defineConfig } from "vitest/config";

/**
 * Separate from `vite.config.ts` on purpose.
 *
 * Vitest ships its own copy of Vite, so a plugin typed against the top-level
 * `vite` package is not assignable to the nested one. Keeping the two configs
 * apart avoids a type clash that says nothing about whether the code works.
 */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // The end-to-end test imports the vendored pdf.js, which is the browser
    // build — correct, since it is what ships — and constructs a DOMMatrix at
    // module scope. The stubs let it load under Node without dragging in a
    // canvas implementation we would never draw to.
    setupFiles: ["test/setup-pdfjs.ts"],
  },
});

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
  },
});

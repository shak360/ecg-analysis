/**
 * Bundles the TypeScript UI layer to `web/dist/app.js`.
 *
 * The wasm-pack glue module is deliberately left **external**. wasm-bindgen's
 * loader locates the `.wasm` binary via `new URL(..., import.meta.url)`, so
 * inlining it would make that lookup resolve against the bundle's directory
 * instead of `web/wasm/`. Keeping it external means the browser imports the real
 * module from its real location and the URL math stays correct.
 *
 * The import specifier `../wasm/ecg_core.js` happens to resolve correctly from
 * both `web/src/` (source) and `web/dist/` (output), so no rewriting is needed.
 */
import * as esbuild from "npm:esbuild@^0.24.0";

const WEB = new URL("../web/", import.meta.url).pathname;
const watch = Deno.args.includes("--watch");
const minify = Deno.args.includes("--minify");

const options: esbuild.BuildOptions = {
  entryPoints: [
    `${WEB}src/main.ts`,
    // Development harness: renders a fixture PDF next to the geometry our
    // extractor recovers from it. Not linked from the app.
    `${WEB}src/dev.ts`,
  ],
  outdir: `${WEB}dist`,
  entryNames: "[name]",
  bundle: true,
  format: "esm",
  target: ["chrome100", "firefox100", "safari15.4", "edge100"],
  sourcemap: true,
  minify,
  external: ["../wasm/ecg_core.js", "../vendor/pdfjs/pdf.mjs"],
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("  bundler watching web/src/");
} else {
  await esbuild.build(options);
  await esbuild.stop();
}

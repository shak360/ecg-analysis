import { defineConfig, type Plugin } from "vite";
import { readFile } from "node:fs/promises";
import { resolve, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const webRoot = resolve(root, "web");
const fixtureRoot = resolve(root, "test/fixtures");

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

/**
 * Serves the synthetic fixtures under `/fixtures/` during development.
 *
 * Deliberately scoped to `test/fixtures` and path-normalised, so a crafted URL
 * cannot escape into the rest of the tree — `sample_ECGs/` in particular, which
 * is where real patient data would sit.
 */
function fixtures(): Plugin {
  return {
    name: "ecg-fixtures",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/fixtures/")) return next();

        const rel = normalize(decodeURIComponent(url.slice("/fixtures/".length)))
          .replace(/^(\.\.[/\\])+/, "");
        const file = resolve(fixtureRoot, rel);
        if (!file.startsWith(fixtureRoot)) {
          res.statusCode = 403;
          return res.end("forbidden");
        }

        readFile(file).then(
          (buf: Buffer) => {
            res.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
            res.end(buf);
          },
          () => {
            res.statusCode = 404;
            res.end("not found");
          },
        );
      });
    },
  };
}

export default defineConfig({
  root: webRoot,
  publicDir: false,
  plugins: [fixtures()],
  server: {
    port: 8080,
    headers: {
      // Keeps SharedArrayBuffer available should multi-threaded WASM land later.
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    fs: {
      // Vite's `/@fs/<absolute-path>` route will serve anything under the
      // inferred workspace root. Because the Vite root is `web/` while the
      // workspace root is the repository, that route happily served
      // `sample_ECGs/` — verified by fetching a real PDF through it. The dev
      // server must not be a way to read patient data off disk.
      strict: true,
      allow: [webRoot, resolve(root, "node_modules")],
      deny: [
        "**/sample_ECGs/**",
        "**/*.pdf",
        "**/*.jpg",
        "**/*.jpeg",
        "**/*.png",
        "**/*.heic",
        "**/*.dcm",
      ],
    },
  },
  build: {
    outDir: resolve(root, "dist"),
    emptyOutDir: true,
    target: ["chrome100", "firefox100", "safari15.4", "edge100"],
    rollupOptions: {
      input: {
        main: resolve(webRoot, "index.html"),
        dev: resolve(webRoot, "dev.html"),
        try: resolve(webRoot, "try.html"),
        compare: resolve(webRoot, "compare.html"),
      },
    },
  },
  // wasm-pack emits an ES module that locates its .wasm via
  // `new URL(..., import.meta.url)`, which Vite rewrites correctly. The vendored
  // pdf.js is excluded from dependency optimisation so it is served as-is.
  optimizeDeps: {
    exclude: ["./wasm/ecg_core.js"],
  },
});

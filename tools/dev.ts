/**
 * Static dev server for the web/ tree.
 *
 * The app is a plain static site — this exists only because ES modules and
 * WebAssembly cannot be loaded over `file://`. It is not part of the shipped
 * product and never sees patient data: files are read by the browser locally
 * and are never sent anywhere.
 */
import { serveDir } from "@std/http/file-server";

const WEB_ROOT = new URL("../web/", import.meta.url);
const FIXTURE_ROOT = new URL("../test/fixtures/", import.meta.url);
const port = Number(Deno.env.get("PORT") ?? 8080);

const toPath = (u: URL) => Deno.build.os === "windows" ? u.pathname.slice(1) : u.pathname;

Deno.serve({
  port,
  onListen: ({ hostname, port }) => {
    console.log(`\n  ECG registration — dev server\n  http://${hostname}:${port}/\n`);
  },
}, (req) => {
  // Synthetic fixtures are served under /fixtures/ so the app can load them over
  // http during development. They contain no patient data.
  const { pathname } = new URL(req.url);
  if (pathname.startsWith("/fixtures/")) {
    return serveDir(new Request(
      new URL(pathname.replace("/fixtures/", "/"), req.url),
      req,
    ), {
      fsRoot: toPath(FIXTURE_ROOT),
      quiet: true,
    });
  }

  return serveDir(req, {
    fsRoot: toPath(WEB_ROOT),
    quiet: true,
    // Cross-origin isolation, so we keep the option of SharedArrayBuffer for
    // multi-threaded WASM later without having to restructure the server.
    headers: [
      "Cross-Origin-Opener-Policy: same-origin",
      "Cross-Origin-Embedder-Policy: require-corp",
    ],
  });
});

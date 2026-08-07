/**
 * Where this build thinks it lives, and what shape its corpus is in.
 *
 * Both facts come from the build, and both were previously assumed. Every
 * runtime fetch was written as an absolute `/corpus/...`, which is correct
 * exactly when the site is served from a domain root and silently wrong
 * everywhere else — a GitHub project page is served from `/<repo>/`, so an
 * absolute path there resolves to somebody else's site. And the corpus was
 * assumed to be raw WFDB on disk, which is true in development and false for a
 * deployed build, where `tools/stage-corpus.ts` has trimmed and packed it.
 *
 * Keeping both in one module means the rest of the app asks `assetUrl(...)`
 * and never repeats the assumption.
 */

/**
 * Vite substitutes these at build time. The optional chaining is for the test
 * runner and for any consumer loading these modules outside a Vite transform,
 * where a bare `import.meta.env` is undefined rather than an empty object.
 */
const env = (import.meta as { env?: { BASE_URL?: string; PROD?: boolean } }).env;

/** Site root, with a trailing slash: `/` in dev, `/ecg-analysis/` on Pages. */
export const BASE_URL = env?.BASE_URL ?? "/";

/**
 * Whether the corpus was staged — trimmed to the displayed window, packed and
 * gzipped. True for any production build, because `npm run build:site` is what
 * produces a deployable tree, and false under `vite dev` and under the tests,
 * which read the raw PhysioNet download.
 */
export const CORPUS_PACKED = env?.PROD ?? false;

/**
 * Resolve a site-relative path against the base.
 *
 * Takes and returns the same path in the common case (`base` is `/`), so the
 * development URLs are unchanged and a broken base shows up as a 404 in the
 * one place rather than as a subtly missing corpus.
 */
export function assetUrl(path: string): string {
  return BASE_URL.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
}

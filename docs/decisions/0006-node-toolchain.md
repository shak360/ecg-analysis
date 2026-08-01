# 0006 — Node, npm and Vite, installed with `--ignore-scripts`

**Status:** accepted
**Decided by:** the user
**Date:** 2026-07-30

## Context

The project began on Deno 2.x, which was a good fit for a web-only product: one
binary, no `node_modules`, TypeScript without a build step, and permissions off
by default.

Mobile changed the calculation. A phone is where a photograph of a paper ECG is
actually taken, so the camera path is not a nice-to-have, and Capacitor is the
route that reuses this codebase rather than replacing it — the same TypeScript,
the same WASM, plus native camera and Keychain/Keystore for the atlas key. It
orchestrates Xcode and Gradle from an npm project layout. Deno would keep working
for the browser and be friction at exactly that integration point, and the UI is
about to become the bulk of the work, so migrating while it is small is far
cheaper than migrating later.

Vite's HMR matters for the same reason. The overlay, the atlas and the explainer
are UI-heavy, and the old loop was rebuild-and-reload.

## Decision

**Node 24 (pinned in `.node-version`), npm, and Vite.** Deno is gone; `deno.json`
and `deno.lock` are deleted, and the task names move to `package.json` scripts:
`npm run fixtures`, `npm run dev`, `npm test`.

**Dependencies install with `npm ci --ignore-scripts`.** Lifecycle scripts are
npm's main supply-chain vector, and this project is built to handle patient data.
The `postinstall` script exists only to print that reminder.

Rust remains the owner of everything numeric. This decision is about the
JavaScript toolchain and changes nothing about decision 0004.

## Consequences

- `node_modules/` exists, with the supply-chain surface that implies. Hence
  `--ignore-scripts`, a committed lockfile, and a vendored pdf.js rather than a
  runtime CDN fetch.
- The dev server is a second way to read files off disk. Vite's `/@fs/` route
  serves absolute paths under the inferred workspace root, and because the Vite
  root is `web/` while the workspace root is the repository, it served
  `sample_ECGs/` — verified by fetching a real patient PDF through it before the
  hole was closed. `vite.config.ts` now restricts `server.fs.allow` to `web/` and
  `node_modules`, with a deny list for patient-data extensions, re-verified as
  403. The `.claude` deny rules govern agent tool calls, not a browser, so they
  were never protection against this.
- Type-checking is no longer implicit in running the code: `npx tsc --noEmit` is
  its own step, and `noUncheckedIndexedAccess` stays on. It immediately earned
  its place — under it, pdf.js's untyped `OPS` map types every operator lookup as
  `number | undefined`, so a renamed operator would have compared equal to
  nothing and left extraction silently returning an empty page. Operator codes
  now resolve through a helper that throws and names the vendored version.
- Deno's `assert()` narrowed types through an `asserts` signature; vitest's
  `expect` does not. An `assertDefined` helper restores the narrowing rather than
  scattering non-null assertions, which would suppress exactly the check worth
  keeping.

## Rejected alternatives

**Stay on Deno and reach mobile through a separate wrapper project:** duplicates
the build and the WASM packaging, and puts the camera path in a repository that
does not contain the pipeline it feeds.

**Deno with an npm compatibility layer:** the compatibility is real for libraries
and thin for toolchains; Xcode and Gradle orchestration is the part that would
have to be rebuilt anyway.

**Bun:** faster, and one more young runtime between patient data and the screen.
Node is the one Capacitor and the mobile toolchains are tested against.

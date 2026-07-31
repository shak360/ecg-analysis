# 0004 — Every constant lives in Rust; the UI reads them through WASM

**Status:** accepted
**Decided by:** the user
**Date:** 2026-07-30

## Context

`docs/engineering-spec.md` §2 proposes `crates/ecg-core/src/config.rs` as the
single source of truth with a generated mirror at `web/src/config.gen.ts`.

The generation step is the problem. A mirror is only correct while someone
remembers to regenerate it, and the failure is silent: a threshold changed in
Rust but stale in TypeScript produces a UI that gates, colours, and labels
against a value the engine no longer uses. Nothing errors. The numbers just
disagree, and the disagreement shows up as a wrong verdict.

That is the same class of failure this project exists to prevent, arriving
through the build system instead of the signal path.

## Decision

**Constants are defined once, in `config.rs`, and never duplicated into
TypeScript.** No `config.gen.ts`, no codegen step.

Where the UI needs a threshold, it reads it through a WASM getter:

```rust
#[wasm_bindgen]
pub fn clinical_thresholds() -> JsValue { /* serialise the subset the UI needs */ }
```

The UI holds no numeric policy of its own. If a screen needs to know that ST
elevation is notable at 0.10 mV, it asks the engine.

## Consequences

- One source of truth, so drift is not possible rather than merely discouraged.
- The UI cannot render a gate the engine would not apply, because it has no
  independent copy of the gate.
- Thresholds arrive asynchronously, after WASM init. The UI must already handle
  a pre-init state — the engine self-check runs there — so this costs nothing new.
- Purely presentational constants (colour ramps, canvas padding, animation
  timings) stay in TypeScript. They are not policy and nothing clinical depends
  on them.

## Rejected alternatives

**Generated mirror** (the spec's proposal): correct only until someone skips the
regeneration, and silent when they do.

**Duplicate by hand:** the same failure, faster.

**Constants in TypeScript, passed into Rust:** inverts the dependency so the
engine's behaviour is set by its least safety-critical consumer, and makes the
Rust unit tests depend on values they cannot see.

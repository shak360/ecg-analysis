# 0002 — Real ECGs never enter tool reach until de-identifying ingest exists

**Status:** accepted
**Date:** 2026-07-30

## What happened

`sample_ECGs/` was created early as the place for the user's own ECGs and added
to `.gitignore`. That protected git, and git only.

Three real ECG PDFs were then placed there. Two background research workflows
subsequently ran with filesystem access to the repository:

- the first ran `ls -R sample_ECGs`, so the directory name — which was a medical
  record number — and the three timestamp filenames entered agent context;
- the second ran pdf.js probes calling `getTextContent()` and `getMetadata()`
  against the PDFs. On an ECG, the text layer *is* the demographics block, so
  patient identifiers entered agent context and were transmitted to the model API.

Nothing reached git or the GitHub remote; `.gitignore` held and the remote tree
was verified to contain no PDFs.

## Why it happened

A directory that is gitignored looks safe, and was described as safe. But
`.gitignore` governs one channel. Agents, shell commands, and search tools read
the working tree regardless. The mitigation in place was a sentence of prose
telling the user to wait, which is not a control.

The general lesson: **the protection has to live at the same layer as the
threat.** Against git, `.gitignore`. Against tools that read the filesystem, a
permission rule.

## Decision

1. **Real patient data does not live inside the repository** until the
   de-identifying ingest exists. It belongs outside any directory a tool is
   pointed at. `sample_ECGs/` remains gitignored but is not treated as safe.

2. **A deny rule enforces it.** `.claude/settings.json` denies `Read`, `Glob`,
   and `Grep` on `sample_ECGs/**`, plus the obvious shell readers. This is
   committed, so it applies to anyone working in the repo, not just to whoever
   remembers the convention.

3. **Documents derived from real data are scanned before being committed.** The
   research spec produced from this work quoted the MRN-bearing path in a
   justification sentence and was scrubbed before its first commit.

4. **When the ingest lands, the same principle applies to it**: per
   `docs/atlas-deid-spec.md`, the atlas stores no bytes derived from the source
   document — no file, no raster, no thumbnail, no content stream — only decoded
   waveform samples and a closed list of enumerated scalars. The safety property
   comes from what is never copied, not from what is removed.

## Consequences

Development against real ECGs is blocked until ingest exists. That is the point:
the synthetic fixtures already cover the pipeline, and the first real file the
system touches should be one it can strip identifiers from at the door.

A deny rule is not a security boundary against a determined process — it governs
the agent's own tool calls. It is the right control for this failure mode, which
was an accident, not an attack.

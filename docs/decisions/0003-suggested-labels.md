# 0003 — Suggested labels: inferred, explainable, never applied

**Status:** superseded on 2026-08-01 by the evidence view — see the note below

> **Superseded.** This ADR designs a tool that *suggests* a label and asks the
> user to accept or reject it. That was never built, and what shipped instead is
> its deliberate opposite: `web/src/criteria/` shows the published criteria for a
> label a cardiologist already assigned, and `evaluate.ts` is written so that a
> verdict cannot exist — it returns `above`/`below`/`atThreshold`/`unmeasurable`
> and never a boolean, on the reasoning that a boolean would eventually be
> rendered, and once rendered it is a judgement on someone's reading.
>
> Two things here are still live and are not superseded: the ST-suppression
> reasoning in the "confounders" section, and the principle that an absent
> suggestion is not reassurance — which `web/src/ui/measurements.ts` still cites
> directly. Note also that two of the four ST suppressors named below (ventricular
> pacing, WPW) cannot fire from the current measurement set at all; see
> `docs/ecg-diagnostic-criteria.md`, "Three corrections to existing repo
> artifacts".
**Decided by:** the user
**Date:** 2026-07-30

## Context

The atlas records the clinician's own label for each case (LBBB, ARVD, STEMI…).
Assigning those by hand across a growing library is tedious, and many of them
follow mechanically from measurements the pipeline already produces.

Earlier note in this repo said labels would be "user-assigned, never inferred".
That is overturned: the app may **suggest**.

## Decision

Suggestions are generated, shown with their reasoning, and **never applied
without an explicit accept.** Four constraints make that safe:

### 1. Rules, not a model

Every suggestion comes from a published criterion in
`docs/engineering-spec.md` §6, evaluated against measured values. No classifier,
no embedding, no black box. The reason is not purism — it is that a suggestion
the clinician cannot check is worse than no suggestion, because it imports a
judgement whose basis is invisible.

Each suggestion therefore renders as its evidence:

> **LBBB** — suggested
> QRS 148 ms (≥120), broad monophasic R in V6, absent q in I/V6
> *Surawicz 2009, AHA/ACCF/HRS Part III*
> [accept] [dismiss]

### 2. Only what the measurements support

| Suggestible now | From |
|---|---|
| LBBB, RBBB, incomplete RBBB, IVCD | QRS duration + V1/V6 morphology |
| LAFB, LPFB | axis + required morphology + QRS <120 ms |
| First-degree AV block | PR >200 ms |
| LVH by voltage | Sokolow-Lyon, Cornell voltage, Cornell product |
| Long / short QT | QTc (Fridericia) vs sex-specific thresholds |
| STEMI by territory | J-point elevation vs UDMI-4 limits, ≥2 contiguous leads |
| Pathological Q / prior MI | UDMI-4 Q-wave duration and depth criteria |
| Poor R-wave progression | R in V3 ≤0.30 mV |
| Atrial fibrillation | RR irregularity + absent consistent P |
| Low voltage | limb and precordial amplitude sums |

**Never suggested — user-only:** ARVD, HCM, Brugada, WPW, congenital long QT
subtype, pericarditis, digitalis effect, and every other entity requiring
features this pipeline does not compute, clinical context it does not have, or
morphology finer than its error budget resolves. Absence of a suggestion means
nothing and the UI must say so.

ARVD is the instructive case: its epsilon wave is a low-amplitude,
high-frequency deflection just after the QRS — near the noise floor on a phone
photo, and precisely the feature DTW warping would delete. Suggesting it from
these measurements would be guessing with a citation attached.

### 3. Suppression, because criteria invalidate each other

A criterion met inside a rhythm that voids it is not a finding. The engine holds
an explicit suppression matrix:

- **LBBB, ventricular pacing, WPW, LVH** void the standard ST-elevation
  thresholds (UDMI-4 Table 3 caveat). Under LBBB, STEMI is not suggested from
  ST elevation at all; Sgarbossa-type criteria are a separate, later rule.
- **QRS ≥120 ms** voids QTc thresholds; report JT/JTc instead (spec §6.1).
- **Atrial fibrillation** voids PR-based suggestions — there is no PR.
- **Poor R-wave progression** is not suggested under LBBB or under a lead
  misassignment warning.

A suppressed rule is shown as suppressed with its reason, never silently
dropped. "No suggestion" and "suggestion withheld because LBBB invalidates the
criterion" are different statements and must look different.

### 4. Gated by the same uncertainty as everything else

A suggestion inherits the gating rule from `docs/engineering-spec.md` §5. If ST
cannot be resolved to the threshold the criterion needs — a poor photo has an ST
MDC of 0.30 mV against a 0.10 mV criterion — the rule does not fire, and reports
that it could not be evaluated. Suggestions are never a way to smuggle a number
past the gate that would not be shown on its own.

## Consequence: the disclaimer changes

The current wording says the app "does not provide diagnosis or interpretation."
Once it suggests labels that is no longer true, and leaving it would be the kind
of inaccuracy that erodes trust in every other claim. Replacement:

> **Not a medical device.** This tool assists visual comparison of ECG tracings
> for research and educational use. Measurements are derived from digitized
> images and carry uncertainty that depends on source quality. Suggested labels
> are automated pattern-matching against published criteria — a starting point
> for your own reading, never a diagnosis. They are applied only when you accept
> them, they omit conditions this tool cannot assess, and an absent suggestion
> means nothing. All findings must be verified against the original tracings by
> a qualified clinician.

Two sentences carry the weight: suggestions are never applied without consent,
and **absence of a suggestion is not reassurance** — which is the specific way an
automated label list misleads a tired reader at 3 a.m.

## Not decided here

Whether accepted suggestions are marked in the atlas as accepted-from-suggestion
versus originally-user-entered. Recommendation: yes, record provenance, because
a library where the clinician's own reading and the machine's are
indistinguishable is a library that slowly launders one into the other.

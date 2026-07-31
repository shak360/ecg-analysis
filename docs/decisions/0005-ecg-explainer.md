# 0005 — ECG explainer: hovering a label highlights the evidence for it

**Status:** accepted
**Decided by:** the user
**Date:** 2026-07-30

## What is wanted

Upload an ECG. Inferred labels appear beside it. Hovering a label highlights the
regions of the tracing that produced it, so the reasoning is visible rather than
asserted.

## Why this is possible here, and would not be with a model

The suggestion engine ([0003](0003-suggested-labels.md)) evaluates published
criteria against measured values. Each rule therefore already *knows* which
measurement it used, in which leads, over which time window. Turning that into a
highlight is bookkeeping, and the highlight is the actual reason — the same fact
the rule fired on.

A neural classifier could produce a label and then a saliency map, but saliency
shows where a model *attended*, not why a label is *correct*. Those come apart
routinely, and a confident-looking heat map over the wrong region is worse than
no explanation, because it manufactures the feeling of having checked.

So the explainer is not a feature bolted onto the suggestion engine. It is the
reason the engine is rule-based.

## Model

Each rule emits evidence carrying spatial extent:

```rust
pub enum RegionRole {
    /// The feature is present and supports the label.
    Supports,
    /// The feature is *absent* where the criterion requires absence —
    /// e.g. no septal q in I and V6 under LBBB. Rendered as an outline,
    /// since there is nothing to fill.
    SupportsByAbsence,
    /// The feature argues against the label but did not veto it.
    Against,
    /// Shown for orientation, not as evidence.
    Context,
}

pub struct EvidenceRegion {
    pub lead: LeadId,
    /// Seconds relative to the study's global QRS onset.
    pub t_start_s: f32,
    pub t_end_s: f32,
    pub role: RegionRole,
}

pub struct Evidence {
    /// "QRS duration 148 ms (>= 120 ms)"
    pub statement: String,
    pub measured: f32,
    pub threshold: f32,
    pub citation: &'static str,
    pub regions: Vec<EvidenceRegion>,
    /// True when the measurement's detection limit exceeds the threshold,
    /// so the rule could not be evaluated.
    pub below_detection_limit: bool,
}
```

Hovering a label highlights the union of its regions; hovering one evidence line
narrows to that line's regions.

## Regions per rule

Drawn from the criteria in `docs/engineering-spec.md` §6. **Needs clinical
review before shipping** — this is the part where being wrong is quiet.

| Label | Highlighted regions |
|---|---|
| LBBB | QRS onset→offset in all leads; broad monophasic R in V6; QS/rS in V1; septal q position in I and V6 (`SupportsByAbsence`) |
| RBBB | QRS onset→offset; terminal rsR′ in V1; slurred S in I and V6 |
| LVH (Sokolow-Lyon) | S nadir in V1 and R peak in whichever of V5/V6 was used — exactly the two amplitudes summed |
| LVH (Cornell) | R in aVL, S in V3 |
| Long QT | QRS onset → T offset, in the leads the T offset was taken from |
| STEMI, by territory | J → J+60 ms in each qualifying contiguous lead; reciprocal leads as `Against`/`Context` |
| Pathological Q | the Q wave itself in each qualifying lead |
| Poor R progression | R waves V1→V4, showing the failure to grow |
| First-degree AV block | P onset → QRS onset |
| Atrial fibrillation | TP segments on the rhythm strip (`SupportsByAbsence` for P), plus RR intervals |
| Fascicular block | QRS onset→offset (to show it is narrow) plus the axis-defining complexes in I, II, aVF |

`SupportsByAbsence` is the interesting one: several criteria turn on a feature
*not* being there. Rendering an outline where the missing feature would sit
explains far more than highlighting nothing.

## Constraints inherited from 0003

- Suggestions are never applied without acceptance; the explainer changes nothing
  about that.
- A suppressed rule can still be inspected, and its highlight shows *why it was
  suppressed* — for example the QRS interval that voids the ST criteria under
  LBBB.
- A rule gated out by uncertainty renders its regions in a distinct muted style
  with the detection limit stated. It must never look like a rule that fired.
- Absence of a highlight is not evidence of absence of disease, and the empty
  state says so.

## Open

Whether hovering should also mark the corresponding region on *other* studies in
the atlas, so a label's evidence can be compared across time. Attractive, and
probably the most useful thing the explainer could do given the product is about
serial change — but it depends on registration, so it is deferred until the
overlay exists.

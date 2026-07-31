# 0001 — Relative timeline: keep the year, store intervals

**Status:** accepted
**Decided by:** the user
**Date:** 2026-07-30

## Context

The atlas stores the user's own ECGs, de-identified at ingest. Under the HIPAA
Safe Harbor method, date elements more specific than the year are identifiers and
must be removed. But serial ECG comparison is *about* time — an evolving STEMI is
a story told in hours, a developing conduction disease in months. Stripping dates
entirely would remove the axis the product exists to display.

## Decision

Sort by time, **keep the year**, and express every other temporal fact as an
**interval relative to the neighbouring studies**:

> 2026 · 14 days 6 h after the previous · 2 h 12 min before the next

Intervals between events are not among the eighteen Safe Harbor identifiers, so
the clinical timeline survives intact while no specific date is stored.

## Consequences

### What is stored

Per entry: `acquisitionYear` (integer) and `offsetFromIndexMs` (signed, relative
to the subject's index study, which is offset 0). Nothing else temporal.

Ordering, the timeline axis, and "X after / Y before" all derive from
`offsetFromIndexMs`. No absolute timestamp is needed to render any of it.

### The anchor problem, and where the true date may live

Placing a *newly added* study on the timeline requires knowing the index study's
absolute date. That date is therefore held in a **separate local anchor record,
outside the atlas store, and excluded from every export.**

The distinction is the point:

- the **working store** on this machine may hold the anchor, so the user can add
  studies later and map back to reality when they need to;
- the **exported artifact** carries only year and offsets, and is what leaves the
  machine, if anything ever does.

An export must be producible without the anchor. If a future change makes the
export depend on the anchor, that change is wrong.

### Unit selection

Choose the unit from the interval's own magnitude, so an acute sequence is not
flattened into "0 days":

| interval        | rendered as              |
|-----------------|--------------------------|
| < 2 h           | minutes                  |
| < 48 h          | hours and minutes        |
| < 90 days       | days and hours           |
| ≥ 90 days       | months, then days        |

Never round an hours-scale interval to days. Two ECGs four hours apart during an
infarct are a different clinical situation from two on the same calendar day.

### Interaction with the overlay

Two distinct mappings, deliberately not the same one:

- the **timeline axis** is proportional to elapsed time, so unequal spacing is
  visible as unequal spacing;
- the **colour ramp** is by rank order, oldest to newest, because proportional
  colour becomes indistinguishable when one interval dwarfs the others.

### Also required by Safe Harbor

Ages over 89 must be aggregated into a single "90 or older" category. Age is not
otherwise needed by the pipeline except for sex- and age-dependent thresholds
(QTc, V2–V3 ST elevation criteria), which take bands rather than exact values.

### What this does and does not claim

Year-plus-intervals removes the date identifiers. It does **not** by itself make a
record de-identified — that depends on every other identifier being removed too,
which is the de-identification pipeline's job. The app reports what it removed and
never asserts that a record "is de-identified".

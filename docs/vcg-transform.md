# Deriving a vectorcardiogram from the 12-lead ECG

This document is the source of truth for the transform's coefficients and its
sign conventions. `crates/ecg-core/src/config.rs` §18 holds the same numbers, and
`vcg::tests::the_coefficients_match_the_document` parses the table below and
fails if the two ever disagree — the same arrangement `test/criteria-doc.test.ts`
uses for the diagnostic criteria.

## Why Kors and not Dower

Both derive Frank's orthogonal X/Y/Z leads from the standard 12. The **inverse
Dower** transform is older and more widely quoted; the **Kors regression**
transform is a least-squares fit against simultaneously recorded true Frank
leads, and in published comparisons it agrees more closely with them —
noticeably so for X and Y. We use Kors.

Two things follow that are easy to get wrong:

- The rows are **not orthogonal vectors**, and the derived X/Y/Z are **not
  mathematically orthogonal signals**. Kors is a regression *onto* anatomically
  orthogonal axes, not an orthogonalisation. Do not write a test asserting
  otherwise; it would be asserting something false.
- Only **eight** leads appear. III, aVR, aVL and aVF are exact linear
  combinations of I and II, so including them would double-count, not add
  information.

## The coefficients

Kors et al., *Eur Heart J* 1990;11:1083–92. Each row is the weight applied to
that lead's millivolts; the derived lead is the sum across the row.

| lead | X | Y | Z |
| --- | --- | --- | --- |
| I | 0.38 | -0.07 | 0.11 |
| II | -0.07 | 0.93 | -0.23 |
| V1 | -0.13 | 0.06 | -0.43 |
| V2 | 0.05 | -0.02 | -0.06 |
| V3 | -0.01 | -0.05 | -0.14 |
| V4 | 0.14 | 0.06 | -0.20 |
| V5 | 0.06 | -0.17 | -0.11 |
| V6 | 0.54 | 0.13 | 0.31 |

## Sign conventions, which carry the diagnosis

| axis | positive direction |
| --- | --- |
| X | **left** |
| Y | **inferior** (towards the feet) |
| Z | **posterior** (towards the back) |

Frank defined Z as posterior-positive. Many published VCG displays draw the
horizontal plane with *anterior* upward, which is the opposite convention — so a
plane definition and a coefficient row can each be individually correct and still
combine into a mirrored picture.

This matters more than a sign convention usually does. A wrong Z sign does not
produce a broken-looking plot; it produces a smooth, plausible loop **running the
wrong way round**. Rotation is the reading:

- A normal horizontal-plane QRS loop is **counterclockwise**.
- **Clockwise** horizontal rotation is a recognised pattern in posterior
  infarction and right ventricular hypertrophy.

So a flipped sign converts a normal study into an abnormal one, silently. The
plane definitions therefore live in Rust beside the coefficients
(`vcg_planes_json`), not in the drawing code, and `test/vcg-projection.test.ts`
pins them.

## What the loop's origin means

Each lead's ensemble beat is detrended to its PQ isoelectric point, so the origin
of the loop is the isoelectric point by construction. That is why a lead whose
baseline was never established is a **refusal** and not a footnote: an arbitrary
zero translates the entire loop off the origin, which is visually
indistinguishable from a displaced ST vector — a fabricated injury current.

## When a derived VCG does not mean anything

The 12-lead matrix is synthetic. The engineering spec (§4.3) states it is not
valid for instant-by-instant vector quantities unless rate and conduction were
stable, and requires `RR CV < 10%` with QRS `ρ > 0.98` across contributing beats,
flagging `NON_STATIONARY_10S` otherwise.

**Only the RR half of that is implemented as a gate, and the corpus is why.**
Measured over 1,355 PTB-XL records:

| statistic | p01 | p10 | p50 | p90 | fails the spec bar |
| --- | --- | --- | --- | --- | --- |
| min ρ across leads | 0.950 | 0.951 | 0.956 | — | 1,268 of 1,342 |
| RR CV | — | — | 0.025 | 0.129 | 184 of 1,355 |

`ensemble()` admits no beat below `RHO_OK_VECTOR` = 0.95, so the *minimum*
admitted ρ is by construction the worst beat that cleared the bar — always just
above it. Testing that minimum against 0.98 asks whether every admitted beat sat
far above the admission threshold, which the admission process makes almost
always false. It refused 92.7% of the corpus for a reason that had nothing to do
with stationarity.

So RR CV decides, and ρ is reported to the reader as a note. Making ρ gate would
need a statistic that is not floored by the screen — the ensemble's own
correlation, or a median rather than a minimum — not a lower threshold. With RR
CV alone, 81.9% of the corpus yields a loop and the 14.9% refused are the
irregular records.

Beyond that, a derived VCG requires the eight leads to have been recorded **at
the same instant**. On a 3×4 printout they were not: each column is a different
2.5-second window. A loop built from four different windows describes no beat
that ever happened, and this is exactly decidable from each lead's recorded time
offset rather than guessed at.

`crates/ecg-core/src/vcg.rs` enumerates the full refusal list.

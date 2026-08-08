# 0008 — Refuse a derived vector loop when the limb leads are not a standard 12-lead

**Status:** accepted
**Date:** 2026-08-08

## Context

The Kors regression maps a standard 12-lead recording onto Frank's X/Y/Z axes.
"Standard" is load-bearing: the coefficients were fitted against recordings made
with limb electrodes on the limbs and precordial electrodes at V1–V6, and the
transform is a statement about *that* geometry.

Nothing in the arithmetic knows this. Handed twelve channels labelled I through
V6 that were recorded some other way, it returns a loop — a normal-looking one,
with a plausible mean QRS vector and a sensible rotation — describing a heart in
a coordinate frame the recording was not made in. There is no outward sign at
all. Every trace still looks like an ECG, and the loop still looks like a loop.

Three electrodes define one plane, so a standard 12-lead carries its own proof:

```
III = II − I        aVR = −(I + II)/2
aVL = I − II/2      aVF = II − I/2
```

A cart computes those four, so they hold to within rounding. That makes the
question decidable rather than a matter of trusting the source.

### What the corpus says

`tools/survey-leads.ts`, over all 1,207 atlas records, scoring the worst of the
four relations per record as `rms(residual) / rms(the lead itself)`:

| | worst-relation residual |
| --- | --- |
| INCART, all 25 | 13.3% – 234.3% |
| `ptbxl:162` | 46.9% |
| next highest, `chapman_shaoxing:JS00016` | 8.0% |
| every other record | median 0.60%, p95 2.02%, p99 3.57% |

INCART is a 30-minute Holter corpus. Its twelve channels are recorded
independently from Holter electrode positions, so the standard names are labels
on channels that are not in the standard geometry — and not only the precordial
ones, which is what had previously been suspected. The limb leads are not an
Einthoven triangle either.

`ptbxl:162` fails alone among 1,046 PTB-XL records. Its III, aVL and I reconcile
at 0.1% while aVR is out by 31.5%; the electrode-swap hypothesis fits far worse,
at 131%. It is an oddity in the source, not a property of the corpus.

## Decision

`VcgRefusal::LimbLeadGeometry` refuses the loop when the worst relation exceeds
`VCG_LIMB_IDENTITY_MAX = 0.10`, naming the lead and the relation it should
satisfy. 26 records: the 25 INCART cases and `ptbxl:162`.

**The threshold is a gap in the data, not a round number.** It sits in the empty
band between 8.0% and 13.3%. That gap is real but it is *this* corpus's gap; the
survey tool is kept so recalibrating on new data is a re-run rather than a
judgement.

**The score is the worst relation, not the mean** — the same reasoning as
`rho_min` in the stationarity gate. One channel out of place is enough to put the
derived vector in the wrong frame, and averaging it against three correct ones
hides exactly the case worth refusing.

### It is measured on the raw samples, before conditioning

This is the part that is easy to get wrong, and we did, twice, before the
negative control caught it. The identity is linear; everything between ingest
and the ensemble beat is not.

| where it is scored | `ptbxl:2`, a record whose raw limb leads agree to <1% |
| --- | --- |
| raw samples, at `StudyBuilder` | 0.6% — correct |
| conditioned signal | 36% — `condition()` runs a slope-limited envelope and a PCHIP interpolation, neither of which distributes over a sum |
| ensemble beat | 64% — each lead is aligned to its own medoid, the quantity `alignment_spread_ms` reports |

Both later stages are correct and both destroy the relation. Scored downstream
the gate refuses nearly every record, for the pipeline rather than for the
recording. So `analyze()` measures it once from the vertices as they arrived and
carries the verdict on `StudyAnalysis`, in the same way `Stationarity` is
measured elsewhere and handed to the transform.

### Ordering, and what is not a failure

The check runs **after** `NotSimultaneous`. On a 3×4 printout the limb leads come
from four different 2.5 s windows, so the relations fail *because of* that;
checking geometry first would tell a reader their printout is not a standard
12-lead, which is both wrong and unactionable. Leads whose offset or sample grid
differs from lead I's are skipped for the same reason.

A record carrying none of III/aVR/aVL/aVF is **not** refused. The transform reads
only I, II and V1–V6, so an eight-lead export is a legitimate input; there is
simply no cross-check available. That is a different situation from failing one,
and it produces a note saying so. This differs deliberately from
`Stationarity::NotMeasured`, which does refuse: there the missing screen is one
this tool was supposed to run, and here the leads were never recorded.

## Consequences

**The frontal axis is still reported for these records, and that is
inconsistent.** It is computed from the same limb leads and is equally
uncomparable across corpora when they are not in standard geometry. Gating it
was considered and deliberately not done — it is a wider change to the
measurement surface than the loop, which is one view. Recorded here so the gap is
a known one rather than an oversight; anyone extending this should start by
deciding whether `axis` deserves the same treatment.

**25 teaching cases lose their vector loop.** INCART is the only Holter source in
the atlas. Their tracings, measurements, criteria and labels are untouched.

**A synthetic fixture had to be corrected.** `test/vcg-transform.test.ts` built
its twelve leads with independent per-lead amplitudes, including for the four
derived ones — a recording no cart could produce, describing a body with more
than three limbs. The gate refused it at 25%. The gate was right and the fixture
was wrong; it now derives them as a cart does.

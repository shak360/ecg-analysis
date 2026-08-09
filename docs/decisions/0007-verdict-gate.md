# 0007 — The ST gate refuses by default; missing evidence is a typed hole, not a passing boolean

**Status:** accepted
**Decided by:** the user
**Date:** 2026-07-31

## Context

`docs/engineering-spec.md` §5.5 specifies a five-state serial ST verdict behind
seven fail-closed preconditions. The code implements none of the preconditions
and two of the states, as a pair of booleans on `measure::StDelta`.

The gap is not cosmetic. Three things are wrong today, in ascending order of
danger.

**`below_detection_limit == false` does not mean the pair resolved the lead.**
`LeadMeasurements` derives `Default`, `sigma_st_mv` is a plain `f32`, and
`measure_lead` returns `..Default::default()` on both of its early-return paths.
A lead whose QRS boundaries were unmeasurable therefore reports σ = 0, and
`st_delta` computes MDC = 0 + 0.002 + 0.002 = 0.004 mV. The emitted row is
`{"delta":null,"mdc":0.0040,"notable":false,"belowLimit":false}`, which every
downstream reader treats as "resolved, no change" for a lead that was never
measured.

**n = 1 is fail-closed by accident.** `EnsembleBeat::measurable()` exists and is
never called. The only thing stopping a single-beat lead from being gated is
that `ensemble.rs` writes `INFINITY` into `sigma_mv`, which `measure_lead`
propagates. Anyone who later floors or sanitises that array for display silently
makes every single-beat lead gateable, and no test would fail.

**Nothing else the spec's gate asks for exists at all.** There is no source
tier, no ST-window coverage, no gain-confirmed flag, no high-pass filter
setting, no lead-reversal state, no rate term, no MDC floor, no `ρ` on the gain
term, and no confounder screening. `n_used` is computed and never passed into
`measure`. The detrend quality verdict is collapsed to a `Vec<f32>` one line
before it could be used. The identity residuals live in TypeScript and are
reduced to a boolean at the boundary.

The tempting shape for all of that missing evidence is `bool`, defaulting to
`true`. That is the shape this ADR exists to forbid. A `gain_confirmed: bool`
that nobody sets reads as "gain confirmed", and the resulting verdict is
indistinguishable from one backed by a calibration pulse. Decision 44's stated
reason is that conflating "not significant" with "no change" is how a phone
photo silently reassures a clinician; a defaulted boolean is the same failure
with a shorter code path.

## Decision

**The gate is built in full, it is fail-closed, and every precondition it cannot
evaluate is represented by a named enum variant that means "not measured" and
routes to a refusal.** No precondition input is a `bool`. No evidence type
implements `Default`. There is exactly one construction site where the WASM
boundary declares what it knows, and a test asserts what it still does not.

The consequence is stated plainly rather than engineered around: **on the real
pipeline, today, every lead of every pair returns `Unmeasurable`.** That is the
correct output of a gate whose evidence does not exist. The product continues to
render the measured ST levels and the serial difference with its uncertainty
band; it stops claiming that any difference is a change. `Significant` becomes
reachable only when the holes close, and closing each one is a visible edit at a
single site.

### 1. Module and public API

New module `crates/ecg-core/src/serial/gate.rs`; `serial/mod.rs` gains
`pub mod gate;`. The crate already exports `pub mod serial`, so every type below
is reachable from `crates/ecg-core/tests/` without a test-only accessor.

`LEAD_ORDER` moves from `wasm_api.rs` to `config.rs` under §0, because
`gate_all` needs it and `wasm_api` is a private module.

#### Source tier and what is known about it

```rust
/// Digitisation quality class for one study. Spec §5.1 tiers A–D.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceTier { Vector, Scan300, Photo, Poor }

impl SourceTier {
    /// mV, 1σ provenance floor. Spec §15.
    pub fn sigma_prov_mv(self) -> f32;
    /// mV, systematic bias, added to the MDC linearly. Spec §15.
    pub fn bias_mv(self) -> f32;
}

/// What the ingest path established about a study's tier.
///
/// `NotMeasured` is not a tier and must never be treated as one. The runtime
/// estimator the spec describes (grid pitch, edge rise, tile pitch spread,
/// illumination range) does not exist, so nothing may claim tier A merely
/// because the input happened to arrive as a PDF.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TierEvidence { Measured(SourceTier), NotMeasured }
```

`TierEvidence::NotMeasured` is **not** a refusal. It has two effects, both
conservative: the pair takes `MDC_FLOOR_OTHER_MV` rather than the vector floor,
and it contributes the `SourceTierMismatch` confounder, because a pair whose
tiers are unknown cannot be shown to match.

Its bias is `BIAS_POOR`. An unknown source is priced as the worst source.

#### The remaining evidence types

```rust
/// How this study's mV scale was established.
///
/// The discriminant matters more than the number: a relative σ of 0.015 read
/// off a calibration pulse and a relative σ of 0.015 assumed from a header
/// string are the same float and different claims, and the gate must be able to
/// tell them apart.
pub enum GainEvidence {
    FromPulse { relative_sigma: f32 },
    Assumed { relative_sigma: f32 },
    NotRecorded,
}

/// Fraction of the ST window backed by real samples rather than interpolation.
pub enum CoverageEvidence { Measured(f32), NotMeasured }

/// The limb-lead null-vector and Goldberger cross-checks.
pub enum IdentityEvidence { Passed, Failed { limb_residual: f32 }, NotChecked }

/// Which cable arrangement the study was recorded with.
///
/// The payload is a canonical name so that two studies can be compared for
/// equality. Einthoven's law is an identity in the *recorded* leads and holds
/// under an LA/RA reversal, so `IdentityEvidence::Passed` does not stand in for
/// this and the two are separate preconditions.
pub enum SwapEvidence { Determined(&'static str), NotDetermined }

/// The high-pass corner the cart printed, in Hz. 0.0 means none.
///
/// `Unreadable` is deliberately not a refusal: spec §8 risk 3 prices an
/// unreadable filter at +0.030 mV in quadrature, and reserves refusal for a
/// *known* mismatch. You cannot un-high-pass a signal, but you also cannot
/// refuse every paper ECG whose header did not survive the scan.
pub enum FilterEvidence { Recorded(f32), Unreadable }

/// Whether a confounder screen has run, and what it found.
///
/// `NotScreened` is the third state that a boolean cannot express. A screen
/// that has not run can neither confirm nor exclude the confounder, so it
/// counts as present.
pub enum Screen { Clear, Present, NotScreened }
```

None of these derives `Default`, and none exposes a method returning `bool`.
The only way to read one is through the gate's own matching, which is total.

#### Evidence structs

```rust
/// One study's side of the gate's evidence. No `Default` impl: every field must
/// be named at the construction site, so a new hole cannot be opened silently.
pub struct StudyEvidence {
    pub tier: TierEvidence,
    pub gain: GainEvidence,
    pub filter: FilterEvidence,
    pub swap: SwapEvidence,
    pub identity: IdentityEvidence,
    pub hr_bpm: Option<f64>,
    pub leads: Vec<LeadEvidence>,
}

pub struct LeadEvidence {
    pub lead: String,
    pub st_j_mv: Option<f32>,
    /// mV², everything independent between the two studies: σ_b², σ_n², σ_grid²,
    /// σ_t². `None` when unestimable, which is not the same as zero.
    pub var_indep_mv2: Option<f32>,
    /// mV, 1σ of the gain contribution at this lead's ST level. Kept separate
    /// from `var_indep_mv2` because ρ applies to this term and to nothing else.
    pub sigma_gain_mv: Option<f32>,
    pub n_beats: u32,
    pub coverage_st: CoverageEvidence,
}

/// Screens that apply to the pair rather than to one study.
pub struct ConfounderScreens {
    pub paper_speed: Screen,
    pub zero_sum_residual: Screen,
    pub pq_baseline: Screen,
    pub precordial_shift: Screen,
    pub ventricular_conduction_class: Screen,   // LVH / LBBB / paced
    pub rhythm_class: Screen,
    pub conduction: Screen,                     // computable today
}

/// How much of the gain error is shared between the two studies. Spec §16.
///
/// ρ > 0 *narrows* the interval, so it must be earned. `Default` is the only
/// value anything constructs today, because nothing in the pipeline evidences
/// that two studies came off the same cart at the same printed gain.
pub enum RhoGain { Default, SameSession, SameCartVector }

pub struct PairEvidence<'a> {
    pub reference: &'a StudyEvidence,
    pub comparison: &'a StudyEvidence,
    pub screens: &'a ConfounderScreens,
    pub rho_gain: RhoGain,
}
```

#### Verdict

```rust
pub enum Verdict {
    Significant { delta_mv: f32, ci_mv: (f32, f32), mdc_mv: f32 },
    Indeterminate { delta_mv: Option<f32>, mdc_mv: f32, reason: Indeterminacy, limiter: Limiter },
    BelowDetectionLimit { delta_mv: Option<f32>, mdc_mv: f32, limiter: Limiter },
    NoChange { delta_mv: f32, bound_mv: f32 },
    Unmeasurable { reason: Refusal },
}

pub enum Indeterminacy {
    /// |Δ| cleared the detection limit but not the clinical criterion.
    SubThreshold,
    /// |Δ| cleared both, and a confounder is present or unscreened.
    Confounded(Vec<Confounder>),
    /// |Δ| is inside the detection limit and the limit is too wide to exclude
    /// the clinical criterion. Not "no change": nothing was established.
    NotResolved,
}

pub enum Confounder {
    SourceTierMismatch,
    PaperSpeedUnverified,
    ZeroSumResidualHigh,
    HeartRateMismatch { delta_bpm: f64 },
    BeatsLessThanThree { fewest: u32 },
    PqBaselineNotFlat,
    PossiblePrecordialElectrodeShift,
    LvhOrLbbbOrPaced,
    RhythmClassChanged,
    ConductionChanged,
}

/// Why no verdict could be reached. Spec §5.5's `Refused`, which decision 44
/// names `Unmeasurable`.
pub enum Refusal {
    LeadAbsent,
    TooFewBeats { fewest: u32 },
    LowCoverage { worst: f32 },
    CoverageUnmeasured,
    IdentityFailed { limb_residual: f32 },
    IdentityUnchecked,
    GainUnconfirmed,
    GainNotRecorded,
    FilterMismatch { reference_hz: f32, comparison_hz: f32 },
    RateMismatch { delta_bpm: f64 },
    LeadReversalMismatch,
    LeadReversalUndetermined,
    NoStLevel,
    NoUncertainty,
}

pub enum WhichStudy { Reference, Comparison }

/// The study constraining the pair, and by how much.
pub struct Limiter {
    pub study: WhichStudy,
    /// mV; that study's own contribution, √(var_indep + σ_gain²) + bias.
    pub sigma_mv: f32,
    /// worse ÷ better, always ≥ 1.0.
    pub ratio: f32,
    /// True above `QUALITY_ASYMMETRY_NAME`, where one study is unambiguously
    /// the constraint and the UI must say which.
    pub dominant: bool,
}

/// Both bands for one lead. §5.3 requires both to be visible by default, so
/// they are returned together rather than behind an `incl_bio` argument — a
/// pair can be `Significant` in one band and `Indeterminate` in the other, and
/// showing only one of those is the whole failure §5.3 is warning about.
pub struct LeadVerdict {
    pub lead: String,
    pub delta_mv: Option<f32>,
    /// Digitisation only: what this pipeline validates and controls.
    pub digitization: Verdict,
    /// Plus σ_bio, the expected repeat-recording variation we do not control.
    pub with_bio: Verdict,
}
```

`Confounder` deliberately omits `gain_unverified`, `filter_setting_mismatch` and
`lead_reversal_mismatch` from the spec's list of twelve. All three are also
preconditions, and a precondition is strictly stronger than a downgrade, so
those variants would be unreachable. `ConductionChanged` is an addition to the
spec's list, justified by `serial/findings.rs`'s own module doc: a conduction
change is the condition under which every other number is to be read with
suspicion, and today a pair with a widened QRS still produces notable ST leads.

#### Functions

```rust
/// mV, 1σ repeat-recording variability for a lead. Spec §5.3.
/// An unrecognised name returns the largest of the three, never the smallest.
pub fn sigma_bio_mv(lead: &str) -> f32;

/// Every unmet pair-level precondition, in spec order.
///
/// Empty means the pair itself is gateable, not that any lead is. This is the
/// list the UI states once, above the table, rather than repeating twelve times.
pub fn pair_blockers(pair: &PairEvidence) -> Vec<Refusal>;

/// Gate one lead. Returns `Unmeasurable { LeadAbsent }` when the named lead is
/// missing from either study's evidence.
pub fn gate_st(pair: &PairEvidence, lead: &str) -> LeadVerdict;

/// Gate every lead in `LEAD_ORDER`, always twelve entries, in canonical order.
pub fn gate_all(pair: &PairEvidence) -> Vec<LeadVerdict>;
```

`gate_all` returns twelve rows unconditionally. The present `filter_map` over
`LEAD_ORDER` in `notable_st_leads` and `st_deltas_json` drops a lead that is
absent from either study, making "absent" indistinguishable from "not notable".
A missing lead is a fact about the study and must be said out loud.

### 2. The gate, precisely

Order of checks inside `gate_st`, first match wins:

1. lead missing from either study → `Unmeasurable { LeadAbsent }`
2. `min(n_beats) < MIN_BEATS_FOR_DELTA` → `TooFewBeats { fewest }`
3. either `coverage_st` is `NotMeasured` → `CoverageUnmeasured`;
   either `Measured(c)` with `c < COVERAGE_ST_MIN` → `LowCoverage { worst }`
4. either identity `NotChecked` → `IdentityUnchecked`; either `Failed` →
   `IdentityFailed { limb_residual }`
5. either gain `NotRecorded` → `GainNotRecorded`; either `Assumed` →
   `GainUnconfirmed`
6. both `Recorded` and unequal → `FilterMismatch { .. }`
7. both HR present and `|Δ| > DHR_REFUSE_BPM` → `RateMismatch { delta_bpm }`
8. both `Determined` and unequal → `LeadReversalMismatch`; either
   `NotDetermined` → `LeadReversalUndetermined`
9. either `st_j_mv` is `None` → `NoStLevel`
10. either `var_indep_mv2` or `sigma_gain_mv` is `None` → `NoUncertainty`

Pair-level refusals precede lead-level data refusals because a pair-level
problem is the one a clinician can act on: re-acquire, re-scan, check the cable.
`NoUncertainty` is the typed replacement for today's σ = 0 default and is the
reason `sigma_st_mv` becomes two `Option<f32>` fields.

Then, with `a` = reference and `b` = comparison:

```
indep = a.var_indep + b.var_indep
gain  = a.σ_gain² + b.σ_gain² − 2·ρ·a.σ_gain·b.σ_gain          // ρ from RhoGain
rate  = if |a.hr − b.hr| > DHR_ANNOTATE_BPM
            (DHR_ST_RATE_TERM_MV_BPM · |a.hr − b.hr|)²
        else 0
filt  = if either FilterEvidence::Unreadable
            FILTER_UNKNOWN_EXTRA_MV²                            // §8 risk 3
        else 0
bio   = 2 · sigma_bio_mv(lead)²                                 // with_bio band only
σ     = √(indep + max(gain, 0) + rate + filt + bio)
floor = if both TierEvidence::Measured(Vector) { MDC_FLOOR_VECTOR_MV }
        else { MDC_FLOOR_OTHER_MV }
mdc   = max(Z95·σ + a.bias + b.bias, floor)
Δ     = b.st_j − a.st_j
```

`max(gain, 0)` is load-bearing: an over-claimed ρ against unequal σ_gain drives
the term negative and the square root to NaN. The floor is applied **after** the
bias, exactly as written. Applying it to σ, or to `Z95·σ` before the bias,
narrows the MDC on good pairs, which is the one direction that manufactures
significance. Bias adds linearly and never in quadrature, per decision 48:
centroid pull and grid-removal asymmetry are systematic and not zero-mean.

Confounders present when: tier `NotMeasured` on either study or the two measured
tiers differ (`SourceTierMismatch`); `|Δhr| > DHR_INDETERMINATE_BPM`
(`HeartRateMismatch`); `min(n_beats) < BEATS_CONFOUNDER_MIN`
(`BeatsLessThanThree`); each `Screen` that is `Present` or `NotScreened`.

Decision branches, in order:

1. `|Δ| > mdc && |Δ| ≥ CLINICAL_DELTA_ST_MV && confounders.is_empty()` →
   `Significant { delta, ci: (Δ − mdc, Δ + mdc), mdc }`
2. `|Δ| > mdc && |Δ| ≥ CLINICAL_DELTA_ST_MV` → `Indeterminate { Confounded(..) }`
3. `|Δ| > mdc` → `Indeterminate { SubThreshold }`
4. `|Δ| + mdc < CLINICAL_DELTA_ST_MV && confounders.is_empty()` →
   `NoChange { bound: |Δ| + mdc }`
5. otherwise → `Indeterminate { NotResolved }`

Finally, an `Indeterminate { NotResolved }` whose `mdc ≥ CLINICAL_DELTA_ST_MV` is
rewritten to `BelowDetectionLimit`, which is the spec's own trigger at §8 risk 10
and carries the `indeterminateBelowThreshold` sentence: a clinically significant
change can be neither confirmed nor excluded.

The reason, not the state, is what the rewrite matches on, and only branch 5
qualifies. Branch 2 reaches `Confounded` only when `|Δ| > mdc`, so a confounded
verdict is one the pair *did* resolve and then declined to attribute; relabelling
it would attribute the refusal to a detection limit that was in fact cleared, and
— since `confounders()` is empty on every state but `Indeterminate` — would drop
the confounder list out of the payload, which is the only place most of the
confounders are ever named. Branch 3's `SubThreshold` requires
`mdc < |Δ| < CLINICAL_DELTA_ST_MV`, so its MDC is always under the criterion and
it never reaches the rewrite.

### 3. Three places this deviates from the spec's normative code

**Branch 4 consults the confounders; the spec's branch 3 does not.** As written
in §5.5, a pair with a high zero-sum residual or an unflat PQ baseline and a
small |Δ| returns `NoChange` — a positive claim of no change, backed by evidence
the gate has just been told is unreliable. That is the single most dangerous
output this product can produce and precisely what decision 44 exists to
prevent. `NoChange` is the only branch that asserts something; it gets at least
the guard that `Significant` gets.

**σ_bio counts both studies.** §5.5 says `2.0*sigma_bio(lead).powi(2)`; §5.3's
worked example computes `1.96·√(0.020²+0.020²+0.040²)+0.004 = 0.100 mV`, which
is one σ_bio² term. The two passages disagree. We take the normative code: both
studies carry an independent repositioning error in the same lead, so both are
in the sum. The consequence is that the perfect A↔A V2 pair has an
acquisition-inclusive MDC of 0.128 mV, not 0.100, so the spec's headline
sentence about sitting "right at the 0.1 mV decision threshold" understates the
floor rather than overstating it. The direction of the error matters: 1× would
narrow the band on the strength of an arithmetic slip.

**`BelowDetectionLimit` is a refinement of `Indeterminate { NotResolved }`, not a
fifth branch.** The §5.5 worked check names V6 on a C↔C pair `Indeterminate`; §8
risk 10 says `mdc ≥ CLINICAL_DELTA_ST_MV` is `BelowDetectionLimit`. Both describe
the same situation — a difference the pair could not resolve — and risk 10
requires the two to render in the same muted style, so on that branch nothing
clinical turns on the choice and we take the more specific name because it
selects the more specific copy string. It does not extend to a confounded
verdict: there the state change is not cosmetic, because it silently empties
`confounders()`.

### 4. Constants

Only constants this increment consumes are added. §9's signal-quality block is
the cautionary precedent: twenty constants defined, none used, and nothing in
the file says so. Under new `// ---- §15 ... ----` and `// ---- §16 ... ----`
banners in `config.rs`, after §14:

```rust
/// mV, 1σ; tier A, vector PDF with exact path geometry. Spec §5.1, §15.
pub const SIGMA_PROV_VECTOR: f32 = 0.010;
/// mV, 1σ; tier B, ≥300 dpi flatbed, rotation under 1°, no perspective.
pub const SIGMA_PROV_SCAN300: f32 = 0.025;
/// mV, 1σ; tier C, ≥200 dpi effective phone photo, ≤3°, ≤1.5% perspective.
pub const SIGMA_PROV_PHOTO: f32 = 0.040;
/// mV, 1σ; tier D, ~110 dpi with ≥3% perspective. No ST delta survives this.
pub const SIGMA_PROV_POOR: f32 = 0.087;

/// mV; systematic amplitude offset for a tier-A source. Spec §15.
///
/// Bias enters the MDC linearly, never in quadrature. Trace-centroid pull and
/// grid-removal asymmetry do not average away and are not zero-mean, so folding
/// them into an RSS understates the band by roughly the bias itself and
/// manufactures significance in the leads a reader is most likely to act on.
pub const BIAS_VECTOR: f32 = 0.002;
/// mV; tier B. Spec §15.
pub const BIAS_SCAN300: f32 = 0.005;
/// mV; tier C. Spec §15.
pub const BIAS_PHOTO: f32 = 0.012;
/// mV; tier D, and the value an unmeasured tier is priced at. Spec §15.
pub const BIAS_POOR: f32 = 0.035;

/// mV, 1σ; repeat-recording variability in a limb lead. Spec §5.3, §15.
///
/// This is not our error. Trained technicians place a precordial electrode
/// within 1 cm in about half of men and a fifth of women, and 1 cm of V2
/// displacement is 48±28 µV. The number belongs in the band a clinician reads
/// because it is in the measurement they are reading, whoever caused it.
pub const SIGMA_BIO_LIMB: f32 = 0.025;
/// mV, 1σ; V1–V3, where precordial placement dominates. Spec §5.3.
pub const SIGMA_BIO_V1_V3: f32 = 0.040;
/// mV, 1σ; V4–V6. Spec §5.3.
pub const SIGMA_BIO_V4_V6: f32 = 0.030;

/// Standard normal deviate for a two-sided 95% interval. Spec §16.
pub const Z95: f32 = 1.96;

/// mV; the ST change a serial difference must also exceed. UDMI-4, spec §16.
///
/// A second hurdle, not an alternative to the detection limit. A pair good
/// enough to resolve 0.03 mV must still not announce a 0.04 mV shift, because
/// nothing clinical follows from it and each such announcement spends the
/// reader's attention on noise until they stop reading.
pub const CLINICAL_DELTA_ST_MV: f32 = 0.10;

/// mV; MDC floor when both studies are measured tier A. Spec §16.
///
/// The floor exists because the runtime σ̂ is an estimate and a confidently
/// small estimate is still an estimate. Below this the arithmetic outruns what
/// any paper-derived pair has been shown to resolve.
pub const MDC_FLOOR_VECTOR_MV: f32 = 0.05;
/// mV; MDC floor for every other pair, including any pair with an unmeasured
/// tier. Spec §16.
pub const MDC_FLOOR_OTHER_MV: f32 = 0.10;

/// Shared fraction of the gain error, same cart and identical printed gain and
/// speed strings and both vector. Spec §16, decision 47.
///
/// ρ > 0 narrows the interval, so it must be positively evidenced. Over-claimed
/// correlation manufactures significance, and it does so invisibly: the delta
/// does not move, only the band it is compared against.
pub const RHO_GAIN_SAME_CART_VECTOR: f32 = 0.90;
/// Shared fraction of the gain error within one recording session. Spec §16.
pub const RHO_GAIN_SAME_SESSION: f32 = 0.50;
/// Shared fraction of the gain error when provenance is unknown, which is
/// every pair this pipeline currently sees. Spec §16.
pub const RHO_GAIN_DEFAULT: f32 = 0.00;

/// bpm; above this the rate difference enters the variance and is annotated.
/// Spec §16.
pub const DHR_ANNOTATE_BPM: f64 = 10.0;
/// bpm; above this a rate difference is a hard confounder. Spec §16, §5.5.
pub const DHR_INDETERMINATE_BPM: f64 = 20.0;
/// bpm; above this ST and QT deltas are refused outright. Spec §16, §5.5.
///
/// Three distinct thresholds on the same quantity, easily conflated: 10 widens
/// the band, 20 downgrades the verdict, 35 declines to answer.
pub const DHR_REFUSE_BPM: f64 = 35.0;
/// mV per bpm; the rate-difference term, squared into the variance. Spec §16.
pub const DHR_ST_RATE_TERM_MV_BPM: f32 = 0.002;

/// mV, 1σ; added in quadrature when a study's high-pass corner is unreadable.
/// Spec §16, §8 risk 3.
///
/// A causal 0.5 Hz high-pass produced J-point deviation averaging 0.30 mV in 42
/// of 45 patients (Buendía-Fuentes 2012). A *known* mismatch is therefore a
/// refusal, because you cannot un-high-pass a signal. An unreadable header is
/// not: refusing every paper ECG whose header did not survive the scan would
/// decline the majority of real inputs on a suspicion, so it is priced instead.
pub const FILTER_UNKNOWN_EXTRA_MV: f32 = 0.030;

/// Beats an ensemble needs before a delta may be gated at all. Spec §16.
///
/// At n = 1 the beat-to-beat spread is unestimable, not small. The lead is
/// excluded from gating rather than reported with a narrow band.
pub const MIN_BEATS_FOR_DELTA: u32 = 2;

/// Beats below which the count is a hard confounder even though the pair passes
/// `MIN_BEATS_FOR_DELTA`. Spec §5.5, the `beats_lt_3` confounder.
pub const BEATS_CONFOUNDER_MIN: u32 = 3;

/// Fraction of the ST window that must be backed by real samples. Spec §16.
pub const COVERAGE_ST_MIN: f32 = 0.90;

/// σ ratio above which one study is unambiguously the pair's constraint and the
/// UI must name it rather than describing the pair as jointly limited. Spec §16.
pub const QUALITY_ASYMMETRY_NAME: f32 = 3.0;

/// mV; the quantum ΔST is rendered to. Spec decision 49.
///
/// Never display more precision than the band. A bare "0.15 mV new ST
/// elevation" at three decimals against a 0.06 mV limit is the exact artifact
/// this product must not produce.
pub const ST_DISPLAY_QUANTUM_MV: f32 = 0.05;
```

`measure::CLINICAL_ST_MV` is deleted; every use becomes
`config::CLINICAL_DELTA_ST_MV`. The JSON key stays `clinicalThresholdMv` so the
TypeScript side does not move twice.

Not added yet, because nothing consumes them: `Z_HOLM_12`, `SIGMA_MULT_CAP`,
`T_INFLATE_N2`, `T_INFLATE_N3`, `SIGMA_ISO_*`, `SIGMA_TRACE_CENTROID_PX`, and
all of §17.

### 5. Changes to `measure.rs`

`sigma_st_mv: f32` is replaced by two fields, so that `Default` is fail-closed
and so that ρ has a term to apply to:

```rust
/// mV, 1σ beat-to-beat spread at the J point. `None` when unestimable — at
/// n = 1, or on any path that returned before measuring. Zero would read as
/// perfect certainty about a lead nobody looked at.
pub sigma_ens_mv: Option<f32>,
/// mV, 1σ gain contribution at this lead's ST level. `None` for the same
/// reasons. Separate from `sigma_ens_mv` because ρ applies here and nowhere
/// else, and folding the two together makes an evidenced correlation
/// unrepresentable.
pub sigma_gain_mv: Option<f32>,
```

`measure_study` gains an `n_used: &[u32]` argument and `measure_lead` an
`n_beats: u32`; `sigma_ens_mv` is `None` when `n_beats < MIN_BEATS_FOR_DELTA`,
independently of what is in `sigma_mv`. `EnsembleBeat::measurable()` stops being
dead code. `st_delta`, `StDelta` and `CLINICAL_ST_MV` are deleted.

`measurements_json`'s `sigmaSt` keeps emitting the RSS of the two, or `null`
when either is `None`.

### 6. The boundary, and the one place the holes live

`set_calibration_quality(gain_relative_sigma: f32, bias_mv: f32)` is replaced by

```rust
pub fn set_gain(&mut self, from_calibration_pulse: bool, relative_sigma: f32);
```

The caller no longer supplies a bias. Bias comes from the tier, and while the
tier is unmeasured it is `BIAS_POOR`. This removes the hardcoded `0.002` from
`web/src/engine/core.ts:129`, which is a live 0004 violation.

`StudyAnalysis` gains one public method, in a plain `impl` block:

```rust
/// This study's side of the gate's evidence, as the pipeline can supply it today.
///
/// This is the single site where a hole is declared. Every `NotMeasured` /
/// `NotChecked` / `NotDetermined` / `Unreadable` below is a pipeline capability
/// that does not exist, named so that closing it is one visible edit here and a
/// changed assertion in `the_boundary_declares_every_hole_it_still_has`.
pub fn evidence(&self) -> StudyEvidence;
```

which constructs, today and only today:

| field | value | why |
|---|---|---|
| `tier` | `TierEvidence::NotMeasured` | no runtime tier estimator (§5.1) |
| `gain` | from `set_gain`, else `NotRecorded` | TS knows `cal.source`; this plumbs it |
| `filter` | `FilterEvidence::Unreadable` | header text is not parsed |
| `swap` | `SwapEvidence::NotDetermined` | no permutation search (§17) |
| `hr_bpm` | `Some` when finite | already available |
| `leads[].n_beats` | `self.n_used[i]` | already available, never plumbed |
| `leads[].coverage_st` | `CoverageEvidence::NotMeasured` | the resample validity mask is dropped at `wasm_api.rs:132` |
| `leads[].var_indep_mv2` | `sigma_ens_mv²` | conservative by ~√10; see Consequences |
| `leads[].sigma_gain_mv` | `sigma_gain_mv` | |

`ConfounderScreens` is built at the pair level with `conduction` taken from
`serial::findings` (`Clear` when both durations are measurable and the change is
under threshold, `Present` when it is over, `NotScreened` when either duration
is unmeasurable) and every other field `NotScreened`.

New exports, replacing `notable_st_leads` and `st_deltas_json`:

```rust
#[wasm_bindgen] pub fn st_verdicts_json(reference: &StudyAnalysis, comparison: &StudyAnalysis) -> String;
#[wasm_bindgen] pub fn significant_st_leads(reference: &StudyAnalysis, comparison: &StudyAnalysis) -> Vec<String>;
```

Both compute the measurements once and share them, rather than re-running
`measure_study` per entry point as the present pair does.

### 7. JSON shape

```json
{
  "clinicalThresholdMv": 0.1,
  "stDisplayQuantumMv": 0.05,
  "pairBlockers": [
    { "code": "CoverageUnmeasured",
      "sentence": "ST-window coverage is not measured yet, so no serial ST change can be confirmed or excluded." }
  ],
  "leads": [
    {
      "lead": "V2",
      "deltaMv": 0.2503,
      "digitization": {
        "state": "Unmeasurable",
        "reason": "CoverageUnmeasured",
        "mdcMv": null, "ciMv": null, "boundMv": null,
        "confounders": [], "limiter": null
      },
      "withBio": { "state": "Unmeasurable", "reason": "CoverageUnmeasured",
                   "mdcMv": null, "ciMv": null, "boundMv": null,
                   "confounders": [], "limiter": null }
    }
  ]
}
```

`state` is one of `Significant`, `Indeterminate`, `BelowDetectionLimit`,
`NoChange`, `Unmeasurable`. `reason` is the `Refusal` or `Indeterminacy` variant
name, `null` on the other states. `ciMv` is a two-element array on `Significant`
and `null` elsewhere; `boundMv` is set on `NoChange` only. `limiter` is
`{"study":"reference"|"comparison","sigmaMv":0.0261,"ratio":1.0,"dominant":false}`
or `null`. All twelve leads are always present. `deltaMv` is `null` when either
study lacks the lead or the level.

`web/src/engine/protocol.ts` replaces `StDelta` with a `LeadVerdict` mirror of
this shape and adds `pairBlockerSets: PairBlocker[][]` and
`stDisplayQuantumMv: number` to `ComparisonSnapshot`. `deltaSets` becomes
`verdictSets: LeadVerdict[][]`. Nothing here is a `Float32Array`, so
`snapshotTransfers` is unchanged.

`web/src/main.ts`: `renderMeasurements` takes the threshold and the quantum from
the snapshot instead of hardcoding "0.10 mV" twice; ΔST renders quantised to
`stDisplayQuantumMv`; `BelowDetectionLimit` and `Unmeasurable` render in the
same muted style, per §8 risk 10, so that a suppressed number never reads as
reassurance; the delta is suppressed entirely rather than printed bare when the
state is `BelowDetectionLimit`, per decision 50. The dead `tr.unresolvable
.delta` rules in `app.css` go with the class they never matched.

## Tests

New, in `serial/gate.rs`'s `mod tests`, against a `complete_evidence()` fixture
that supplies every hole so that the branches are reachable:

- `a_lead_built_from_one_beat_is_unmeasurable_not_unchanged`
- `unmeasured_st_window_coverage_refuses_rather_than_assuming_full_coverage`
- `an_unchecked_lead_identity_refuses_rather_than_passing`
- `a_gain_that_was_assumed_rather_than_measured_refuses`
- `an_undetermined_electrode_arrangement_refuses`
- `a_rate_difference_past_thirty_five_bpm_refuses`
- `two_studies_whose_high_pass_filters_differ_refuse`
- `an_unreadable_high_pass_filter_widens_the_band_rather_than_refusing`
- `the_first_unmet_precondition_in_spec_order_is_the_one_reported`
- `every_unmet_precondition_appears_in_the_pair_blockers`
- `a_change_clearing_both_the_detection_limit_and_the_clinical_criterion_is_significant`
- `a_significant_verdict_carries_the_uncorrected_interval_that_produced_it`
- `a_change_clearing_the_detection_limit_but_not_the_criterion_is_indeterminate`
- `a_flat_lead_that_positively_excludes_the_criterion_reads_as_no_change`
- `no_change_is_never_reached_by_a_band_too_wide_to_exclude_the_criterion`
- `a_pair_that_cannot_resolve_the_criterion_reads_as_below_the_detection_limit`
- `an_unscreened_confounder_downgrades_significant_to_indeterminate`
- `an_unscreened_confounder_also_blocks_no_change`
- `a_conduction_change_downgrades_every_lead_in_the_pair`
- `a_rate_difference_past_twenty_bpm_downgrades_but_does_not_refuse`
- `two_gated_beats_pass_the_precondition_and_still_confound`
- `the_mdc_floor_is_applied_after_the_bias_and_never_before_it`
- `a_vector_to_vector_pair_gets_the_tighter_floor_and_no_other_pair_does`
- `an_unmeasured_source_tier_takes_the_wider_floor_and_the_worst_bias`
- `bias_adds_linearly_and_never_in_quadrature`
- `an_unevidenced_gain_correlation_is_zero_and_widens_rather_than_narrows`
- `an_over_claimed_gain_correlation_cannot_drive_the_variance_negative`
- `a_rate_difference_under_ten_bpm_adds_no_rate_term`
- `the_bio_band_is_never_narrower_than_the_digitization_band`
- `both_bands_are_returned_for_every_lead_because_either_alone_misleads`
- `the_bio_term_counts_both_studies_repositioning_error`
- `a_lead_present_in_only_one_study_is_reported_rather_than_omitted`
- `the_specs_worked_verdicts_reproduce_at_every_tier` — the §5.5 fixture check,
  built from the §5.1 **σ_ST (RSS)** row 0.020 / 0.026 / 0.038 / 0.087, *not*
  from `SIGMA_PROV_*`. The two coincide only at tier D, so a D-only test would
  not catch the substitution, and using σ_prov at tier A halves the A↔A MDC.

New, in `measure.rs`:

- `a_lead_that_measured_nothing_reports_no_uncertainty_rather_than_zero`
- `a_single_beat_lead_has_no_estimable_ensemble_sigma`
- `the_gain_term_is_reported_separately_from_the_beat_to_beat_term`

New, in `wasm_api.rs`:

- `the_boundary_declares_every_hole_it_still_has` — asserts `evidence()` yields
  `NotMeasured` / `NotChecked` / `NotDetermined` / `Unreadable` for exactly the
  five open holes. It fails when a hole closes, which is the point: closing one
  is a deliberate act with a visible diff.

Changed:

- `acceptance.rs::flags_exactly_the_injected_leads` becomes
  `the_gate_refuses_every_lead_while_the_evidence_it_needs_is_unmeasured`,
  asserting the refusal *and its reason*. Its power as a regression test on the
  measurement path moves to a sibling,
  `the_injected_leads_are_significant_once_the_missing_evidence_is_supplied`,
  which takes `a.evidence()` and `b.evidence()`, overwrites the hole fields (the
  structs are `pub`, so no test-only API is needed), and asserts V2/V3/V4
  `Significant` and the other nine not.
- `acceptance.rs::refuses_to_flag_anything_on_a_noisy_unchanged_pair` keeps its
  name and its assertion. It passes trivially today, because everything refuses.
  Say so in the test body: it is retained as the guard that must still hold when
  the holes close, not as evidence that anything works now.
- The five `st_delta` unit tests in `measure.rs` are deleted with the function.
  Their intent survives as, respectively,
  `a_change_clearing_both_...`, `..._not_the_criterion_is_indeterminate`,
  `a_pair_that_cannot_resolve_the_criterion_...`,
  `a_lead_built_from_one_beat_...`, and
  `a_change_clearing_the_detection_limit_but_not_the_criterion_...`.
- `test/end-to-end.test.ts`: `"exactly the injected leads are flagged notable"`
  becomes `"no lead is claimed significant while the gate's evidence is
  unmeasured"`; `"baseline wander alone is never reported as a change"` keeps its
  name and asserts no `Significant`. Add `"the snapshot names the evidence the
  gate is missing"` and `"a lead nothing was measured on never reads as no
  change"` — the second is the regression test for the `belowLimit:false`
  behaviour described at the top of this ADR.
- `"the injected ST elevation survives the round trip through a PDF"` and
  `"the leads that were not touched stay untouched"` change only their field
  path, from `deltaSets[..].delta` to `verdictSets[..].deltaMv`.

Run `npm run wasm:dev` before `npm run test:web`; the release `npm run wasm`
has no network for binaryen and fails here.

## Consequences

- The product reports no ST change until the holes close. It still shows every
  ST level, every serial difference, and the band around it, and it now says
  which evidence it lacks instead of implying it has it.
- The MDC is currently conservative by roughly √10 in the opposite direction:
  `sigma_ens_mv` is read at the single J-point sample while `st_j_mv` is a 20 ms
  mean of ten. With the 0.05/0.10 mV floors in place the floor will usually
  dominate anyway, so fixing the estimator and tuning the floor are the same
  decision and neither is made here.
- `Significant` is unreachable on the real path and reachable in tests. That is
  the honest state of the pipeline, and it is visible in one grep for
  `NotMeasured`.
- Closing a hole is four edits: measure it, construct the `Measured` variant in
  `StudyAnalysis::evidence`, update
  `the_boundary_declares_every_hole_it_still_has`, and delete the row from the
  table in §6 above.


**`identity` closed, 2026-08-09.** The residual is measured in Rust now, on the
samples as they arrive, by `vcg::limb_geometry` — the same measurement that
refuses a vector loop whose limb leads are not in standard 12-lead geometry.
`evidence()` reports `Passed` / `Failed { limb_residual }` / `NotChecked`, the
last only when a record carries none of III/aVR/aVL/aVF and there is nothing to
compare. The TypeScript `checkIdentities` is deleted; one computation answers
the question. Threshold and calibration: `config::LIMB_IDENTITY_MAX`, and
decision 0008.

Closing it did **not** open the gate. Three blockers remain unconditional —
`LeadReversalUndetermined`, `GainNotRecorded` and `CoverageUnmeasured` — and
`the_payload_names_the_evidence_the_gate_is_missing` now asserts that, so the
next reader does not have to rediscover why nothing changed.

## Out of scope

The runtime σ̂ of §5.4 and its evidence channels, the quality index and the A–D
grades. Multiplicity: regional coherence, Holm–Bonferroni, `Z_HOLM_12`, the
contiguous lead groups. Runtime source-tier measurement. ST-window coverage
plumbing, which requires carrying the resample validity mask through
`condition`, `PreparedPanel`, `Built` and the ensemble, and whose spec
definition depends on `CONF_MEASURE`, a §12 raster constant with no raster
pipeline behind it. Lead identity into Rust, and the reconciliation of
`layout.ts`'s `EINTHOVEN_MAX` 0.20 / `GOLDBERGER_MAX` 0.30 with §17's
`ID_LIMB_PASS` 0.03 / `ID_LIMB_MARGINAL` 0.08 — different normalisations, not a
rename. Lead-reversal and swap detection, and all of §17. Reading the high-pass
corner out of header text. The six unscreened confounders. Interval gates for
QRS and QT. Decision 50's photo suppression and its fiducial-review release.
SQI. The `MorphologyOnly` panel that is currently measured as though it had been
baseline-corrected, which is a live correctness problem and not a gating one.
The unescaped filename interpolation in `renderMeasurements`.

## Rejected alternatives

**`Option<T>` for the missing evidence:** invites `unwrap_or(true)`, and the
call site reads as ordinary Rust rather than as a hole.

**A `bool` per precondition, defaulted false:** fails closed today and fails
open the first time someone adds `..Default::default()` to the evidence struct,
which is exactly how `sigma_st_mv` became 0.0 on the unmeasurable path.

**Stub the unmeasurable preconditions optimistically — coverage 1.0, tier A for
vector input — so the gate produces verdicts now:** the numbers would be
indistinguishable from measured ones, and the first photo pair would inherit
tier A's floor. This is the failure decision 44 names by hand.

**Keep `st_delta` alongside the new gate so the UI keeps working:** two gates
that disagree, with the looser one wired to the screen.

**Ship the gate but leave `notable` on the JSON:** the same thing through a
field name.

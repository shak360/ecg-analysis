//! The verdict gate: may a serial ST difference be called a change?
//!
//! # Why every input here is an enum and none of them is a `bool`
//!
//! The gate has seven preconditions and this pipeline can evaluate two of them.
//! The tempting shape for the other five is a `bool` that defaults to `true`,
//! and that shape is the reason this module exists. A `gain_confirmed: bool`
//! nobody sets reads as "gain confirmed", and the verdict it produces is
//! indistinguishable from one backed by an actual calibration pulse. The same
//! failure already happened once in this crate: `LeadMeasurements` derived
//! `Default`, a lead whose QRS boundaries were unmeasurable reported σ = 0, and
//! the resulting row said `{"delta":null,"mdc":0.0040,"belowLimit":false}` —
//! "resolved, no change" for a lead nobody ever looked at.
//!
//! So each precondition input carries a variant that means *not measured*, that
//! variant routes to a refusal, and no type here implements `Default` or exposes
//! a method returning `bool`. The only way to read one is through this module's
//! own matching, which is total. Adding a field to `StudyEvidence` breaks every
//! construction site, which is the point: a new hole cannot be opened silently.
//!
//! # What that costs today, stated plainly
//!
//! On the real pipeline, right now, every lead of every pair returns
//! [`Verdict::Unmeasurable`]. That is the correct output of a gate whose
//! evidence does not exist. The product still renders the measured ST levels and
//! the serial difference with its uncertainty band; it stops claiming that any
//! difference is a change. [`Verdict::Significant`] becomes reachable when the
//! holes close, and closing each one is a visible edit at a single site —
//! `StudyAnalysis::evidence`, guarded by a test that fails when a hole closes.
//!
//! # Why `NoChange` is the branch that is guarded hardest
//!
//! Four of the five states decline to assert something. `NoChange` is the one
//! that asserts, so it requires positively excluding the clinical criterion —
//! `|Δ| + MDC < CLINICAL_DELTA_ST_MV`, a TOST-style equivalence bound — *and* an
//! empty confounder list. The spec's own normative code omits that second guard,
//! which would let a pair with an unflat PQ baseline and a small |Δ| return a
//! positive claim of no change backed by evidence the gate has just been told is
//! unreliable. "No significant change" and "no change" read identically to a
//! tired clinician at 3 a.m.; only one of them is ever true here.

use crate::config::{
    BEATS_CONFOUNDER_MIN, BIAS_PHOTO, BIAS_POOR, BIAS_SCAN300, BIAS_VECTOR, CLINICAL_DELTA_ST_MV,
    COVERAGE_ST_MIN, DHR_ANNOTATE_BPM, DHR_INDETERMINATE_BPM, DHR_REFUSE_BPM,
    DHR_ST_RATE_TERM_MV_BPM, FILTER_UNKNOWN_EXTRA_MV, LEAD_ORDER, MDC_FLOOR_OTHER_MV,
    MDC_FLOOR_VECTOR_MV, MIN_BEATS_FOR_DELTA, QUALITY_ASYMMETRY_NAME, RHO_GAIN_DEFAULT,
    RHO_GAIN_SAME_CART_VECTOR, RHO_GAIN_SAME_SESSION, SIGMA_BIO_LIMB, SIGMA_BIO_V1_V3,
    SIGMA_BIO_V4_V6, SIGMA_PROV_PHOTO, SIGMA_PROV_POOR, SIGMA_PROV_SCAN300, SIGMA_PROV_VECTOR, Z95,
};

// ---------------------------------------------------------------------------
// Source tier, and what is known about it
// ---------------------------------------------------------------------------

/// Digitisation quality class for one study. Spec §5.1 tiers A–D.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceTier {
    Vector,
    Scan300,
    Photo,
    Poor,
}

impl SourceTier {
    /// mV, 1σ provenance floor. Spec §15.
    pub fn sigma_prov_mv(self) -> f32 {
        match self {
            SourceTier::Vector => SIGMA_PROV_VECTOR,
            SourceTier::Scan300 => SIGMA_PROV_SCAN300,
            SourceTier::Photo => SIGMA_PROV_PHOTO,
            SourceTier::Poor => SIGMA_PROV_POOR,
        }
    }

    /// mV, systematic bias, added to the MDC linearly. Spec §15.
    pub fn bias_mv(self) -> f32 {
        match self {
            SourceTier::Vector => BIAS_VECTOR,
            SourceTier::Scan300 => BIAS_SCAN300,
            SourceTier::Photo => BIAS_PHOTO,
            SourceTier::Poor => BIAS_POOR,
        }
    }
}

/// What the ingest path established about a study's tier.
///
/// `NotMeasured` is not a tier and must never be treated as one. The runtime
/// estimator the spec describes (grid pitch, edge rise, tile pitch spread,
/// illumination range) does not exist, so nothing may claim tier A merely
/// because the input happened to arrive as a PDF.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TierEvidence {
    Measured(SourceTier),
    NotMeasured,
}

impl TierEvidence {
    /// mV of systematic bias this study contributes.
    ///
    /// An unmeasured tier is priced as the worst source there is. The
    /// alternative — pricing it as tier A because the file was a PDF — is how a
    /// phone photo of a printout inherits a vector pipeline's error budget.
    fn bias_mv(self) -> f32 {
        match self {
            TierEvidence::Measured(t) => t.bias_mv(),
            TierEvidence::NotMeasured => BIAS_POOR,
        }
    }
}

// ---------------------------------------------------------------------------
// The remaining evidence types
// ---------------------------------------------------------------------------

/// How this study's mV scale was established.
///
/// The discriminant matters more than the number: a relative σ of 0.015 read
/// off a calibration pulse and a relative σ of 0.015 assumed from a header
/// string are the same float and different claims, and the gate must be able to
/// tell them apart.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum GainEvidence {
    FromPulse { relative_sigma: f32 },
    Assumed { relative_sigma: f32 },
    NotRecorded,
}

impl GainEvidence {
    /// The relative 1σ to propagate into an amplitude, when there is one.
    ///
    /// `NotRecorded` yields `None` rather than a conservative stand-in. A number
    /// invented here would flow into `sigma_gain_mv` and out through
    /// `measurements_json` looking exactly like a measured one.
    pub fn relative_sigma(self) -> Option<f32> {
        match self {
            GainEvidence::FromPulse { relative_sigma }
            | GainEvidence::Assumed { relative_sigma } => Some(relative_sigma),
            GainEvidence::NotRecorded => None,
        }
    }
}

/// Fraction of the ST window backed by real samples rather than interpolation.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CoverageEvidence {
    Measured(f32),
    NotMeasured,
}

/// The limb-lead null-vector and Goldberger cross-checks.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum IdentityEvidence {
    Passed,
    Failed { limb_residual: f32 },
    NotChecked,
}

/// Which cable arrangement the study was recorded with.
///
/// The payload is a canonical name so that two studies can be compared for
/// equality. Einthoven's law is an identity in the *recorded* leads and holds
/// under an LA/RA reversal, so `IdentityEvidence::Passed` does not stand in for
/// this and the two are separate preconditions.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SwapEvidence {
    Determined(&'static str),
    NotDetermined,
}

/// The high-pass corner the cart printed, in Hz. 0.0 means none.
///
/// `Unreadable` is deliberately not a refusal: spec §8 risk 3 prices an
/// unreadable filter at +0.030 mV in quadrature, and reserves refusal for a
/// *known* mismatch. You cannot un-high-pass a signal, but you also cannot
/// refuse every paper ECG whose header did not survive the scan.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum FilterEvidence {
    Recorded(f32),
    Unreadable,
}

/// Whether a confounder screen has run, and what it found.
///
/// `NotScreened` is the third state that a boolean cannot express. A screen
/// that has not run can neither confirm nor exclude the confounder, so it
/// counts as present.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Screen {
    Clear,
    Present,
    NotScreened,
}

impl Screen {
    /// Whether this screen contributes its confounder.
    ///
    /// Only `Clear` does not. Collapsing `NotScreened` into `Clear` is the exact
    /// substitution this module exists to prevent, so the mapping is written
    /// once, here, and matched exhaustively.
    fn confounds(self) -> bool {
        !matches!(self, Screen::Clear)
    }
}

// ---------------------------------------------------------------------------
// Evidence structs
// ---------------------------------------------------------------------------

/// One study's side of the gate's evidence. No `Default` impl: every field must
/// be named at the construction site, so a new hole cannot be opened silently.
#[derive(Debug, Clone, PartialEq)]
pub struct StudyEvidence {
    pub tier: TierEvidence,
    pub gain: GainEvidence,
    pub filter: FilterEvidence,
    pub swap: SwapEvidence,
    pub identity: IdentityEvidence,
    pub hr_bpm: Option<f64>,
    pub leads: Vec<LeadEvidence>,
}

impl StudyEvidence {
    fn lead(&self, name: &str) -> Option<&LeadEvidence> {
        self.leads.iter().find(|l| l.lead == name)
    }
}

#[derive(Debug, Clone, PartialEq)]
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
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ConfounderScreens {
    pub paper_speed: Screen,
    pub zero_sum_residual: Screen,
    pub pq_baseline: Screen,
    pub precordial_shift: Screen,
    /// LVH / LBBB / paced, which invalidate the ST rules rather than the
    /// measurement.
    pub ventricular_conduction_class: Screen,
    pub rhythm_class: Screen,
    /// Serial QRS-duration change. The one screen this pipeline can run today.
    pub conduction: Screen,
}

/// How much of the gain error is shared between the two studies. Spec §16.
///
/// ρ > 0 *narrows* the interval, so it must be earned. `Default` is the only
/// value anything constructs today, because nothing in the pipeline evidences
/// that two studies came off the same cart at the same printed gain.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RhoGain {
    Default,
    SameSession,
    SameCartVector,
}

impl RhoGain {
    fn rho(self) -> f32 {
        match self {
            RhoGain::Default => RHO_GAIN_DEFAULT,
            RhoGain::SameSession => RHO_GAIN_SAME_SESSION,
            RhoGain::SameCartVector => RHO_GAIN_SAME_CART_VECTOR,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct PairEvidence<'a> {
    pub reference: &'a StudyEvidence,
    pub comparison: &'a StudyEvidence,
    pub screens: &'a ConfounderScreens,
    pub rho_gain: RhoGain,
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

/// One lead's serial ST verdict in one uncertainty band.
///
/// Five states, not two. `BelowDetectionLimit` and `Unmeasurable` are distinct
/// facts — "the band is wider than the thing you are asking about" and "we never
/// measured it" — and a reader who is told the second when the first is true
/// will go and re-acquire an image that was fine.
#[derive(Debug, Clone, PartialEq)]
pub enum Verdict {
    Significant {
        delta_mv: f32,
        ci_mv: (f32, f32),
        mdc_mv: f32,
    },
    Indeterminate {
        delta_mv: Option<f32>,
        mdc_mv: f32,
        reason: Indeterminacy,
        limiter: Limiter,
    },
    BelowDetectionLimit {
        delta_mv: Option<f32>,
        mdc_mv: f32,
        limiter: Limiter,
    },
    NoChange {
        delta_mv: f32,
        bound_mv: f32,
    },
    Unmeasurable {
        reason: Refusal,
    },
}

impl Verdict {
    /// The state name, which is also the JSON discriminant.
    pub fn state(&self) -> &'static str {
        match self {
            Verdict::Significant { .. } => "Significant",
            Verdict::Indeterminate { .. } => "Indeterminate",
            Verdict::BelowDetectionLimit { .. } => "BelowDetectionLimit",
            Verdict::NoChange { .. } => "NoChange",
            Verdict::Unmeasurable { .. } => "Unmeasurable",
        }
    }

    /// The detection limit this verdict was decided against, where there is one.
    ///
    /// `Unmeasurable` has none on purpose. A refusal that carried an MDC would
    /// invite a caller to render the number anyway, and the number would be
    /// arithmetic over evidence that was never established.
    pub fn mdc_mv(&self) -> Option<f32> {
        match *self {
            Verdict::Significant { mdc_mv, .. }
            | Verdict::Indeterminate { mdc_mv, .. }
            | Verdict::BelowDetectionLimit { mdc_mv, .. } => Some(mdc_mv),
            Verdict::NoChange { .. } | Verdict::Unmeasurable { .. } => None,
        }
    }

    /// The study constraining the pair, where the verdict names one.
    pub fn limiter(&self) -> Option<Limiter> {
        match *self {
            Verdict::Indeterminate { limiter, .. }
            | Verdict::BelowDetectionLimit { limiter, .. } => Some(limiter),
            _ => None,
        }
    }

    /// The confounders that downgraded this verdict, if any survived into it.
    pub fn confounders(&self) -> &[Confounder] {
        match self {
            Verdict::Indeterminate { reason: Indeterminacy::Confounded(c), .. } => c,
            _ => &[],
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Indeterminacy {
    /// |Δ| cleared the detection limit but not the clinical criterion.
    SubThreshold,
    /// |Δ| cleared both, and a confounder is present or unscreened.
    Confounded(Vec<Confounder>),
    /// |Δ| is inside the detection limit and the limit is too wide to exclude
    /// the clinical criterion. Not "no change": nothing was established.
    NotResolved,
}

impl Indeterminacy {
    pub fn code(&self) -> &'static str {
        match self {
            Indeterminacy::SubThreshold => "SubThreshold",
            Indeterminacy::Confounded(_) => "Confounded",
            Indeterminacy::NotResolved => "NotResolved",
        }
    }
}

/// A condition that downgrades `Significant` to `Indeterminate`, and blocks
/// `NoChange`. Never upgrades anything.
///
/// Three of the spec's twelve are deliberately absent — `gain_unverified`,
/// `filter_setting_mismatch` and `lead_reversal_mismatch`. All three are also
/// preconditions, and a precondition is strictly stronger than a downgrade, so
/// the variants would be unreachable. `ConductionChanged` is an addition,
/// justified by `serial::findings`'s own module doc: a conduction change is the
/// condition under which every other number is to be read with suspicion, and
/// before this gate existed a pair with a widened QRS still produced notable ST
/// leads.
#[derive(Debug, Clone, Copy, PartialEq)]
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

impl Confounder {
    pub fn code(&self) -> &'static str {
        match self {
            Confounder::SourceTierMismatch => "SourceTierMismatch",
            Confounder::PaperSpeedUnverified => "PaperSpeedUnverified",
            Confounder::ZeroSumResidualHigh => "ZeroSumResidualHigh",
            Confounder::HeartRateMismatch { .. } => "HeartRateMismatch",
            Confounder::BeatsLessThanThree { .. } => "BeatsLessThanThree",
            Confounder::PqBaselineNotFlat => "PqBaselineNotFlat",
            Confounder::PossiblePrecordialElectrodeShift => "PossiblePrecordialElectrodeShift",
            Confounder::LvhOrLbbbOrPaced => "LvhOrLbbbOrPaced",
            Confounder::RhythmClassChanged => "RhythmClassChanged",
            Confounder::ConductionChanged => "ConductionChanged",
        }
    }
}

/// Why no verdict could be reached. Spec §5.5's `Refused`, which decision 44
/// names `Unmeasurable`.
#[derive(Debug, Clone, Copy, PartialEq)]
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

impl Refusal {
    pub fn code(&self) -> &'static str {
        match self {
            Refusal::LeadAbsent => "LeadAbsent",
            Refusal::TooFewBeats { .. } => "TooFewBeats",
            Refusal::LowCoverage { .. } => "LowCoverage",
            Refusal::CoverageUnmeasured => "CoverageUnmeasured",
            Refusal::IdentityFailed { .. } => "IdentityFailed",
            Refusal::IdentityUnchecked => "IdentityUnchecked",
            Refusal::GainUnconfirmed => "GainUnconfirmed",
            Refusal::GainNotRecorded => "GainNotRecorded",
            Refusal::FilterMismatch { .. } => "FilterMismatch",
            Refusal::RateMismatch { .. } => "RateMismatch",
            Refusal::LeadReversalMismatch => "LeadReversalMismatch",
            Refusal::LeadReversalUndetermined => "LeadReversalUndetermined",
            Refusal::NoStLevel => "NoStLevel",
            Refusal::NoUncertainty => "NoUncertainty",
        }
    }

    /// A sentence for the reader, not a log line.
    ///
    /// Each one says what is missing *and* that the consequence is a refusal to
    /// answer, because "coverage unmeasured" on its own reads as a technical
    /// aside rather than as the reason the ST column is empty.
    pub fn sentence(&self) -> String {
        match *self {
            Refusal::LeadAbsent => "This lead is missing from one of the two studies, so there \
                 is nothing to compare it against."
                .into(),
            Refusal::TooFewBeats { fewest } => format!(
                "One study contributed only {fewest} beat(s) to this lead. Beat-to-beat spread \
                 cannot be estimated from that, so the difference has no uncertainty and is not \
                 gated."
            ),
            Refusal::LowCoverage { worst } => format!(
                "Only {:.0}% of the ST window is backed by real samples in one study, against a \
                 {:.0}% requirement. The rest is interpolation, and an ST level computed from \
                 interpolated pixels looks exactly like a measured one.",
                worst * 100.0,
                COVERAGE_ST_MIN * 100.0
            ),
            Refusal::CoverageUnmeasured => "ST-window coverage is not measured yet, so no serial \
                 ST change can be confirmed or excluded."
                .into(),
            Refusal::IdentityFailed { limb_residual } => format!(
                "The limb-lead identity check failed with a residual of {limb_residual:.3}, so \
                 the panels may not be the leads they are labelled as. Comparing V2 in one study \
                 against V3 in another reads as new ST elevation that resolved one lead over."
            ),
            Refusal::IdentityUnchecked => "The lead-identity cross-checks have not been run, so \
                 it is not established that these panels are the leads they are labelled as."
                .into(),
            Refusal::GainUnconfirmed => "One study's millivolt scale was assumed rather than \
                 measured from a calibration pulse. A 2× gain error fabricates an entire anterior \
                 ST evolution out of a normal tracing."
                .into(),
            Refusal::GainNotRecorded => "No millivolt scale was recorded for one study, so its \
                 amplitudes have no established uncertainty."
                .into(),
            Refusal::FilterMismatch { reference_hz, comparison_hz } => format!(
                "The two studies were recorded through different high-pass filters \
                 ({reference_hz:.2} Hz and {comparison_hz:.2} Hz). That alone shifts the J point \
                 by up to 0.30 mV in the direction of the finding, and it cannot be undone."
            ),
            Refusal::RateMismatch { delta_bpm } => format!(
                "Heart rate differs by {delta_bpm:.0} bpm, past the {DHR_REFUSE_BPM:.0} bpm limit. \
                 Repolarisation itself changes with rate, so the ST difference is not attributable \
                 to a change in the heart."
            ),
            Refusal::LeadReversalMismatch => "The two studies were recorded with different \
                 electrode arrangements, so like is not being compared with like."
                .into(),
            Refusal::LeadReversalUndetermined => "The electrode arrangement has not been \
                 determined for both studies. An arm-lead reversal satisfies Einthoven's law \
                 perfectly, so the identity checks cannot stand in for this."
                .into(),
            Refusal::NoStLevel => "No ST level could be measured for this lead in one of the two \
                 studies."
                .into(),
            Refusal::NoUncertainty => "This lead's measurement uncertainty is unestimable in one \
                 of the two studies. A difference without a band is not a change; it is a number."
                .into(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WhichStudy {
    Reference,
    Comparison,
}

impl WhichStudy {
    pub fn code(self) -> &'static str {
        match self {
            WhichStudy::Reference => "reference",
            WhichStudy::Comparison => "comparison",
        }
    }
}

/// The study constraining the pair, and by how much.
#[derive(Debug, Clone, Copy, PartialEq)]
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
#[derive(Debug, Clone, PartialEq)]
pub struct LeadVerdict {
    pub lead: String,
    pub delta_mv: Option<f32>,
    /// Digitisation only: what this pipeline validates and controls.
    pub digitization: Verdict,
    /// Plus σ_bio, the expected repeat-recording variation we do not control.
    pub with_bio: Verdict,
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/// mV, 1σ repeat-recording variability for a lead. Spec §5.3.
///
/// An unrecognised name returns the largest of the three, never the smallest.
/// A lead this function does not recognise is one whose placement error nobody
/// has characterised, and guessing 0.025 mV for it would narrow the band on a
/// lead we know least about.
pub fn sigma_bio_mv(lead: &str) -> f32 {
    match lead {
        "I" | "II" | "III" | "aVR" | "aVL" | "aVF" => SIGMA_BIO_LIMB,
        "V1" | "V2" | "V3" => SIGMA_BIO_V1_V3,
        "V4" | "V5" | "V6" => SIGMA_BIO_V4_V6,
        _ => SIGMA_BIO_LIMB.max(SIGMA_BIO_V1_V3).max(SIGMA_BIO_V4_V6),
    }
}

/// The gain variance term, in mV².
///
/// Clamped at zero because an over-claimed ρ against unequal σ_gain drives it
/// negative, and a negative variance term takes the square root below to NaN —
/// which propagates into the MDC and compares false against every threshold,
/// silently turning a refusal into whatever the last branch happens to be.
fn gain_term_mv2(sigma_a: f32, sigma_b: f32, rho: f32) -> f32 {
    (sigma_a.powi(2) + sigma_b.powi(2) - 2.0 * rho * sigma_a * sigma_b).max(0.0)
}

/// The rate-difference variance term, in mV².
///
/// Zero below `DHR_ANNOTATE_BPM`: a few bpm of difference is ordinary and
/// pricing it would widen every band for nothing.
fn rate_term_mv2(a_hr: Option<f64>, b_hr: Option<f64>) -> f32 {
    match delta_hr(a_hr, b_hr) {
        Some(d) if d > DHR_ANNOTATE_BPM => (DHR_ST_RATE_TERM_MV_BPM * d as f32).powi(2),
        _ => 0.0,
    }
}

/// |Δ heart rate| in bpm, when both studies reported one.
fn delta_hr(a: Option<f64>, b: Option<f64>) -> Option<f64> {
    match (a, b) {
        (Some(x), Some(y)) if x.is_finite() && y.is_finite() => Some((y - x).abs()),
        _ => None,
    }
}

/// The MDC floor for this pair. Spec §16.
///
/// Only a pair whose tiers were both *measured* as vector earns the tighter
/// floor. An unmeasured tier takes the wider one, which is the whole reason
/// `TierEvidence::NotMeasured` is not a refusal: it costs the pair precision
/// rather than an answer.
fn mdc_floor(a: TierEvidence, b: TierEvidence) -> f32 {
    match (a, b) {
        (
            TierEvidence::Measured(SourceTier::Vector),
            TierEvidence::Measured(SourceTier::Vector),
        ) => MDC_FLOOR_VECTOR_MV,
        _ => MDC_FLOOR_OTHER_MV,
    }
}

/// Which study constrains the pair, and by how much.
///
/// Each side is `(var_indep_mv2, sigma_gain_mv, tier)`, already unwrapped by
/// `gate_st`: this runs only past the uncertainty refusal, so there is no
/// missing term left to default and no opportunity to default one.
fn limiter_of(a: (f32, f32, TierEvidence), b: (f32, f32, TierEvidence)) -> Limiter {
    let own = |(var, gain, tier): (f32, f32, TierEvidence)| -> f32 {
        (var + gain.powi(2)).max(0.0).sqrt() + tier.bias_mv()
    };
    let sa = own(a);
    let sb = own(b);

    let (study, sigma_mv, better) = if sa >= sb {
        (WhichStudy::Reference, sa, sb)
    } else {
        (WhichStudy::Comparison, sb, sa)
    };
    // Both bias terms are strictly positive for every tier, so `better` cannot
    // be zero on any pair the gate reaches. The guard is here anyway: a ratio of
    // infinity would serialise as `null` and read as "no limiter", which is the
    // opposite of what an infinite asymmetry means.
    let ratio = if better > 0.0 { (sigma_mv / better).max(1.0) } else { 1.0 };
    Limiter {
        study,
        sigma_mv,
        ratio,
        dominant: ratio > QUALITY_ASYMMETRY_NAME,
    }
}

/// Every unmet pair-level precondition, in spec order.
///
/// Empty means the pair itself is gateable, not that any lead is. This is the
/// list the UI states once, above the table, rather than repeating twelve times.
///
/// Beat count and ST-window coverage are per-lead preconditions, and they appear
/// here only when they block *every* lead the two studies share — at which point
/// they have stopped being a fact about one lead and become a fact about the
/// pair. That is exactly the pipeline's present state: coverage is unmeasured
/// everywhere, so it belongs above the table rather than twelve times inside it.
pub fn pair_blockers(pair: &PairEvidence) -> Vec<Refusal> {
    let mut out = Vec::new();

    let shared: Vec<(&LeadEvidence, &LeadEvidence)> = LEAD_ORDER
        .iter()
        .filter_map(|name| {
            Some((pair.reference.lead(name)?, pair.comparison.lead(name)?))
        })
        .collect();

    if !shared.is_empty() {
        let fewest = shared.iter().map(|(a, b)| a.n_beats.min(b.n_beats)).min().unwrap_or(0);
        if fewest < MIN_BEATS_FOR_DELTA {
            // Reported only when no shared lead has enough beats. One thin lead
            // is that lead's problem and is said in its own row.
            if shared.iter().all(|(a, b)| a.n_beats.min(b.n_beats) < MIN_BEATS_FOR_DELTA) {
                out.push(Refusal::TooFewBeats { fewest });
            }
        }

        let unmeasured = |(a, b): &(&LeadEvidence, &LeadEvidence)| {
            matches!(a.coverage_st, CoverageEvidence::NotMeasured)
                || matches!(b.coverage_st, CoverageEvidence::NotMeasured)
        };
        let low = |(a, b): &(&LeadEvidence, &LeadEvidence)| match (a.coverage_st, b.coverage_st) {
            (CoverageEvidence::Measured(x), CoverageEvidence::Measured(y)) => {
                x < COVERAGE_ST_MIN || y < COVERAGE_ST_MIN
            }
            _ => false,
        };
        if shared.iter().all(unmeasured) {
            out.push(Refusal::CoverageUnmeasured);
        } else if shared.iter().all(|s| unmeasured(s) || low(s)) {
            let worst = shared
                .iter()
                .filter_map(|(a, b)| match (a.coverage_st, b.coverage_st) {
                    (CoverageEvidence::Measured(x), CoverageEvidence::Measured(y)) => {
                        Some(x.min(y))
                    }
                    _ => None,
                })
                .fold(f32::INFINITY, f32::min);
            out.push(Refusal::LowCoverage { worst });
        }
    }

    out.extend(study_blockers(pair));
    out
}

/// The preconditions that are properties of the two studies rather than of one
/// lead, in the order `gate_st` evaluates them.
fn study_blockers(pair: &PairEvidence) -> Vec<Refusal> {
    let (a, b) = (pair.reference, pair.comparison);
    let mut out = Vec::new();

    match (a.identity, b.identity) {
        (IdentityEvidence::NotChecked, _) | (_, IdentityEvidence::NotChecked) => {
            out.push(Refusal::IdentityUnchecked)
        }
        (IdentityEvidence::Failed { limb_residual: x }, IdentityEvidence::Failed { limb_residual: y }) => {
            out.push(Refusal::IdentityFailed { limb_residual: x.max(y) })
        }
        (IdentityEvidence::Failed { limb_residual }, _)
        | (_, IdentityEvidence::Failed { limb_residual }) => {
            out.push(Refusal::IdentityFailed { limb_residual })
        }
        (IdentityEvidence::Passed, IdentityEvidence::Passed) => {}
    }

    match (a.gain, b.gain) {
        (GainEvidence::NotRecorded, _) | (_, GainEvidence::NotRecorded) => {
            out.push(Refusal::GainNotRecorded)
        }
        (GainEvidence::Assumed { .. }, _) | (_, GainEvidence::Assumed { .. }) => {
            out.push(Refusal::GainUnconfirmed)
        }
        (GainEvidence::FromPulse { .. }, GainEvidence::FromPulse { .. }) => {}
    }

    if let (FilterEvidence::Recorded(x), FilterEvidence::Recorded(y)) = (a.filter, b.filter) {
        if x != y {
            out.push(Refusal::FilterMismatch { reference_hz: x, comparison_hz: y });
        }
    }

    if let Some(d) = delta_hr(a.hr_bpm, b.hr_bpm) {
        if d > DHR_REFUSE_BPM {
            out.push(Refusal::RateMismatch { delta_bpm: d });
        }
    }

    match (a.swap, b.swap) {
        (SwapEvidence::Determined(x), SwapEvidence::Determined(y)) if x != y => {
            out.push(Refusal::LeadReversalMismatch)
        }
        (SwapEvidence::NotDetermined, _) | (_, SwapEvidence::NotDetermined) => {
            out.push(Refusal::LeadReversalUndetermined)
        }
        (SwapEvidence::Determined(_), SwapEvidence::Determined(_)) => {}
    }

    out
}

/// The first unmet precondition for one lead, in spec order, if any.
///
/// Pair-level refusals precede lead-level data refusals because a pair-level
/// problem is the one a clinician can act on: re-acquire, re-scan, check the
/// cable. Being told "no ST level" for twelve leads when the real problem is one
/// unreadable filter header sends them looking in the wrong place.
fn first_refusal(a: &LeadEvidence, b: &LeadEvidence, pair: &PairEvidence) -> Option<Refusal> {
    let fewest = a.n_beats.min(b.n_beats);
    if fewest < MIN_BEATS_FOR_DELTA {
        return Some(Refusal::TooFewBeats { fewest });
    }

    match (a.coverage_st, b.coverage_st) {
        (CoverageEvidence::NotMeasured, _) | (_, CoverageEvidence::NotMeasured) => {
            return Some(Refusal::CoverageUnmeasured)
        }
        (CoverageEvidence::Measured(x), CoverageEvidence::Measured(y)) => {
            if x < COVERAGE_ST_MIN || y < COVERAGE_ST_MIN {
                return Some(Refusal::LowCoverage { worst: x.min(y) });
            }
        }
    }

    if let Some(r) = study_blockers(pair).first() {
        return Some(*r);
    }

    if a.st_j_mv.is_none() || b.st_j_mv.is_none() {
        return Some(Refusal::NoStLevel);
    }
    if a.var_indep_mv2.is_none()
        || b.var_indep_mv2.is_none()
        || a.sigma_gain_mv.is_none()
        || b.sigma_gain_mv.is_none()
    {
        return Some(Refusal::NoUncertainty);
    }

    None
}

/// Every confounder present for this pair and lead.
///
/// A confounder never upgrades a verdict. It downgrades `Significant` to
/// `Indeterminate` and it blocks `NoChange`, and those are the only two things
/// it does.
fn confounders_of(a: &LeadEvidence, b: &LeadEvidence, pair: &PairEvidence) -> Vec<Confounder> {
    let mut out = Vec::new();
    let s = pair.screens;

    // A pair whose tiers are unknown cannot be *shown* to match, and this is
    // the second of `TierEvidence::NotMeasured`'s two conservative effects.
    let tier_mismatch = match (pair.reference.tier, pair.comparison.tier) {
        (TierEvidence::Measured(x), TierEvidence::Measured(y)) => x != y,
        _ => true,
    };
    if tier_mismatch {
        out.push(Confounder::SourceTierMismatch);
    }
    if s.paper_speed.confounds() {
        out.push(Confounder::PaperSpeedUnverified);
    }
    if s.zero_sum_residual.confounds() {
        out.push(Confounder::ZeroSumResidualHigh);
    }
    if let Some(d) = delta_hr(pair.reference.hr_bpm, pair.comparison.hr_bpm) {
        if d > DHR_INDETERMINATE_BPM {
            out.push(Confounder::HeartRateMismatch { delta_bpm: d });
        }
    }
    let fewest = a.n_beats.min(b.n_beats);
    if fewest < BEATS_CONFOUNDER_MIN {
        out.push(Confounder::BeatsLessThanThree { fewest });
    }
    if s.pq_baseline.confounds() {
        out.push(Confounder::PqBaselineNotFlat);
    }
    if s.precordial_shift.confounds() {
        out.push(Confounder::PossiblePrecordialElectrodeShift);
    }
    if s.ventricular_conduction_class.confounds() {
        out.push(Confounder::LvhOrLbbbOrPaced);
    }
    if s.rhythm_class.confounds() {
        out.push(Confounder::RhythmClassChanged);
    }
    if s.conduction.confounds() {
        out.push(Confounder::ConductionChanged);
    }
    out
}

/// Decide one band, given the delta, its detection limit and the confounders.
///
/// The branch order is the whole gate. `NoChange` is fourth and consults the
/// confounders, which the spec's normative code does not: it is the only branch
/// that asserts something, so it gets at least the guard `Significant` gets.
fn decide(
    delta: f32,
    mdc: f32,
    confounders: &[Confounder],
    limiter: Limiter,
) -> Verdict {
    let mag = delta.abs();
    let v = if mag > mdc && mag >= CLINICAL_DELTA_ST_MV && confounders.is_empty() {
        Verdict::Significant {
            delta_mv: delta,
            ci_mv: (delta - mdc, delta + mdc),
            mdc_mv: mdc,
        }
    } else if mag > mdc && mag >= CLINICAL_DELTA_ST_MV {
        Verdict::Indeterminate {
            delta_mv: Some(delta),
            mdc_mv: mdc,
            reason: Indeterminacy::Confounded(confounders.to_vec()),
            limiter,
        }
    } else if mag > mdc {
        Verdict::Indeterminate {
            delta_mv: Some(delta),
            mdc_mv: mdc,
            reason: Indeterminacy::SubThreshold,
            limiter,
        }
    } else if mag + mdc < CLINICAL_DELTA_ST_MV && confounders.is_empty() {
        Verdict::NoChange { delta_mv: delta, bound_mv: mag + mdc }
    } else {
        Verdict::Indeterminate {
            delta_mv: Some(delta),
            mdc_mv: mdc,
            reason: Indeterminacy::NotResolved,
            limiter,
        }
    };

    // A band wider than the criterion cannot confirm or exclude a clinically
    // significant change, and spec §8 risk 10 makes that the trigger for the
    // `indeterminateBelowThreshold` copy — but only for the case risk 10
    // actually describes, which is a difference smaller than the pair's own
    // detection limit. Hence the match on the *reason* rather than on the state.
    //
    // `Confounded` is excluded deliberately, and that exclusion is the point.
    // Branch 2 above reaches it only when `mag > mdc`, so a confounded verdict is
    // one the pair did resolve and then declined to attribute. Rewriting it would
    // tell the reader that the difference is withheld because the detection limit
    // is wider than the threshold — false of a 0.30 mV change measured against a
    // 0.13 mV limit — and, because `Verdict::confounders()` returns `&[]` for
    // every other state, would drop the confounder list out of the payload
    // entirely, erasing the only reason the change was withheld. Most of the
    // confounders have no other surface in the JSON.
    //
    // `SubThreshold` needs no case: it requires `mdc < mag < CLINICAL`, so its
    // MDC is always under the criterion and it never reaches this match.
    //
    // Note what remains implied, because it is not obvious from the branch list:
    // `MDC_FLOOR_OTHER_MV` and `CLINICAL_DELTA_ST_MV` are both 0.10 mV, so every
    // pair that is not measured-vector-to-measured-vector has an MDC of at least
    // the criterion. On such a pair `NoChange` is unreachable and an unconfounded
    // `Indeterminate` is always rewritten here. That is the §5.2 table restated:
    // only the best pairs get to say anything nuanced, and a photo pair that
    // cannot resolve 0.10 mV should not be offered five shades of an answer it
    // does not have.
    match v {
        Verdict::Indeterminate {
            delta_mv,
            mdc_mv,
            reason: Indeterminacy::NotResolved,
            ..
        } if mdc_mv >= CLINICAL_DELTA_ST_MV => {
            Verdict::BelowDetectionLimit { delta_mv, mdc_mv, limiter }
        }
        other => other,
    }
}

/// Gate one lead. Returns `Unmeasurable { LeadAbsent }` when the named lead is
/// missing from either study's evidence.
pub fn gate_st(pair: &PairEvidence, lead: &str) -> LeadVerdict {
    let absent = |reason: Refusal| LeadVerdict {
        lead: lead.to_string(),
        delta_mv: None,
        digitization: Verdict::Unmeasurable { reason },
        with_bio: Verdict::Unmeasurable { reason },
    };

    let (Some(a), Some(b)) = (pair.reference.lead(lead), pair.comparison.lead(lead)) else {
        return absent(Refusal::LeadAbsent);
    };

    // The delta is reported even on the paths that refuse, wherever both levels
    // exist. A refusal means "this difference is not a change", not "there is no
    // difference", and hiding the number turns the first into the second.
    let delta = match (a.st_j_mv, b.st_j_mv) {
        (Some(x), Some(y)) => Some(y - x),
        _ => None,
    };

    if let Some(reason) = first_refusal(a, b, pair) {
        return LeadVerdict {
            lead: lead.to_string(),
            delta_mv: delta,
            digitization: Verdict::Unmeasurable { reason },
            with_bio: Verdict::Unmeasurable { reason },
        };
    }

    // Every `expect` below is discharged by `first_refusal` having returned
    // `None`: it refuses on a missing level and on a missing uncertainty before
    // this point is reached. They are `expect` and not `unwrap_or(0.0)`
    // deliberately. A defaulted zero here is exactly the bug this whole module
    // replaces — it does not fail, it produces a confident narrow band around a
    // lead nobody measured — so if the refusal order is ever reordered out from
    // under this code, it must stop rather than lie.
    let delta = delta.expect("st level present past the NoStLevel refusal");
    let a_var = a.var_indep_mv2.expect("variance present past the NoUncertainty refusal");
    let b_var = b.var_indep_mv2.expect("variance present past the NoUncertainty refusal");
    let a_gain = a.sigma_gain_mv.expect("gain sigma present past the NoUncertainty refusal");
    let b_gain = b.sigma_gain_mv.expect("gain sigma present past the NoUncertainty refusal");

    let indep = a_var + b_var;
    let gain = gain_term_mv2(a_gain, b_gain, pair.rho_gain.rho());
    let rate = rate_term_mv2(pair.reference.hr_bpm, pair.comparison.hr_bpm);
    // Priced once for the pair, not once per study: the term stands for "one of
    // these two recordings may have been high-passed differently", which is a
    // single unknown however many studies fail to state their filter.
    let filt = if matches!(pair.reference.filter, FilterEvidence::Unreadable)
        || matches!(pair.comparison.filter, FilterEvidence::Unreadable)
    {
        FILTER_UNKNOWN_EXTRA_MV.powi(2)
    } else {
        0.0
    };
    // Both studies carry an independent repositioning error in the same lead, so
    // both are in the sum. §5.3's worked example counts one; §5.5's normative
    // code counts two, and the two passages disagree. Counting one would narrow
    // the band on the strength of an arithmetic slip, so the normative code
    // wins: the perfect A↔A V2 pair has an acquisition-inclusive MDC of
    // 0.128 mV, not the 0.100 mV the spec's headline sentence quotes.
    let bio = 2.0 * sigma_bio_mv(lead).powi(2);

    let bias = pair.reference.tier.bias_mv() + pair.comparison.tier.bias_mv();
    let floor = mdc_floor(pair.reference.tier, pair.comparison.tier);
    // The floor is applied *after* the bias, exactly as spec §5.5 writes it.
    // Applying it to σ, or to Z95·σ before the bias, narrows the MDC on good
    // pairs — the one direction that manufactures significance.
    let mdc_of = |extra: f32| ((indep + gain + rate + filt + extra).sqrt() * Z95 + bias).max(floor);

    let confounders = confounders_of(a, b, pair);
    let limiter = limiter_of(
        (a_var, a_gain, pair.reference.tier),
        (b_var, b_gain, pair.comparison.tier),
    );

    LeadVerdict {
        lead: lead.to_string(),
        delta_mv: Some(delta),
        digitization: decide(delta, mdc_of(0.0), &confounders, limiter),
        with_bio: decide(delta, mdc_of(bio), &confounders, limiter),
    }
}

/// Gate every lead in `LEAD_ORDER`, always twelve entries, in canonical order.
///
/// Twelve rows unconditionally. Filtering the absent leads out — which is what
/// the `filter_map` this replaced did — makes "absent" indistinguishable from
/// "not notable", and a lead missing from the comparison is a fact about the
/// study that has to be said out loud.
pub fn gate_all(pair: &PairEvidence) -> Vec<LeadVerdict> {
    LEAD_ORDER.iter().map(|l| gate_st(pair, l)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Owns the two studies and their screens so that a `PairEvidence`, which
    /// borrows all three, can be handed out from it.
    struct Fixture {
        reference: StudyEvidence,
        comparison: StudyEvidence,
        screens: ConfounderScreens,
        rho_gain: RhoGain,
    }

    impl Fixture {
        fn pair(&self) -> PairEvidence<'_> {
            PairEvidence {
                reference: &self.reference,
                comparison: &self.comparison,
                screens: &self.screens,
                rho_gain: self.rho_gain,
            }
        }

        fn verdict(&self, lead: &str) -> LeadVerdict {
            gate_st(&self.pair(), lead)
        }

        /// Set every lead's ST level in the comparison, so a known delta lands
        /// in every row.
        fn shift(&mut self, delta_mv: f32) -> &mut Self {
            for l in self.comparison.leads.iter_mut() {
                l.st_j_mv = Some(delta_mv);
            }
            self
        }

        fn tiers(&mut self, a: SourceTier, b: SourceTier) -> &mut Self {
            self.reference.tier = TierEvidence::Measured(a);
            self.comparison.tier = TierEvidence::Measured(b);
            self
        }

        /// Set both studies' independent variance from a 1σ in mV.
        fn sigma_indep(&mut self, a_mv: f32, b_mv: f32) -> &mut Self {
            for l in self.reference.leads.iter_mut() {
                l.var_indep_mv2 = Some(a_mv * a_mv);
            }
            for l in self.comparison.leads.iter_mut() {
                l.var_indep_mv2 = Some(b_mv * b_mv);
            }
            self
        }

        fn sigma_gain(&mut self, a_mv: f32, b_mv: f32) -> &mut Self {
            for l in self.reference.leads.iter_mut() {
                l.sigma_gain_mv = Some(a_mv);
            }
            for l in self.comparison.leads.iter_mut() {
                l.sigma_gain_mv = Some(b_mv);
            }
            self
        }

        fn beats(&mut self, n: u32) -> &mut Self {
            for l in self.reference.leads.iter_mut().chain(self.comparison.leads.iter_mut()) {
                l.n_beats = n;
            }
            self
        }

        fn coverage(&mut self, c: CoverageEvidence) -> &mut Self {
            for l in self.reference.leads.iter_mut().chain(self.comparison.leads.iter_mut()) {
                l.coverage_st = c;
            }
            self
        }
    }

    /// Evidence with every hole filled, so the branches under test are
    /// reachable at all.
    ///
    /// Nothing in the pipeline produces this today — that is the point of the
    /// ADR this module implements. It exists so the decision rule can be tested
    /// independently of whether the pipeline can yet feed it.
    fn complete_evidence() -> Fixture {
        let study = |st: f32| StudyEvidence {
            tier: TierEvidence::Measured(SourceTier::Vector),
            gain: GainEvidence::FromPulse { relative_sigma: 0.015 },
            filter: FilterEvidence::Recorded(0.05),
            swap: SwapEvidence::Determined("standard"),
            identity: IdentityEvidence::Passed,
            hr_bpm: Some(68.0),
            leads: LEAD_ORDER
                .iter()
                .map(|l| LeadEvidence {
                    lead: (*l).to_string(),
                    st_j_mv: Some(st),
                    // 0.020 mV is the spec's tier-A σ_ST (RSS), §5.1.
                    var_indep_mv2: Some(0.020 * 0.020),
                    sigma_gain_mv: Some(0.003),
                    n_beats: 4,
                    coverage_st: CoverageEvidence::Measured(1.0),
                })
                .collect(),
        };
        Fixture {
            reference: study(0.0),
            comparison: study(0.0),
            screens: clear_screens(),
            rho_gain: RhoGain::Default,
        }
    }

    fn clear_screens() -> ConfounderScreens {
        ConfounderScreens {
            paper_speed: Screen::Clear,
            zero_sum_residual: Screen::Clear,
            pq_baseline: Screen::Clear,
            precordial_shift: Screen::Clear,
            ventricular_conduction_class: Screen::Clear,
            rhythm_class: Screen::Clear,
            conduction: Screen::Clear,
        }
    }

    fn refusal(v: &Verdict) -> Refusal {
        match v {
            Verdict::Unmeasurable { reason } => *reason,
            other => panic!("expected a refusal, got {other:?}"),
        }
    }

    /// The detection limit behind any verdict that has one.
    ///
    /// `NoChange` carries the equivalence bound |Δ| + MDC rather than the MDC
    /// itself — that is the number the claim rests on — so the arithmetic tests
    /// recover the MDC from it rather than avoiding the branch and testing a
    /// different pair than they meant to.
    fn mdc(v: &Verdict) -> f32 {
        match *v {
            Verdict::NoChange { delta_mv, bound_mv } => bound_mv - delta_mv.abs(),
            _ => v.mdc_mv().unwrap_or_else(|| panic!("no detection limit on {v:?}")),
        }
    }

    // ---- preconditions -----------------------------------------------------

    #[test]
    fn a_lead_built_from_one_beat_is_unmeasurable_not_unchanged() {
        // The delta is zero and the band would be narrow, so every arithmetic
        // path here lands on "no change". At n = 1 the beat-to-beat spread is
        // unestimable, not small, and the band is a fiction.
        let mut f = complete_evidence();
        f.beats(1);
        let v = f.verdict("V2");
        assert_eq!(refusal(&v.digitization), Refusal::TooFewBeats { fewest: 1 });
        assert_eq!(refusal(&v.with_bio), Refusal::TooFewBeats { fewest: 1 });
        assert!(!matches!(v.digitization, Verdict::NoChange { .. }));
    }

    #[test]
    fn unmeasured_st_window_coverage_refuses_rather_than_assuming_full_coverage() {
        let mut f = complete_evidence();
        f.coverage(CoverageEvidence::NotMeasured);
        assert_eq!(refusal(&f.verdict("V2").digitization), Refusal::CoverageUnmeasured);
    }

    #[test]
    fn low_st_window_coverage_refuses_and_names_the_worst_lead_fraction() {
        let mut f = complete_evidence();
        f.coverage(CoverageEvidence::Measured(0.62));
        assert_eq!(
            refusal(&f.verdict("V2").digitization),
            Refusal::LowCoverage { worst: 0.62 }
        );
    }

    #[test]
    fn an_unchecked_lead_identity_refuses_rather_than_passing() {
        let mut f = complete_evidence();
        f.comparison.identity = IdentityEvidence::NotChecked;
        assert_eq!(refusal(&f.verdict("V2").digitization), Refusal::IdentityUnchecked);

        f.comparison.identity = IdentityEvidence::Failed { limb_residual: 0.21 };
        assert_eq!(
            refusal(&f.verdict("V2").digitization),
            Refusal::IdentityFailed { limb_residual: 0.21 }
        );
    }

    #[test]
    fn a_gain_that_was_assumed_rather_than_measured_refuses() {
        // The float is identical to the one a calibration pulse would have
        // produced. Only the discriminant differs, and only the discriminant
        // says whether anyone measured it.
        let mut f = complete_evidence();
        f.comparison.gain = GainEvidence::Assumed { relative_sigma: 0.015 };
        assert_eq!(refusal(&f.verdict("V2").digitization), Refusal::GainUnconfirmed);

        f.comparison.gain = GainEvidence::NotRecorded;
        assert_eq!(refusal(&f.verdict("V2").digitization), Refusal::GainNotRecorded);
    }

    #[test]
    fn an_undetermined_electrode_arrangement_refuses() {
        let mut f = complete_evidence();
        f.comparison.swap = SwapEvidence::NotDetermined;
        assert_eq!(
            refusal(&f.verdict("V2").digitization),
            Refusal::LeadReversalUndetermined
        );

        f.comparison.swap = SwapEvidence::Determined("la-ra-reversed");
        assert_eq!(refusal(&f.verdict("V2").digitization), Refusal::LeadReversalMismatch);
    }

    #[test]
    fn a_rate_difference_past_thirty_five_bpm_refuses() {
        let mut f = complete_evidence();
        f.comparison.hr_bpm = Some(68.0 + DHR_REFUSE_BPM + 5.0);
        assert_eq!(
            refusal(&f.verdict("V2").digitization),
            Refusal::RateMismatch { delta_bpm: DHR_REFUSE_BPM + 5.0 }
        );
    }

    #[test]
    fn two_studies_whose_high_pass_filters_differ_refuse() {
        let mut f = complete_evidence();
        f.comparison.filter = FilterEvidence::Recorded(0.5);
        assert_eq!(
            refusal(&f.verdict("V2").digitization),
            Refusal::FilterMismatch { reference_hz: 0.05, comparison_hz: 0.5 }
        );
    }

    #[test]
    fn an_unreadable_high_pass_filter_widens_the_band_rather_than_refusing() {
        // Refusing every paper ECG whose header did not survive the scan would
        // decline the majority of real inputs on a suspicion. §8 risk 3 prices
        // it instead, and reserves refusal for a *known* mismatch.
        let f = complete_evidence();
        let tight = mdc(&f.verdict("V2").digitization);

        let mut g = complete_evidence();
        g.comparison.filter = FilterEvidence::Unreadable;
        let v = g.verdict("V2");
        assert!(!matches!(v.digitization, Verdict::Unmeasurable { .. }));
        let wide = mdc(&v.digitization);
        assert!(wide > tight, "unreadable filter narrowed the band: {wide} vs {tight}");

        // And it is priced at exactly the constant, in quadrature.
        let sig_tight = (tight - 0.004) / Z95;
        let sig_wide = (wide - 0.004) / Z95;
        let added = sig_wide.powi(2) - sig_tight.powi(2);
        assert!(
            (added - FILTER_UNKNOWN_EXTRA_MV.powi(2)).abs() < 1e-6,
            "added {added} mV^2, expected {}",
            FILTER_UNKNOWN_EXTRA_MV.powi(2)
        );
    }

    #[test]
    fn the_first_unmet_precondition_in_spec_order_is_the_one_reported() {
        // Four preconditions unmet at once. Beat count is first in spec order,
        // and reporting the last one to be evaluated would send a clinician to
        // re-scan an image whose real problem was that it had one beat in it.
        let mut f = complete_evidence();
        f.beats(1).coverage(CoverageEvidence::NotMeasured);
        f.comparison.identity = IdentityEvidence::NotChecked;
        f.comparison.gain = GainEvidence::Assumed { relative_sigma: 0.02 };
        assert_eq!(refusal(&f.verdict("V2").digitization), Refusal::TooFewBeats { fewest: 1 });
    }

    #[test]
    fn every_unmet_precondition_appears_in_the_pair_blockers() {
        // The per-lead list says one thing; this list is what the UI states once
        // above the table, and it must not be a shorter story than the rows.
        let mut f = complete_evidence();
        f.beats(1).coverage(CoverageEvidence::NotMeasured);
        f.reference.identity = IdentityEvidence::NotChecked;
        f.comparison.gain = GainEvidence::Assumed { relative_sigma: 0.02 };
        f.reference.filter = FilterEvidence::Recorded(0.05);
        f.comparison.filter = FilterEvidence::Recorded(0.5);
        f.comparison.hr_bpm = Some(140.0);
        f.comparison.swap = SwapEvidence::NotDetermined;

        let codes: Vec<&str> =
            pair_blockers(&f.pair()).iter().map(|r| r.code()).collect();
        assert_eq!(
            codes,
            vec![
                "TooFewBeats",
                "CoverageUnmeasured",
                "IdentityUnchecked",
                "GainUnconfirmed",
                "FilterMismatch",
                "RateMismatch",
                "LeadReversalUndetermined",
            ],
            "pair blockers should list every unmet precondition, in spec order"
        );
    }

    #[test]
    fn a_gateable_pair_has_no_pair_blockers() {
        let f = complete_evidence();
        assert!(pair_blockers(&f.pair()).is_empty());
    }

    // ---- the decision rule -------------------------------------------------

    #[test]
    fn a_change_clearing_both_the_detection_limit_and_the_clinical_criterion_is_significant() {
        let mut f = complete_evidence();
        f.shift(0.25);
        let v = f.verdict("V2");
        assert!(
            matches!(v.digitization, Verdict::Significant { .. }),
            "0.25 mV on a clean A-to-A pair should be significant, got {:?}",
            v.digitization
        );
    }

    #[test]
    fn a_significant_verdict_carries_the_uncorrected_interval_that_produced_it() {
        // Uncorrected for multiplicity, deliberately: a clinician interrogating
        // one lead they already suspect is not performing twelve tests. The
        // interval is exactly Δ ± MDC and nothing else.
        let mut f = complete_evidence();
        f.shift(0.25);
        match f.verdict("V2").digitization {
            Verdict::Significant { delta_mv, ci_mv, mdc_mv } => {
                assert!((delta_mv - 0.25).abs() < 1e-6);
                assert!((ci_mv.0 - (0.25 - mdc_mv)).abs() < 1e-6);
                assert!((ci_mv.1 - (0.25 + mdc_mv)).abs() < 1e-6);
                assert!((ci_mv.1 - ci_mv.0 - 2.0 * mdc_mv).abs() < 1e-6);
            }
            other => panic!("expected Significant, got {other:?}"),
        }
    }

    #[test]
    fn a_change_clearing_the_detection_limit_but_not_the_criterion_is_indeterminate() {
        // 0.08 mV on a pair that resolves 0.06 mV: measurable, and not a change
        // worth anyone's attention. Announcing it spends the reader's attention
        // on noise until they stop reading.
        let mut f = complete_evidence();
        f.shift(0.08);
        match f.verdict("V2").digitization {
            Verdict::Indeterminate { reason, .. } => {
                assert_eq!(reason, Indeterminacy::SubThreshold)
            }
            other => panic!("expected SubThreshold, got {other:?}"),
        }
    }

    #[test]
    fn a_flat_lead_that_positively_excludes_the_criterion_reads_as_no_change() {
        let f = complete_evidence();
        match f.verdict("V6").digitization {
            Verdict::NoChange { delta_mv, bound_mv } => {
                assert!(delta_mv.abs() < 1e-6);
                assert!(bound_mv < CLINICAL_DELTA_ST_MV, "bound {bound_mv} must exclude 0.10");
            }
            other => panic!("expected NoChange, got {other:?}"),
        }
    }

    #[test]
    fn no_change_is_never_reached_by_a_band_too_wide_to_exclude_the_criterion() {
        // The guard this test exists for: `NoChange` is the only branch that
        // asserts something, so it must never become the fallback arm. A pair
        // that cannot resolve 0.10 mV and sees Δ = 0 has established nothing,
        // and "no change" is the single most dangerous thing to say about it.
        let mut f = complete_evidence();
        f.tiers(SourceTier::Photo, SourceTier::Photo).sigma_indep(0.038, 0.038);
        assert!(
            !matches!(f.verdict("V6").digitization, Verdict::NoChange { .. }),
            "a 0.13 mV band excluded nothing and still said no change"
        );

        // And the property, swept, so that moving `NoChange` to the else arm
        // fails here rather than in review: every `NoChange` this gate emits
        // positively excludes the criterion and carries no confounder.
        for tier in [SourceTier::Vector, SourceTier::Scan300, SourceTier::Photo, SourceTier::Poor] {
            for sigma in [0.0f32, 0.005, 0.020, 0.038, 0.087] {
                for hundredths in 0..40 {
                    let d = hundredths as f32 * 0.01;
                    let mut g = complete_evidence();
                    g.tiers(tier, tier).sigma_indep(sigma, sigma).shift(d);
                    for band in [g.verdict("V2").digitization, g.verdict("V2").with_bio] {
                        if let Verdict::NoChange { delta_mv, bound_mv } = band {
                            assert!(
                                delta_mv.abs() + (bound_mv - delta_mv.abs())
                                    < CLINICAL_DELTA_ST_MV,
                                "NoChange at Δ={delta_mv} bound={bound_mv} did not exclude \
                                 the criterion"
                            );
                            assert!(bound_mv < CLINICAL_DELTA_ST_MV);
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn a_pair_that_cannot_resolve_the_criterion_reads_as_below_the_detection_limit() {
        let mut f = complete_evidence();
        f.tiers(SourceTier::Photo, SourceTier::Photo).sigma_indep(0.038, 0.038);
        let v = f.verdict("V6").digitization;
        match v {
            Verdict::BelowDetectionLimit { mdc_mv, .. } => {
                assert!(mdc_mv >= CLINICAL_DELTA_ST_MV)
            }
            other => panic!("expected BelowDetectionLimit, got {other:?}"),
        }
        // And it is a different fact from a refusal, in the data and not only in
        // the copy: "the band is wider than your question" is not "we never
        // measured it", and a reader told the second re-acquires a fine image.
        assert!(!matches!(v, Verdict::Unmeasurable { .. }));
        assert_ne!(v.state(), Verdict::Unmeasurable { reason: Refusal::LeadAbsent }.state());
    }

    #[test]
    fn an_unscreened_confounder_downgrades_significant_to_indeterminate() {
        let mut f = complete_evidence();
        f.shift(0.25);
        assert!(matches!(f.verdict("V2").digitization, Verdict::Significant { .. }));

        f.screens.pq_baseline = Screen::NotScreened;
        match f.verdict("V2").digitization {
            Verdict::Indeterminate { reason: Indeterminacy::Confounded(c), .. } => {
                assert!(c.contains(&Confounder::PqBaselineNotFlat), "got {c:?}")
            }
            other => panic!("expected Confounded, got {other:?}"),
        }
    }

    #[test]
    fn an_unscreened_confounder_also_blocks_no_change() {
        // The spec's normative branch 3 does not consult the confounders, so a
        // pair with an unflat PQ baseline and a small |Δ| returns a positive
        // claim of no change backed by evidence the gate has just been told is
        // unreliable. This asserts the deviation.
        let f = complete_evidence();
        assert!(matches!(f.verdict("V6").digitization, Verdict::NoChange { .. }));

        let mut g = complete_evidence();
        g.screens.pq_baseline = Screen::NotScreened;
        match g.verdict("V6").digitization {
            Verdict::Indeterminate { reason, .. } => assert_eq!(reason, Indeterminacy::NotResolved),
            other => panic!("expected NotResolved, got {other:?}"),
        }
    }

    #[test]
    fn a_conduction_change_downgrades_every_lead_in_the_pair() {
        // Depolarisation takes as long as it takes: a new bundle branch block
        // widens the complex in every lead at once, so the downgrade is not
        // per-lead either.
        let mut f = complete_evidence();
        f.shift(0.25);
        f.screens.conduction = Screen::Present;
        for v in gate_all(&f.pair()) {
            // Both bands, not just the digitisation-only one. The acquisition
            // band is wider by σ_bio, so it is the band that crosses the
            // criterion first, and checking only the narrow one let a rewrite
            // that dropped the confounder list pass unnoticed.
            for (band, verdict) in [("digitization", v.digitization), ("with_bio", v.with_bio)] {
                match verdict {
                    Verdict::Indeterminate { reason: Indeterminacy::Confounded(c), .. } => {
                        assert!(
                            c.contains(&Confounder::ConductionChanged),
                            "{} {band}: {c:?}",
                            v.lead
                        )
                    }
                    other => panic!("{} {band}: expected Confounded, got {other:?}", v.lead),
                }
            }
        }
    }

    #[test]
    fn a_confounded_change_keeps_its_confounders_even_when_the_band_is_wide() {
        // Branch 2 reaches `Confounded` only when |Δ| exceeds the MDC, so a
        // confounded verdict is one the pair *did* resolve and then declined to
        // attribute. Rewriting it to `BelowDetectionLimit` because the band is
        // wider than the criterion would state the opposite — and, since
        // `confounders()` is empty on every other state, would drop the reason
        // for the refusal out of the payload entirely, leaving the reader with a
        // sentence about the detection limit and no mention of the conduction
        // change that actually withheld the number.
        let mut f = complete_evidence();
        f.tiers(SourceTier::Photo, SourceTier::Photo)
            .sigma_indep(0.038, 0.038)
            .sigma_gain(0.0, 0.0)
            .shift(0.30);
        f.screens.conduction = Screen::Present;

        let v = f.verdict("V2").digitization;
        assert!(
            v.mdc_mv().is_some_and(|m| m >= CLINICAL_DELTA_ST_MV),
            "fixture must have a band wider than the criterion or it tests nothing: {v:?}"
        );
        match v {
            Verdict::Indeterminate { reason: Indeterminacy::Confounded(ref c), .. } => {
                assert!(c.contains(&Confounder::ConductionChanged), "{c:?}")
            }
            other => panic!("expected Confounded, got {other:?}"),
        }
    }

    #[test]
    fn an_unscreened_conduction_check_confounds_exactly_as_a_positive_one_does() {
        // `NotScreened` is the third state a boolean cannot express. A screen
        // that has not run can neither confirm nor exclude the confounder.
        let mut f = complete_evidence();
        f.shift(0.25);
        f.screens.conduction = Screen::NotScreened;
        assert!(f.verdict("V2")
            .digitization
            .confounders()
            .contains(&Confounder::ConductionChanged));
    }

    #[test]
    fn a_rate_difference_past_twenty_bpm_downgrades_but_does_not_refuse() {
        // The rest of the budget is kept small deliberately. A rate difference
        // widens the band as well as confounding the verdict, and at the
        // fixture's usual sigma the band alone would push the pair past the
        // clinical criterion — which is a different finding from the one this
        // test is about.
        let mut f = complete_evidence();
        f.shift(0.25).sigma_indep(0.005, 0.005).sigma_gain(0.0, 0.0);
        f.comparison.hr_bpm = Some(68.0 + 21.0);
        let v = f.verdict("V2").digitization;
        assert!(!matches!(v, Verdict::Unmeasurable { .. }), "25 bpm must not refuse");
        assert!(
            v.confounders()
                .iter()
                .any(|c| matches!(c, Confounder::HeartRateMismatch { .. })),
            "got {v:?}"
        );
    }

    #[test]
    fn two_gated_beats_pass_the_precondition_and_still_confound() {
        // Two thresholds on the same quantity, easily conflated: 2 beats is
        // enough to estimate a spread at all, 3 is enough to trust it.
        let mut f = complete_evidence();
        f.shift(0.25).beats(2);
        let v = f.verdict("V2").digitization;
        assert!(!matches!(v, Verdict::Unmeasurable { .. }));
        assert!(v.confounders().contains(&Confounder::BeatsLessThanThree { fewest: 2 }));
    }

    // ---- the arithmetic ----------------------------------------------------

    #[test]
    fn the_mdc_floor_is_applied_after_the_bias_and_never_before_it() {
        // σ chosen so that Z95·σ sits just under the vector floor while
        // Z95·σ + bias sits just over it. Applying the floor to Z95·σ first
        // would give 0.0540; applying it to σ would give 0.1020; the rule as
        // written gives 0.0510. Each wrong order narrows or widens the band in
        // a way no test on a single number would catch.
        let mut f = complete_evidence();
        f.sigma_indep(0.024 / 2.0f32.sqrt(), 0.024 / 2.0f32.sqrt()).sigma_gain(0.0, 0.0);
        let got = mdc(&f.verdict("V2").digitization);
        let expect = Z95 * 0.024 + 2.0 * BIAS_VECTOR;
        assert!((got - expect).abs() < 1e-5, "mdc {got}, expected {expect}");
        assert!(got > MDC_FLOOR_VECTOR_MV);
        assert!(
            got < MDC_FLOOR_VECTOR_MV + 2.0 * BIAS_VECTOR - 1e-6,
            "the floor was applied before the bias"
        );
    }

    #[test]
    fn a_vector_to_vector_pair_gets_the_tighter_floor_and_no_other_pair_does() {
        let floor_of = |a: TierEvidence, b: TierEvidence| {
            let mut f = complete_evidence();
            f.sigma_indep(0.0, 0.0).sigma_gain(0.0, 0.0);
            f.reference.tier = a;
            f.comparison.tier = b;
            mdc(&f.verdict("V2").digitization)
        };
        let vector = TierEvidence::Measured(SourceTier::Vector);
        assert!((floor_of(vector, vector) - MDC_FLOOR_VECTOR_MV).abs() < 1e-6);
        for other in [SourceTier::Scan300, SourceTier::Photo, SourceTier::Poor] {
            let m = floor_of(vector, TierEvidence::Measured(other));
            assert!((m - MDC_FLOOR_OTHER_MV).abs() < 1e-6, "{other:?} got floor {m}");
        }
        assert!(
            (floor_of(vector, TierEvidence::NotMeasured) - MDC_FLOOR_OTHER_MV).abs() < 1e-6
        );
    }

    #[test]
    fn an_unmeasured_source_tier_takes_the_wider_floor_and_the_worst_bias() {
        // An unknown source is priced as the worst source. The alternative is
        // that a phone photo of a printout inherits tier A's error budget
        // because the bytes arrived in a PDF container.
        let mut f = complete_evidence();
        f.sigma_indep(0.087, 0.087).sigma_gain(0.0, 0.0);
        f.comparison.tier = TierEvidence::NotMeasured;
        let got = mdc(&f.verdict("V2").digitization);
        let sigma = (2.0f32 * 0.087 * 0.087).sqrt();
        let expect = Z95 * sigma + BIAS_VECTOR + BIAS_POOR;
        assert!((got - expect).abs() < 1e-5, "mdc {got}, expected {expect}");

        // And it contributes the tier-mismatch confounder, because a pair whose
        // tiers are unknown cannot be *shown* to match. Observed through what it
        // costs rather than through the confounder list, which is where a
        // measured pair and an unmeasured one can be held identical in every
        // other respect: same bias, same floor, same sigma, same MDC, and only
        // one of them may be called a change.
        let matched = {
            let mut g = complete_evidence();
            g.tiers(SourceTier::Poor, SourceTier::Poor)
                .sigma_indep(0.087, 0.087)
                .sigma_gain(0.0, 0.0)
                .shift(0.5);
            g.verdict("V2").digitization
        };
        let unknown = {
            let mut g = complete_evidence();
            g.tiers(SourceTier::Poor, SourceTier::Poor)
                .sigma_indep(0.087, 0.087)
                .sigma_gain(0.0, 0.0)
                .shift(0.5);
            g.comparison.tier = TierEvidence::NotMeasured;
            g.verdict("V2").digitization
        };
        assert!((mdc(&matched) - mdc(&unknown)).abs() < 1e-6, "the two bands must be equal");
        assert!(matches!(matched, Verdict::Significant { .. }), "{matched:?}");
        assert!(
            !matches!(unknown, Verdict::Significant { .. }),
            "an unmeasured tier let a change be claimed: {unknown:?}"
        );
    }

    #[test]
    fn bias_adds_linearly_and_never_in_quadrature() {
        let mut f = complete_evidence();
        f.tiers(SourceTier::Poor, SourceTier::Poor).sigma_indep(0.087, 0.087).sigma_gain(0.0, 0.0);
        let got = mdc(&f.verdict("V2").digitization);

        let z_sigma = Z95 * (2.0f32 * 0.087 * 0.087).sqrt();
        let bias = 2.0 * BIAS_POOR;
        let linear = z_sigma + bias;
        let quadrature = (z_sigma.powi(2) + bias.powi(2)).sqrt();
        assert!((got - linear).abs() < 1e-5, "mdc {got}, expected {linear}");
        assert!(
            linear > quadrature,
            "an RSS of the bias would have understated the band by {} mV",
            linear - quadrature
        );
    }

    #[test]
    fn an_unevidenced_gain_correlation_is_zero_and_widens_rather_than_narrows() {
        let mdc_at = |rho: RhoGain| {
            let mut f = complete_evidence();
            f.tiers(SourceTier::Photo, SourceTier::Photo)
                .sigma_indep(0.02, 0.02)
                .sigma_gain(0.05, 0.05);
            f.rho_gain = rho;
            mdc(&f.verdict("V2").digitization)
        };
        assert!(mdc_at(RhoGain::Default) > mdc_at(RhoGain::SameSession));
        assert!(mdc_at(RhoGain::SameSession) > mdc_at(RhoGain::SameCartVector));
        assert!((RHO_GAIN_DEFAULT - 0.0).abs() < 1e-9, "the default rho must be zero");
    }

    #[test]
    fn an_over_claimed_gain_correlation_cannot_drive_the_variance_negative() {
        // No `RhoGain` variant can express ρ > 1 today, and for ρ ≤ 1 the term
        // is non-negative by the AM-GM inequality. The clamp is there for the
        // variant that does not exist yet, so it is tested where it can be: a
        // negative term would take the square root to NaN, and NaN compares
        // false against every threshold, so the gate would fall through to
        // whichever branch has no comparison in it.
        // Unequal sigmas need rho past (a²+b²)/2ab = 1.67 before the term
        // turns negative; equal sigmas need only rho > 1.
        assert_eq!(gain_term_mv2(0.01, 0.03, 2.0), 0.0);
        assert_eq!(gain_term_mv2(0.02, 0.02, 1.5), 0.0);
        assert!(gain_term_mv2(0.01, 0.03, 0.9) > 0.0);

        // Through the public gate, at the most adverse ρ it can express.
        let mut f = complete_evidence();
        f.sigma_gain(0.05, 0.05);
        f.rho_gain = RhoGain::SameCartVector;
        let got = mdc(&f.verdict("V2").digitization);
        assert!(got.is_finite(), "mdc was {got}");
    }

    #[test]
    fn a_rate_difference_under_ten_bpm_adds_no_rate_term() {
        let mdc_at = |hr: f64| {
            let mut f = complete_evidence();
            f.tiers(SourceTier::Photo, SourceTier::Photo).sigma_indep(0.038, 0.038);
            f.comparison.hr_bpm = Some(hr);
            mdc(&f.verdict("V2").digitization)
        };
        let same = mdc_at(68.0);
        assert!((mdc_at(77.0) - same).abs() < 1e-6, "9 bpm should cost nothing");
        assert!(mdc_at(80.0) > same + 1e-4, "12 bpm should widen the band");
    }

    // ---- the two bands -----------------------------------------------------

    #[test]
    fn the_bio_band_is_never_narrower_than_the_digitization_band() {
        let mut f = complete_evidence();
        f.shift(0.12);
        for v in gate_all(&f.pair()) {
            let (d, b) = (v.digitization.mdc_mv(), v.with_bio.mdc_mv());
            if let (Some(d), Some(b)) = (d, b) {
                assert!(b >= d - 1e-6, "{}: bio band {b} narrower than {d}", v.lead);
            }
        }
    }

    #[test]
    fn both_bands_are_returned_for_every_lead_because_either_alone_misleads() {
        // 0.11 mV on a perfect vector pair: significant against what we control,
        // and not resolvable once the repositioning error we do not control is
        // included. Showing one of those alone is the failure §5.3 warns about.
        let mut f = complete_evidence();
        f.shift(0.11);
        let v = f.verdict("V2");
        assert!(matches!(v.digitization, Verdict::Significant { .. }), "{:?}", v.digitization);
        assert!(
            matches!(v.with_bio, Verdict::BelowDetectionLimit { .. }),
            "{:?}",
            v.with_bio
        );
        assert_eq!(gate_all(&f.pair()).len(), 12);
    }

    #[test]
    fn the_bio_term_counts_both_studies_repositioning_error() {
        // §5.3's worked example counts one σ_bio²; §5.5's normative code counts
        // two. Both studies carry an independent repositioning error in the same
        // lead, so both are in the sum — counting one narrows the band on the
        // strength of an arithmetic slip.
        let mut f = complete_evidence();
        f.tiers(SourceTier::Photo, SourceTier::Photo).sigma_indep(0.038, 0.038);
        let v = f.verdict("V2");
        let bias = 2.0 * BIAS_PHOTO;
        let var = |m: f32| ((m - bias) / Z95).powi(2);
        let added = var(v.with_bio.mdc_mv().unwrap()) - var(v.digitization.mdc_mv().unwrap());
        let one = sigma_bio_mv("V2").powi(2);
        assert!((added - 2.0 * one).abs() < 1e-6, "added {added}, expected {}", 2.0 * one);
        assert!((added - one).abs() > 1e-6, "the bio term counted only one study");
    }

    #[test]
    fn an_unrecognised_lead_takes_the_largest_repositioning_error() {
        assert!(sigma_bio_mv("V7") >= sigma_bio_mv("V2"));
        assert!(sigma_bio_mv("V7") >= sigma_bio_mv("I"));
    }

    // ---- absence -----------------------------------------------------------

    #[test]
    fn a_lead_present_in_only_one_study_is_reported_rather_than_omitted() {
        // Dropping the row makes "absent" indistinguishable from "not notable",
        // and a lead missing from the comparison is a fact about the study.
        let mut f = complete_evidence();
        f.shift(0.25);
        f.comparison.leads.retain(|l| l.lead != "V6");

        let all = gate_all(&f.pair());
        assert_eq!(all.len(), 12, "a missing lead dropped its row");
        let v6 = all.iter().find(|v| v.lead == "V6").expect("no V6 row");
        assert_eq!(refusal(&v6.digitization), Refusal::LeadAbsent);
        assert_eq!(v6.delta_mv, None);
    }

    // ---- the spec's own worked check ---------------------------------------

    #[test]
    fn the_specs_worked_verdicts_reproduce_at_every_tier() {
        // Built from the §5.1 **σ_ST (RSS)** row — 0.020 / 0.026 / 0.038 /
        // 0.087 — and not from SIGMA_PROV_*, which is the per-tier provenance
        // floor and one term of that RSS rather than the whole of it. The two
        // coincide only at tier D, so a D-only check would not catch the
        // substitution, and substituting at tier A drops the A↔A MDC onto its
        // 0.05 floor and moves the CI this test pins.
        let case = |tier: SourceTier, sigma_st: f32| {
            let mut f = complete_evidence();
            f.tiers(tier, tier).sigma_indep(sigma_st, sigma_st).sigma_gain(0.0, 0.0);
            for l in ["V2", "V3", "V4"] {
                let i = f.comparison.leads.iter().position(|x| x.lead == l).unwrap();
                f.comparison.leads[i].st_j_mv = Some(0.25);
            }
            gate_all(&f.pair())
        };
        let of = |vs: &[LeadVerdict], lead: &str| {
            vs.iter().find(|v| v.lead == lead).unwrap().digitization.clone()
        };

        // A↔A: V2 Significant with CI [0.19, 0.31]; V6 NoChange at ≤0.06.
        let a = case(SourceTier::Vector, 0.020);
        match of(&a, "V2") {
            Verdict::Significant { ci_mv, mdc_mv, .. } => {
                assert!((mdc_mv - 0.060).abs() < 0.002, "A↔A MDC {mdc_mv}, expected 0.06");
                assert!((ci_mv.0 - 0.19).abs() < 0.005, "CI low {}", ci_mv.0);
                assert!((ci_mv.1 - 0.31).abs() < 0.005, "CI high {}", ci_mv.1);
            }
            other => panic!("A↔A V2 should be Significant, got {other:?}"),
        }
        match of(&a, "V6") {
            Verdict::NoChange { bound_mv, .. } => {
                assert!(bound_mv < 0.065, "A↔A V6 bound {bound_mv}, expected ≤0.06")
            }
            other => panic!("A↔A V6 should be NoChange, got {other:?}"),
        }

        // B↔B computes 0.082 mV, the §5.2 table's 0.08, and then meets the §16
        // floor: any pair that is not measured-vector-to-measured-vector cannot
        // claim better than 0.10 mV however good its arithmetic looks. That is
        // the floor doing its job — the runtime σ̂ is an estimate, and a
        // confidently small estimate is still an estimate — so the assertion is
        // on the floored value and not on the table's.
        let b = case(SourceTier::Scan300, 0.026);
        assert!((mdc(&of(&b, "V2")) - MDC_FLOOR_OTHER_MV).abs() < 1e-6);

        // C↔C: V2 Significant with CI [0.12, 0.38]; V6 cannot resolve 0.10.
        let c = case(SourceTier::Photo, 0.038);
        match of(&c, "V2") {
            Verdict::Significant { ci_mv, mdc_mv, .. } => {
                assert!((mdc_mv - 0.130).abs() < 0.003, "C↔C MDC {mdc_mv}, expected 0.13");
                assert!((ci_mv.0 - 0.12).abs() < 0.005, "CI low {}", ci_mv.0);
                assert!((ci_mv.1 - 0.38).abs() < 0.005, "CI high {}", ci_mv.1);
            }
            other => panic!("C↔C V2 should be Significant, got {other:?}"),
        }
        // §5.5 names this one `Indeterminate` and §8 risk 10 names the same
        // situation `BelowDetectionLimit`. They describe one state; we take the
        // more specific name because it selects the more specific copy.
        match of(&c, "V6") {
            Verdict::BelowDetectionLimit { mdc_mv, .. } => {
                assert!(mdc_mv >= CLINICAL_DELTA_ST_MV)
            }
            other => panic!("C↔C V6 should be below the detection limit, got {other:?}"),
        }

        // D↔D: nothing is resolvable, including the 0.25 mV injection.
        let d = case(SourceTier::Poor, 0.087);
        for lead in ["V2", "V6"] {
            match of(&d, lead) {
                Verdict::BelowDetectionLimit { mdc_mv, .. } => {
                    assert!(mdc_mv > 0.29, "D↔D MDC {mdc_mv}, expected ~0.31")
                }
                other => panic!("D↔D {lead} should be below the detection limit, got {other:?}"),
            }
        }

        // A↔C beats C↔C, which is why the gate is pair-specific and the
        // pipeline must never be labelled with one accuracy number.
        let mut ac = complete_evidence();
        ac.tiers(SourceTier::Vector, SourceTier::Photo).sigma_gain(0.0, 0.0);
        for l in ac.reference.leads.iter_mut() {
            l.var_indep_mv2 = Some(0.020 * 0.020);
        }
        for l in ac.comparison.leads.iter_mut() {
            l.var_indep_mv2 = Some(0.038 * 0.038);
        }
        let ac_mdc = mdc(&ac.verdict("V2").digitization);
        assert!((ac_mdc - 0.10).abs() < 0.004, "A↔C MDC {ac_mdc}, expected ~0.10");
        assert!(ac_mdc < mdc(&of(&c, "V2")), "A↔C should beat C↔C");
    }

    #[test]
    fn the_limiter_names_the_worse_study_and_says_when_it_dominates() {
        let mut f = complete_evidence();
        f.sigma_indep(0.005, 0.005);
        // The acquisition-inclusive band, not the digitisation-only one. On a
        // pair this good the digitisation band lands on `NoChange`, which carries
        // no limiter by construction, so asserting through an `if let` on it
        // asserted nothing at all — the body never ran, and the non-dominant case
        // had no Rust coverage. Unwrapping is the point: the test must fail if the
        // limiter stops being reported, not skip.
        let v = f.verdict("V2").with_bio;
        // Symmetric pair: neither study dominates, and the UI must describe the
        // pair as jointly limited rather than blaming one study.
        let l = v.limiter().expect("a banded verdict must name its limiter");
        assert!(!l.dominant);
        assert!((l.ratio - 1.0).abs() < 1e-6);

        let mut g = complete_evidence();
        g.tiers(SourceTier::Vector, SourceTier::Poor).sigma_indep(0.005, 0.120);
        let l = g
            .verdict("V2")
            .digitization
            .limiter()
            .expect("a wide band should name its limiter");
        assert_eq!(l.study, WhichStudy::Comparison);
        assert!(l.ratio > QUALITY_ASYMMETRY_NAME);
        assert!(l.dominant);
    }
}

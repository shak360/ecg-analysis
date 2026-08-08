//! The vectorcardiogram: the same beat, drawn as a path in space.
//!
//! Every other view in this project plots voltage against time. A VCG plots the
//! heart's instantaneous electrical vector against *itself* — X against Y, X
//! against Z, Z against Y — so one point on the loop is one instant of all
//! twelve deflections at once. That is the whole pedagogical value, and it is
//! also the whole constraint: the twelve leads must have been recorded at the
//! same instant, or the loop describes a beat that never happened.
//!
//! # Why this is computed here and not in the UI
//!
//! Two of the four refusals below are decidable only from facts the drawing
//! code cannot see. `offsets_s` says whether the leads were simultaneous;
//! `baselined` says whether their zero is real. Ship twelve beats to a canvas
//! without those and it will draw a beautiful, meaningless loop from four
//! different 2.5-second windows of a printout, with no way to know it did.
//!
//! The coefficients themselves are clinical constants, which
//! `docs/decisions/0004-constants-live-in-rust.md` already places on this side
//! of the boundary.

use crate::config::{KORS_LEADS, KORS_X, KORS_Y, KORS_Z, VCG_LIMB_IDENTITY_MAX, VCG_RR_CV_MAX};

/// The three orthogonal leads, on the same frame as the ensemble beats they
/// came from: X left-positive, Y inferior-positive, Z posterior-positive.
#[derive(Debug, Clone, PartialEq)]
pub struct Vcg {
    pub x_mv: Vec<f32>,
    pub y_mv: Vec<f32>,
    pub z_mv: Vec<f32>,
}

/// Why this study has no loop.
///
/// Every variant names what was missing, because "no vectorcardiogram" is not
/// something a reader can act on and "V3 was never recorded" is.
#[derive(Debug, Clone, PartialEq)]
pub enum VcgRefusal {
    /// The transform needs all eight; these were absent.
    LeadsMissing(Vec<String>),
    /// These leads' panels start at different times, so they are not one beat.
    NotSimultaneous { offsets_s: Vec<(String, f64)> },
    /// These leads had no isoelectric anchor, so their zero is arbitrary.
    BaselineNotEstablished(Vec<String>),
    /// Rate or morphology varied across the record. Spec §4.3.
    NonStationary { rr_cv: f64, rho_min: f32 },
    /// A contributing lead's ensemble was not the canonical frame length.
    FrameLengthMismatch { lead: String, len: usize },
    /// The limb leads are not the Einthoven combinations of I and II, so these
    /// twelve channels are not a standard 12-lead and the transform's frame
    /// does not apply. `residual` is a fraction of the offending lead's RMS.
    LimbLeadGeometry { relation: String, lead: String, residual: f32 },
}

impl VcgRefusal {
    /// A short machine code, for the UI to branch on.
    pub fn code(&self) -> &'static str {
        match self {
            Self::LeadsMissing(_) => "LeadsMissing",
            Self::NotSimultaneous { .. } => "NotSimultaneous",
            Self::BaselineNotEstablished(_) => "BaselineNotEstablished",
            Self::NonStationary { .. } => "NonStationary",
            Self::FrameLengthMismatch { .. } => "FrameLengthMismatch",
            Self::LimbLeadGeometry { .. } => "LimbLeadGeometry",
        }
    }

    /// Prose a clinician can act on, in the register of `serial::gate`.
    ///
    /// Each sentence says what was missing and what would have gone wrong had
    /// the loop been drawn anyway — the second half is the part that stops this
    /// reading as the tool being broken.
    pub fn sentence(&self) -> String {
        match self {
            Self::LeadsMissing(leads) => format!(
                "This transform reads eight leads and {} {} not recorded here. \
                 A loop from the rest would be a different transform with the \
                 same name.",
                leads.join(", "),
                if leads.len() == 1 { "was" } else { "were" },
            ),
            Self::NotSimultaneous { offsets_s } => {
                let mut spans: Vec<String> =
                    offsets_s.iter().map(|(_, t)| format!("{t:.1} s")).collect();
                spans.sort();
                spans.dedup();
                format!(
                    "These leads came from {} different windows of the recording \
                     ({}), so they were never measured at the same instant. A \
                     loop built from them describes no beat that happened.",
                    spans.len(),
                    spans.join(", "),
                )
            }
            Self::BaselineNotEstablished(leads) => format!(
                "No beat in {} gave a flat enough PQ segment, so that lead's zero \
                 is wherever the trace happened to sit. The loop's origin would \
                 be displaced by an unknown amount, which reads as an injury \
                 current.",
                leads.join(", "),
            ),
            Self::NonStationary { rr_cv, rho_min } => {
                if rr_cv.is_nan() {
                    "The rhythm was never screened — too few beats to measure how \
                     steady the rate was. A screen that has not run cannot show \
                     the ten seconds were one rhythm."
                        .to_string()
                } else {
                    format!(
                        "Across these ten seconds the R-R interval varied by {:.0}%, \
                         so these are several different beats averaged together. The \
                         instantaneous vector between them is not a measurement. \
                         (Worst beat-to-beat QRS match was {rho_min:.2}.)",
                        rr_cv * 100.0,
                    )
                }
            }
            Self::FrameLengthMismatch { lead, len } => format!(
                "{lead}'s averaged beat is {len} samples where the rest are the \
                 standard frame. Nothing lines them up, so there is no shared \
                 instant to plot."
            ),
            Self::LimbLeadGeometry { relation, lead, residual } => format!(
                "Lead {lead} differs from {relation} by {:.0}% of its own \
                 amplitude. Three electrodes give one plane, so on a standard \
                 12-lead that relation holds to within rounding; these channels \
                 are not in that geometry. This transform maps from it, so the \
                 loop's coordinate frame would not be the one this recording was \
                 made in.",
                residual * 100.0,
            ),
        }
    }

    /// The leads this refusal names, for the UI to highlight. May be empty.
    pub fn leads(&self) -> Vec<String> {
        match self {
            Self::LeadsMissing(l) | Self::BaselineNotEstablished(l) => l.clone(),
            Self::NotSimultaneous { offsets_s } => {
                offsets_s.iter().map(|(n, _)| n.clone()).collect()
            }
            Self::FrameLengthMismatch { lead, .. } => vec![lead.clone()],
            Self::LimbLeadGeometry { lead, .. } => vec![lead.clone()],
            Self::NonStationary { .. } => Vec::new(),
        }
    }
}

/// What the rhythm strip established about whether the ten seconds were one
/// rhythm.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Stationarity {
    Measured { rr_cv: f64, rho_min: f32 },
    /// No rhythm strip, or too few beats for a coefficient of variation.
    NotMeasured,
}

/// Derive X/Y/Z from per-lead ensemble beats.
///
/// `beats`, `offsets_s` and `baselined` are parallel and in any lead order;
/// leads the transform does not read are ignored rather than rejected, since a
/// study carrying III and aVR is the normal case, not a malformed one.
///
/// Returns the loop or the first reason there is none. The checks run in a
/// deliberate order — see the module docs — and the first match wins, because a
/// reader given five simultaneous reasons acts on none of them.
/// The four Einthoven/Goldberger relations, as `(lead, printed form, builder)`.
///
/// Written out rather than derived from a matrix because the printed form is
/// what the refusal sentence shows a reader, and a reader checking the tool
/// against a textbook is checking this string.
/// `(lead, the relation as printed, how to build it from I and II)`.
type LimbIdentity = (&'static str, &'static str, fn(f32, f32) -> f32);

const LIMB_IDENTITIES: [LimbIdentity; 4] = [
    ("III", "II - I", |i, ii| ii - i),
    ("aVR", "-(I + II)/2", |i, ii| -(i + ii) / 2.0),
    ("aVL", "I - II/2", |i, ii| i - ii / 2.0),
    ("aVF", "II - I/2", |i, ii| ii - i / 2.0),
];

/// Whether these twelve channels are in standard 12-lead geometry.
///
/// Measured outside the transform and handed in, for the same reason
/// `Stationarity` is: it is a fact about the *recording*, established once from
/// the conditioned signals, and the transform's job is to act on it rather than
/// to re-derive it from whatever happens to be in front of it.
#[derive(Debug, Clone, PartialEq)]
pub enum LimbGeometry {
    /// The worst of the four relations, and how far off it is as a fraction of
    /// that lead's own RMS.
    Measured { relation: String, lead: String, residual: f32 },
    /// I, II, or all four derived leads were absent, so there was nothing to
    /// compare. Not a failure: an eight-lead export carrying I, II and V1-V6 is
    /// a legitimate recording this transform can read.
    NotMeasurable,
}

/// Score the limb leads against their definitions.
///
/// **Give this the samples as they arrived, before conditioning.** The identity
/// is linear and every stage between here and the ensemble beat is not:
///
///   - each lead's ensemble is aligned to its own medoid, so two leads carry a
///     relative shift of a few milliseconds — what `alignment_spread_ms`
///     reports. Scored on the beats, ptbxl:2 reads 64%.
///   - `condition()` runs a slope-limited envelope and a PCHIP interpolation,
///     neither of which distributes over a sum. Scored on the conditioned
///     signal the same record reads 36%.
///
/// Its raw limb leads agree to better than 1%. Both later stages are correct
/// and both destroy the relation, so the check has to happen upstream of them
/// or it measures the pipeline rather than the recording.
///
/// # Why the worst and not the mean
///
/// The same reason the stationarity gate reads `rho_min`: one channel out of
/// place is enough to put the derived vector in the wrong frame, and averaging
/// it against three correct ones hides exactly the case worth refusing.
///
/// Leads whose offset differs from lead I's are skipped: on a 3x4 printout they
/// are from another window of the recording, so a residual would be measuring
/// non-simultaneity, which has its own refusal and its own sentence.
pub fn limb_geometry(signals: &[(String, Vec<f32>)], offsets_s: &[f64]) -> LimbGeometry {
    let at = |name: &str| signals.iter().position(|(n, _)| n == name);
    let (Some(i_idx), Some(ii_idx)) = (at("I"), at("II")) else {
        return LimbGeometry::NotMeasurable;
    };
    let reference = offsets_s.get(i_idx).copied().unwrap_or(0.0);
    let contemporaneous = |k: usize| {
        (offsets_s.get(k).copied().unwrap_or(0.0) - reference).abs() <= 1e-9
    };
    if !contemporaneous(ii_idx) {
        return LimbGeometry::NotMeasurable;
    }
    let (i, ii) = (&signals[i_idx].1, &signals[ii_idx].1);

    let mut worst: Option<(String, String, f32)> = None;
    for (name, printed, want) in LIMB_IDENTITIES {
        let Some(k) = at(name).filter(|&k| contemporaneous(k)) else { continue };
        let got = &signals[k].1;
        // Sample-by-sample, so the grids must be the same grid. On a printout
        // each panel is its own digitised polyline with its own vertex count,
        // and comparing those by index would be measuring nothing.
        if got.len() != i.len() || got.len() != ii.len() {
            continue;
        }
        let n = got.len();
        if n == 0 {
            continue;
        }
        let mut se = 0.0f64;
        let mut sg = 0.0f64;
        for t in 0..n {
            let d = f64::from(got[t] - want(i[t], ii[t]));
            se += d * d;
            sg += f64::from(got[t]) * f64::from(got[t]);
        }
        let scale = (sg / n as f64).sqrt();
        // A lead with essentially no amplitude has no ratio worth forming; the
        // dead-channel checks upstream are what speak to that case.
        if scale < 0.02 {
            continue;
        }
        let rel = ((se / n as f64).sqrt() / scale) as f32;
        if worst.as_ref().is_none_or(|(_, _, w)| rel > *w) {
            worst = Some((name.to_string(), printed.to_string(), rel));
        }
    }
    match worst {
        Some((lead, relation, residual)) => LimbGeometry::Measured { relation, lead, residual },
        None => LimbGeometry::NotMeasurable,
    }
}

pub fn kors(
    beats: &[(String, Vec<f32>)],
    offsets_s: &[f64],
    baselined: &[bool],
    stationarity: Stationarity,
    geometry: &LimbGeometry,
) -> Result<Vcg, VcgRefusal> {
    debug_assert_eq!(beats.len(), offsets_s.len());
    debug_assert_eq!(beats.len(), baselined.len());

    // Index each required lead, in coefficient order, so everything below can
    // address them positionally.
    let mut idx = [usize::MAX; 8];
    let mut missing = Vec::new();
    for (k, want) in KORS_LEADS.iter().enumerate() {
        match beats.iter().position(|(n, _)| n == want) {
            Some(i) => idx[k] = i,
            None => missing.push((*want).to_string()),
        }
    }
    if !missing.is_empty() {
        return Err(VcgRefusal::LeadsMissing(missing));
    }

    // Simultaneity. On a WFDB record every offset is 0; on a 3x4 printout the
    // eight leads sit at four distinct offsets, and that is exactly the case a
    // derived VCG must refuse rather than draw.
    let first = offsets_s[idx[0]];
    if idx.iter().any(|&i| (offsets_s[i] - first).abs() > 1e-9) {
        return Err(VcgRefusal::NotSimultaneous {
            offsets_s: idx
                .iter()
                .map(|&i| (beats[i].0.clone(), offsets_s[i]))
                .collect(),
        });
    }

    // Geometry, checked *after* simultaneity and before anything else.
    //
    // The order is load-bearing. On a 3x4 printout the limb leads come from
    // four different 2.5 s windows, so the Einthoven relations fail because the
    // leads are not contemporaneous rather than because the electrodes were
    // elsewhere. Running this first would tell a reader their printout is not a
    // standard 12-lead, which is both wrong and unactionable.
    if let LimbGeometry::Measured { relation, lead, residual } = geometry {
        if *residual > VCG_LIMB_IDENTITY_MAX {
            return Err(VcgRefusal::LimbLeadGeometry {
                relation: relation.clone(),
                lead: lead.clone(),
                residual: *residual,
            });
        }
    }

    // An arbitrary zero translates the whole loop off the origin, which looks
    // exactly like a displaced ST vector.
    let unbaselined: Vec<String> = idx
        .iter()
        .filter(|&&i| !baselined[i])
        .map(|&i| beats[i].0.clone())
        .collect();
    if !unbaselined.is_empty() {
        return Err(VcgRefusal::BaselineNotEstablished(unbaselined));
    }

    match stationarity {
        Stationarity::Measured { rr_cv, rho_min } => {
            // Rate only. `VCG_QRS_RHO_NOTE` records why ρ cannot gate here:
            // it is floored by the ensemble's own admission threshold, so
            // testing it against a higher bar refuses almost everything for a
            // reason that has nothing to do with stationarity.
            if rr_cv > VCG_RR_CV_MAX {
                return Err(VcgRefusal::NonStationary { rr_cv, rho_min });
            }
        }
        // A screen that has not run can neither confirm nor exclude, so it
        // refuses rather than assuming the rhythm was regular.
        Stationarity::NotMeasured => {
            return Err(VcgRefusal::NonStationary { rr_cv: f64::NAN, rho_min: f32::NAN });
        }
    }

    let n = beats[idx[0]].1.len();
    for &i in &idx {
        if beats[i].1.len() != n {
            return Err(VcgRefusal::FrameLengthMismatch {
                lead: beats[i].0.clone(),
                len: beats[i].1.len(),
            });
        }
    }

    let project = |row: &[f32; 8]| -> Vec<f32> {
        (0..n)
            .map(|s| {
                let mut acc = 0.0f32;
                for (k, &c) in row.iter().enumerate() {
                    acc += c * beats[idx[k]].1[s];
                }
                acc
            })
            .collect()
    };

    Ok(Vcg { x_mv: project(&KORS_X), y_mv: project(&KORS_Y), z_mv: project(&KORS_Z) })
}

/// Derive X/Y/Z from the *conditioned continuous signals*, beat by beat.
///
/// # Why this exists beside `kors`
///
/// `kors` reads the ensemble beat, which averages every beat in the window into
/// one. That is necessary for a study whose leads are not simultaneous — a 3x4
/// printout's twelve panels are four different 2.5 s columns, and the
/// R-anchored frame is the only thing that puts them on a shared clock.
///
/// For a record whose leads *were* recorded together, averaging is not
/// necessary and costs two things. It hides beat-to-beat variation, which for
/// an ectopic beat or a run of ventricular tachycardia is the entire finding.
/// And it forces a stationarity gate — the ten seconds must be one rhythm for
/// the average to describe a beat — which is why those rhythms are refused.
///
/// So this takes the leads as recorded and transforms each sample where it
/// stands. No average, therefore no assumption that the beats were alike, and
/// therefore no stationarity gate: the loop simply shows what happened,
/// including that the beats differed.
///
/// Simultaneity is still required and still checked. It is the one assumption
/// the transform genuinely cannot do without.
pub fn kors_raw(
    signals: &[(String, Vec<f32>)],
    offsets_s: &[f64],
    baselined: &[bool],
    geometry: &LimbGeometry,
) -> Result<Vcg, VcgRefusal> {
    let mut idx = [usize::MAX; 8];
    let mut missing = Vec::new();
    for (k, want) in KORS_LEADS.iter().enumerate() {
        match signals.iter().position(|(n, _)| n == want) {
            Some(i) => idx[k] = i,
            None => missing.push((*want).to_string()),
        }
    }
    if !missing.is_empty() {
        return Err(VcgRefusal::LeadsMissing(missing));
    }

    let first = offsets_s[idx[0]];
    if idx.iter().any(|&i| (offsets_s[i] - first).abs() > 1e-9) {
        return Err(VcgRefusal::NotSimultaneous {
            offsets_s: idx.iter().map(|&i| (signals[i].0.clone(), offsets_s[i])).collect(),
        });
    }

    // Geometry, checked *after* simultaneity and before anything else.
    //
    // The order is load-bearing. On a 3x4 printout the limb leads come from
    // four different 2.5 s windows, so the Einthoven relations fail because the
    // leads are not contemporaneous rather than because the electrodes were
    // elsewhere. Running this first would tell a reader their printout is not a
    // standard 12-lead, which is both wrong and unactionable.
    if let LimbGeometry::Measured { relation, lead, residual } = geometry {
        if *residual > VCG_LIMB_IDENTITY_MAX {
            return Err(VcgRefusal::LimbLeadGeometry {
                relation: relation.clone(),
                lead: lead.clone(),
                residual: *residual,
            });
        }
    }

    let unbaselined: Vec<String> = idx
        .iter()
        .filter(|&&i| !baselined[i])
        .map(|&i| signals[i].0.clone())
        .collect();
    if !unbaselined.is_empty() {
        return Err(VcgRefusal::BaselineNotEstablished(unbaselined));
    }

    // The shortest lead bounds the transform: a sample is only a vector where
    // every contributing lead has one.
    let n = idx.iter().map(|&i| signals[i].1.len()).min().unwrap_or(0);
    if n == 0 {
        return Err(VcgRefusal::FrameLengthMismatch {
            lead: signals[idx[0]].0.clone(),
            len: 0,
        });
    }

    let project = |row: &[f32; 8]| -> Vec<f32> {
        (0..n)
            .map(|s| {
                let mut acc = 0.0f32;
                for (k, &c) in row.iter().enumerate() {
                    acc += c * signals[idx[k]].1[s];
                }
                acc
            })
            .collect()
    };

    Ok(Vcg { x_mv: project(&KORS_X), y_mv: project(&KORS_Y), z_mv: project(&KORS_Z) })
}

#[cfg(test)]
mod tests {
    use super::*;

    const N: usize = 8;

    fn steady() -> Stationarity {
        Stationarity::Measured { rr_cv: 0.02, rho_min: 0.995 }
    }

    /// Eight leads of zeros, ready to have one poked.
    fn blank() -> Vec<(String, Vec<f32>)> {
        KORS_LEADS.iter().map(|n| ((*n).to_string(), vec![0.0f32; N])).collect()
    }

    fn ok(beats: &[(String, Vec<f32>)]) -> Vcg {
        let g = limb_geometry(beats, &[0.0; 8]);
        kors(beats, &[0.0; 8], &[true; 8], steady(), &g).expect("should derive")
    }

    /// Twelve leads in which the limb leads really are combinations of I and II.
    ///
    /// The eight `blank()` leads cannot exercise the geometry gate at all —
    /// none of III/aVR/aVL/aVF is among them — so the gate needs a fixture that
    /// can pass it before anything can meaningfully fail it.
    fn twelve_lead() -> Vec<(String, Vec<f32>)> {
        let i: Vec<f32> = (0..N).map(|t| (t as f32 * 0.7).sin() * 0.8).collect();
        let ii: Vec<f32> = (0..N).map(|t| (t as f32 * 0.5).cos() * 1.1).collect();
        let derive = |f: fn(f32, f32) -> f32| -> Vec<f32> {
            (0..N).map(|t| f(i[t], ii[t])).collect()
        };
        let mut leads = vec![
            ("I".to_string(), i.clone()),
            ("II".to_string(), ii.clone()),
            ("III".to_string(), derive(|a, b| b - a)),
            ("aVR".to_string(), derive(|a, b| -(a + b) / 2.0)),
            ("aVL".to_string(), derive(|a, b| a - b / 2.0)),
            ("aVF".to_string(), derive(|a, b| b - a / 2.0)),
        ];
        for (k, v) in ["V1", "V2", "V3", "V4", "V5", "V6"].iter().enumerate() {
            leads.push((
                (*v).to_string(),
                (0..N).map(|t| ((t + k) as f32 * 0.9).sin() * 0.5).collect(),
            ));
        }
        leads
    }

    fn derive12(leads: &[(String, Vec<f32>)]) -> Result<Vcg, VcgRefusal> {
        let n = leads.len();
        kors(leads, &vec![0.0; n], &vec![true; n], steady(), &limb_geometry(leads, &vec![0.0; n]))
    }

    #[test]
    fn a_standard_twelve_lead_passes_the_geometry_check() {
        // The negative control, and it has to come first: a gate that refuses
        // everything would satisfy every test below it.
        assert!(derive12(&twelve_lead()).is_ok());
    }

    #[test]
    fn a_limb_lead_out_of_its_einthoven_relation_is_refused_and_named() {
        // Injected rather than asserted: aVR is scaled so it is no longer
        // -(I + II)/2, and the refusal must say which lead and which relation.
        //
        // Scaling by 1.5 leaves a residual of 0.5/1.5 of the *scaled* lead's own
        // RMS, since the score is relative to the lead being checked.
        let mut leads = twelve_lead();
        let k = leads.iter().position(|(n, _)| n == "aVR").unwrap();
        for v in leads[k].1.iter_mut() {
            *v *= 1.5;
        }

        match derive12(&leads) {
            Err(VcgRefusal::LimbLeadGeometry { relation, lead, residual }) => {
                assert_eq!(lead, "aVR");
                assert_eq!(relation, "-(I + II)/2");
                assert!(
                    (residual - 1.0 / 3.0).abs() < 0.01,
                    "residual {residual} should be about 0.333"
                );
            }
            other => panic!("expected LimbLeadGeometry, got {other:?}"),
        }
    }

    #[test]
    fn a_small_departure_stays_within_the_threshold() {
        // The other side of the boundary. 2% is above the corpus median of 0.6%
        // and well inside `VCG_LIMB_IDENTITY_MAX`, so real rounding noise in a
        // cart's derived leads must not refuse.
        let mut leads = twelve_lead();
        let k = leads.iter().position(|(n, _)| n == "aVF").unwrap();
        for v in leads[k].1.iter_mut() {
            *v *= 1.02;
        }
        assert!(derive12(&leads).is_ok());
    }

    #[test]
    fn simultaneity_is_decided_before_geometry() {
        // On a 3x4 printout the limb leads are different windows of the
        // recording, so the Einthoven relations fail *because* of that. The
        // reader needs to be told about the windows, not told their printout is
        // not a standard 12-lead.
        //
        // Both faults are present here: V1 sits at a different offset and aVR is
        // broken. The offsets must win.
        let mut leads = twelve_lead();
        let k = leads.iter().position(|(n, _)| n == "aVR").unwrap();
        for v in leads[k].1.iter_mut() {
            *v *= 1.5;
        }
        let n = leads.len();
        let mut offsets = vec![0.0; n];
        offsets[leads.iter().position(|(x, _)| x == "V1").unwrap()] = 2.5;

        match kors(&leads, &offsets, &vec![true; n], steady(), &limb_geometry(&leads, &offsets)) {
            Err(VcgRefusal::NotSimultaneous { .. }) => {}
            other => panic!("expected NotSimultaneous, got {other:?}"),
        }
    }

    #[test]
    fn a_derived_lead_from_another_window_is_not_scored() {
        // The same reasoning one level down. Where the eight Kors leads *are*
        // contemporaneous but a derived limb lead is not, that lead says nothing
        // about geometry and must be skipped rather than counted as a failure.
        let mut leads = twelve_lead();
        let k = leads.iter().position(|(n, _)| n == "aVR").unwrap();
        for v in leads[k].1.iter_mut() {
            *v *= 1.5;
        }
        let n = leads.len();
        let mut offsets = vec![0.0; n];
        offsets[k] = 2.5;

        assert!(kors(&leads, &offsets, &vec![true; n], steady(), &limb_geometry(&leads, &offsets)).is_ok());
    }

    #[test]
    fn an_eight_lead_export_is_not_refused_for_a_check_it_cannot_take() {
        // I, II and V1-V6 is everything the transform reads. There is no
        // cross-check available, which is not the same as failing one.
        assert!(kors(&blank(), &[0.0; 8], &[true; 8], steady(), &LimbGeometry::NotMeasurable).is_ok());
    }

    #[test]
    fn a_unit_step_in_one_lead_reproduces_that_lead_s_column() {
        // The literal columns, so a typo'd constant fails here rather than
        // agreeing with itself.
        let expect: [(f32, f32, f32); 8] = [
            (0.38, -0.07, 0.11),   // I
            (-0.07, 0.93, -0.23),  // II
            (-0.13, 0.06, -0.43),  // V1
            (0.05, -0.02, -0.06),  // V2
            (-0.01, -0.05, -0.14), // V3
            (0.14, 0.06, -0.20),   // V4
            (0.06, -0.17, -0.11),  // V5
            (0.54, 0.13, 0.31),    // V6
        ];
        for (k, name) in KORS_LEADS.iter().enumerate() {
            let mut b = blank();
            b[k].1 = vec![1.0; N];
            let v = ok(&b);
            let (ex, ey, ez) = expect[k];
            for s in 0..N {
                assert!((v.x_mv[s] - ex).abs() < 1e-6, "{name} X: {} != {ex}", v.x_mv[s]);
                assert!((v.y_mv[s] - ey).abs() < 1e-6, "{name} Y: {} != {ey}", v.y_mv[s]);
                assert!((v.z_mv[s] - ez).abs() < 1e-6, "{name} Z: {} != {ez}", v.z_mv[s]);
            }
        }
    }

    #[test]
    fn the_transform_is_linear() {
        // Catches an accidental abs, normalisation or per-sample rescale.
        let mut b1 = blank();
        let mut b2 = blank();
        for (k, (l1, l2)) in b1.iter_mut().zip(b2.iter_mut()).enumerate() {
            l1.1 = (0..N).map(|s| (k as f32 + 1.0) * s as f32 * 0.1).collect();
            l2.1 = (0..N).map(|s| (8.0 - k as f32) * (s as f32).sin()).collect();
        }
        let (a, c) = (2.5f32, -1.75f32);
        let mut mixed = blank();
        for (k, lead) in mixed.iter_mut().enumerate() {
            lead.1 = (0..N).map(|s| a * b1[k].1[s] + c * b2[k].1[s]).collect();
        }

        let (v1, v2, vm) = (ok(&b1), ok(&b2), ok(&mixed));
        for s in 0..N {
            assert!((vm.x_mv[s] - (a * v1.x_mv[s] + c * v2.x_mv[s])).abs() < 1e-4);
            assert!((vm.y_mv[s] - (a * v1.y_mv[s] + c * v2.y_mv[s])).abs() < 1e-4);
            assert!((vm.z_mv[s] - (a * v1.z_mv[s] + c * v2.z_mv[s])).abs() < 1e-4);
        }
    }

    #[test]
    fn each_output_sample_reads_only_its_own_input_sample() {
        // No smoothing, no shift. If either ever crept in, the loop would be
        // subtly rotated and nothing else would complain.
        let mut b = blank();
        b[7].1[5] = 1.0; // V6, one sample
        let v = ok(&b);
        for s in 0..N {
            let want = if s == 5 { 0.54 } else { 0.0 };
            assert!((v.x_mv[s] - want).abs() < 1e-6, "sample {s} leaked");
        }
    }

    #[test]
    fn the_derived_limb_leads_do_not_enter_the_transform() {
        // III, aVR, aVL and aVF are combinations of I and II; reading them would
        // double-count. Present or absent, the loop must be the same.
        //
        // This used to add *arbitrary* signal to those four, which was a
        // stronger statement about the transform and is no longer a legal
        // input: the geometry gate refuses limb leads that are not the
        // Einthoven combinations, so arbitrary values now fail before the
        // transform is reached. `a_limb_lead_out_of_its_einthoven_relation_is
        // _refused_and_named` covers that. What is left here is the original
        // property — the four contribute nothing — stated on a record that is
        // a standard 12-lead, which is the only kind the transform accepts.
        let mut b = blank();
        for (k, lead) in b.iter_mut().enumerate() {
            lead.1 = (0..N).map(|s| ((k + 1) * s) as f32 * 0.01).collect();
        }
        let base = ok(&b);

        let i = b[0].1.clone();
        let ii = b[1].1.clone();
        let mut extra = b.clone();
        for (name, f) in LIMB_IDENTITIES.map(|(n, _, f)| (n, f)) {
            extra.push((
                name.to_string(),
                (0..N).map(|s| f(i[s], ii[s])).collect(),
            ));
        }
        let with = kors(&extra, &[0.0; 12], &[true; 12], steady(), &limb_geometry(&extra, &[0.0; 12])).expect("should derive");
        assert_eq!(base, with);
    }

    #[test]
    fn a_missing_lead_is_refused_and_named() {
        let b: Vec<_> = blank().into_iter().filter(|(n, _)| n != "V3").collect();
        let err = kors(&b, &[0.0; 7], &[true; 7], steady(), &limb_geometry(&b, &[0.0; 7])).unwrap_err();
        assert_eq!(err.code(), "LeadsMissing");
        assert_eq!(err.leads(), vec!["V3"]);
        assert!(err.sentence().contains("V3"));
    }

    #[test]
    fn panels_from_different_columns_are_refused_because_they_are_not_one_beat() {
        // A 3x4 printout: four columns, 2.5 s apart. This is the refusal that
        // matters most, and the one a canvas could never make for itself.
        let b = blank();
        let offsets = [0.0, 0.0, 2.5, 2.5, 5.0, 5.0, 7.5, 7.5];
        let err = kors(&b, &offsets, &[true; 8], steady(), &limb_geometry(&b, &offsets)).unwrap_err();
        assert_eq!(err.code(), "NotSimultaneous");
        assert!(err.sentence().contains("never measured at the same instant"));
    }

    #[test]
    fn a_lead_whose_baseline_was_never_established_is_refused() {
        let b = blank();
        let mut based = [true; 8];
        based[3] = false; // V2
        let err = kors(&b, &[0.0; 8], &based, steady(), &limb_geometry(&b, &[0.0; 8])).unwrap_err();
        assert_eq!(err.code(), "BaselineNotEstablished");
        assert_eq!(err.leads(), vec!["V2"]);
    }

    #[test]
    fn an_unscreened_rhythm_is_refused_rather_than_assumed_regular() {
        let err = kors(&blank(), &[0.0; 8], &[true; 8], Stationarity::NotMeasured, &limb_geometry(&blank(), &[0.0; 8])).unwrap_err();
        assert_eq!(err.code(), "NonStationary");
        assert!(err.sentence().contains("never screened"));
    }

    #[test]
    fn a_low_correlation_alone_does_not_refuse() {
        // ρ is floored by the ensemble's own 0.95 admission bar, so almost every
        // real record sits just above it. Gating on it refused 92.7% of the
        // corpus for a reason unrelated to stationarity. See VCG_QRS_RHO_NOTE.
        let s = Stationarity::Measured { rr_cv: 0.02, rho_min: 0.951 };
        assert!(kors(&blank(), &[0.0; 8], &[true; 8], s, &limb_geometry(&blank(), &[0.0; 8])).is_ok());
    }

    #[test]
    fn a_varying_rate_is_refused() {
        let s = Stationarity::Measured { rr_cv: 0.14, rho_min: 0.99 };
        let err = kors(&blank(), &[0.0; 8], &[true; 8], s, &limb_geometry(&blank(), &[0.0; 8])).unwrap_err();
        assert_eq!(err.code(), "NonStationary");
        assert!(err.sentence().contains("14%"));
    }

    #[test]
    fn a_ragged_frame_is_refused_rather_than_truncated() {
        let mut b = blank();
        b[2].1 = vec![0.0; N - 1]; // V1
        let err = kors(&b, &[0.0; 8], &[true; 8], steady(), &limb_geometry(&b, &[0.0; 8])).unwrap_err();
        assert_eq!(err.code(), "FrameLengthMismatch");
    }

    #[test]
    fn the_frame_length_is_preserved() {
        assert_eq!(ok(&blank()).x_mv.len(), N);
    }

    /// The frame agrees with the leads it was derived from.
    ///
    /// Each orthogonal axis has a scalar lead pointing nearly along it, so the
    /// two must move together, and this needs no reference VCG to check:
    ///
    ///   X left-positive,      V6 points left      -> same sign
    ///   Y inferior-positive,  aVF points inferior -> same sign
    ///   Z posterior-positive, V2 points anterior  -> opposite sign
    ///
    /// The Z line is the one worth having. A flipped Z draws a loop mirrored
    /// front-to-back — smooth, plausible, and the wrong diagnosis — and nothing
    /// else in the pipeline would notice. Measured over 1,102 corpus records the
    /// real correlations are +0.95, +0.85 and -0.84, holding in 99.5%, 97.8% and
    /// 98.0% of them; this pins the signs deterministically.
    #[test]
    fn each_axis_tracks_the_lead_that_points_along_it() {
        // A deflection on one lead at a time, so each axis is read in isolation.
        let probe = |lead: &str| {
            let mut b = blank();
            let k = KORS_LEADS.iter().position(|n| *n == lead).unwrap();
            b[k].1 = vec![1.0; N];
            ok(&b)
        };

        // V6 points to the patient's left, so it drives X positive.
        assert!(probe("V6").x_mv[0] > 0.0, "V6 must push X leftward");
        // V2 sits on the front of the chest, so it drives Z *negative*.
        assert!(probe("V2").z_mv[0] < 0.0, "V2 is anterior, so Z must go negative");
        // V1 likewise, and more strongly than V2 does in X.
        assert!(probe("V1").z_mv[0] < 0.0, "V1 is anterior, so Z must go negative");
        // II is the inferior limb lead of the pair the transform reads.
        assert!(probe("II").y_mv[0] > 0.0, "II must push Y inferiorly");
    }

    #[test]
    fn the_coefficients_match_the_document() {
        // `docs/vcg-transform.md` is what a reader checks the transform against.
        // If the table and the constants drift apart, one of them is lying and
        // there is no way to tell which from inside the code.
        let doc = include_str!("../../../docs/vcg-transform.md");
        for (k, lead) in KORS_LEADS.iter().enumerate() {
            let row = doc
                .lines()
                .find(|l| l.trim_start().starts_with(&format!("| {lead} |")))
                .unwrap_or_else(|| panic!("no row for {lead} in docs/vcg-transform.md"));
            let cells: Vec<f32> = row
                .split('|')
                .filter_map(|c| c.trim().parse::<f32>().ok())
                .collect();
            assert_eq!(cells.len(), 3, "{lead}: expected X, Y and Z in {row:?}");
            assert!((cells[0] - KORS_X[k]).abs() < 1e-6, "{lead} X drifted from the doc");
            assert!((cells[1] - KORS_Y[k]).abs() < 1e-6, "{lead} Y drifted from the doc");
            assert!((cells[2] - KORS_Z[k]).abs() < 1e-6, "{lead} Z drifted from the doc");
        }
    }
}

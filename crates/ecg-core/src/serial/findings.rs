//! Study-level findings about a pair, as distinct from per-lead measurements.
//!
//! # Why conduction change is not a per-lead flag
//!
//! `register::register_lead` decides, lead by lead, whether two complexes are
//! the same shape. That is the right question for a new Q wave or fresh
//! notching, which appear in some leads and not others.
//!
//! It is the wrong question for a change in QRS *duration*. Depolarisation takes
//! as long as it takes; a new bundle branch block widens the complex in every
//! lead at once, because there is one ventricular activation and all twelve
//! leads are views of it. So duration is measured once per study, from the
//! global spatial-velocity fiducials, and compared once per pair.
//!
//! # Why correlation cannot stand in for it
//!
//! Measured on this project's own fixtures: a QRS dilated by 30% — an
//! unmistakable new block on paper — still correlates at 0.96 with the original,
//! against an interlock threshold of 0.90. Normalised cross-correlation asks
//! whether two waveforms have the same *shape*, and a dilated complex does. It
//! is not a defect in the threshold; no threshold on correlation separates a
//! widened complex from an identical one without also flagging ordinary noise.
//!
//! The measured duration, meanwhile, moved 86 → 106 ms across that same pair.
//! The information was already in the pipeline and simply was not being asked
//! for.
//!
//! # Why it matters more than any single lead's ST delta
//!
//! Three separate mechanisms in this pipeline — the baseline treatment, the
//! extra interpolation the comparison passes through, and the frame anchor —
//! produce errors that cancel in the serial delta *only while the complexes
//! match*. When conduction changes they stop cancelling together. A conduction
//! change is therefore not merely one finding among many: it is the condition
//! under which the other numbers should be read with suspicion.

use crate::config::{QRS_DURATION_CHANGE_MS, QRS_DURATION_EQUIVOCAL_MS};

/// A study-level observation about a pair of ECGs.
#[derive(Debug, Clone, PartialEq)]
pub enum SerialFinding {
    /// QRS duration changed, or may have.
    ///
    /// Carries both durations rather than only the delta, because "96 to 116 ms"
    /// and "146 to 166 ms" are the same delta and different clinical situations.
    ConductionChanged {
        reference_ms: f64,
        comparison_ms: f64,
        confidence: Conduction,
    },
}

/// How firmly a QRS-duration change can be asserted.
///
/// Three bands rather than one threshold, because the underlying distributions
/// overlap and no single cut separates them. Measured on PTB-XL, an unchanged
/// pair's |dQRS| reaches 12 ms at the 90th centile while half of complete bundle
/// branch blocks sit below 15 ms. A binary answer across that region is a choice
/// about which way to be wrong; naming the region is not.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Conduction {
    /// At or above `QRS_DURATION_CHANGE_MS`. Report it.
    Changed,
    /// Between the two thresholds. Real often enough to mention, ordinary often
    /// enough that it must not be stated as a finding.
    Equivocal,
}

impl SerialFinding {
    /// A sentence for the reader, not a log line.
    pub fn message(&self) -> String {
        match *self {
            SerialFinding::ConductionChanged {
                reference_ms,
                comparison_ms,
                confidence,
            } => {
                let d = comparison_ms - reference_ms;
                let direction = if d > 0.0 { "widened" } else { "narrowed" };
                let measured =
                    format!("QRS {direction} from {reference_ms:.0} to {comparison_ms:.0} ms ({d:+.0} ms).");
                match confidence {
                    Conduction::Changed => format!(
                        "{measured} Ventricular conduction has changed, so ST and T \
                         differences between these studies reflect the new activation \
                         sequence as well as any change in repolarisation, and cannot be \
                         cleanly separated. Interpret the per-lead deltas with that in mind."
                    ),
                    // Worded so it cannot be read as a finding. A change this size
                    // is seen in about one unchanged pair in six, so asserting it
                    // would be wrong more often than right.
                    Conduction::Equivocal => format!(
                        "{measured} That is within the range ordinary repeat recordings \
                         show, so conduction may or may not have changed — this is not a \
                         finding. It is reported because if the ST deltas below are \
                         large, a conduction change is the first thing that would \
                         explain them."
                    ),
                }
            }
        }
    }
}

/// QRS duration in milliseconds from frame indices, when both are measurable.
///
/// Fiducial getters report -1 for unmeasurable, which is why this takes signed
/// indices: a duration computed from a sentinel would be a fabrication.
pub fn qrs_duration_ms(qrs_onset: i32, qrs_offset: i32, fs_hz: f64) -> Option<f64> {
    if qrs_onset < 0 || qrs_offset < 0 || qrs_offset <= qrs_onset {
        return None;
    }
    Some((qrs_offset - qrs_onset) as f64 / fs_hz * 1000.0)
}

/// Compare two studies' global fiducials for study-level findings.
///
/// Returns nothing when either duration is unmeasurable. Silence here means "not
/// established", never "no change" — the caller must not read an empty list as
/// reassurance, which is why the study warnings surface unmeasurability
/// separately.
pub fn serial_findings(
    reference_qrs_ms: Option<f64>,
    comparison_qrs_ms: Option<f64>,
) -> Vec<SerialFinding> {
    let mut out = Vec::new();
    if let (Some(a), Some(b)) = (reference_qrs_ms, comparison_qrs_ms) {
        let d = (b - a).abs();
        let confidence = if d >= QRS_DURATION_CHANGE_MS {
            Some(Conduction::Changed)
        } else if d >= QRS_DURATION_EQUIVOCAL_MS {
            Some(Conduction::Equivocal)
        } else {
            // Below the lower edge conduction is called unchanged, positively.
            // This is the one band where saying nothing is the right answer
            // rather than an omission.
            None
        };
        if let Some(confidence) = confidence {
            out.push(SerialFinding::ConductionChanged {
                reference_ms: a,
                comparison_ms: b,
                confidence,
            });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const FS: f64 = 500.0;

    #[test]
    fn duration_needs_both_fiducials() {
        assert_eq!(qrs_duration_ms(-1, 130, FS), None);
        assert_eq!(qrs_duration_ms(85, -1, FS), None);
        // An offset at or before onset is not a short QRS, it is a broken
        // measurement, and returning 0 would let it be reported as one.
        assert_eq!(qrs_duration_ms(130, 85, FS), None);
        assert_eq!(qrs_duration_ms(85, 130, FS), Some(90.0));
    }

    #[test]
    fn an_unmeasurable_duration_produces_no_finding() {
        // Not "no change" — not established. The distinction is the whole point.
        assert!(serial_findings(None, Some(120.0)).is_empty());
        assert!(serial_findings(Some(90.0), None).is_empty());
    }

    fn band(a: f64, b: f64) -> Option<Conduction> {
        serial_findings(Some(a), Some(b)).first().map(|f| match *f {
            SerialFinding::ConductionChanged { confidence, .. } => confidence,
        })
    }

    #[test]
    fn below_the_lower_edge_conduction_is_called_unchanged() {
        // Positively unchanged, not merely unreported: a control pair's median
        // |dQRS| on PTB-XL is 4 ms, so this band is where most real repeats sit.
        assert_eq!(band(90.0, 96.0), None);
        assert_eq!(band(90.0, 84.0), None);
        assert_eq!(band(90.0, 99.9), None);
    }

    #[test]
    fn the_middle_band_is_equivocal_and_says_so() {
        assert_eq!(band(90.0, 100.0), Some(Conduction::Equivocal));
        assert_eq!(band(90.0, 104.9), Some(Conduction::Equivocal));
        assert_eq!(band(120.0, 110.0), Some(Conduction::Equivocal));

        // The wording has to survive being skim-read. An equivocal finding that
        // says "conduction has changed" is worse than no finding at all.
        let m = serial_findings(Some(90.0), Some(102.0))[0].message();
        assert!(m.contains("may or may not"), "{m}");
        assert!(m.contains("not a finding"), "{m}");
        assert!(!m.contains("has changed"), "equivocal must not assert a change: {m}");
    }

    #[test]
    fn at_or_above_the_upper_edge_it_is_a_change() {
        assert_eq!(band(90.0, 105.0), Some(Conduction::Changed));
        assert_eq!(band(90.0, 130.0), Some(Conduction::Changed));
        // Narrowing counts too: a block that resolves is as much a change as one
        // that appears, and reads the same way in the serial delta.
        assert_eq!(band(140.0, 110.0), Some(Conduction::Changed));

        let widened = serial_findings(Some(90.0), Some(120.0))[0].message();
        assert!(widened.contains("widened"), "{widened}");
        assert!(widened.contains("has changed"), "{widened}");
        let narrowed = serial_findings(Some(140.0), Some(110.0))[0].message();
        assert!(narrowed.contains("narrowed"), "{narrowed}");
    }

}

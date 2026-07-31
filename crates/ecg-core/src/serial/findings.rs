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

use crate::config::QRS_DURATION_CHANGE_MS;

/// A study-level observation about a pair of ECGs.
#[derive(Debug, Clone, PartialEq)]
pub enum SerialFinding {
    /// QRS duration changed by more than the serial threshold.
    ///
    /// Carries both durations rather than only the delta, because "96 to 116 ms"
    /// and "146 to 166 ms" are the same delta and different clinical situations.
    ConductionChanged {
        reference_ms: f64,
        comparison_ms: f64,
    },
}

impl SerialFinding {
    /// A sentence for the reader, not a log line.
    pub fn message(&self) -> String {
        match *self {
            SerialFinding::ConductionChanged {
                reference_ms,
                comparison_ms,
            } => {
                let d = comparison_ms - reference_ms;
                let direction = if d > 0.0 { "widened" } else { "narrowed" };
                format!(
                    "QRS {direction} from {reference_ms:.0} to {comparison_ms:.0} ms \
                     ({d:+.0} ms). Ventricular conduction has changed, so ST and T \
                     differences between these studies reflect the new activation \
                     sequence as well as any change in repolarisation, and cannot be \
                     cleanly separated. Interpret the per-lead deltas with that in mind."
                )
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
        if (b - a).abs() >= QRS_DURATION_CHANGE_MS {
            out.push(SerialFinding::ConductionChanged {
                reference_ms: a,
                comparison_ms: b,
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

    #[test]
    fn ordinary_variation_is_not_a_finding() {
        assert!(serial_findings(Some(90.0), Some(96.0)).is_empty());
        assert!(serial_findings(Some(90.0), Some(84.0)).is_empty());
    }

    #[test]
    fn a_widening_past_the_threshold_is_reported_both_ways() {
        let widened = serial_findings(Some(90.0), Some(110.0));
        assert_eq!(widened.len(), 1);
        assert!(widened[0].message().contains("widened"));

        // Narrowing matters too: a block that resolves is as much a change as
        // one that appears, and reads the same way in the serial delta.
        let narrowed = serial_findings(Some(140.0), Some(110.0));
        assert_eq!(narrowed.len(), 1);
        assert!(narrowed[0].message().contains("narrowed"));
    }

    #[test]
    fn the_threshold_is_inclusive() {
        // Exactly at the threshold counts. A value that lands on the boundary is
        // more likely to be a real change at the limit of resolution than a
        // coincidence, and the failure directions are not symmetric.
        assert_eq!(serial_findings(Some(90.0), Some(100.0)).len(), 1);
        assert!(serial_findings(Some(90.0), Some(99.9)).is_empty());
    }
}

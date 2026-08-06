//! The WebAssembly surface.
//!
//! JavaScript hands over irregular `(t, mV)` vertices per lead and gets back
//! ensemble beats, fiducials, and — for a pair of studies — a per-lead
//! registration. No per-sample calls cross the boundary.
//!
//! **No serial difference crossing this boundary is claimed as a change.**
//! `serial::gate` decides that, and it refuses whenever a precondition it cannot
//! evaluate stands in the way. `StudyAnalysis::evidence` is the one place those
//! holes are declared, and today it declares five of them, so every lead of
//! every real pair comes back `Unmeasurable`. The levels and the differences
//! still render, with their bands; the word "change" does not.

use wasm_bindgen::prelude::*;

use crate::beats::detect::{detect_qrs, Beat, BeatClass};
use crate::beats::ensemble::{ensemble, Provenance};
use crate::beats::panels::{beat_support, project_strip_beats, verify_panel, PanelFlag};
use crate::config::{
    KORS_LEADS, MIN_BEATS_FOR_DELTA,
    CLINICAL_DELTA_ST_MV, FRAME_T0_S, FS, LEAD_ORDER, PANEL_WINDOW_S, ST_DISPLAY_QUANTUM_MV,
};
use crate::dsp::detrend::{detrend, Detrended, ProvisionalSignal};
use crate::dsp::median_filter::provisional_detrend;
use crate::dsp::resample::{
    column_envelope, intermediate_rate, pchip_uniform, resample, Vertex,
};
use crate::fiducial::{fiducials, r_index, GlobalFiducials, Unmeasurable, FRAME_LEN};
use crate::measure::{measure_study, LeadMeasurements};
use crate::vcg::{kors, Stationarity, VcgRefusal};
use crate::serial::gate::{
    gate_all, pair_blockers, ConfounderScreens, CoverageEvidence, FilterEvidence, GainEvidence,
    IdentityEvidence, LeadEvidence, LeadVerdict, PairEvidence, RhoGain, Screen, StudyEvidence,
    SwapEvidence, TierEvidence, Verdict,
};
use crate::serial::register::register_lead;

/// One lead's irregular vertices plus where its panel sits in the record.
struct RawLead {
    name: String,
    vertices: Vec<Vertex>,
    time_offset_s: f64,
}

/// A panel that passed verification, conditioned once and reused by both passes.
struct PreparedPanel {
    name: String,
    time_offset_s: f64,
    sig: Vec<f32>,
    /// R-peak sample positions within this panel, edge-excluded beats already dropped.
    anchors: Vec<usize>,
}

/// The per-lead products of one detrend-and-ensemble pass.
struct Built {
    names: Vec<String>,
    signals: Vec<Vec<f32>>,
    offsets: Vec<f64>,
    beats: Vec<Vec<f32>>,
    sigmas: Vec<Vec<f32>>,
    n_used: Vec<u32>,
    /// Leads whose ensemble is display-only, per `EnsembleBeat::measurable`.
    display_only: Vec<String>,
    /// Parallel to `names`: whether this panel's baseline was established.
    ///
    /// `Detrended::MorphologyOnly` means no beat gave a flat enough PQ segment,
    /// so there is no isoelectric line. Every ST amplitude is a height above
    /// that line, so without it there is no ST to report — only a height above
    /// zero, and zero is wherever the trace happened to sit.
    baselined: Vec<bool>,
    /// Parallel to `names`: the worst beat-to-template QRS correlation that
    /// still entered this lead's ensemble.
    ///
    /// `ensemble()` computes it and drops it. Averaging hides morphology change
    /// by construction, so the ensemble alone cannot say whether the beats it
    /// combined were the same beat — this is the only surviving evidence, and a
    /// derived vectorcardiogram is exactly the reading that needs it.
    rho_min: Vec<f32>,
    /// Parallel to `names`: the mean alignment shift applied to this lead's
    /// beats, milliseconds.
    ///
    /// Each lead aligns to *its own* medoid, so two leads can end up with a
    /// relative time offset. On a scalar tracing that is invisible; on a loop it
    /// rotates and fattens the QRS. Kept so the spread can be reported rather
    /// than silently corrected.
    shift_mean_ms: Vec<f32>,
}

impl Built {
    /// `rr_s` is the rhythm strip's median RR. It bounds the T search, and
    /// without one there is no T offset at all — see `fiducial::t_offset`.
    fn fiducials(&self, rr_s: Option<f64>) -> GlobalFiducials {
        let weights = vec![1.0f32; self.beats.len()];
        let vm = self.beats.first().cloned().unwrap_or_else(|| vec![0.0; FRAME_LEN]);
        fiducials(&self.beats, &weights, &vm, FS, 0.0, rr_s)
    }
}

/// Detrend every panel against the onsets `onset_of` derives from each R peak,
/// then build its ensemble beat.
///
/// Taking the onset rule as a closure is what makes the two passes the same code:
/// pass 1 subtracts a nominal interval, pass 2 applies the measured offset.
fn build_pass(
    panels: &[PreparedPanel],
    provenance: Provenance,
    sigma_prov: f32,
    onset_of: impl Fn(usize) -> usize,
) -> Built {
    let mut out = Built {
        names: Vec::new(),
        signals: Vec::new(),
        offsets: Vec::new(),
        beats: Vec::new(),
        sigmas: Vec::new(),
        n_used: Vec::new(),
        display_only: Vec::new(),
        baselined: Vec::new(),
        rho_min: Vec::new(),
        shift_mean_ms: Vec::new(),
    };

    for p in panels {
        let onsets: Vec<usize> = p.anchors.iter().map(|&r| onset_of(r)).collect();

        // The measurement baseline comes from PQ anchors on the original signal,
        // never from the throwaway pass-1 median cascade.
        let prov = ProvisionalSignal::new(p.sig.clone(), FS);
        // Both variants yield samples to draw; only one yields samples to
        // measure. Unwrapping them into the same `Vec<f32>` discarded that,
        // which is the distinction `Detrended` exists to make unrepresentable —
        // so the flag travels alongside rather than being thrown away here.
        let (measurement, baselined) = match detrend(&prov, &onsets) {
            Detrended::Measurable(m) => (m.samples().to_vec(), true),
            Detrended::MorphologyOnly { v_mv, .. } => (v_mv, false),
        };

        let Ok(eb) = ensemble(&measurement, FS, &p.anchors, provenance, sigma_prov) else {
            continue;
        };
        out.names.push(p.name.clone());
        out.baselined.push(baselined);
        // The conditioned continuous panel, kept so the printout view can draw
        // the recording as it ran rather than an ensemble beat.
        out.signals.push(measurement);
        out.offsets.push(p.time_offset_s);
        out.beats.push(eb.v_mv.clone());
        out.sigmas.push(eb.sigma_mv.clone());
        out.n_used.push(eb.n_used as u32);
        // Worst correlation and mean shift, both computed by `ensemble()` and
        // otherwise discarded at this line.
        out.rho_min
            .push(eb.rho.iter().copied().fold(f32::INFINITY, f32::min));
        let shift_mean = if eb.shifts.is_empty() {
            0.0
        } else {
            eb.shifts.iter().sum::<f32>() / eb.shifts.len() as f32
        };
        out.shift_mean_ms.push(shift_mean / FS as f32 * 1000.0);
        // `measurable()` was written and then never called, so the only thing
        // stopping a single-beat lead from being gated was an INFINITY in the
        // sigma array — which anyone who later floors that array for display
        // would have removed, silently, with no test failing. The count now
        // drives the gate, and this says out loud which leads it excluded.
        if !eb.measurable() {
            out.display_only.push(p.name.clone());
        }
    }
    out
}

/// Condition irregular vertices onto the canonical grid.
fn condition(vertices: &[Vertex], max_slope: f32) -> Option<Vec<f32>> {
    if vertices.len() < 4 {
        return None;
    }
    let span = vertices[vertices.len() - 1].t_s - vertices[0].t_s;
    if !span.is_finite() || span <= 0.0 {
        return None;
    }
    let f_src = (vertices.len() - 1) as f64 / span;
    let f_int = intermediate_rate(f_src, FS);

    let cols = column_envelope(vertices, 1.0 / f_int, max_slope);
    if cols.len() < 4 {
        return None;
    }
    let uniform = pchip_uniform(&cols, f_int);
    if uniform.is_empty() {
        return None;
    }
    Some(resample(&uniform, FS).v_mv)
}

/// Accumulates one study's leads before analysis.
#[wasm_bindgen]
pub struct StudyBuilder {
    leads: Vec<RawLead>,
    rhythm: Option<Vec<Vertex>>,
}

#[wasm_bindgen]
impl StudyBuilder {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        StudyBuilder { leads: Vec::new(), rhythm: None }
    }

    /// Add one lead panel. `time_offset_s` is where its window starts within the
    /// record — 0 for column 0, 2.5 for column 1, and so on.
    pub fn add_lead(&mut self, name: &str, t_s: &[f64], v_mv: &[f32], time_offset_s: f64) {
        let n = t_s.len().min(v_mv.len());
        self.leads.push(RawLead {
            name: name.to_string(),
            vertices: (0..n).map(|i| Vertex { t_s: t_s[i], v_mv: v_mv[i] }).collect(),
            time_offset_s,
        });
    }

    /// Set the rhythm strip, which is the study's sole timing authority.
    pub fn set_rhythm(&mut self, t_s: &[f64], v_mv: &[f32]) {
        let n = t_s.len().min(v_mv.len());
        self.rhythm = Some((0..n).map(|i| Vertex { t_s: t_s[i], v_mv: v_mv[i] }).collect());
    }

    /// Condition, detect beats, build ensemble beats, and locate fiducials.
    pub fn analyze(&self, from_vector_pdf: bool) -> StudyAnalysis {
        let provenance =
            if from_vector_pdf { Provenance::VectorPdf } else { Provenance::Raster };
        let sigma_prov = if from_vector_pdf { 0.010 } else { 0.040 };

        // Rate and beat times come from the rhythm strip alone.
        let strip = self.rhythm.as_ref().and_then(|v| condition(v, 100.0));
        // Beats are kept as structs, not times: the panel verification needs the
        // full beat to reconcile a panel's timing against the strip's.
        // `rr_median_s` is carried rather than derived from `hr_bpm` later: they
        // are the same number by construction, and taking it from the detector
        // guarantees the T-search bound and `measure`'s `QT < RR` backstop can
        // never disagree about the cycle length they are both reasoning about.
        //
        // Median, not minimum. The ensemble is a median-RR object, and this is a
        // regular-rhythm defect by mechanism — under irregular RR the intruding
        // complex lands at a different index in every frame and is smeared away
        // by the combination. A min-RR bound would over-refuse AF for a failure
        // AF does not have.
        let (strip_beats, hr_bpm, rr_median_s) = match &strip {
            Some(s) => {
                let prov = provisional_detrend(s, FS, None, None);
                let det = detect_qrs(&prov, FS);
                (
                    det.beats
                        .iter()
                        .filter(|b| {
                            matches!(b.class, BeatClass::Normal | BeatClass::Unclassified)
                        })
                        .copied()
                        .collect::<Vec<Beat>>(),
                    det.hr_bpm.unwrap_or(f64::NAN),
                    det.rr_median_s,
                )
            }
            None => (Vec::new(), f64::NAN, None),
        };

        // Condition every panel once; both passes reuse the result.
        let mut panels: Vec<PreparedPanel> = Vec::new();
        let mut warnings: Vec<String> = Vec::new();
        // Edge exclusions are collected and reported once. Nine identical lines
        // is noise that buries the warnings that are specific to one lead.
        let mut edge_excluded: Vec<(String, usize, usize)> = Vec::new();

        for lead in self.leads.iter() {
            let Some(sig) = condition(&lead.vertices, 100.0) else { continue };
            let duration_s = sig.len() as f64 / FS;

            // Beats the strip says fall inside this panel, in panel-local time.
            let projected = project_strip_beats(&strip_beats, lead.time_offset_s, duration_s);
            if projected.is_empty() {
                warnings.push(format!("{}: no beats fall inside this panel", lead.name));
                continue;
            }
            let local_times: Vec<f64> = projected.iter().map(|&(_, t)| t).collect();

            // Prove the panel is where the layout says it is. A swapped column is
            // still perfectly rectangular and in the right place on the page, so
            // geometry cannot catch it; only the beat timing can.
            //
            // The column comes from `time_offset_s`, which is the field that
            // carries it and the one the projection above already uses. It was
            // previously derived from the lead's position in the insertion order
            // (`index / 3`), which assumed every caller adds leads in printout
            // order. The app does, so the two agreed and the disagreement stayed
            // invisible — until a simultaneous digital recording arrived, where
            // every lead starts at zero and nine of twelve were then excluded for
            // "timing does not match" when their timing was never in question.
            //
            // Rate-dependent, too: the survivors were the ones whose RR interval
            // happened to divide the bogus offset, because under a regular rhythm
            // an offset differing by a whole RR fits the beats identically.
            let column = (lead.time_offset_s / PANEL_WINDOW_S).round().max(0.0) as usize;
            let mapping = verify_panel(column, &local_times, &strip_beats, duration_s);
            if !mapping.usable() {
                warnings.push(format!(
                    "{}: panel excluded — its beat timing does not match the rhythm strip",
                    lead.name
                ));
                continue;
            }
            if mapping.flag == PanelFlag::Corrected {
                warnings.push(format!(
                    "{}: panel offset corrected by {:.0} ms against the rhythm strip",
                    lead.name,
                    (mapping.tau_s - mapping.tau_nominal_s) * 1000.0,
                ));
            }

            // Drop beats too close to a column boundary. A half-drawn upstroke is
            // exactly the high-amplitude, high-slope feature a peak detector wants,
            // and averaging a truncated complex into an ensemble fabricates T-wave
            // flattening with no visible artefact.
            let support = beat_support(
                &local_times,
                duration_s,
                FRAME_T0_S,
                FRAME_T0_S + FRAME_LEN as f64 / FS,
                Some((&sig, FS)),
            );
            if support.is_empty() {
                warnings.push(format!(
                    "{}: every beat sits too close to a panel edge to measure",
                    lead.name
                ));
                continue;
            }
            if support.n_rejected() > 0 {
                edge_excluded.push((
                    lead.name.clone(),
                    support.n_rejected(),
                    support.n_used() + support.n_rejected(),
                ));
            }

            let anchors: Vec<usize> = support
                .used
                .iter()
                .filter_map(|&i| local_times.get(i))
                .map(|&t| (t * FS).round().max(0.0) as usize)
                .collect();

            panels.push(PreparedPanel {
                name: lead.name.clone(),
                time_offset_s: lead.time_offset_s,
                sig,
                anchors,
            });
        }

        if !edge_excluded.is_empty() {
            let total: usize = edge_excluded.iter().map(|(_, n, _)| n).sum();
            let of: usize = edge_excluded.iter().map(|(_, _, d)| d).sum();
            let leads: Vec<&str> = edge_excluded.iter().map(|(l, _, _)| l.as_str()).collect();
            warnings.push(format!(
                "{total} of {of} beats excluded at panel edges across {} leads ({}). \
                 A complex cut by a column boundary is truncated, and averaging it in \
                 would flatten the ensemble's T wave.",
                edge_excluded.len(),
                leads.join(", "),
            ));
        }

        // --- pass 1: locate the fiducial -----------------------------------
        //
        // PQ anchors need the QRS onset, and the global onset needs detrended
        // beats — a circular dependency the spec resolves by iterating once. The
        // seed onset (R minus a nominal interval) is good enough to *find* the
        // fiducial; it is not good enough to set the baseline, which is why there
        // is a second pass.
        let seed_onset = (0.040 * FS) as usize;
        let pass1 = build_pass(&panels, provenance, sigma_prov, |r| {
            r.saturating_sub(seed_onset)
        });
        let f1 = pass1.fiducials(rr_median_s);

        // --- pass 2: re-detrend against the measured onset ------------------
        let anchor = r_index(FS);
        let (built, f, onset_shift_ms) = match f1.qrs_onset {
            Ok(onset_frame) => {
                // The frame is anchored so `anchor` is the R peak, so the onset's
                // offset from R carries straight back into per-beat coordinates.
                let delta = onset_frame as i64 - anchor as i64;
                let pass2 = build_pass(&panels, provenance, sigma_prov, |r| {
                    (r as i64 + delta).max(0) as usize
                });
                let f2 = pass2.fiducials(rr_median_s);
                let moved = f2
                    .qrs_onset
                    .ok()
                    .map(|o| (o as f64 - onset_frame as f64) / FS * 1000.0)
                    .unwrap_or(f64::NAN);
                // Prefer pass 2, but fall back if the second pass lost the
                // fiducial entirely rather than reporting nothing.
                if f2.qrs_onset.is_ok() { (pass2, f2, moved) } else { (pass1, f1, 0.0) }
            }
            Err(_) => (pass1, f1, 0.0),
        };

        // A large second-pass move means pass 1 was wrong in a way worth saying
        // out loud rather than silently correcting.
        if onset_shift_ms.is_finite() && onset_shift_ms.abs() > 20.0 {
            warnings.push(format!(
                "QRS onset moved {onset_shift_ms:.0} ms between passes — the isoelectric \
                 baseline was re-derived, but check the tracing"
            ));
        }

        let Built {
            names, signals, offsets, beats, sigmas, n_used, display_only, baselined,
            rho_min, shift_mean_ms,
        } = built;

        // A single-beat lead is not a slightly noisier lead. Its beat-to-beat
        // spread is unestimable, so the gate excludes it from every serial
        // difference — and a lead that silently produces no verdict reads as a
        // lead with nothing to report.
        if !display_only.is_empty() {
            warnings.push(format!(
                "{}: combined from a single beat, so the tracing is drawn but no serial \
                 difference in {} can be gated. A one-beat ensemble carries full \
                 single-beat noise and none of the averaging that makes a difference \
                 measurable.",
                display_only.join(", "),
                if display_only.len() == 1 { "it" } else { "them" },
            ));
        }

        // How steady the rate was across the ten seconds.
        //
        // NaN, not zero, when there are too few beats to say: a coefficient of
        // variation nobody could compute is unknown, and unknown must not read
        // as "perfectly regular" to whatever consumes it.
        let rr_cv = {
            let rr: Vec<f64> = strip_beats.iter().filter_map(|b| b.rr_prev_s).collect();
            if rr.len() < 3 {
                f64::NAN
            } else {
                let mean = rr.iter().sum::<f64>() / rr.len() as f64;
                let var = rr.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / rr.len() as f64;
                if mean > 0.0 { var.sqrt() / mean } else { f64::NAN }
            }
        };

        StudyAnalysis {
            names,
            signals,
            offsets,
            rhythm: strip.clone().unwrap_or_default(),
            beats,
            sigmas,
            n_used,
            baselined,
            rho_min,
            shift_mean_ms,
            rr_cv,
            hr_bpm,
            qrs_onset: f.qrs_onset.map(|v| v as i32).unwrap_or(-1),
            qrs_offset: f.qrs_offset.map(|v| v as i32).unwrap_or(-1),
            t_offset: f.t_offset.map(|v| v as i32).unwrap_or(-1),
            warnings,
            onset_shift_ms,
            // Overwritten by `set_gain` once the calibration pulse is read.
            //
            // The default is `NotRecorded` and not an assumed relative sigma,
            // because those two are the same float and different claims. There
            // is deliberately no bias field here any more: bias follows from the
            // source tier, which nothing measures yet, so the gate prices it at
            // the worst tier rather than at whatever the file extension implied.
            gain: GainEvidence::NotRecorded,
        }
    }
}

impl Default for StudyBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// One study, conditioned and reduced to ensemble beats.
#[wasm_bindgen]
pub struct StudyAnalysis {
    names: Vec<String>,
    /// Conditioned continuous panel per lead, millivolts at `FS`.
    signals: Vec<Vec<f32>>,
    /// Where each panel's window starts within the record, seconds.
    offsets: Vec<f64>,
    /// The conditioned rhythm strip.
    rhythm: Vec<f32>,
    beats: Vec<Vec<f32>>,
    sigmas: Vec<Vec<f32>>,
    n_used: Vec<u32>,
    /// Parallel to `names`: whether that lead's baseline was established.
    ///
    /// Carried onto the analysis rather than consumed in `build_pass`, because
    /// the measurement happens later and this is the fact that decides whether
    /// an ST amplitude exists at all.
    baselined: Vec<bool>,
    /// Parallel to `names`: worst beat-to-template QRS correlation in that
    /// lead's ensemble, and the mean alignment shift applied, milliseconds.
    /// Both are computed by `ensemble()` and were previously discarded.
    rho_min: Vec<f32>,
    shift_mean_ms: Vec<f32>,
    /// Coefficient of variation of RR across the strip; NaN when unmeasurable.
    rr_cv: f64,
    hr_bpm: f64,
    qrs_onset: i32,
    qrs_offset: i32,
    t_offset: i32,
    /// Panels excluded or corrected, and beats dropped at edges — the things a
    /// clinician must know before trusting a lead's numbers.
    warnings: Vec<String>,
    /// How far the second pass moved the QRS onset, milliseconds.
    onset_shift_ms: f64,
    /// How this study's millivolt scale was established, if it was.
    gain: GainEvidence,
}

#[wasm_bindgen]
impl StudyAnalysis {
    /// Record how this study's millivolt scale was established.
    ///
    /// `from_calibration_pulse` is the whole point of the call. A relative sigma
    /// of 0.015 read off a pulse and a relative sigma of 0.015 assumed from a
    /// header string are the same float and different claims, and only the first
    /// satisfies the gate's gain precondition.
    ///
    /// The caller no longer supplies a bias. Bias is a property of the source
    /// tier, not of the calibration, and passing it across the boundary put a
    /// clinical number in TypeScript — a live violation of decision 0004.
    pub fn set_gain(&mut self, from_calibration_pulse: bool, relative_sigma: f32) {
        self.gain = if from_calibration_pulse {
            GainEvidence::FromPulse { relative_sigma }
        } else {
            GainEvidence::Assumed { relative_sigma }
        };
    }

    /// Measurements for this study, as a JSON string.
    ///
    /// Serialised rather than exposed field by field because the shape is wide
    /// and read whole; the boundary cost is one string per study.
    pub fn measurements_json(&self) -> String {
        let m = self.measure();
        let leads: Vec<String> = m
            .leads
            .iter()
            .map(|l| {
                format!(
                    r#"{{"lead":"{}","stJ":{},"stJ60":{},"stSlope":{},"r":{},"s":{},"q":{},"qDur":{},"t":{},"sigmaSt":{},"note":{}}}"#,
                    l.lead,
                    opt(l.st_j_mv), opt(l.st_j60_mv), opt(l.st_slope_mv_s),
                    opt(l.r_amplitude_mv), opt(l.s_amplitude_mv), opt(l.q_amplitude_mv),
                    opt(l.q_duration_ms), opt(l.t_amplitude_mv),
                    // The RSS of the two terms, or null when either is
                    // unestimable. Null is the honest answer: an ST level whose
                    // uncertainty nobody could estimate has no band, and a zero
                    // here would render as a perfectly certain measurement.
                    match (l.sigma_ens_mv, l.sigma_gain_mv) {
                        (Some(e), Some(g)) if (e * e + g * g).is_finite() => {
                            format!("{:.5}", (e * e + g * g).sqrt())
                        }
                        _ => "null".into(),
                    },
                    l.st_note.map(|n| format!(r#""{n}""#)).unwrap_or_else(|| "null".into()),
                )
            })
            .collect();
        format!(
            r#"{{"hr":{},"qrs":{},"qt":{},"qtcF":{},"qtcB":{},"axis":{},"leads":[{}]}}"#,
            optd(m.hr_bpm), optd(m.qrs_ms), optd(m.qt_ms),
            optd(m.qtc_fridericia_ms), optd(m.qtc_bazett_ms), opt(m.axis_deg),
            leads.join(","),
        )
    }
    /// Lead names, in the order the beats are stored.
    #[wasm_bindgen(getter)]
    pub fn lead_names(&self) -> Vec<String> {
        self.names.clone()
    }

    /// Panels excluded or corrected, and beats dropped at panel edges.
    ///
    /// These are not diagnostics for a developer — a lead missing from the
    /// comparison because its timing did not match the rhythm strip is something
    /// the reader has to know, or its absence reads as "unchanged".
    #[wasm_bindgen(getter)]
    pub fn warnings(&self) -> Vec<String> {
        self.warnings.clone()
    }

    /// Milliseconds the QRS onset moved between the seeded and measured passes.
    #[wasm_bindgen(getter)]
    pub fn onset_shift_ms(&self) -> f64 {
        self.onset_shift_ms
    }

    /// One lead's ensemble beat: `FRAME_LEN` samples in millivolts.
    pub fn beat(&self, lead: &str) -> Option<Vec<f32>> {
        self.index_of(lead).map(|i| self.beats[i].clone())
    }

    /// One lead's conditioned continuous panel, millivolts at `FS`.
    ///
    /// This is what the printout view draws: the recording as it ran, not a
    /// combined beat.
    pub fn lead_signal(&self, lead: &str) -> Option<Vec<f32>> {
        self.index_of(lead).map(|i| self.signals[i].clone())
    }

    /// Where a lead's panel starts within the record, seconds.
    pub fn lead_offset_s(&self, lead: &str) -> f64 {
        self.index_of(lead).map(|i| self.offsets[i]).unwrap_or(0.0)
    }

    /// The conditioned rhythm strip, millivolts at `FS`.
    #[wasm_bindgen(getter)]
    pub fn rhythm_signal(&self) -> Vec<f32> {
        self.rhythm.clone()
    }

    /// One lead's per-sample standard deviation, millivolts.
    pub fn sigma(&self, lead: &str) -> Option<Vec<f32>> {
        self.index_of(lead).map(|i| self.sigmas[i].clone())
    }

    /// ST level at the J point for one lead, millivolts; NaN when unmeasurable.
    ///
    /// A scalar accessor alongside `measurements_json`, so callers that want one
    /// number do not have to parse the whole report.
    pub fn st_j_mv(&self, lead: &str) -> f64 {
        self.lead_measurements()
            .iter()
            .find(|l| l.lead == lead)
            .and_then(|l| l.st_j_mv)
            .map(|v| v as f64)
            .unwrap_or(f64::NAN)
    }

    /// Beats combined into this lead's ensemble.
    pub fn beats_used(&self, lead: &str) -> u32 {
        self.index_of(lead).map(|i| self.n_used[i]).unwrap_or(0)
    }

    #[wasm_bindgen(getter)]
    pub fn hr_bpm(&self) -> f64 {
        self.hr_bpm
    }

    /// Frame index of global QRS onset, or −1 when unmeasurable.
    #[wasm_bindgen(getter)]
    pub fn qrs_onset(&self) -> i32 {
        self.qrs_onset
    }

    #[wasm_bindgen(getter)]
    pub fn qrs_offset(&self) -> i32 {
        self.qrs_offset
    }

    #[wasm_bindgen(getter)]
    pub fn t_offset(&self) -> i32 {
        self.t_offset
    }

    #[wasm_bindgen(getter)]
    pub fn frame_len(&self) -> usize {
        FRAME_LEN
    }

    #[wasm_bindgen(getter)]
    pub fn anchor_index(&self) -> usize {
        r_index(FS)
    }

    /// This study's vectorcardiogram, derived from its ensemble beats.
    ///
    /// Always returns a value. A study the transform cannot be applied to comes
    /// back carrying a refusal and **empty** arrays — never zero-filled ones. A
    /// loop of zeros draws a dot at the origin, and a null vector is a finding.
    pub fn vcg(&self) -> VcgLoops {
        let beats: Vec<(String, Vec<f32>)> = self
            .names
            .iter()
            .cloned()
            .zip(self.beats.iter().cloned())
            .collect();

        // The gate reads the worst lead, not the average: one lead whose beats
        // disagree is enough to make the instantaneous vector meaningless.
        let rho_min = self
            .rho_min
            .iter()
            .copied()
            .fold(f32::INFINITY, f32::min);
        let stationarity = if self.rr_cv.is_nan() || !rho_min.is_finite() {
            Stationarity::NotMeasured
        } else {
            Stationarity::Measured { rr_cv: self.rr_cv, rho_min }
        };

        // Each lead aligns to its own medoid, so the leads can drift relative to
        // one another. Reported, never silently corrected — re-aligning eight
        // leads to a common template would be a new estimator with no test.
        let spread = if self.shift_mean_ms.is_empty() {
            0.0
        } else {
            let hi = self.shift_mean_ms.iter().copied().fold(f32::NEG_INFINITY, f32::max);
            let lo = self.shift_mean_ms.iter().copied().fold(f32::INFINITY, f32::min);
            hi - lo
        };

        let mut notes = Vec::new();
        for (i, name) in self.names.iter().enumerate() {
            if KORS_LEADS.contains(&name.as_str()) && self.n_used[i] < MIN_BEATS_FOR_DELTA {
                notes.push(format!(
                    "{name} was averaged from a single beat, so its contribution \
                     carries full single-beat noise."
                ));
            }
        }
        if spread > 4.0 {
            notes.push(format!(
                "The contributing leads were aligned to their own beats and differ \
                 by up to {spread:.1} ms. On a loop that rotates and widens the QRS \
                 rather than shifting it."
            ));
        }

        match kors(&beats, &self.offsets, &self.baselined, stationarity) {
            Ok(v) => VcgLoops {
                x_mv: v.x_mv,
                y_mv: v.y_mv,
                z_mv: v.z_mv,
                qrs_onset: self.qrs_onset,
                qrs_offset: self.qrs_offset,
                t_offset: self.t_offset,
                refusal: None,
                notes,
                alignment_spread_ms: spread,
            },
            Err(r) => VcgLoops {
                x_mv: Vec::new(),
                y_mv: Vec::new(),
                z_mv: Vec::new(),
                qrs_onset: -1,
                qrs_offset: -1,
                t_offset: -1,
                refusal: Some(r),
                notes,
                alignment_spread_ms: spread,
            },
        }
    }

    /// Coefficient of variation of RR across the strip; NaN if unmeasurable.
    ///
    /// Named apart from the field it reads: a private field shadows a same-named
    /// method for callers outside the crate, including this crate's own
    /// integration tests, which is where it bit.
    #[wasm_bindgen(getter = rr_cv)]
    pub fn rr_cv_measured(&self) -> f64 {
        self.rr_cv
    }

    /// Worst beat-to-template QRS correlation across every lead's ensemble.
    #[wasm_bindgen(getter = rho_min)]
    pub fn rho_min_measured(&self) -> f32 {
        self.rho_min.iter().copied().fold(f32::INFINITY, f32::min)
    }

    fn index_of(&self, lead: &str) -> Option<usize> {
        self.names.iter().position(|n| n == lead)
    }
}

impl StudyAnalysis {
    fn fiducials(&self) -> GlobalFiducials {
        let cvt = |v: i32| {
            if v >= 0 { Ok(v as usize) } else { Err(Unmeasurable::NoActivation) }
        };
        GlobalFiducials {
            qrs_onset: cvt(self.qrs_onset),
            qrs_offset: cvt(self.qrs_offset),
            t_offset: cvt(self.t_offset),
            sv_peak: 1.0,
        }
    }

    fn measure(&self) -> crate::measure::StudyMeasurements {
        let leads: Vec<(String, Vec<f32>, Vec<f32>)> = self
            .names
            .iter()
            .enumerate()
            .map(|(i, n)| (n.clone(), self.beats[i].clone(), self.sigmas[i].clone()))
            .collect();
        let hr = if self.hr_bpm.is_finite() { Some(self.hr_bpm) } else { None };
        // `n_used` was computed by the ensemble stage and never plumbed anywhere.
        // It is the reason a single-beat lead was only fail-closed by accident:
        // nothing stopped it being gated except an INFINITY in a sigma array.
        measure_study(
            &leads,
            &self.fiducials(),
            hr,
            self.gain.relative_sigma(),
            &self.n_used,
            &self.baselined,
        )
    }

    fn lead_measurements(&self) -> Vec<LeadMeasurements> {
        self.measure().leads
    }

    /// This study's side of the gate's evidence, as the pipeline can supply it
    /// today.
    ///
    /// This is the single site where a hole is declared. Every `NotMeasured` /
    /// `NotChecked` / `NotDetermined` / `Unreadable` below is a pipeline
    /// capability that does not exist, named so that closing it is one visible
    /// edit here and a changed assertion in
    /// `the_boundary_declares_every_hole_it_still_has`.
    ///
    /// The fields are `pub`, so a test can supply a hole and exercise the gate
    /// beyond it without a test-only constructor. Production code must not: an
    /// overwrite here is a claim that something was measured.
    pub fn evidence(&self) -> StudyEvidence {
        let m = self.measure();
        StudyEvidence {
            // No runtime tier estimator exists (spec §5.1 measures tier from
            // grid pitch, edge rise, tile pitch spread and illumination range).
            // Claiming tier A because the bytes arrived in a PDF is exactly the
            // substitution decision 44 names by hand.
            tier: TierEvidence::NotMeasured,
            gain: self.gain,
            // The cart's header text is not parsed, so the high-pass corner is
            // unknown rather than absent. §8 risk 3 prices that; it does not
            // refuse it.
            filter: FilterEvidence::Unreadable,
            // No permutation search (§17), so the cable arrangement is
            // undetermined. Einthoven's law holds under an LA/RA reversal, so
            // the identity checks could not stand in for this even if they ran.
            swap: SwapEvidence::NotDetermined,
            // The identity residuals live in TypeScript at a different
            // normalisation (`layout.ts`'s EINTHOVEN_MAX 0.20 against §17's
            // ID_LIMB_PASS 0.03), and reconciling the two is not a rename.
            identity: IdentityEvidence::NotChecked,
            hr_bpm: if self.hr_bpm.is_finite() { Some(self.hr_bpm) } else { None },
            leads: m
                .leads
                .iter()
                .enumerate()
                .map(|(i, l)| LeadEvidence {
                    lead: l.lead.clone(),
                    st_j_mv: l.st_j_mv,
                    // Conservative by roughly √10 in the safe direction: the
                    // ensemble sigma is read at the single J-point sample while
                    // st_j_mv is a 20 ms mean of ten. Fixing the estimator and
                    // retuning the MDC floor are one decision, and not this one.
                    var_indep_mv2: l.sigma_ens_mv.map(|s| s * s),
                    sigma_gain_mv: l.sigma_gain_mv,
                    n_beats: self.n_used.get(i).copied().unwrap_or(0),
                    // The resample validity mask is dropped in `condition`
                    // before it can be carried through the ensemble, so the
                    // fraction of the ST window backed by real samples is not
                    // measured. Assuming 1.0 would let an ST level computed
                    // entirely from interpolated pixels read as a measured one.
                    coverage_st: CoverageEvidence::NotMeasured,
                })
                .collect(),
        }
    }
}

fn opt(v: Option<f32>) -> String {
    v.filter(|x| x.is_finite()).map(|x| format!("{x:.4}")).unwrap_or_else(|| "null".into())
}

fn optd(v: Option<f64>) -> String {
    v.filter(|x| x.is_finite()).map(|x| format!("{x:.2}")).unwrap_or_else(|| "null".into())
}

/// Study-level findings about a pair, above and beyond the per-lead deltas.
///
/// Currently one: a change in QRS duration. It is reported separately from the
/// lead measurements, and should be shown more prominently than any of them,
/// because it changes how all of them are to be read — when ventricular
/// conduction changes, ST and T differences carry the new activation sequence as
/// well as any change in repolarisation, and the two cannot be separated.
/// The findings as plain sentences, for callers that only need to know whether
/// there are any. `serial_findings_json` carries the level too.
#[wasm_bindgen]
pub fn serial_findings(reference: &StudyAnalysis, comparison: &StudyAnalysis) -> Vec<String> {
    use crate::serial::findings::{qrs_duration_ms, serial_findings as findings};
    findings(
        qrs_duration_ms(reference.qrs_onset, reference.qrs_offset, FS),
        qrs_duration_ms(comparison.qrs_onset, comparison.qrs_offset, FS),
    )
    .iter()
    .map(|f| f.message())
    .collect()
}

/// Emitted as JSON because a finding carries a level as well as a sentence, and
/// the caller must be able to style an equivocal one differently. Handing the UI
/// bare strings would leave it inferring the level by reading the prose, which
/// is how an equivocal finding ends up rendered in the same red as a confirmed
/// one.
#[wasm_bindgen]
pub fn serial_findings_json(reference: &StudyAnalysis, comparison: &StudyAnalysis) -> String {
    use crate::serial::findings::{qrs_duration_ms, serial_findings as findings, Conduction, SerialFinding};
    let rows: Vec<String> = findings(
        qrs_duration_ms(reference.qrs_onset, reference.qrs_offset, FS),
        qrs_duration_ms(comparison.qrs_onset, comparison.qrs_offset, FS),
    )
    .iter()
    .map(|f| {
        let level = match *f {
            SerialFinding::ConductionChanged { confidence, .. } => match confidence {
                Conduction::Changed => "changed",
                Conduction::Equivocal => "equivocal",
            },
        };
        // The message is prose and may contain quotes or backslashes.
        let text = f.message().replace('\\', "\\\\").replace('"', "\\\"");
        format!(r#"{{"level":"{level}","text":"{text}"}}"#)
    })
    .collect();
    format!("[{}]", rows.join(","))
}

/// The screens that apply to a pair rather than to one study.
///
/// One of the seven can be run today. `serial::findings` compares the two
/// studies' global QRS durations, which is the change no correlation interlock
/// can see — a complex dilated by 30% still correlates at 0.96, because it is
/// the same shape drawn wider. The other six are `NotScreened`, which counts as
/// present: a screen that has not run can neither confirm nor exclude what it
/// looks for.
fn pair_screens(reference: &StudyAnalysis, comparison: &StudyAnalysis) -> ConfounderScreens {
    use crate::serial::findings::{qrs_duration_ms, serial_findings as findings};
    let a = qrs_duration_ms(reference.qrs_onset, reference.qrs_offset, FS);
    let b = qrs_duration_ms(comparison.qrs_onset, comparison.qrs_offset, FS);
    let conduction = match (a, b) {
        // Silence from `serial_findings` means "no change past the threshold"
        // only when both durations were measurable. When either is not, nothing
        // was established and the screen has not run.
        (Some(_), Some(_)) if findings(a, b).is_empty() => Screen::Clear,
        (Some(_), Some(_)) => Screen::Present,
        _ => Screen::NotScreened,
    };
    ConfounderScreens {
        paper_speed: Screen::NotScreened,
        zero_sum_residual: Screen::NotScreened,
        pq_baseline: Screen::NotScreened,
        precordial_shift: Screen::NotScreened,
        ventricular_conduction_class: Screen::NotScreened,
        rhythm_class: Screen::NotScreened,
        conduction,
    }
}

/// The gate's verdicts for one pair, computed once and shared by both exports.
fn verdicts_of(
    reference: &StudyAnalysis,
    comparison: &StudyAnalysis,
) -> (Vec<LeadVerdict>, Vec<crate::serial::gate::Refusal>) {
    let (a, b) = (reference.evidence(), comparison.evidence());
    let screens = pair_screens(reference, comparison);
    let pair = PairEvidence {
        reference: &a,
        comparison: &b,
        screens: &screens,
        // Nothing in the pipeline evidences that two studies came off the same
        // cart at the same printed gain, and rho > 0 narrows the interval.
        rho_gain: RhoGain::Default,
    };
    (gate_all(&pair), pair_blockers(&pair))
}

/// Leads whose serial ST change is significant in **both** uncertainty bands.
///
/// §5.3's point is that showing one band alone misleads, and a list of names can
/// only show one — so it shows the conservative one. A lead appears here only
/// when the change survives the repeat-recording variation nobody controls as
/// well as the digitisation error this pipeline does. `st_verdicts_json` carries
/// both bands and is the authority for anything a reader sees.
///
/// Expect this to be empty on every real pair until the gate's evidence exists.
/// That is the honest state of the pipeline, not a bug in this function.
#[wasm_bindgen]
pub fn significant_st_leads(reference: &StudyAnalysis, comparison: &StudyAnalysis) -> Vec<String> {
    verdicts_of(reference, comparison)
        .0
        .into_iter()
        .filter(|v| {
            matches!(v.digitization, Verdict::Significant { .. })
                && matches!(v.with_bio, Verdict::Significant { .. })
        })
        .map(|v| v.lead)
        .collect()
}

/// The five-state serial ST verdict for all twelve leads, as a JSON string.
///
/// Twelve rows unconditionally, in canonical order. A lead absent from either
/// study gets a row saying so, because dropping it makes "absent"
/// indistinguishable from "not notable".
#[wasm_bindgen]
pub fn st_verdicts_json(reference: &StudyAnalysis, comparison: &StudyAnalysis) -> String {
    let (verdicts, blockers) = verdicts_of(reference, comparison);

    let blocker_rows: Vec<String> = blockers
        .iter()
        .map(|r| {
            format!(
                r#"{{"code":"{}","sentence":"{}"}}"#,
                r.code(),
                escape(&r.sentence())
            )
        })
        .collect();

    let lead_rows: Vec<String> = verdicts
        .iter()
        .map(|v| {
            format!(
                r#"{{"lead":"{}","deltaMv":{},"digitization":{},"withBio":{}}}"#,
                v.lead,
                opt(v.delta_mv),
                verdict_json(&v.digitization),
                verdict_json(&v.with_bio),
            )
        })
        .collect();

    format!(
        r#"{{"clinicalThresholdMv":{CLINICAL_DELTA_ST_MV},"stDisplayQuantumMv":{ST_DISPLAY_QUANTUM_MV},"pairBlockers":[{}],"leads":[{}]}}"#,
        blocker_rows.join(","),
        lead_rows.join(","),
    )
}

/// One verdict as a plain-data object.
///
/// `state` is the discriminant; `reason` carries the refusal or the
/// indeterminacy and is null on the other three states. Every numeric field is
/// null where the state does not define it, rather than zero — a zero MDC on a
/// refusal is the same lie this whole change exists to remove.
fn verdict_json(v: &Verdict) -> String {
    let reason = match v {
        Verdict::Unmeasurable { reason } => format!(r#""{}""#, reason.code()),
        Verdict::Indeterminate { reason, .. } => format!(r#""{}""#, reason.code()),
        _ => "null".into(),
    };
    let ci = match v {
        Verdict::Significant { ci_mv, .. } => {
            format!("[{:.4},{:.4}]", ci_mv.0, ci_mv.1)
        }
        _ => "null".into(),
    };
    let bound = match v {
        Verdict::NoChange { bound_mv, .. } => format!("{bound_mv:.4}"),
        _ => "null".into(),
    };
    let confounders: Vec<String> =
        v.confounders().iter().map(|c| format!(r#""{}""#, c.code())).collect();
    let limiter = match v.limiter() {
        Some(l) => format!(
            r#"{{"study":"{}","sigmaMv":{:.4},"ratio":{:.4},"dominant":{}}}"#,
            l.study.code(),
            l.sigma_mv,
            l.ratio,
            l.dominant
        ),
        None => "null".into(),
    };
    format!(
        r#"{{"state":"{}","reason":{},"mdcMv":{},"ciMv":{},"boundMv":{},"confounders":[{}],"limiter":{}}}"#,
        v.state(),
        reason,
        opt(v.mdc_mv()),
        ci,
        bound,
        confounders.join(","),
        limiter,
    )
}

/// Escape a sentence for embedding in a JSON string literal.
///
/// The refusal sentences are prose written in this crate, not user input, but
/// they contain quotation-worthy punctuation and one of them will eventually
/// contain a quote. A JSON payload that fails to parse takes the whole
/// comparison down, so this is not optional.
fn escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

/// One lead's registration between two studies.
#[wasm_bindgen]
pub struct LeadComparison {
    lead: String,
    lag_ms: f32,
    rho_qrs: f32,
    rms_difference_mv: f32,
    aligned_mv: Vec<f32>,
    difference_mv: Vec<f32>,
    morphology_changed: bool,
    align_implausible: bool,
}

#[wasm_bindgen]
impl LeadComparison {
    #[wasm_bindgen(getter)]
    pub fn lead(&self) -> String {
        self.lead.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn lag_ms(&self) -> f32 {
        self.lag_ms
    }
    #[wasm_bindgen(getter)]
    pub fn rho_qrs(&self) -> f32 {
        self.rho_qrs
    }
    #[wasm_bindgen(getter)]
    pub fn rms_difference_mv(&self) -> f32 {
        self.rms_difference_mv
    }
    #[wasm_bindgen(getter)]
    pub fn aligned_mv(&self) -> Vec<f32> {
        self.aligned_mv.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn difference_mv(&self) -> Vec<f32> {
        self.difference_mv.clone()
    }
    /// The QRS shapes disagreed, so no shift was applied. A finding, not an error.
    #[wasm_bindgen(getter)]
    pub fn morphology_changed(&self) -> bool {
        self.morphology_changed
    }
    #[wasm_bindgen(getter)]
    pub fn align_implausible(&self) -> bool {
        self.align_implausible
    }
}

/// Register every lead the two studies share.
///
/// Leads present in only one study are omitted rather than compared against
/// nothing.
#[wasm_bindgen]
pub fn compare_studies(
    reference: &StudyAnalysis,
    comparison: &StudyAnalysis,
) -> Vec<LeadComparison> {
    use crate::serial::register::AlignFlag;

    // The window comes from the reference alone, deliberately.
    //
    // Widening it to the union of both studies' QRS extents was tried, on the
    // theory that a widened complex puts its new terminal deflection outside the
    // reference's window where correlation never scores it. Measured, it bought
    // nothing — a 30% dilated QRS still correlates at 0.96, because it is the
    // same shape drawn wider — and it cost something real: the comparison's
    // measured QRS offset sits slightly later when ST is elevated, so the union
    // window reached into the ST segment and pulled a genuine ST difference into
    // the QRS correlation. That is the contamination `qrs_window` exists to
    // prevent.
    //
    // Duration change is detected on the fiducials instead, by
    // `serial::findings`, where the signal actually is.
    let onset = if reference.qrs_onset >= 0 {
        reference.qrs_onset as usize
    } else {
        r_index(FS).saturating_sub((0.040 * FS) as usize)
    };
    let offset = if reference.qrs_offset >= 0 {
        reference.qrs_offset as usize
    } else {
        r_index(FS) + (0.060 * FS) as usize
    };

    let mut out = Vec::new();
    for name in LEAD_ORDER {
        let (Some(a), Some(b)) = (reference.index_of(name), comparison.index_of(name)) else {
            continue;
        };
        let r = register_lead(&reference.beats[a], &comparison.beats[b], onset, offset, FS);
        out.push(LeadComparison {
            lead: name.to_string(),
            lag_ms: r.lag_samples / FS as f32 * 1000.0,
            rho_qrs: r.rho_qrs,
            rms_difference_mv: r.rms_difference_mv,
            aligned_mv: r.aligned_mv,
            difference_mv: r.difference_mv,
            morphology_changed: r.flags.contains(&AlignFlag::QrsMorphologyChanged),
            align_implausible: r.flags.contains(&AlignFlag::AlignImplausible),
        });
    }
    out
}

/// Build identifier, surfaced so a rendered comparison can be traced to its code.
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Round-trip check across the JS/WASM boundary, in millivolts.
#[wasm_bindgen]
pub fn rms_mv(samples_mv: &[f32]) -> f32 {
    crate::dsp::rms(samples_mv)
}

/// Conditioning and beat detection for a single strip.
///
/// Retained alongside the study-level API because one strip is the smallest
/// thing worth looking at, and the trial page uses it to show what a wrong
/// paper-speed assumption does to the reported rate.
#[wasm_bindgen]
pub struct StripAnalysis {
    samples: Vec<f32>,
    r_samples: Vec<u32>,
    beat_classes: Vec<u8>,
    hr_bpm: f64,
    edge_samples: u32,
    flags: Vec<u8>,
}

#[wasm_bindgen]
impl StripAnalysis {
    #[wasm_bindgen(getter)]
    pub fn samples(&self) -> Vec<f32> { self.samples.clone() }
    #[wasm_bindgen(getter)]
    pub fn flags(&self) -> Vec<u8> { self.flags.clone() }
    #[wasm_bindgen(getter)]
    pub fn r_samples(&self) -> Vec<u32> { self.r_samples.clone() }
    #[wasm_bindgen(getter)]
    pub fn beat_classes(&self) -> Vec<u8> { self.beat_classes.clone() }
    #[wasm_bindgen(getter)]
    pub fn hr_bpm(&self) -> f64 { self.hr_bpm }
    #[wasm_bindgen(getter)]
    pub fn fs_hz(&self) -> f64 { FS }
    #[wasm_bindgen(getter)]
    pub fn t0_s(&self) -> f64 { 0.0 }
    #[wasm_bindgen(getter)]
    pub fn edge_samples(&self) -> u32 { self.edge_samples }
    #[wasm_bindgen(getter)]
    pub fn beat_count(&self) -> usize { self.r_samples.len() }
}

/// Condition an irregularly sampled strip and locate its beats.
#[wasm_bindgen]
pub fn analyze_strip(t_s: &[f64], v_mv: &[f32], max_slope_mv_per_s: f32) -> StripAnalysis {
    let empty = StripAnalysis {
        samples: Vec::new(), r_samples: Vec::new(), beat_classes: Vec::new(),
        hr_bpm: f64::NAN, edge_samples: 0, flags: Vec::new(),
    };
    let n = t_s.len().min(v_mv.len());
    if n < 4 { return empty; }

    let vertices: Vec<Vertex> = (0..n).map(|i| Vertex { t_s: t_s[i], v_mv: v_mv[i] }).collect();
    let slope = if max_slope_mv_per_s > 0.0 { max_slope_mv_per_s } else { 100.0 };

    let span = vertices[n - 1].t_s - vertices[0].t_s;
    if !span.is_finite() || span <= 0.0 { return empty; }
    let f_int = intermediate_rate((n - 1) as f64 / span, FS);

    let cols = column_envelope(&vertices, 1.0 / f_int, slope);
    if cols.len() < 4 { return empty; }
    let uniform = pchip_uniform(&cols, f_int);
    if uniform.is_empty() { return empty; }
    let out = resample(&uniform, FS);

    let detrended = provisional_detrend(&out.v_mv, FS, None, None);
    let det = detect_qrs(&detrended, FS);

    StripAnalysis {
        samples: detrended,
        flags: out.flags,
        r_samples: det.beats.iter().map(|b| b.r_sample as u32).collect(),
        beat_classes: det.beats.iter().map(|b| match b.class {
            BeatClass::Normal => 0,
            BeatClass::Premature => 1,
            BeatClass::PostEctopic => 2,
            BeatClass::Unclassified => 3,
        }).collect(),
        hr_bpm: det.hr_bpm.unwrap_or(f64::NAN),
        edge_samples: out.edge_samples as u32,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A study built from a plausible synthetic beat, so that `evidence()` has
    /// something to describe.
    ///
    /// Sums of Gaussians rather than ramps: the QRS detector wants a slope it
    /// recognises, and a triangular spike gives it one that no rate estimator
    /// then agrees with.
    fn a_study() -> StudyAnalysis {
        let n = (10.0 * FS) as usize;
        let rr = 60.0 / 68.0;
        let g = |dt: f64, centre: f64, width: f64, amp: f32| -> f32 {
            let z = (dt - centre) / width;
            amp * (-0.5 * z * z).exp() as f32
        };
        let sig: Vec<f32> = (0..n)
            .map(|i| {
                let t = i as f64 / FS;
                let mut v = 0.0f32;
                let mut peak = 0.4;
                while peak < 10.0 {
                    let dt = t - peak;
                    if (-0.45..0.55).contains(&dt) {
                        v += g(dt, -0.17, 0.022, 0.15)
                            + g(dt, -0.026, 0.007, -0.05)
                            + g(dt, 0.0, 0.011, 1.05)
                            + g(dt, 0.028, 0.011, -0.08)
                            + g(dt, 0.21, 0.048, 0.32);
                    }
                    peak += rr;
                }
                v
            })
            .collect();
        let t: Vec<f64> = (0..n).map(|k| k as f64 / FS).collect();

        let mut b = StudyBuilder::new();
        for name in LEAD_ORDER {
            b.add_lead(name, &t, &sig, 0.0);
        }
        b.set_rhythm(&t, &sig);
        b.analyze(true)
    }

    #[test]
    fn the_vcg_accessor_always_answers_and_never_fakes_a_loop() {
        let v = a_study().vcg();
        let refusal = v.refusal_json();

        if refusal == "null" {
            // A derived loop is exactly as long as the frame it came from, so a
            // cursor index into the tracing indexes the loop too.
            assert_eq!(v.x_mv().len(), FRAME_LEN);
            assert_eq!(v.y_mv().len(), FRAME_LEN);
            assert_eq!(v.z_mv().len(), FRAME_LEN);
            assert_eq!(v.anchor_index(), r_index(FS));
        } else {
            // The alternative to a loop is empty arrays and a reason — never
            // zeros, which would draw a dot at the origin, and a null vector is
            // itself a finding.
            assert!(v.x_mv().is_empty(), "a refusal must carry no samples");
            assert!(v.y_mv().is_empty());
            assert!(v.z_mv().is_empty());
            assert!(refusal.contains("\"code\""), "{refusal}");
            assert!(refusal.contains("\"sentence\""), "{refusal}");
        }
    }

    #[test]
    fn panels_from_a_printout_are_refused_at_the_boundary() {
        // The four columns of a 3x4 printout are four different 2.5 s windows.
        // This is the refusal a canvas could never make for itself, so it has to
        // hold at the boundary and not only in `vcg::kors`.
        let n = (10.0 * FS) as usize;
        let t: Vec<f64> = (0..n).map(|k| k as f64 / FS).collect();
        let sig = vec![0.0f32; n];
        let mut b = StudyBuilder::new();
        for (k, name) in LEAD_ORDER.iter().enumerate() {
            b.add_lead(name, &t, &sig, (k / 3) as f64 * 2.5);
        }
        b.set_rhythm(&t, &sig);

        let v = b.analyze(true).vcg();
        let r = v.refusal_json();
        assert!(r.contains("NotSimultaneous") || r.contains("LeadsMissing"), "{r}");
        assert!(v.x_mv().is_empty());
    }

    #[test]
    fn the_three_planes_are_named_and_distinct() {
        let j = vcg_planes_json();
        for id in ["frontal", "horizontal", "sagittal"] {
            assert!(j.contains(id), "{id} missing from {j}");
        }
        // The sagittal plane reads Z backwards so anterior is to the right; if
        // that sign ever vanished, every loop would be mirrored front-to-back.
        assert!(j.contains("\"sign\":-1"), "no axis is inverted: {j}");
        assert!(j.contains("posterior") && j.contains("anterior") && j.contains("inferior"));
    }

    /// Every hole the boundary still has, named.
    ///
    /// This test fails when a hole closes, which is the point: closing one is a
    /// deliberate act with a visible diff, not something that happens because a
    /// field acquired a plausible-looking default. Closing a hole is four edits
    /// — measure it, construct the `Measured` variant in `evidence`, update this
    /// assertion, and delete the row from the table in decision 0007 §6.
    #[test]
    fn the_boundary_declares_every_hole_it_still_has() {
        let e = a_study().evidence();

        // 1. No runtime source-tier estimator (spec §5.1).
        assert_eq!(e.tier, TierEvidence::NotMeasured);
        // 2. The cart's header text is not parsed for a high-pass corner.
        assert_eq!(e.filter, FilterEvidence::Unreadable);
        // 3. No permutation search for the cable arrangement (spec §17).
        assert_eq!(e.swap, SwapEvidence::NotDetermined);
        // 4. The identity residuals live in TypeScript at another normalisation.
        assert_eq!(e.identity, IdentityEvidence::NotChecked);
        // 5. The resample validity mask is dropped before the ensemble, so
        //    ST-window coverage is unmeasured in every lead.
        assert!(
            e.leads.iter().all(|l| l.coverage_st == CoverageEvidence::NotMeasured),
            "a lead reported measured ST-window coverage"
        );

        // And the two things that are *not* holes, so that a regression in
        // either shows up here rather than as a silently narrower band.
        assert_eq!(
            e.gain,
            GainEvidence::NotRecorded,
            "a study nobody calibrated must not carry a gain claim"
        );
        assert!(e.hr_bpm.is_some(), "heart rate is available and should be supplied");
        assert!(
            e.leads.iter().any(|l| l.n_beats >= 2),
            "beat counts are available and should be supplied"
        );
    }

    /// The gate's own refusal, reached through the real boundary.
    #[test]
    fn the_boundary_gates_twelve_leads_and_refuses_all_of_them() {
        let (a, b) = (a_study(), a_study());
        let json = st_verdicts_json(&a, &b);
        assert_eq!(json.matches(r#""lead":"#).count(), 12, "{json}");
        assert!(!json.contains(r#""state":"Significant""#), "{json}");
        assert!(json.contains(r#""state":"Unmeasurable""#), "{json}");
        assert!(significant_st_leads(&a, &b).is_empty());
    }

    /// The payload says which evidence is missing, once, above the table.
    ///
    /// Twelve identical refusal reasons in twelve rows is noise a reader learns
    /// to scroll past; the same fact stated once above them is the thing they
    /// can act on. Both are emitted, and this pins the shape of the first.
    #[test]
    fn the_payload_names_the_evidence_the_gate_is_missing() {
        let (mut a, b) = (a_study(), a_study());
        a.set_gain(true, 0.015);
        let json = st_verdicts_json(&a, &b);

        for key in [
            r#""clinicalThresholdMv":"#,
            r#""stDisplayQuantumMv":"#,
            r#""pairBlockers":"#,
            r#""deltaMv":"#,
            r#""digitization":"#,
            r#""withBio":"#,
        ] {
            assert!(json.contains(key), "missing {key} in {json}");
        }
        // The comparison never had `set_gain` called on it, so the pair is
        // blocked on a gain nobody recorded as well as on the standing holes.
        for code in ["GainNotRecorded", "CoverageUnmeasured", "IdentityUnchecked"] {
            assert!(json.contains(code), "missing blocker {code} in {json}");
        }
        // And the sentences are prose for a reader, not variant names.
        assert!(json.contains("can be confirmed or excluded"), "{json}");
    }
}

/// One study's vectorcardiogram, or the reason it has none.
///
/// X is left-positive, Y inferior-positive, Z posterior-positive, on the same
/// `FRAME_LEN` frame as the ensemble beats — so sample `i` here and sample `i`
/// of any lead's beat are the same instant. That correspondence is what lets a
/// cursor run along the tracing and the loop together.
#[wasm_bindgen]
pub struct VcgLoops {
    x_mv: Vec<f32>,
    y_mv: Vec<f32>,
    z_mv: Vec<f32>,
    qrs_onset: i32,
    qrs_offset: i32,
    t_offset: i32,
    refusal: Option<VcgRefusal>,
    notes: Vec<String>,
    alignment_spread_ms: f32,
}

#[wasm_bindgen]
impl VcgLoops {
    #[wasm_bindgen(getter)]
    pub fn x_mv(&self) -> Vec<f32> {
        self.x_mv.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn y_mv(&self) -> Vec<f32> {
        self.y_mv.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn z_mv(&self) -> Vec<f32> {
        self.z_mv.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn qrs_onset(&self) -> i32 {
        self.qrs_onset
    }

    #[wasm_bindgen(getter)]
    pub fn qrs_offset(&self) -> i32 {
        self.qrs_offset
    }

    #[wasm_bindgen(getter)]
    pub fn t_offset(&self) -> i32 {
        self.t_offset
    }

    #[wasm_bindgen(getter)]
    pub fn frame_len(&self) -> usize {
        FRAME_LEN
    }

    #[wasm_bindgen(getter)]
    pub fn anchor_index(&self) -> usize {
        r_index(FS)
    }

    #[wasm_bindgen(getter)]
    pub fn fs_hz(&self) -> f64 {
        FS
    }

    #[wasm_bindgen(getter)]
    pub fn notes(&self) -> Vec<String> {
        self.notes.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn alignment_spread_ms(&self) -> f32 {
        self.alignment_spread_ms
    }

    /// `null`, or `{"code":…,"sentence":…,"leads":[…]}`.
    pub fn refusal_json(&self) -> String {
        match &self.refusal {
            None => "null".to_string(),
            Some(r) => {
                let leads = r
                    .leads()
                    .iter()
                    .map(|l| format!("\"{}\"", escape(l)))
                    .collect::<Vec<_>>()
                    .join(",");
                format!(
                    "{{\"code\":\"{}\",\"sentence\":\"{}\",\"leads\":[{leads}]}}",
                    r.code(),
                    escape(&r.sentence()),
                )
            }
        }
    }
}

/// How each plane maps the orthogonal leads onto two screen axes.
///
/// In Rust, beside the coefficients, because the sign on Z decides whether a
/// horizontal loop reads clockwise or counterclockwise — and that is a
/// diagnosis, not a layout choice. A normal horizontal QRS loop runs
/// counterclockwise; clockwise is the pattern of posterior infarction and right
/// ventricular hypertrophy. Leaving this to the drawing code would put a
/// clinical convention somewhere no test would ever check it.
///
/// Canvas y grows downward and Frank Y is inferior-positive, so a vertical Y
/// axis maps straight through with sign +1 — two conventions that happen to
/// agree. Stated so nobody "fixes" one of them.
#[wasm_bindgen]
pub fn vcg_planes_json() -> String {
    r#"[
      {"id":"frontal","label":"Frontal",
       "horizontal":{"axis":"x","sign":1,"positiveLabel":"left"},
       "vertical":{"axis":"y","sign":1,"positiveLabel":"inferior"}},
      {"id":"horizontal","label":"Horizontal (transverse)",
       "horizontal":{"axis":"x","sign":1,"positiveLabel":"left"},
       "vertical":{"axis":"z","sign":1,"positiveLabel":"posterior"}},
      {"id":"sagittal","label":"Left sagittal",
       "horizontal":{"axis":"z","sign":-1,"positiveLabel":"anterior"},
       "vertical":{"axis":"y","sign":1,"positiveLabel":"inferior"}}
    ]"#
    .to_string()
}

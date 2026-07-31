//! The WebAssembly surface.
//!
//! JavaScript hands over irregular `(t, mV)` vertices per lead and gets back
//! ensemble beats, fiducials, and — for a pair of studies — a per-lead
//! registration. No per-sample calls cross the boundary.
//!
//! **Nothing here reports a clinical amplitude or interval as a measurement.**
//! Those require a confirmed gain and the uncertainty gate, neither of which is
//! built. Morphology and differences render; numbers do not.

use wasm_bindgen::prelude::*;

use crate::beats::detect::{detect_qrs, Beat, BeatClass};
use crate::beats::ensemble::{ensemble, EnsembleBeat, Provenance};
use crate::beats::panels::{beat_support, project_strip_beats, verify_panel, PanelFlag};
use crate::config::{FRAME_T0_S, FS, PANEL_WINDOW_S};
use crate::dsp::detrend::{detrend, Detrended, ProvisionalSignal};
use crate::dsp::median_filter::provisional_detrend;
use crate::dsp::resample::{
    column_envelope, intermediate_rate, pchip_uniform, resample, Vertex,
};
use crate::fiducial::{fiducials, r_index, GlobalFiducials, Unmeasurable, FRAME_LEN};
use crate::measure::{measure_study, st_delta, LeadMeasurements, CLINICAL_ST_MV};
use crate::serial::register::register_lead;

/// Canonical 12-lead order.
pub const LEAD_ORDER: [&str; 12] = [
    "I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6",
];

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
}

impl Built {
    fn fiducials(&self) -> GlobalFiducials {
        let weights = vec![1.0f32; self.beats.len()];
        let vm = self.beats.first().cloned().unwrap_or_else(|| vec![0.0; FRAME_LEN]);
        fiducials(&self.beats, &weights, &vm, FS, 0.0)
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
    };

    for p in panels {
        let onsets: Vec<usize> = p.anchors.iter().map(|&r| onset_of(r)).collect();

        // The measurement baseline comes from PQ anchors on the original signal,
        // never from the throwaway pass-1 median cascade.
        let prov = ProvisionalSignal::new(p.sig.clone(), FS);
        let measurement = match detrend(&prov, &onsets) {
            Detrended::Measurable(m) => m.samples().to_vec(),
            Detrended::MorphologyOnly { v_mv, .. } => v_mv,
        };

        let Ok(eb) = ensemble(&measurement, FS, &p.anchors, provenance, sigma_prov) else {
            continue;
        };
        out.names.push(p.name.clone());
        // The conditioned continuous panel, kept so the printout view can draw
        // the recording as it ran rather than an ensemble beat.
        out.signals.push(measurement);
        out.offsets.push(p.time_offset_s);
        out.beats.push(eb.v_mv.clone());
        out.sigmas.push(eb.sigma_mv.clone());
        out.n_used.push(eb.n_used as u32);
        let _: &EnsembleBeat = &eb;
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
        let (strip_beats, hr_bpm) = match &strip {
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
                )
            }
            None => (Vec::new(), f64::NAN),
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
        let f1 = pass1.fiducials();

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
                let f2 = pass2.fiducials();
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

        let Built { names, signals, offsets, beats, sigmas, n_used } = built;

        StudyAnalysis {
            names,
            signals,
            offsets,
            rhythm: strip.clone().unwrap_or_default(),
            beats,
            sigmas,
            n_used,
            hr_bpm,
            qrs_onset: f.qrs_onset.map(|v| v as i32).unwrap_or(-1),
            qrs_offset: f.qrs_offset.map(|v| v as i32).unwrap_or(-1),
            t_offset: f.t_offset.map(|v| v as i32).unwrap_or(-1),
            warnings,
            onset_shift_ms,
            // Overwritten by set_calibration_quality once the pulse is read.
            gain_sigma: 0.10,
            bias_mv: if from_vector_pdf { 0.002 } else { 0.012 },
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
    hr_bpm: f64,
    qrs_onset: i32,
    qrs_offset: i32,
    t_offset: i32,
    /// Panels excluded or corrected, and beats dropped at edges — the things a
    /// clinician must know before trusting a lead's numbers.
    warnings: Vec<String>,
    /// How far the second pass moved the QRS onset, milliseconds.
    onset_shift_ms: f64,
    /// Relative 1-sigma on the gain, propagated into every amplitude.
    gain_sigma: f32,
    /// Systematic amplitude bias for this provenance, millivolts.
    bias_mv: f32,
}

#[wasm_bindgen]
impl StudyAnalysis {
    /// Record the calibration quality the JS side measured from the pulse.
    pub fn set_calibration_quality(&mut self, gain_relative_sigma: f32, bias_mv: f32) {
        self.gain_sigma = gain_relative_sigma;
        self.bias_mv = bias_mv;
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
                    if l.sigma_st_mv.is_finite() { format!("{:.5}", l.sigma_st_mv) } else { "null".into() },
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
        measure_study(&leads, &self.fiducials(), hr, self.gain_sigma)
    }

    fn lead_measurements(&self) -> Vec<LeadMeasurements> {
        self.measure().leads
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

/// Leads whose ST change cleared both the detection limit and the clinical
/// threshold.
///
/// The same gate `st_deltas_json` applies, as a plain list — this is the
/// question the acceptance test asks, and the one a caller usually wants.
#[wasm_bindgen]
pub fn notable_st_leads(reference: &StudyAnalysis, comparison: &StudyAnalysis) -> Vec<String> {
    let (a, b) = (reference.lead_measurements(), comparison.lead_measurements());
    LEAD_ORDER
        .iter()
        .filter_map(|name| {
            let ra = a.iter().find(|l| l.lead == *name)?;
            let rb = b.iter().find(|l| l.lead == *name)?;
            let d = st_delta(ra, rb, reference.bias_mv, comparison.bias_mv);
            d.notable.then_some(d.lead)
        })
        .collect()
}

/// Serial ST deltas between two studies, gated by their combined uncertainty.
#[wasm_bindgen]
pub fn st_deltas_json(reference: &StudyAnalysis, comparison: &StudyAnalysis) -> String {
    let (a, b) = (reference.lead_measurements(), comparison.lead_measurements());
    let rows: Vec<String> = LEAD_ORDER
        .iter()
        .filter_map(|name| {
            let ra = a.iter().find(|l| l.lead == *name)?;
            let rb = b.iter().find(|l| l.lead == *name)?;
            let d = st_delta(ra, rb, reference.bias_mv, comparison.bias_mv);
            Some(format!(
                r#"{{"lead":"{}","delta":{},"mdc":{},"notable":{},"belowLimit":{}}}"#,
                d.lead,
                opt(d.delta_mv),
                if d.mdc95_mv.is_finite() { format!("{:.4}", d.mdc95_mv) } else { "null".into() },
                d.notable,
                d.below_detection_limit,
            ))
        })
        .collect();
    format!(r#"{{"clinicalThresholdMv":{CLINICAL_ST_MV},"leads":[{}]}}"#, rows.join(","))
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

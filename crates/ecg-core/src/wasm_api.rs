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

use crate::beats::detect::{detect_qrs, BeatClass};
use crate::beats::ensemble::{ensemble, EnsembleBeat, Provenance};
use crate::config::FS;
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
        let (strip_beats_s, hr_bpm) = match &strip {
            Some(s) => {
                let prov = provisional_detrend(s, FS, None, None);
                let det = detect_qrs(&prov, FS);
                (
                    det.beats
                        .iter()
                        .filter(|b| {
                            matches!(b.class, BeatClass::Normal | BeatClass::Unclassified)
                        })
                        .map(|b| b.r_time_s)
                        .collect::<Vec<f64>>(),
                    det.hr_bpm.unwrap_or(f64::NAN),
                )
            }
            None => (Vec::new(), f64::NAN),
        };

        let mut names = Vec::new();
        let mut beats: Vec<Vec<f32>> = Vec::new();
        let mut sigmas: Vec<Vec<f32>> = Vec::new();
        let mut n_used: Vec<u32> = Vec::new();

        for lead in &self.leads {
            let Some(sig) = condition(&lead.vertices, 100.0) else { continue };

            // Beats visible inside this panel, in panel-local time.
            let local: Vec<usize> = strip_beats_s
                .iter()
                .filter_map(|&t| {
                    let rel = t - lead.time_offset_s;
                    let idx = (rel * FS).round();
                    (rel >= 0.0 && idx >= 0.0 && (idx as usize) < sig.len())
                        .then_some(idx as usize)
                })
                .collect();
            if local.is_empty() {
                continue;
            }

            // The measurement baseline comes from PQ anchors on the original,
            // never from the throwaway pass-1 signal. QRS onset is approximated
            // here as R minus a nominal interval until per-study fiducials feed
            // back in; the anchor search window absorbs the residual error.
            let nominal_onset = (0.040 * FS) as usize;
            let onsets: Vec<usize> =
                local.iter().map(|&r| r.saturating_sub(nominal_onset)).collect();

            let prov = ProvisionalSignal::new(sig.clone(), FS);
            let measurement = match detrend(&prov, &onsets) {
                Detrended::Measurable(m) => m.samples().to_vec(),
                Detrended::MorphologyOnly { v_mv, .. } => v_mv,
            };

            let Ok(eb) = ensemble(&measurement, FS, &local, provenance, sigma_prov) else {
                continue;
            };
            names.push(lead.name.clone());
            beats.push(eb.v_mv.clone());
            sigmas.push(eb.sigma_mv.clone());
            n_used.push(eb.n_used as u32);
            let _: &EnsembleBeat = &eb;
        }

        // Global fiducials from the assembled lead matrix.
        let weights = vec![1.0f32; beats.len()];
        let vm = beats.first().cloned().unwrap_or_else(|| vec![0.0; FRAME_LEN]);
        let f = fiducials(&beats, &weights, &vm, FS, 0.0);

        StudyAnalysis {
            names,
            beats,
            sigmas,
            n_used,
            hr_bpm,
            qrs_onset: f.qrs_onset.map(|v| v as i32).unwrap_or(-1),
            qrs_offset: f.qrs_offset.map(|v| v as i32).unwrap_or(-1),
            t_offset: f.t_offset.map(|v| v as i32).unwrap_or(-1),
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
    beats: Vec<Vec<f32>>,
    sigmas: Vec<Vec<f32>>,
    n_used: Vec<u32>,
    hr_bpm: f64,
    qrs_onset: i32,
    qrs_offset: i32,
    t_offset: i32,
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

    /// One lead's ensemble beat: `FRAME_LEN` samples in millivolts.
    pub fn beat(&self, lead: &str) -> Option<Vec<f32>> {
        self.index_of(lead).map(|i| self.beats[i].clone())
    }

    /// One lead's per-sample standard deviation, millivolts.
    pub fn sigma(&self, lead: &str) -> Option<Vec<f32>> {
        self.index_of(lead).map(|i| self.sigmas[i].clone())
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

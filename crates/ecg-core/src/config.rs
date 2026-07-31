//! Every tunable constant in the pipeline, in one place.
//!
//! Units are in the name or the comment. A `DEFAULT` note means: ship this value.
//! Section numbers match `docs/engineering-spec.md` §2, and the code that consumes
//! a constant cites the section it came from.
//!
//! Sections §10–§14 (raster ingest) land with the raster pipeline; only the
//! signal-path constants are defined here so far.

// ---- §0 CANONICAL MODEL ----------------------------------------------------

/// Hz, the canonical sample grid. There is never a second rate downstream of
/// resampling — every comparison, measurement, and stored signal is on this grid.
pub const FS: f64 = 500.0;

/// Seconds, frame start relative to the global QRS onset.
pub const FRAME_T0_S: f64 = -0.200;

/// Frame length in samples, so the frame ends at +0.600 s.
pub const FRAME_N: usize = 401;

/// Samples past this fraction of the shortest RR are drawn but not scored — at
/// short RR the frame would otherwise run into the following P wave.
pub const FRAME_VALID_RR_FRAC: f64 = 0.80;

/// mm/s, paper-speed prior. Never applied silently; see the gain rule below.
pub const MM_PER_S_DEFAULT: f64 = 25.0;

/// mm/mV, gain prior. **Never applied silently** — an unconfirmed gain blocks
/// every amplitude output, because a 2x gain error fabricates an entire
/// anterior STEMI evolution out of a normal tracing.
pub const MM_PER_MV_DEFAULT: f64 = 10.0;

/// PDF device units (points) per millimetre.
pub const PT_PER_MM: f64 = 72.0 / 25.4;

// ---- §1 BASELINE / DETREND -------------------------------------------------
//
// No high-pass filter may touch the measurement path. A 2.5 s panel cannot
// support one: 0.05 Hz has tau = 3.18 s, longer than the panel itself, and a
// causal 0.5 Hz high-pass fabricates ~0.30 mV of J-point offset — three times
// the STEMI threshold, in the direction of the finding. Baseline is removed by
// piecewise-linear detrend through per-beat PQ anchors instead, which sets
// ST = 0 at the anchors by construction.

/// ms relative to QRS onset — start of the PQ anchor search.
pub const PQ_SEARCH_LO_MS: f64 = -44.0;

/// ms relative to QRS onset — end of the search, guarding against onset jitter.
pub const PQ_SEARCH_HI_MS: f64 = -8.0;

/// ms, flattest-window length; the anchor is that window's median.
pub const PQ_WIN_MS: f64 = 20.0;

/// mV peak-to-peak within the window; above this the anchor is rejected.
pub const PQ_FLATNESS_MAX_MV: f32 = 0.040;

/// Weight on slope² in the flattest-window cost.
pub const PQ_SLOPE_COST_W: f32 = 1.0e-4;

/// mV RMS over anchors; above this the baseline is not modelled by a line.
pub const DETREND_RESID_MAX_MV: f32 = 0.050;

/// mV peak of removed baseline; above this, flag heavy correction.
pub const BASELINE_REMOVED_MAX_MV: f32 = 0.150;

/// mV disagreement between TP and PQ estimates; above this, inflate sigma.
pub const TP_PQ_DISAGREE_WARN_MV: f32 = 0.050;

/// mV disagreement; above this, refuse ST for the lead.
pub const TP_PQ_DISAGREE_FAIL_MV: f32 = 0.080;

// ---- §2 PASS-1 (THROWAWAY) MEDIAN CASCADE ----------------------------------
//
// This cascade exists ONLY to stabilise beat detection. Its output is discarded
// and must never reach a measurement: if w2 is shorter than QRS+ST+T the median
// eats real ST elevation and reports the patient as improved, invisibly.

/// ms, first running median.
pub const MED_W1_MS: f64 = 200.0;

/// ms, second running median.
pub const MED_W2_MS: f64 = 600.0;

/// ms, wide first median, used when QRS > 130 ms or RR < 700 ms.
pub const MED_W1_WIDE_MS: f64 = 250.0;

/// ms, wide second median. HARD RULE: w2 >= 1.2 * QT.
pub const MED_W2_WIDE_MS: f64 = 750.0;

/// ms QRS duration triggering the wide cascade.
pub const MED_WIDE_QRS_MS: f64 = 130.0;

/// ms RR interval triggering the wide cascade.
pub const MED_WIDE_RR_MS: f64 = 700.0;

/// µV, histogram bin width of the O(1) running median.
pub const MED_BIN_UV: f32 = 1.0;

/// mV, ± span of the running-median histogram.
pub const MED_RANGE_MV: f32 = 16.384;

// ---- §3 MAINS ---------------------------------------------------------------
//
// DEFAULT OFF. An IIR notch at Q=35 rings for 0.66 s at 30–75 µV across the
// entire ST segment, and zero-phase filtering makes it pre-ring into the PQ
// anchor. Levkov phase-locked subtraction never filters the QRS.

/// DEFAULT: mains suppression off.
pub const MAINS_ENABLED_DEFAULT: bool = false;

/// Hz; below this effective rate, never notch.
pub const MAINS_MIN_FS_EFF_HZ: f64 = 200.0;

/// Goertzel harmonic-sum over neighbour-median floor.
pub const MAINS_SNR_MIN: f64 = 4.0;

/// The winning mains frequency must beat the runner-up by this factor.
pub const MAINS_WINNER_RATIO: f64 = 2.0;

/// mV peak; below this, do nothing rather than fit noise.
pub const MAINS_TEMPLATE_MIN_MV: f32 = 0.010;

/// Minimum samples per mains phase bin.
pub const MAINS_MIN_SAMPLES_PER_PHASE: usize = 8;

/// Robust QRS-exclusion factor in the Levkov residual.
pub const MAINS_MAD_K: f32 = 3.0;

// ---- §4 RESAMPLING ---------------------------------------------------------

/// Anti-alias cutoff as a fraction of `min(f_in, f_out)`.
pub const RESAMP_FC_FRAC: f64 = 0.45;

/// Hz, diagnostic band edge (AHA / IEC 60601-2-25). The cutoff never exceeds it.
pub const RESAMP_FC_CAP_HZ: f64 = 150.0;

/// Sinc zero crossings per side. Drop to 16 only when f_in/f_out > 3.
pub const RESAMP_ZERO_CROSSINGS: usize = 32;

/// dB stopband attenuation the Kaiser window is designed for.
pub const RESAMP_ATTEN_DB: f64 = 80.0;

/// Sinc table length; linear interpolation between entries errs at about −75 dB.
pub const RESAMP_TABLE_LEN: usize = 4096;

/// ms between source vertices; a larger gap marks the span INTERPOLATED and
/// excludes it from every measurement rather than silently filling it.
pub const PCHIP_GAP_MAX_MS: f64 = 8.0;

// ---- §5 QRS DETECTION (Pan–Tompkins at 500 Hz, time-matched) ---------------

/// Low-pass comb length, 30 ms.
pub const PT_LP_M: usize = 15;

/// High-pass moving-average length, 160 ms (−3 dB near 5 Hz).
pub const PT_HP_N: usize = 80;

/// Moving-window integration length, 150 ms.
pub const PT_MWI_W: usize = 75;

/// Total pipeline group delay in samples (15+40+2+37 = 188 ms).
pub const PT_PIPELINE_DELAY: usize = 94;

/// Refractory period, 200 ms.
pub const PT_REFRACTORY: usize = 100;

/// T-wave discrimination window, 360 ms.
pub const PT_T_LIMIT: usize = 180;

/// Half-width of the slope window, ±30 ms.
pub const PT_SLOPE_HALF: usize = 15;

/// Odd-reflect pad at each end. Without it the first beat is systematically
/// lost, which costs column 0 one of only two or three beats.
pub const PT_PAD: usize = 200;

/// Peak-estimate weight, rate-independent, from the original paper.
pub const PT_ALPHA: f64 = 0.125;

/// Threshold fraction between noise and signal peak estimates.
pub const PT_THRESH_FRAC: f64 = 0.25;

/// Lower bound of the acceptable RR band.
pub const PT_RR_LOW: f64 = 0.92;

/// Upper bound of the acceptable RR band.
pub const PT_RR_HIGH: f64 = 1.16;

/// RR multiple that triggers search-back for a missed beat.
pub const PT_RR_MISSED: f64 = 1.66;

/// Slope ratio below which a candidate is judged a T wave.
pub const PT_T_SLOPE_RATIO: f64 = 0.50;

// ---- §6 BEAT QUALITY / ENSEMBLE --------------------------------------------

/// ms, template correlation window, deliberately QRS-centric: including the T
/// wave lets the large slow T dominate and drag the QRS out of alignment.
pub const TEMPLATE_WIN_MS: (f64, f64) = (-100.0, 160.0);

/// Correlation for ensemble eligibility, vector-PDF sources.
pub const RHO_OK_VECTOR: f32 = 0.95;

/// Correlation for ensemble eligibility, image-derived traces.
pub const RHO_OK_RASTER: f32 = 0.92;

/// Below this correlation a beat is an outlier.
pub const RHO_SUSPECT: f32 = 0.80;

/// Cross-study NCC interlock. Below this, the alignment shift is forced to zero
/// rather than sliding to whatever lag flatters a changed QRS.
pub const RHO_XSTUDY_MIN: f32 = 0.90;

/// ms, ± search range for template alignment.
pub const ALIGN_MAX_LAG_MS: f64 = 20.0;

/// ms, ± search range for cross-study NCC.
pub const XSTUDY_MAX_LAG_MS: f64 = 30.0;

/// ms; a larger shift with acceptable correlation is implausible, so clamp to 0.
pub const XSTUDY_CLAMP_MS: f64 = 12.0;

/// ms, acceptance-test target for alignment jitter. On the QRS upstroke 4 ms of
/// misalignment costs 0.48 mV of smearing.
pub const ALIGN_SIGMA_TARGET_MS: f64 = 0.5;

/// A beat is premature when its preceding RR falls below this fraction of median.
pub const ECTOPY_RR_FRAC: f64 = 0.85;

/// Relative RR deviation marking a rate outlier.
pub const RATE_OUTLIER_FRAC: f64 = 0.20;

/// Relative R peak-to-peak deviation from the medoid marking a scale outlier.
pub const SCALE_OUTLIER_FRAC: f32 = 0.20;

/// At or above this beat count use a per-sample median; at 3–4 a screened mean.
/// Below 5 the median is no more robust than the mean and carries about 35%
/// more variance, since at n=3 the median *is* the 1-trimmed mean.
pub const ENSEMBLE_MEDIAN_MIN_N: usize = 5;

/// Post-extrasystolic ST/T change is real, but it is not the resting morphology.
pub const EXCLUDE_POST_ECTOPIC: bool = true;

/// Fraction of beats excluded above which human review is required.
pub const UNRELIABLE_RHYTHM_FRAC: f64 = 0.40;

/// The ensemble's own sigma can never be claimed below this fraction of the
/// single-sample provisional sigma.
pub const SIGMA_ENS_FLOOR_FRAC: f32 = 0.25;

// ---- §7 FIDUCIALS ----------------------------------------------------------

/// Savitzky–Golay half-window for QRS boundaries, 14 ms.
pub const SV_HALF_QRS: usize = 3;

/// Savitzky–Golay half-window for P and T, 30 ms.
pub const SV_HALF_PT: usize = 7;

/// Spatial-velocity threshold as a fraction of its peak.
pub const SV_THRESH_FRAC: f32 = 0.05;

/// Threshold floor is base + this many MADs.
pub const SV_THRESH_MAD_K: f32 = 4.0;

/// Samples the threshold crossing must persist, 6 ms, so a noisy dip does not
/// terminate the boundary walk early.
pub const SV_PERSIST_SAMPLES: usize = 3;

/// Fewer surviving leads than this makes the fiducial unmeasurable.
pub const SV_MIN_LEADS: usize = 4;

/// A lead contributes with weight = SQI only at or above this quality.
pub const SV_LEAD_SQI_MIN: f32 = 0.50;

/// ms, plausible QRS onset clamp relative to R.
pub const QRS_ON_CLAMP_MS: (f64, f64) = (-120.0, -10.0);

/// ms, plausible QRS offset clamp relative to R.
pub const QRS_OFF_CLAMP_MS: (f64, f64) = (20.0, 160.0);

/// ms; a duration outside this blocks output and points at the paper speed.
pub const QRS_DUR_PLAUSIBLE_MS: (f64, f64) = (50.0, 220.0);

/// P detection is deliberately stricter; failing it yields None, which is the
/// correct answer in atrial fibrillation rather than a fabricated P wave.
pub const P_SV_MAD_K: f32 = 6.0;

/// Half-width of the least-squares tangent window for T offset, ±12 ms.
pub const T_LS_HALF: usize = 6;

/// mV; a flatter T than this is unmeasurable rather than guessed.
pub const T_MIN_AMP_MV: f32 = 0.050;

/// mV/s; a shallower tangent than this is rejected.
pub const T_MIN_SLOPE_MV_S: f32 = 0.20;

/// Relative amplitude for terminal-lobe selection in a biphasic T.
pub const T_LOBE_REL_AMP: f32 = 0.15;

/// T search span is min(this fraction of RR, 0.55 s).
pub const T_WIN_RR_FRAC: f64 = 0.60;

/// Percentile fallback when the vector magnitude is unusable but enough leads are.
pub const T_PERCENTILE_FALLBACK: f64 = 0.75;

// ---- §8 ST MEASUREMENT -----------------------------------------------------

/// ms relative to J; mean over this window is the primary ST_J.
pub const ST_J_WIN_MS: (f64, f64) = (0.0, 20.0);

/// ms relative to J; one grid period centred at J+60.
pub const ST_J60_WIN_MS: (f64, f64) = (40.0, 80.0);

/// ms relative to J; the two points defining ST slope in mV/s.
pub const ST_SLOPE_PTS_MS: (f64, f64) = (20.0, 80.0);

/// mV/s; a shallower slope than this counts as horizontal.
pub const ST_SLOPE_FLAT_MV_S: f32 = 0.15;

/// Heart-rate-dependent cap on how far past J we may sample: at tachycardia
/// J+80 lands on the T wave. Pairs are (hr_upper_bound_bpm, max_offset_ms).
pub const ST_CAP_MS_BY_HR: [(f64, f64); 3] =
    [(100.0, 80.0), (130.0, 60.0), (f64::MAX, 40.0)];

/// Never sample past J plus this fraction of the J-to-T-peak interval.
pub const ST_TPEAK_GUARD_FRAC: f64 = 0.50;

// ---- §9 SIGNAL QUALITY (per lead, 0..1) ------------------------------------

/// ms window for flatline detection.
pub const SQI_FLAT_WIN_MS: f64 = 200.0;

/// µV peak-to-peak below which a window counts as flatline.
pub const SQI_FLAT_PP_UV: f32 = 25.0;

/// Flatline fraction forcing a hard zero quality.
pub const SQI_FLAT_FRAC_FAIL: f32 = 0.50;

/// Saturation penalty gain: g_sat = 1 − min(1, gain × sat_frac).
pub const SQI_SAT_GAIN: f32 = 20.0;

/// dB high-frequency SNR mapping to quality 0.
pub const SQI_HF_SNR_LO_DB: f32 = 10.0;

/// dB high-frequency SNR mapping to quality 1.
pub const SQI_HF_SNR_HI_DB: f32 = 30.0;

/// Baseline-wander penalty gain.
pub const SQI_BW_GAIN: f32 = 10.0;

/// Grid-residual ratio at or below which quality is unaffected.
pub const SQI_GRID_RATIO_OK: f32 = 2.0;

/// Grid-residual ratio at or above which quality is zero.
pub const SQI_GRID_RATIO_BAD: f32 = 6.0;

/// Geometric-mean exponents for (high-frequency, baseline-wander, grid) terms.
pub const SQI_EXP: (f32, f32, f32) = (0.4, 0.3, 0.3);

/// At or above this SQI, measure freely.
pub const SQI_BAND_MEASURE: f32 = 0.75;

/// Between this and `SQI_BAND_MEASURE`, measure with caution.
pub const SQI_BAND_CAUTION: f32 = 0.50;

/// Between this and `SQI_BAND_CAUTION`, display only — no numeric delta.
pub const SQI_BAND_DISPLAY: f32 = 0.35;

/// Below this, the rhythm strip cannot serve as timing authority.
pub const BSQI_STRIP_MIN: f32 = 0.35;

// ---- §14 PANEL ↔ STRIP TIME BASE -------------------------------------------
//
// A 3×4 printout gives each lead a 2.5 s window at its column's offset. The
// geometry says which window that should be; these constants govern proving it
// against the rhythm strip. Getting it wrong compares V2 in one study against V3
// in another, which reads as "new ST elevation that resolved one lead over".

/// Seconds covered by one column of a 3×4 layout.
pub const PANEL_WINDOW_S: f64 = 2.5;

/// ms; |τ_c − 2.5·c| beyond this means the layout is not the standard cadence.
pub const PANEL_TAU_TOL_MS: f64 = 60.0;

/// ms; a panel beat within this of a strip beat is a match.
/// Between this and `PANEL_EXCLUDE_TOL_MS` the offset is corrected and flagged.
pub const PANEL_MATCH_TOL_MS: f64 = 40.0;

/// ms; beyond this the panel is excluded from serial comparison entirely.
pub const PANEL_EXCLUDE_TOL_MS: f64 = 150.0;

/// Matched beats a panel needs before its time base is trusted.
pub const PANEL_MIN_MATCHED_BEATS: usize = 2;

/// ms at each panel edge in which no local maximum may be promoted to a QRS.
///
/// A half-drawn upstroke at a column boundary is exactly the high-amplitude,
/// high-slope feature a peak detector wants, and counting it as a beat imports
/// a truncated complex into the ensemble.
pub const EDGE_MARGIN_MS: f64 = 60.0;

/// mV; an adjacent-sample jump this large near an edge means the trace is
/// truncated rather than continuous.
pub const EDGE_DISCONT_MV: f32 = 0.50;

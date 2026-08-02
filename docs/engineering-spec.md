# SERIAL ECG COMPARISON — MERGED ENGINEERING SPEC v1.0

Scope note: this document supersedes all eight slice documents. Where a slice conflicts with this document, this document wins.

---

## 1. DECISIONS TABLE

### 1.1 Verdicts on the project's five stated defaults

| Project default | Verdict | Evidence |
|---|---|---|
| **Baseline "filter"** | **OVERTURNED — LOUDLY.** No high-pass filter of any cutoff may touch the measurement path. Replaced by **piecewise-linear detrend through per-beat PQ anchors**. | A 2.5 s panel structurally cannot support a high-pass: 0.05 Hz has τ=3.18 s > the whole panel; 0.5 Hz has τ=0.318 s so zero-phase settling eats ~1 s at each end. Causal 0.5 Hz HPF produced J-point deviation of 1.5–9 mm (mean 3 mm = **0.30 mV**) in 42/45 patients (Buendía-Fuentes 2012) — 3× the STEMI threshold. Even the *best* zero-phase filter in clean simulation has ST-error IQR 0.042–0.097 mV (Lenis 2017), i.e. the filter's own error is the size of the finding. PQ anchoring sets ST=0 at the PQ points *by construction*, which is the clinical definition of ST deviation; it cannot fabricate ST shift at the anchors. |
| **Gain normalization OFF** | **CONFIRMED, and strengthened.** Empirical cross-study gain matching stays off, is display-only when enabled, and **type-suppresses every amplitude output** when active. | The estimator is circular (any gain factor derived from QRS amplitude assumes QRS amplitude did not change — the hypothesis under test), and the findings targeted (new LVH voltage, new low voltage, R-wave amputation) are exactly what it erases. The legitimate residual — photo scale error — is bounded and already corrected by the calibration pulse, clamped to ±5%. |
| **QRS-onset anchor** | **CONFIRMED, decisively.** Global QRS onset, two-pass. | R-peak anchoring: a 20 ms terminal-QRS change (new RBBB, hyperkalaemia, Ic effect) displaces J by up to 20 ms relative to the anchor; on the ST-T upstroke dV/dt is 5–15 µV/ms, so this manufactures **100–300 µV** of apparent ST shift with a perfectly plausible overlay. The R peak is also lead-specific and jumps discretely between R and R′ in RSR′. |
| **No warping** | **CONFIRMED.** `WarpMode::Rigid` is the only mode that produces reportable numbers. | QT/JT rate dependence *is* the physiology and is frequently the finding. Warping is a lossy transform on the axis carrying the signal, and the rate difference is quantifiable without it (ΔQT + ΔQTcF). DTW singularities create and delete short deflections (Osborn, epsilon, delta, fragmentation). Opt-in DTW is confined to the ST-T window, never the QRS, and suppresses all timing output. |
| **Fridericia QTc** | **CONFIRMED, and Bazett is barred from driving verdicts.** | Vandenberk 2016 (n=6609): Fridericia and Framingham best, Bazett worst; 30-day mortality HR 5.95 (Fri) vs 4.49 (Baz); "Bazett overestimated the number of patients with potentially dangerous QTc prolongation." In our use case Bazett is *worse* than in that study: prior HR 60 → current HR 100 shifts Bazett QTc by **+25 to +35 ms on unchanged QT**, more than half the 60 ms "significant prolongation" convention, from heart rate alone. Bazett may be *displayed* as a labelled secondary. |

### 1.2 All other significant choices

| # | Choice | Decision | One-line reason |
|---|---|---|---|
| 1 | Baseline anchor segment | **PQ (terminal PR)**, flattest-20 ms search in `[on−44 ms, on−8 ms]`, median of window | Adjacent to ST so residual wander barely leaks; matches GE Marquette (voltage at QRS onset = 0); TP vanishes above HR 110 and hosts U waves. |
| 2 | Detrend model | **Piecewise-linear between consecutive PQ anchors; constant extrapolation past the first/last anchor** | A spline through knots ~1 s apart bends the ST segment by tens of µV; linear extrapolation swings at panel ends. |
| 3 | Beat-detection pre-filter | Cascaded running median 200/600 ms, **pass-1 only, output discarded** | `w2` must exceed QRS+ST+T or the median eats the ST elevation and reports the patient as improved — invisibly. Adaptive to 250/750 ms if QRS>130 ms or RR<700 ms. |
| 4 | Signal typing | Newtypes `ProvisionalSignal` / `MeasurementSignal` | Makes it a compile error to measure on the pass-1 signal. |
| 5 | Mains notch | **OFF by default**; Levkov phase-locked subtraction only when detected and `fs_eff ≥ 200 Hz` | IIR notch at Q=35 rings 0.66 s at 30–75 µV across the whole ST segment; filtfilt makes it pre-ring into the PQ anchor. A one-mains-period comb is −3.9 dB at 25 Hz. Levkov never filters the QRS. |
| 6 | Irregular→uniform interpolation | **PCHIP** (Fritsch–Carlson), never natural cubic spline | Natural spline overshoots the R peak and rings into early ST, fabricating ST deviation. |
| 7 | Steep-stroke column rule | Column **envelope + slope-continuity clamp**, never column mean | Averaging halves R amplitude on the steepest columns. |
| 8 | Uniform resampling | Kaiser windowed-sinc, `fc = min(0.45·min(f_in,f_out), 150)` Hz, 80 dB | `min()` handles up- and downsampling with one expression; 150 Hz is the diagnostic band edge (AHA/IEC 60601-2-25). |
| 9 | QRS detection | Pan–Tompkins retuned to 500 Hz by **time** constants, two-pass warm start, odd-reflect pad 200 | 10 s is too short for the original 2 s learning phase; without the pad the first beat is systematically lost, costing column 0 one of its 2–3 beats. |
| 10 | Where detection runs | **Rhythm strip only.** It is the sole timing authority | 12 detectors on 2.5 s snippets give 12 inconsistent beat sets; any cross-lead fiducial is then meaningless. |
| 11 | Panel↔strip mapping | Derive from geometry, then **verify** by matching panel QRS times to strip R times (±40 ms accept, ±150 ms correct-and-flag, beyond → exclude panel) | Catches swapped/misordered columns, which otherwise reads as "new ST elevation in V2 that resolved in V3". |
| 12 | Panel-edge policy | `EDGE_MARGIN = 60 ms`; no local max inside it may be promoted to QRS; per-measurement support test | A half-drawn upstroke is exactly the high-amplitude high-slope feature a peak detector wants. |
| 13 | Zero-padding a clipped beat | **Forbidden** | Pulls median T amplitude toward baseline by 1/n — a fabricated "T-wave flattening". |
| 14 | Ensemble estimator | **n≥5 → per-sample median; 3≤n≤4 → screened mean; n=2 → screened mean, strict gate, flag; n=1 → single beat, display only; n=0 → `Unavailable`** | At n=3 the median *is* the 1-trimmed mean and carries ~35% more variance than the mean, with no real robustness gain; robustness belongs at whole-beat level where 800 ms of evidence exists. UI name: **"ensemble beat"**, never "median beat". |
| 15 | Sub-sample alignment | Stage 1 parabolic on raw → Stage 2 parabolic on NCC vs template → Stage 3 fractional resample of the **polyline** if available, else 16-tap Kaiser sinc (β=6) | Pixel grid is coarser than the sample grid (5.1 ms/px at 200 dpi); alignment jitter blunts a multi-beat median but not a 1-beat one, manufacturing a "new Q wave" between a 1-beat and a 5-beat study. Catmull-Rom is display-only (0.1 dB droop is a δ-dependent amplitude bias). |
| 16 | Alignment target σ | **≤ 0.5 ms** | On the QRS upstroke (up to 120 mV/s) 4 ms of misalignment costs 0.48 mV of smearing. |
| 17 | NCC window | `[onset−20 ms, onset+max(QRSd)+10 ms]` — QRS only | Including T lets the large slow T dominate and drag the QRS out of alignment; a real QT change then reads as an ST change. |
| 18 | NCC interlock | `ρ < 0.90` → **δ := 0**, flag `QRS_MORPHOLOGY_CHANGED`; `|δ|>12 ms` with ρ≥0.90 → clamp 0, flag `ALIGN_IMPLAUSIBLE` | Aligning a changed QRS by maximising correlation with the old one slides to whatever lag flatters the residual, manufacturing ST shift. |
| 19 | Fiducials | **Global, one set per study**, from 8-lead spatial velocity (I, II, V1–V6 only) | Per-lead onsets are systematically short and lead-dependent; per-lead fiducials move with axis, so a pure axis rotation manufactures ST change. Never include III/aVR/aVL/aVF in a cross-lead sum — they triple-count the limb plane. |
| 20 | Fiducial linking across studies | **ON by default** — one drag moves the ST measurement point in both studies | Converts fiducial error from a between-study bias into a common-mode term. Highest-value UI decision in the product. |
| 21 | T offset | **Tangent (Lepeschkin) on the vector magnitude of the 8 independent leads**; per-lead advisory only; fall back to 75th percentile of per-lead (≥6 leads), max (3–5), else `Unmeasurable` | VM has one well-defined terminal limb and cannot suffer biphasic cancellation; `max` over 8 noisy estimates is an extreme order statistic whose variance is set by the worst lead. **Never mix tangent and threshold methods between studies** (~10 ms systematic, reads as drug-induced QT prolongation). |
| 22 | ST measurement point | **ST_J drives all absolute verdicts** (UDMI-4 thresholds are J-point thresholds). ΔST reported at **both J and J+60**; disagreement in sign of change is a flag. | Anything other than J is not comparable to the published cut-points. J+60/80 carry the morphology (upsloping/horizontal/downsloping) the ST-depression criterion requires. |
| 23 | ST sampling | **Mean over one grid period**, not a point sample: `ST_J = mean[J, J+20 ms]`, `ST_J60 = mean[J+40, J+80]` | Integrates one full cycle of the 1/T_grid-Hz grid-removal residual to zero and cuts white centroid noise ~4×. Point sampling costs ~4× in σ_c. |
| 24 | ST rate guard | `cap_ms` = 80/60/40 at HR ≤100/≤130/>130, **and** never past the midpoint of J→T_peak | At HR 150 (RR 400 ms), J+80 lands on the T upstroke; the "ST elevation" is T amplitude. |
| 25 | QTc | Fridericia; Bazett display-only; **JTc = QTc − QRS as primary when QRS ≥ 120 ms** | QTc thresholds are not validated under BBB and a serial QRS change propagates 1:1 into QT. |
| 26 | Frontal axis | From **net QRS area** in I and II, not peak-to-peak; wrapped angular difference | One mis-traced spike moves an amplitude by 0.5 mV and the area by <2%; naive subtraction reports a 350° "shift" for a true 10° move. |
| 27 | Raster: rectification | Compute a **transform**, never resample the page for measurement | Bilinear/bicubic rectification low-passes narrow R peaks by 2–6% — a silent, uniform, physiology-shaped amplitude error. Rectified preview for UI only. |
| 28 | Raster: grid pitch | Projection-profile autocorrelation → harmonic sub-pixel → **comb regression** `x_i = a + p·n_i`; Hough **not implemented** | Comb regression yields an honest σ_p and a residual test; Hough is strictly dominated at 5–20× the cost. 2-D FFT on a 1024² centre tile is the tie-break for angle only. |
| 29 | Raster: binarisation | **Sauvola** (k=0.25, window 3 mm), with a global-Otsu floor at 0.35·o | Otsu under a 20% photo gradient either drops the trace in shadow (→gap→interpolation→fake flat segment) or floods the bright corner with grid. |
| 30 | Raster: grid removal | **Greyscale model subtraction** of a separable lattice template. Morphological horizontal-line opening is **forbidden** | The isoelectric baseline *is* a long thin horizontal line; opening deletes it, and interpolation then produces a clean flat segment at the wrong level. Subtraction is monotone — it cannot remove trace ink. |
| 31 | Raster: 2-D FFT notch | **OFF** | The flat baseline shares the `u=0` axis with the horizontal rules; notching breaks it into dashes at the grid pitch, which are bridged and silently flattened. |
| 32 | Raster: column→value | **Viterbi/min-sum DP over per-column ink runs**, transition cost dominated by *vertical white gap*, not `|Δy|` | Connectivity is what distinguishes a 40-px QRS sweep (touching runs, cost ≈0) from a 5-px hop to the neighbour's trace (cost 10). A `|Δy|` prior gets this backwards and shaves peaks. Band prior **saturates** so tall R waves are never dragged back. |
| 33 | Raster: apex correction | `edge ∓ stroke/2`, applied only where run height > stroke+2 | ECGMiner's "farthest pixel" over-corrects by half a stroke = **+13–17 µV on every peak, always inflating**. |
| 34 | Raster: skeletonisation | **Do not use** | Integer-valued (≥0.29 px quantisation vs 0.065 px for greyscale centroid), and its failures are biases (spurs, forks, endpoint erosion), not noise. |
| 35 | Raster: overlapping leads | Extract runs over the **full page height**, decode tracks sequentially with exclusive claims (+6.0 on clean runs, +0.5 on merged), rhythm strip first | Neighbour intrusion is *phase-locked* — all four panels in a row share the same 2.5 s window, so a tall R intrudes at the same phase every beat and averages into a stable fake Q/notch. |
| 36 | Raster: lead identity | Within-column null-vector residual + **cross-column Goldberger in linear-feature space** + label evidence + aVR polarity, 4320 hypotheses | `I−II+III=0` is symmetric under I↔III; `aVR+aVL+aVF=0` is symmetric under **all 6 permutations** and gives *zero* discrimination. Only the cross-column test breaks these — and it is the only thing that detects Cabrera's inverted −aVR. |
| 37 | Precordial identity | Labels + ordering constraint only; R-progression is a **flag, never an override**; mandatory one-click human confirm if any precordial label is not CONFIDENT | No linear identity constrains V1–V6. Using morphology similarity to the *other study* would be circular and would suppress the finding. |
| 38 | Label reading | Whole-word binary NCC against a build-time template bank + targeted sub-glyph discriminators; emits a **score vector**, not a decision. **No tesseract.js** | Tesseract's language model maps V1→VI, aVR→AVFl, II→ll — and returns a confident wrong string. |
| 39 | Gain source precedence | **Calibration pulse > header text > user > default**; pulse is preferred because it is 1.000 mV *regardless of the gain setting*. Disagreement >12% → class C + explicit user confirmation | A 2× gain error is the worst output this product can produce. Per-**row** pulses are mandatory (split-gain limb 10 / chest 5 mm/mV is routine). |
| 40 | Acquisition date | **Parse to pre-fill, never auto-accept.** DD/MM vs MM/DD ambiguity asked once, persisted per cart fingerprint | Swapping study order turns evolving ST elevation into resolving ST elevation. EXIF `DateTimeOriginal` is the photo date; use it only to assert photo ≥ ECG date. |
| 41 | Cross-study conditioning | **Byte-identical parameters or no delta.** Hash the ops set; refuse to render a delta on mismatch unless it is a logged, displayed harmonization | Errors cancel in a difference only when the same operator is applied to both. |
| 42 | Low-pass mismatch | Auto-harmonize down to `min(lpA, lpB)` with the Kaiser FIR, yellow chip, measurements stay enabled | You can remove bandwidth you have. |
| 43 | High-pass mismatch | **Hard block on ST deltas.** No correction offered | You cannot un-high-pass a signal. 0.5 Hz altered ST level in 93% of patients. |
| 44 | Verdict model | Five states: `Significant / Indeterminate / BelowDetectionLimit / NoChange / Unmeasurable`. **`NoChange` requires positively excluding 0.10 mV (TOST-style), it is never the default** | "Not significant" ≠ "no change". Conflating them is how a phone-photo comparison silently reassures a clinician that a real ST elevation is absent. |
| 45 | Multiplicity | Regional coherence (≥2 leads in one anatomical territory at z=1.96) for auto-flags; Holm–Bonferroni (z≈2.87) for isolated leads; **uncorrected CI on hover** | Coherence cuts false positives from ~0.6 to ~0.02 per comparison *and* matches the clinical pattern, where raw Bonferroni destroys sensitivity for a genuine 2-lead regional change. |
| 46 | PR interval / P duration | **Not offered in v1** | PaperECG — a validated tool — produced PR limits of agreement of −226 to +219 ms with ICC 0.119 from signals whose QRS and QT were excellent. Framingham inter-rater ICC for P duration is 0.46. |
| 47 | Correlation between studies | `ρ = 0` for everything unless positively evidenced (same device model + identical printed gain/speed string + both vector → ρ=0.90 on the gain term only) | ρ>0 *narrows* the CI, so it must be earned. Over-claimed correlation manufactures significance. |
| 48 | Bias combination | **Linear**, never quadrature | Systematic centroid pull and grid-removal asymmetry do not average away and are not zero-mean; a "3σ" claim from quadrature alone is dishonest. |
| 49 | Uncertainty display | Every number carries `± MDC`; **never display more precision than the band**; ΔST rendered to 0.05 mV | A bare "0.15 mV new ST elevation" is the exact artifact this product must not produce. |
| 50 | Photo tier policy | Render and overlay always; **amplitude deltas suppressed** on tier D and on any pair whose MDC exceeds 0.10 mV, unless the user completes fiducial review | Best-in-world fully automatic phone-photo digitization scored ≈0 dB in PhysioNet 2024 (winner −1.07 on clean phone photos); 9 of 16 official teams scored ≤0 dB overall, i.e. worse than outputting zeros. |

---

## 2. THE CONFIG OBJECT

Single source of truth: `crates/ecg-core/src/config.rs`. There is no TS mirror and no codegen step: decision [0004](decisions/0004-constants-live-in-rust.md) rejected the generated `config.gen.ts` this section used to mandate, and the UI reads what it needs through WASM getters instead. Every constant here is referenced by section number in the code that consumes it.

```rust
//! ============================================================================
//!  ecg-core :: config.rs   —  every tunable constant in the pipeline.
//!  Units are in the name or the comment. DEFAULT means: ship this value.
//! ============================================================================

// ---- §0 CANONICAL MODEL ----------------------------------------------------
pub const FS: f64                     = 500.0;   // Hz, canonical grid. Never a second rate.
pub const FRAME_T0_S: f64             = -0.200;  // s, frame start rel. global QRS onset
pub const FRAME_N: usize              = 401;     // samples => frame ends at +0.600 s
pub const FRAME_VALID_RR_FRAC: f64    = 0.80;    // samples past 0.80*RR_min are drawn, not scored
pub const MM_PER_S_DEFAULT: f64       = 25.0;    // mm/s  paper speed prior
pub const MM_PER_MV_DEFAULT: f64      = 10.0;    // mm/mV gain prior (NEVER applied silently, §A0)
pub const PT_PER_MM: f64              = 72.0 / 25.4; // PDF device units per mm

// ---- §1 BASELINE / DETREND -------------------------------------------------
pub const PQ_SEARCH_LO_MS: f64        = -44.0;   // ms rel. QRS onset, start of anchor search
pub const PQ_SEARCH_HI_MS: f64        = -8.0;    // ms rel. QRS onset, end (guard for onset jitter)
pub const PQ_WIN_MS: f64              = 20.0;    // ms, flattest-window length; anchor = its median
pub const PQ_FLATNESS_MAX_MV: f32     = 0.040;   // mV p-p in window; above => reject this anchor
pub const PQ_SLOPE_COST_W: f32        = 1.0e-4;  // weight on slope^2 in the flattest-window cost
pub const DETREND_RESID_MAX_MV: f32   = 0.050;   // mV RMS over anchors; above => BASELINE_UNMODELLED
pub const BASELINE_REMOVED_MAX_MV: f32= 0.150;   // mV peak; above => HEAVY_BASELINE_CORRECTION
pub const TP_PQ_DISAGREE_WARN_MV: f32 = 0.050;   // mV; above => inflate sigma_b, flag lead
pub const TP_PQ_DISAGREE_FAIL_MV: f32 = 0.080;   // mV; above => refuse ST for that lead

// ---- §2 PASS-1 (THROWAWAY) MEDIAN CASCADE ----------------------------------
pub const MED_W1_MS: f64              = 200.0;   // ms, first running median
pub const MED_W2_MS: f64              = 600.0;   // ms, second running median
pub const MED_W1_WIDE_MS: f64         = 250.0;   // ms, used when QRS>130 ms or RR<700 ms
pub const MED_W2_WIDE_MS: f64         = 750.0;   // ms, ditto. HARD RULE: w2 >= 1.2 * QT.
pub const MED_WIDE_QRS_MS: f64        = 130.0;   // ms, trigger for the wide cascade
pub const MED_WIDE_RR_MS: f64         = 700.0;   // ms, trigger for the wide cascade
pub const MED_BIN_UV: f32             = 1.0;     // uV, histogram bin of the O(1) running median
pub const MED_RANGE_MV: f32           = 16.384;  // mV, +/- histogram span

// ---- §3 MAINS ---------------------------------------------------------------
pub const MAINS_ENABLED_DEFAULT: bool = false;   // DEFAULT OFF. See decision #5.
pub const MAINS_MIN_FS_EFF_HZ: f64    = 200.0;   // Hz, below this: never notch, and no quant. output
pub const MAINS_SNR_MIN: f64          = 4.0;     // Goertzel harmonic-sum / neighbour-median floor
pub const MAINS_WINNER_RATIO: f64     = 2.0;     // best must beat runner-up by this factor
pub const MAINS_TEMPLATE_MIN_MV: f32  = 0.010;   // mV peak; below => do nothing (fitting noise)
pub const MAINS_MIN_SAMPLES_PER_PHASE: usize = 8;
pub const MAINS_MAD_K: f32            = 3.0;     // robust QRS exclusion in the Levkov residual

// ---- §4 RESAMPLING ---------------------------------------------------------
pub const RESAMP_FC_FRAC: f64         = 0.45;    // of min(f_in, f_out)
pub const RESAMP_FC_CAP_HZ: f64       = 150.0;   // diagnostic band edge (AHA/IEC 60601-2-25)
pub const RESAMP_ZERO_CROSSINGS: usize= 32;      // per side; drop to 16 only if f_in/f_out > 3
pub const RESAMP_ATTEN_DB: f64        = 80.0;
pub const RESAMP_TABLE_LEN: usize     = 4096;    // sinc table; linear interp error ~ -75 dB
pub const PCHIP_GAP_MAX_MS: f64       = 8.0;     // ms between source vertices; above => INTERPOLATED

// ---- §5 QRS DETECTION (Pan-Tompkins @ 500 Hz, time-matched) ----------------
pub const PT_LP_M: usize              = 15;      // 30 ms comb
pub const PT_HP_N: usize              = 80;      // 160 ms MA, -3 dB ~ 5 Hz
pub const PT_MWI_W: usize             = 75;      // 150 ms integration
pub const PT_PIPELINE_DELAY: usize    = 94;      // 15+40+2+37 samples = 188 ms
pub const PT_REFRACTORY: usize        = 100;     // 200 ms
pub const PT_T_LIMIT: usize           = 180;     // 360 ms T-wave discrimination window
pub const PT_SLOPE_HALF: usize        = 15;      // +/-30 ms slope window
pub const PT_PAD: usize               = 200;     // odd-reflect pad each end
pub const PT_ALPHA: f64               = 0.125;   // peak weight (rate-independent, from the paper)
pub const PT_THRESH_FRAC: f64         = 0.25;
pub const PT_RR_LOW: f64              = 0.92;
pub const PT_RR_HIGH: f64             = 1.16;
pub const PT_RR_MISSED: f64           = 1.66;    // search-back trigger
pub const PT_T_SLOPE_RATIO: f64       = 0.50;

// ---- §6 BEAT QUALITY / ENSEMBLE --------------------------------------------
pub const TEMPLATE_WIN_MS: (f64, f64) = (-100.0, 160.0); // QRS-centric on purpose
pub const RHO_OK_VECTOR: f32          = 0.95;    // eligibility for the ensemble, vector PDF
pub const RHO_OK_RASTER: f32          = 0.92;    // image-derived traces plateau near 0.95
pub const RHO_SUSPECT: f32            = 0.80;    // below => Outlier
pub const RHO_XSTUDY_MIN: f32         = 0.90;    // NCC interlock (decision #18)
pub const ALIGN_MAX_LAG_MS: f64       = 20.0;    // +/- for template alignment
pub const XSTUDY_MAX_LAG_MS: f64      = 30.0;    // +/- for cross-study NCC
pub const XSTUDY_CLAMP_MS: f64        = 12.0;    // |delta| above this with rho ok => ALIGN_IMPLAUSIBLE
pub const ALIGN_SIGMA_TARGET_MS: f64  = 0.5;     // acceptance-test target
pub const ECTOPY_RR_FRAC: f64         = 0.85;    // rr_prev < 0.85*RR_med => premature
pub const RATE_OUTLIER_FRAC: f64      = 0.20;    // |rr - RR_med|/RR_med
pub const SCALE_OUTLIER_FRAC: f32     = 0.20;    // |Rpp_i/Rpp_medoid - 1|
pub const ENSEMBLE_MEDIAN_MIN_N: usize= 5;       // n>=5 median, 3..4 screened mean, <=2 flagged
pub const EXCLUDE_POST_ECTOPIC: bool  = true;    // post-extrasystolic T/ST change is real but not resting
pub const UNRELIABLE_RHYTHM_FRAC: f64 = 0.40;    // >40% beats excluded => require human review
pub const SIGMA_ENS_FLOOR_FRAC: f32   = 0.25;    // sigma_ens >= 0.25 * sigma_prov

// ---- §7 FIDUCIALS ----------------------------------------------------------
pub const SV_HALF_QRS: usize          = 3;       // 14 ms Savitzky-Golay window for QRS boundaries
pub const SV_HALF_PT: usize           = 7;       // 30 ms window for P and T
pub const SV_THRESH_FRAC: f32         = 0.05;    // of SV peak
pub const SV_THRESH_MAD_K: f32        = 4.0;     // floor = base + 4*MAD
pub const SV_PERSIST_SAMPLES: usize   = 3;       // 6 ms; stops a noisy dip terminating the walk
pub const SV_MIN_LEADS: usize         = 4;       // fewer surviving leads => Unmeasurable
pub const SV_LEAD_SQI_MIN: f32        = 0.50;    // weight = sqi if >= this, else 0
pub const QRS_ON_CLAMP_MS: (f64,f64)  = (-120.0, -10.0); // rel. R
pub const QRS_OFF_CLAMP_MS: (f64,f64) = ( 20.0,  160.0); // rel. R
pub const QRS_DUR_PLAUSIBLE_MS: (f64,f64) = (50.0, 220.0); // outside => block, "check paper speed"
pub const P_SV_MAD_K: f32             = 6.0;     // P detection is stricter; else P = None (correct in AF)
pub const T_LS_HALF: usize            = 6;       // +/-12 ms => 24 ms tangent LS window
pub const T_MIN_AMP_MV: f32           = 0.050;   // flat-T guard; below => Unmeasurable(FlatT)
pub const T_MIN_SLOPE_MV_S: f32       = 0.20;    // shallow-tangent guard
pub const T_LOBE_REL_AMP: f32         = 0.15;    // terminal-lobe selection threshold
pub const T_WIN_RR_FRAC: f64          = 0.60;    // search span = min(0.60*RR, 0.55 s)
pub const T_PERCENTILE_FALLBACK: f64  = 0.75;    // if VM unusable and >=6 leads measurable

// ---- §8 ST MEASUREMENT -----------------------------------------------------
pub const ST_J_WIN_MS: (f64,f64)      = ( 0.0, 20.0);  // mean over this, rel. J  -> ST_J (primary)
pub const ST_J60_WIN_MS: (f64,f64)    = (40.0, 80.0);  // one grid period centred at J+60
pub const ST_SLOPE_PTS_MS: (f64,f64)  = (20.0, 80.0);  // J+20 -> J+80, mV/s
pub const ST_SLOPE_FLAT_MV_S: f32     = 0.15;    // |slope| below => Horizontal
pub const ST_CAP_MS_BY_HR: [(f64,f64);3] = [(100.0,80.0),(130.0,60.0),(f64::MAX,40.0)];
pub const ST_TPEAK_GUARD_FRAC: f64    = 0.50;    // never sample past J + 0.5*(Tpeak - J)

// ---- §9 SIGNAL QUALITY (per lead, 0..1) ------------------------------------
pub const SQI_FLAT_WIN_MS: f64        = 200.0;
pub const SQI_FLAT_PP_UV: f32         = 25.0;    // window p-p below this counts as flatline
pub const SQI_FLAT_FRAC_FAIL: f32     = 0.50;    // hard 0
pub const SQI_SAT_GAIN: f32           = 20.0;    // g_sat = 1 - min(1, 20*sat_frac)
pub const SQI_HF_SNR_LO_DB: f32       = 10.0;    // maps to 0
pub const SQI_HF_SNR_HI_DB: f32       = 30.0;    // maps to 1
pub const SQI_BW_GAIN: f32            = 10.0;    // q_bw = 1 - 10*sqrt(P_lf)/qrs_amp
pub const SQI_GRID_RATIO_OK: f32      = 2.0;     // <=2 => 1.0
pub const SQI_GRID_RATIO_BAD: f32     = 6.0;     // >=6 => 0.0
pub const SQI_EXP: (f32,f32,f32)      = (0.4, 0.3, 0.3); // hf, bw, grid exponents (geometric mean)
pub const SQI_BAND_MEASURE: f32       = 0.75;    // >=      : measure freely
pub const SQI_BAND_CAUTION: f32       = 0.50;    // 0.50-75 : measure with caution
pub const SQI_BAND_DISPLAY: f32       = 0.35;    // 0.35-50 : display only, no numeric delta
pub const BSQI_STRIP_MIN: f32         = 0.35;    // below => NoTimingAuthority fallback

// ---- §10 RASTER: PREFLIGHT GATES -------------------------------------------
pub const S_WORK_PX_PER_MM: f64       = 12.0;    // ~305 DPI working raster; clamp to source if lower
pub const G1_PX_PER_MM_FAIL: f64      = 5.0;     // hard floor (~127 DPI)
pub const G1_PX_PER_MM_WARN: f64      = 8.0;
pub const G2_EDGE_RISE_FAIL_MM: f64   = 0.35;    // 10-90% rise across a grid rule
pub const G2_EDGE_RISE_WARN_MM: f64   = 0.20;
pub const G3_PITCH_UNIFORM_FAIL: f64  = 0.02;    // max/min tile pitch - 1; #1 phone-photo killer
pub const G3_PITCH_UNIFORM_WARN: f64  = 0.01;
pub const G4_ROT_RESID_DEG: f64       = 0.20;    // after deskew
pub const SKEW_CORRECT_DEG: f64       = 0.05;    // correct above this (1 deg => 0.109 mV ramp / panel)
pub const G5_PULSE_ROW_SPREAD: f64    = 0.08;    // >8% between rows => split-gain, per-row gain
pub const G7_INK_FRAC: (f64,f64)      = (0.003, 0.08); // of plot area, after illumination correction
pub const GLARE_SAT_LEVEL: u8         = 250;
pub const GLARE_BLOB_MIN_MM2: f64     = 25.0;    // above => NaN-mark, NEVER interpolate

// ---- §11 RASTER: GRID / CALIBRATION ----------------------------------------
pub const GRID_LAG_MIN_PX: usize      = 3;
pub const GRID_LAG_MAX_PX: usize      = 220;
pub const GRID_PEAK_MIN_R: f32        = 0.25;    // autocorr peak height (PaperECG used 0.30)
pub const GRID_PEAK_MIN_PROM: f32     = 0.05;
pub const GRID_WINSOR_Q: f32          = 0.975;   // clip the projection before summing
pub const GRID_MAX_HARMONIC: usize    = 40;
pub const GRID_CREST_MIN_REL_AMP: f32 = 0.20;    // vs median crest amplitude
pub const GRID_MAX_RESID_FRAC: f64    = 0.25;    // residual/pitch above => "not a lattice"
pub const GRID_RESID_GOOD_FRAC: f64   = 0.08;
pub const GRID_MIN_CRESTS: usize      = 40;      // 12-40 warn, <12 fail
pub const GRID_MOD5_MIN: f32          = 0.15;    // period-5 modulation => minor rules resolved
pub const GRID_MOD5_RATIO: f32        = 1.8;     // must beat period-4 and period-6 by this
pub const GRID_MOD5_RESID_CORR: f32   = 0.35;    // resid vs (n mod 5); above => refit majors only
pub const GRID_DECIMATE_TOL: f64      = 0.015;   // 2x-decimated pitch must halve within this
pub const GRID_PX_PER_MM_RANGE: (f64,f64) = (4.0, 40.0);
pub const ANISO_OK: f64               = 0.005;   // |px_y/px_x - 1|
pub const ANISO_SUSPECT: f64          = 0.15;
pub const TILE_SPREAD_AFFINE: f64     = 0.01;    // above => homography
pub const TILE_SPREAD_HOMOG: f64      = 0.08;    // above => TPS or HITL
pub const PULSE_MIN_H_MM: f64         = 4.0;
pub const PULSE_W_RANGE_MM: (f64,f64) = (1.5, 10.0);
pub const PULSE_STROKE_MATCH: f64     = 0.20;    // heights within 20%
pub const PULSE_FLATNESS_MAX_MM: f64  = 0.30;    // SD of the plateau
pub const PULSE_GAIN_SNAP_TOL: f64    = 0.12;    // snap to {5,10,20} within +/-12%, else reject
pub const GEO_GAIN_CLAMP: (f64,f64)   = (0.95, 1.05); // ONLY automatic amplitude scaling permitted

// ---- §12 RASTER: TRACE TRACKER (min-sum DP over ink runs) -------------------
pub const TRK_W_INK: f32              = 1.0;
pub const TRK_W_BAND: f32             = 0.30;    // SATURATING: tall R waves are never dragged back
pub const TRK_W_LEN: f32              = 0.05;    // per px above len_max
pub const TRK_W_GAP: f32              = 2.0;     // per px of VERTICAL WHITE -> dominant term
pub const TRK_W_SLOPE: f32            = 0.02;    // per px of centre displacement; tie-break only
pub const TRK_W_SKIP: f32             = 4.0;     // per skipped column
pub const TRK_W_JUMP: f32             = 0.50;    // per px across an occlusion
pub const TRK_W_HINT: f32             = 3.0;     // repair-brush soft constraint
pub const TRK_CLAIM_CLEAN: f32        = 6.0;     // exclusive claim on a clean run
pub const TRK_CLAIM_MERGED: f32       = 0.5;     // a merged run may legitimately carry two leads
pub const TRK_LEN_MAX_PX: f32         = 30.0;    // + 2*stroke; 30 mm/mm is max physiological slope
pub const TRK_LEN_MERGE_PX: f32       = 45.0;    // + 3*stroke; above => two fused strokes
pub const TRK_MAX_SKIP_MM: f64        = 6.0;     // = 240 ms at 25 mm/s; widest printed lead label
pub const TRK_INK_REF: f32            = 0.55;
pub const TRK_TAU: f32                = 3.0;     // confidence softness on the cost margin
pub const TRK_STROKE_MM: f64          = 0.30;    // nominal pen; measured from run-length mode2
pub const TRK_SUBPIX_PAD_PX: u16      = 2;
pub const TRK_SUBPIX_FLOOR: f32       = 0.10;
pub const TRK_INTERP_CONF: f32        = 0.20;    // max conf on a bridged span
pub const TRK_INTERP_DECAY_PX: f32    = 24.0;    // conf -> 0 by ~25 px of bridge
pub const CONF_MEASURE: f32           = 0.70;    // >= : usable for measurement
pub const CONF_DISPLAY: f32           = 0.30;    // 0.30-0.70 display+registration only
pub const CONF_BEAT_MIN: f32          = 0.50;    // mean conf over [P onset, T end] to keep a beat

// ---- §13 RASTER: BINARISATION / SEPARATION ---------------------------------
pub const SAUVOLA_K: f32              = 0.25;
pub const SAUVOLA_WIN_MM: f64         = 3.0;     // clamped to [15, 51] px
pub const SAUVOLA_OTSU_FLOOR: f32     = 0.35;    // reject ink below 0.35 * global Otsu level
pub const FLATFIELD_SE_MM: f64        = 4.0;     // grey closing; exceeds every ink feature
pub const LOCALNORM_WIN_MM: f64       = 8.0;
pub const LOCALNORM_SIGMA_FLOOR: f32  = 0.02;    // stops noise amplification in blank paper
pub const CHROMA_GATE_8BIT: (f32,f32) = (10.0, 30.0);
pub const HUE_HALF_WIDTH_RAD: f32     = 0.60;    // +/-34 deg around the dominant grid hue
pub const CHROMATIC_MASS_MIN: f32     = 0.15;    // below => NEUTRAL branch (grey grid)
pub const GRID_TEMPLATE_PCTL: f32     = 0.25;    // 25th pctl along each rule; median gets polluted
pub const SPECKLE_MIN_MM2: f64        = 0.30;

// ---- §14 RASTER: LAYOUT / IDENTITY -----------------------------------------
pub const ROW_PEAK_ABS: f32           = 0.15;    // ink-density ridge (isoelectric segment)
pub const ROW_PEAK_REL: f32           = 3.0;     // x median density
pub const ROW_MIN_SEP_MM: f64         = 20.0;
pub const ROW_PITCH_CV_MAX: f64       = 0.15;
pub const COL_WIDTH_TOL_MM: f64       = 4.0;     // vs 2.5 s * speed; fail both speeds => cropped page
pub const LABEL_H_MM: (f64,f64)       = (2.2, 6.5);
pub const LABEL_FILL: (f64,f64)       = (0.22, 0.78);
pub const LABEL_SCORE_MIN: f32        = 0.72;
pub const LABEL_MARGIN_MIN: f32       = 0.12;
pub const LABEL_SOFTMAX_T: f32        = 0.08;
pub const LABEL_MIN_CONFIDENT: usize  = 8;       // of 12; below => w_label 1.0 -> 0.3
pub const IDENT_W_E: f64              = 3.0;     // within-column null-vector residual
pub const IDENT_W_G: f64              = 1.5;     // cross-column Goldberger, feature space
pub const IDENT_W_L: f64              = 1.0;     // label evidence
pub const IDENT_W_P: f64              = 0.5;     // aVR polarity penalty (warn-level)
pub const IDENT_RHO_E_OK: f64         = 0.10;    // marginal to 0.20, reject above
pub const IDENT_RHO_E_MAX: f64        = 0.20;
pub const IDENT_RHO_G_OK: f64         = 0.18;    // marginal to 0.30
pub const IDENT_RHO_G_MAX: f64        = 0.30;
pub const IDENT_RHO_G_AF_INFLATE: f64 = 1.6;     // when RR CV > 0.15
pub const IDENT_MARGIN_OK: f64        = 1.8;     // J_2nd / J_best; 1.25-1.8 => user confirm
pub const PANEL_TAU_TOL_MS: f64       = 60.0;    // |tau_c - 2.5*c|; above => non-standard layout
pub const PANEL_MATCH_TOL_MS: f64     = 40.0;    // accept; 40-150 correct-and-flag; >150 exclude
pub const EDGE_MARGIN_MS: f64         = 60.0;    // no QRS may be promoted inside this
pub const EDGE_DISCONT_MV: f32        = 0.50;    // adjacent-sample jump near an edge => truncate

// ---- §15 ERROR BUDGET: PROVENANCE FLOORS (mV, 1-sigma, ST after ensemble) ---
pub const SIGMA_PROV_VECTOR: f32      = 0.010;   // tier A: vector PDF, exact geometry
pub const SIGMA_PROV_SCAN300: f32     = 0.025;   // tier B: >=300 dpi flatbed, rot<1 deg
pub const SIGMA_PROV_PHOTO: f32       = 0.040;   // tier C: >=200 dpi eff., <=3 deg, <=1.5% perspective
pub const SIGMA_PROV_POOR: f32        = 0.087;   // tier D: ~110 dpi, >=3% perspective => NO ST DELTAS
pub const BIAS_VECTOR: f32            = 0.002;   // mV, ADDED LINEARLY, never in quadrature
pub const BIAS_SCAN300: f32           = 0.005;
pub const BIAS_PHOTO: f32             = 0.012;
pub const BIAS_POOR: f32              = 0.035;
pub const SIGMA_ISO_PQ: f32           = 0.015;   // mV, isoelectric estimate uncertainty
pub const SIGMA_ISO_PQ_SHORT: f32     = 0.025;
pub const SIGMA_ISO_TP: f32           = 0.030;
pub const SIGMA_ISO_AF: f32           = 0.045;   // f-waves in the PQ segment
pub const SIGMA_ISO_ONSET_PT: f32     = 0.040;
pub const SIGMA_BIO_LIMB: f32         = 0.025;   // mV, repeat-recording variability (NOT ours)
pub const SIGMA_BIO_V1_V3: f32        = 0.040;   // precordial placement dominates
pub const SIGMA_BIO_V4_V6: f32        = 0.030;
pub const SIGMA_TRACE_CENTROID_PX: f32= 0.35;    // px, realistic greyscale-centroid noise

// ---- §16 GATING ------------------------------------------------------------
pub const Z95: f32                    = 1.96;
pub const Z_HOLM_12: f32              = 2.87;    // most-extreme-of-12 isolated-lead flag
pub const CLINICAL_DELTA_ST_MV: f32   = 0.10;    // the criterion a change must also exceed
pub const MDC_FLOOR_VECTOR_MV: f32    = 0.05;    // both studies tier A
pub const MDC_FLOOR_OTHER_MV: f32     = 0.10;    // anything else
pub const RHO_GAIN_SAME_CART_VECTOR: f32 = 0.90; // must be POSITIVELY evidenced
pub const RHO_GAIN_SAME_SESSION: f32  = 0.50;
pub const RHO_GAIN_DEFAULT: f32       = 0.00;    // DEFAULT when provenance unknown
pub const DHR_ANNOTATE_BPM: f64       = 10.0;    // 10-20: add 0.002 mV/bpm in quadrature + annotate
pub const DHR_INDETERMINATE_BPM: f64  = 20.0;    // >20: ST claim + QTc delta -> Indeterminate
pub const DHR_REFUSE_BPM: f64         = 35.0;    // >35: ST/QT deltas Unmeasurable
pub const DHR_ST_RATE_TERM_MV_BPM: f32= 0.002;
pub const FILTER_UNKNOWN_EXTRA_MV: f32= 0.030;   // added in quadrature if HPF unreadable
pub const MIN_BEATS_FOR_DELTA: usize  = 2;       // n=1 -> display only, no uncertainty, no gating
pub const T_INFLATE_N2: f32           = 6.48/1.96;
pub const T_INFLATE_N3: f32           = 2.19/1.96;
pub const SIGMA_MULT_CAP: f32         = 6.0;     // beyond this the lead is REFUSED, not widened
pub const COVERAGE_ST_MIN: f32        = 0.90;    // fraction of the ST window with conf>=CONF_MEASURE
pub const QUALITY_ASYMMETRY_NAME: f32 = 3.0;     // sigma ratio above which we always name the limiter

// ---- §17 CROSS-CHECK RESIDUALS ---------------------------------------------
pub const ID_LIMB_PASS: f32           = 0.03;    // ||I - II + III|| / ||.||  (Einthoven)
pub const ID_LIMB_MARGINAL: f32       = 0.08;    // above => HARD BLOCK on limb comparison
pub const ID_RHYTHM_PASS: f32         = 0.04;    // rhythm strip vs its own panel, normalised RMS
pub const HR_PRINTED_TOL_BPM: f64     = 3.0;     // vs cart header; a 2x ratio = wrong paper speed
pub const QRS_PRINTED_TOL_MS: f64     = 12.0;
pub const QT_PRINTED_TOL_MS: f64      = 25.0;
pub const AXIS_PRINTED_TOL_DEG: f64   = 15.0;    // only cross-check sensitive to RELATIVE limb gains
pub const SWAP_MARGIN_MIN: f32        = 0.15;    // cross-study permutation score margin
pub const SWAP_SCORE_MIN: f32         = 0.90;
pub const SWAP_PRECORDIAL_RHO_MIN: f32= 0.95;    // precordials must be UNCHANGED for a cable swap
pub const RL_FLAT_RMS_MV: f32         = 0.05;    // near-flat limb lead => RL-cable swap, unrecoverable
pub const TZ_SHIFT_SUSPECT: f32       = 0.8;     // transition-zone positions => precordial shift
pub const GLOBAL_GAIN_SUSPECT: f32    = 0.03;    // |g-1| with IQR(r_l) < 0.10 => not physiology

// ---- §18 OPT-IN, DEFAULT-OFF MODES -----------------------------------------
pub const GAIN_MATCH_ENABLED: bool    = false;   // decision #— confirmed OFF
pub const GAIN_MATCH_IQR_MAX: f32     = 0.15;    // dispersed ratio => change is REGIONAL, refuse
pub const GAIN_MATCH_RANGE: (f32,f32) = (0.80, 1.25);
pub const WARP_MODE_DEFAULT: u8       = 0;       // 0 = Rigid
pub const DTW_LAMBDA: f32             = 0.4;     // derivative term weight (suppresses singularities)
pub const DTW_TAU_S: f32              = 0.020;   // puts the derivative term in mV^2
pub const DTW_BAND_SAMPLES: usize     = 20;      // 40 ms Sakoe-Chiba; hard cap R <= 0.08*JT_ref
pub const DTW_SATURATION_FRAC: f32    = 0.9;     // max|i-j| >= 0.9R => refuse, revert to rigid
pub const REPOL_SCALE_CLAMP: (f64,f64)= (0.75, 1.33);
```

---

## 3. PIPELINE STAGES

`[R]` = Rust/WASM in the worker. `[T]` = TypeScript, main thread or worker glue. `[H]` = human-in-the-loop gate.

| # | Stage | In → Out | Where | Blocking conditions |
|---|---|---|---|---|
| 0 | **Ingest & decode** | `File` → `ImageBitmap` \| `PDFDocumentProxy` | `[T]` | HEIC unsupported outside Safari → instruct user. EXIF orientation applied (§B5 probe); `imageOrientation:"from-image"` feature-detected by behaviour, not UA. |
| 1a | **Vector path**: pdf.js operator list → polylines | `PDFPageProxy` → `Vec<Polyline>` in points | `[T]` extract, `[R]` classify | *Already built and verified.* Grid/trace classifier + pitch estimator. |
| 1b | **Raster path**: illumination → lattice → homography | `ImageData` → `RasterCalibration{to_mm, homography, px_per_mm_{x,y}, θ, class}` | `[R]` | Class `Fail` (no lattice, resid>0.25·p, <12 crests) → HITL-2 four-corner. **Return a transform, never a resampled measurement image.** |
| 2 | **Quality gate** | `RasterCalibration` + raw → `Vec<Gate>` | `[R]` | G1 px/mm<5, G2 rise>0.35 mm, G3 pitch spread>2%, G7 ink fraction. FAIL blocks *measurement*, never *viewing*. |
| 3 | **Layout segmentation** | rectified preview → `[PanelRect;13]`, `[RowCal;4]` | `[R]` | `w_col` inconsistent with both 25 and 50 mm/s → "page is cropped", hard stop. |
| 4 | **Calibration** | pulses + header text + grid → `mm_per_mV` (per row), `mm_per_s` | `[R]` parse, `[H]` confirm | Pulse↔header disagreement >12% → modal. Row spread >8% → split-gain, per-row. **No pulse in both studies → no amplitude output.** |
| 5 | **Label read + lead identity** | panels → `LabelEvidence[12]` → `assign[12]`, `Layout` | `[R]` | `margin<1.8` or any ρ marginal or any precordial label not CONFIDENT → **HITL-1** lead-confirm grid. `DERIVED_LEAD_INCONSISTENT` → hard block. |
| 6 | **Trace extraction** | mask+grey per panel → `LeadTrace{y_px, conf, flags}` | `[R]` | Runs extracted over full page height; sequential decode with exclusive claims; `apex_refine`; `detect_clipping`. `<2` usable beats → "not digitisable", never a flat line. |
| 7 | **Geometry → physics** | `LeadTrace` + calibration → `(t_s, v_mV)` irregular | `[R]` | Column envelope + slope-continuity clamp. Gaps >8 ms → `INTERPOLATED` span, excluded from every measurement. |
| 8 | **PCHIP → f_int** | irregular → uniform at `f_int = max(f_src,500)` rounded to `10·f0` | `[R]` | Never PCHIP onto a grid coarser than the source (aliases). |
| 9 | **Mains (optional)** | `f_int` signal → same | `[R]` | Only if detected, `fs_eff ≥ 200 Hz`, template peak ≥ 10 µV, and paper speed cross-checked. |
| 10 | **Kaiser resample → 500 Hz** | → `ProvisionalSignal` on the canonical grid | `[R]` | `edge_samples` at each end flagged `EDGE`, excluded. **Never reflect-pad.** |
| 11 | **Pass 1 (throwaway)** | median cascade → beats, coarse QRS/PQ/J/T | `[R]` | Output is `ProvisionalSignal`; a newtype makes measuring on it a compile error. Adaptive cascade if wide QRS / tachycardia. |
| 12 | **Beat detection & classification** | rhythm strip → `Vec<Beat>` with `ρ`, class, `bSQI` | `[R]` | >40% excluded → `UnreliableRhythm`, human review before any serial number. |
| 13 | **Panel↔strip time-base verify** | panels + `Vec<Beat>` → `τ_c`, `PanelFlag` | `[R]` | `|Δ|>150 ms` or <2 matched beats → panel excluded from serial comparison entirely. |
| 14 | **Pass 2 detrend (measurement)** | `ProvisionalSignal` + PQ anchors → `MeasurementSignal` | `[R]` | 0 anchors → `NO_ISOELECTRIC_ANCHOR`, morphology only. Residual >50 µV → `BASELINE_UNMODELLED`. |
| 15 | **Ensemble beat per lead** | gated beats → `LeadMedian{v[401], σ[401], n_used}` | `[R]` | §4.2 gating; `n=0` → `Unavailable`, never "unchanged", never blank. |
| 16 | **Global fiducials, two-pass** | 12×401 matrix → `GlobalFiducials` + confidences | `[R]` | Pass 2 re-anchors on the assembled matrix, removing the rhythm lead's own bias. `NON_STATIONARY_10S` suppresses vector-derived outputs. |
| 17 | **Per-study measurements** | frame + fiducials → `Measurements` | `[R]` | Each study's **own** J, T end, P onset. Sex/age required for V2–V3 STE and QTc thresholds or `Unmeasurable(demographics_required)`. |
| 18 | **Cross-study registration** | 2..N `RegisteredStudy` → rigid δ per lead, `ρ_qrs` | `[R]` | §4 below. |
| 19 | **Confounder detectors** | pair → `Vec<Confounder>` | `[R]` | Run **before** the report renders and gate it: filter mismatch, ΔHR, limb swap divergence, precordial shift, global scaling, rhythm class change. |
| 20 | **σ̂ estimation + gating** | evidence → `σ̂_ST` per lead, `Verdict` per metric | `[R]` | §5. Five-state verdict; regional coherence for auto-flags. |
| 21 | **Render** | `RegisteredStudy[]` + verdicts → Canvas 2D | `[T]` | Three rows/lead: reference+σ band, comparison(s), Δ(t) with ±MDC shading. Fixed mV/div across all panels. Dashed = interpolated, faded = low-conf, red hatch = clipped. |
| 22 | **Export** | → PNG/PDF/JSON | `[T]` | Burns in conditioning summary, app version, both studies' flags, all `±` bands, and the disclaimer. A number that escapes without its interval is the product's main way of causing harm. |

---

## 4. THE REGISTRATION ALGORITHM (decided)

### 4.1 Frame

`FS=500`, `t ∈ [−0.200, +0.600]` s relative to **that study's own global QRS onset**, `N=401`. Samples beyond `0.80·RR_min` are drawn and shaded but excluded from every scalar.

**Two anchors, two purposes.** Display/difference anchor = global QRS onset, rigid, shared. Measurement fiducials = **each study's own** J, T end, P onset. `ST_J60` for study *k* is measured at *k*'s own `J_k+60 ms`, never at `J_ref+60`. Both offsets must be the **same Δt**; encode the offset in the metric ID (`ST_J60_V3`) so a mismatch is a type error.

### 4.2 Within-study: beat gating and the ensemble

Reference template = the **medoid** (beat minimising `Σ_j ‖W_i − W_j‖₁` over the QRS window `[−100, +160] ms`), which is immune to a single wild beat in a way the mean is not. `ρ_i` = Pearson vs template, maximised over ±20 ms with sub-sample lag by parabolic NCC vertex. Template ← median of beats with `ρ ≥ 0.90`, iterate twice.

Reject beat *i* if any of:
1. `rr_prev < 0.85·RR_med` (premature) **or** *i* immediately follows a rejected ectopic. Post-extrasystolic ST/T change is real physiology but is not the resting state, and in a 2-beat median it is a documented route to a fake "new T-wave change".
2. `|rr_prev − RR_med|/RR_med > 0.20`.
3. `ρ_qrs < ρ_ok` (0.95 vector / 0.92 raster).
4. `|Rpp_i/Rpp_medoid − 1| > 0.20`.
5. Post-alignment RMS residual `> max(3·σ_prov, 0.10 mV)`.
6. Any `F_INTERP | F_MERGED | F_CLIPPED` column inside the beat's measurement-support window.

Never reject below n=1; if all would be rejected, keep the medoid and flag `ALL_BEATS_DISCORDANT` — which is itself clinically informative (ectopy, alternans, or extraction failure).

**Alignment then combination.** (a) coarse-align to the strip's global onset; (b) refine per lead by NCC + parabolic vertex; (c) **resample the polyline at the refined fractional δ** where a polyline exists (vector PDF, and the raster tracker's sub-pixel `y` series), else 16-tap Kaiser sinc β=6 — do not re-interpolate an already-gridded 500 Hz array, which commits a second interpolation error and low-passes the QRS peak differently for different δ (up to 2% R-amplitude bias as a function of a nuisance parameter); (d) subtract the beat's own PQ isoelectric; (e) combine per §config `ENSEMBLE_MEDIAN_MIN_N`.

`σ_ens[i] = 1.4826·MAD_j(v_j[i])/√n` for n≥3; `σ_prov` for n≤2; clamped `≥ 0.25·σ_prov`.

### 4.3 Global onset — the two-pass design

**Pass 1 (rhythm strip = timing authority).** Detect all beats and their onsets over the full 10 s using the rhythm lead plus the column leads simultaneously available at each instant. Every panel beat inherits the onset time of the strip beat occupying the same absolute time. The strip's lead-specific onset bias `b_study` is **identical for all 12 panels within the study**, so it cancels completely in within-study lead-to-lead comparison.

**Pass 2 (bootstrap to a true global onset).** With all 12 ensemble beats on the frame, assemble the 12×401 matrix and run the absolute-spatial-velocity onset detector on **all 8 independent channels at once**. Shift the whole frame so that onset lands at `t=0`. `b_study` is now removed and the anchor is comparable across studies.

Onset detector: 5-point SG derivative per channel, `ASV = Σ|d|`, 10 ms moving average; `thr = max(0.04·peak, 3·MAD(pre-QRS ASV))`; walk back from R to the last index where ASV stays below `thr` for ≥10 ms; refine by least-squares tangent x-intercept over the following 20 ms, clamped ±10 ms. Offset uses the same machinery with a 24 ms confirmation (the ST segment is flatter and noisier) and `J − onset ∈ [50, 220] ms`.

**Stated assumption:** the 12-lead matrix is *synthetic* — leads come from four different 2.5 s windows. It is adequate for defining onset (it is essentially what commercial median-beat programs construct) but **not** valid for instant-by-instant vector quantities unless rate and conduction were stable: require `RR CV < 10%` and strip QRS `ρ > 0.98` across all beats, else flag `NON_STATIONARY_10S` and suppress VG/axis/spatial-angle outputs.

Two costs of the synthetic matrix that must be published, not hidden:
- Beat-to-beat QT variability (5–10 ms SD in normals) adds **~3–5 ms** of fiducial uncertainty vs a true simultaneous 12-lead. That is the floor for global fiducials from a 3×4.
- The respiratory cycle is 4–5 s, so each 2.5 s column samples a different respiratory phase. Limb amplitudes are modulated 5–10%. This does **not** average out within a column and does **not** cancel between studies. **The amplitude uncertainty floor for any single-column measurement on a 3×4 printout is ~5%, no matter how good the digitization.**

Residual risk: if the rhythm lead's *own* morphology changed (new inferior Q in II), `b_study` changes. Pass 2 largely removes this. Detector regardless: `ρ_uncentered(II_ref, II_k)` over QRS `< 0.90` → flag `RHYTHM_LEAD_MORPHOLOGY_CHANGED` and widen timing uncertainty to ±6 ms.

### 4.4 Cross-study rigid refinement

Per lead, NCC over `[onset−20 ms, onset+max(QRSd_ref,QRSd_k)+10 ms]`, ±30 ms search, integer argmax then parabolic vertex `δ = 0.5(r[k−1]−r[k+1])/(r[k−1]−2r[k]+r[k+1])` clamped ±0.5 sample. At 500 Hz with typical QRS SNR this gives ~±0.3 ms.

**Interlocks, in order:**
```
if rho < 0.90        { delta = 0.0; flags |= QRS_MORPHOLOGY_CHANGED; }   // often THE finding
if |delta| > 12 ms   { delta = 0.0; flags |= ALIGN_IMPLAUSIBLE; }
```
Report `median(δ_lead)` as the study-level residual anchor error; `IQR(δ_lead) > 4 ms` → `ANCHOR_UNSTABLE`.

**Amplitude registration is calibration only.** mV = mm / `gain_mm_per_mv`, per row. The only permitted automatic scaling is `g_geo = 1.0/pulse_measured_mV`, clamped to [0.95, 1.05]; outside the clamp, flag "calibration inconsistent" and require user action. Empirical gain matching stays off (decision table).

**Rate handling: rigid, no warping.** Report ΔQT and ΔQTcF as numbers. Never report QTc without the raw pair and both rates. If ΔQT and ΔQTc disagree in sign, the "change" is the correction formula, not the patient — say so in the UI.

### 4.5 Difference computation

`Δ(t) = v_k(t) − v_ref(t)` on the common frame, with a ±2.5·σ_Δ(t) significance band. Δ is the product's primary visual object and must be as prominent as the tracings.

Per-lead scalars (segments from the **reference** study's fiducials, intersected with the valid region): `rmsd_full`, `rmsd_{qrs,st,t}`, `max_abs_delta` + `t_at_max`, **uncentered** `ρ_qrs`/`ρ_stt` (zero is physically meaningful — do not mean-remove), `shape_only_rmsd_stt` (invariant to isoelectric-method mismatch), `d_st_J`, `d_st_60`, `d_t_amp`/`d_t_area`, `d_q_dur`/`d_q_depth`, `d_r_amp`/`d_s_amp`, `d_qrs_dur_lead`, `d_notch_count`.

Global: ΔHR, ΔQRS_dur, ΔQT, ΔQTcF, ΔQRS_axis, ΔT_axis, ΔQRS-T angle, **ΔST vector** and **ΔVG** (Kors transform on the synthetic matrix). The ΔST and ΔVG difference vectors reached AUC 0.906 and 0.880 for acute occlusion-induced ischaemia in serial pairs, outperforming static STEMI criteria — cheap to compute once the registered medians exist, and worth having.

**Regional aggregation is what a clinician reads first:** inferior (II, III, aVF), anterior/septal (V1–V4), lateral (I, aVL, V5, V6). A change confined to a contiguous anatomical region is credible; a change scattered across non-contiguous leads is more likely technical — put that sentence in the UI.

---

## 5. ERROR BUDGET AND GATING RULE

### 5.1 Tiers and the headline numbers

| Tier | Definition | σ_prov (mV) | bias (mV) |
|---|---|---|---|
| **A** | Vector PDF, exact geometry | 0.010 | 0.002 |
| **B** | ≥300 dpi flatbed scan, rot <1°, no perspective | 0.025 | 0.005 |
| **C** | ≥200 dpi effective phone photo, ≤3° rot, ≤1.5% perspective, JPEG q≥85 | 0.040 | 0.012 |
| **D** | ~110 dpi, ≥3% perspective, ≥30% shadow, JPEG q≈60, blur σ≥1.5 px | 0.087 | 0.035 |

Tier is **measured at runtime** (grid pitch, edge rise, tile pitch spread, illumination range), never declared by the user.

Budget composition for ST (1σ, mV, after ensemble and after grid-period averaging):

| Term | A | B | C | D |
|---|---|---|---|---|
| Trace centroid + grid residual | 0.003 | 0.010 | 0.014 | 0.050 |
| **Isoelectric baseline** | **0.015** | **0.020** | **0.030** | **0.060** |
| Residual beat noise (n=3) | 0.012 | 0.012 | 0.017 | 0.035 |
| J localisation × ST slope | 0.004 | 0.006 | 0.007 | 0.015 |
| Resampling + scale @0.2 mV | 0.001 | 0.002 | 0.004 | 0.009 |
| **σ_ST (RSS)** | **0.020** | **0.026** | **0.038** | **0.087** |

**The baseline estimate dominates every tier, including vector PDF.** "Where is isoelectric" costs 15 µV even with exact geometry. This is why a perfect vector pipeline still cannot resolve arbitrarily small ST changes, and it is the most important line in the budget.

Scale errors are nearly irrelevant to ST (1% of 0.2 mV = 2 µV) and dominant for R amplitude — state this, it is counterintuitive and it determines which failure modes matter.

### 5.2 MDC95 per pair

```
σ_Δ² = Σ_s ( σ_A,s² + σ_B,s² − 2·ρ_s·σ_A,s·σ_B,s )      # ρ=0 for everything except evidenced gain
MDC95 = 1.96·σ_Δ + b_A + b_B                            # bias LINEAR, never in quadrature
```

| Pair | MDC95, digitization only | Verdict on 0.10 mV |
|---|---|---|
| A ↔ A | **0.06 mV** | resolves comfortably |
| B ↔ B | **0.08 mV** | resolves |
| A ↔ C | **0.10 mV** | exactly at threshold |
| C ↔ C | **0.13 mV** | **cannot reliably resolve 0.10 mV** |
| D ↔ D | **0.30 mV** | **refuse ST deltas** |

Note A↔C (0.10) beats C↔C (0.13): **the gate is pair-specific, not tier-specific.** Never label the pipeline with one accuracy number.

Interval MDC95: ΔQRS 11.6 / 15.8 / 27.7 / 59.6 ms; ΔQT 23.8 / 30.5 / 50.7 / 99 ms for A/B/C/D. **The vector-PDF ΔQT MDC (24 ms) sits at the CSE/IEC tolerance of 25 ms — the app must never claim a QT change smaller than 25 ms from any paper source, and must refuse QT deltas entirely for photo pairs.**

### 5.3 The floor we do not control

Precordial electrode repositioning: morphology changes are prominent beyond 2 cm displacement; 1 cm gives RMSE 48±28 µV (V2) and 67±35 µV (V3); 5 cm gives 292/344 µV. Trained technicians place within 1 cm in ~50% of men and ~20% of women. `σ_bio` = 0.025 (limb) / 0.040 (V1–V3) / 0.030 (V4–V6) mV.

Consequence, stated plainly: even a **perfect** A↔A pair has an acquisition-inclusive MDC in V2 of `1.96·√(0.020²+0.020²+0.040²)+0.004 = 0.100 mV`. **Two paper ECGs, however well digitized, sit right at the 0.1 mV decision threshold in the anterior leads.** That is a property of serial 12-lead ECG, not of our pipeline, and it is the most important true thing this product can tell a clinician.

**Show two bands.** Solid = digitization-only (what we validate and control). Hatched = plus `σ_bio`, labelled "including expected repeat-recording variation". Both visible by default.

### 5.4 Runtime σ̂ (no ground truth)

Five evidence channels, fused into a **calibrated σ̂ in mV**, not a score:

- **C1 — identity residuals.** `‖I−II+III‖` and `‖aVR+aVL+aVF‖` within their own columns (no time alignment needed — that is the answer to "how do you check identity when panels aren't aligned"); rhythm strip vs its own panel sample-for-sample. **Caveat that must be in the code comments and the UI:** carts *derive* III/aVR/aVL/aVF from I and II, so **a uniform gain error satisfies both identities perfectly.** These validate lead assignment, tracker fidelity, per-panel baseline, and per-panel geometry — **nothing about global gain.**
- **C2 — cart's printed HR/QRS/QT.** Independent check of the time base. `HR_ours/HR_printed ≈ 2.0` catches a 50 vs 25 mm/s misread instantly. Counts toward confidence only after user confirmation (4-field row, ~5 s, the highest-value-per-second interaction in the product).
- **C3 — grid-fit residual** → `σ_grid = 0.5·grid_res_mm/gain`.
- **C4 — per-column tracker confidence** (`n_comp`, extent, contrast, slew), aggregated as **coverage over the specific measurement window**, not per lead.
- **C5 — beat-to-beat empirical σ**, inflated by the t-factor at n=2 (6.48/1.96) and n=3 (2.19/1.96). **At n=1 σ is unestimable — `σ̂ = ∞`, lead excluded from gating.** Unit-test this.

Additive terms combine by **variance** (weight 1/σ², the only defensible weighting for independent zero-mean contributions to one physical quantity — no free parameter). Coverage inflates variance by `1/cov`. The cross-checks are **validity tests, not contributors**: a failed validity test cannot be averaged away by a good one, so they enter as a **multiplier ≥1**, capped at 6×, beyond which the lead is **refused**, not reported with a huge interval.

Expected term ordering on real studies: `σ_b > σ_n > σ_grid > σ_t > σ_scale`. If your implementation disagrees, something upstream is broken.

Quality index `Q = 100·exp(−σ̂/0.040)`; grades A ≤0.025, B ≤0.045, C ≤0.070, D >0.070 (no ST claims). **The mV number is always shown; the letter may never appear without it; the study grade is the WORST lead's grade, never the mean** — a mean hides the one bad lead, which is the lead that will be misread.

Calibration is mandatory: bin harness cases by predicted σ̂ and verify observed p95|error| ≈ 1.96·σ̂ in each bin. Raise floors until no bin is anti-conservative. **An uncalibrated confidence score is worse than none.**

### 5.5 The gating rule

```rust
pub fn gate_st(a:&LeadResult, b:&LeadResult, rho_gain:f32, incl_bio:bool, lead:Lead) -> Verdict {
    // ---- hard preconditions (fail-closed) ---------------------------------
    if a.n_beats < 2 || b.n_beats < 2                 { return Refused(TooFewBeats); }
    if a.coverage_st < 0.90 || b.coverage_st < 0.90   { return Refused(LowCoverage); }
    if a.identity_fail || b.identity_fail             { return Refused(IdentityFail); }
    if !a.gain_confirmed || !b.gain_confirmed         { return Refused(GainUnconfirmed); }
    if a.hp_filter_hz != b.hp_filter_hz               { return Refused(FilterMismatch); }
    if (a.hr - b.hr).abs() > 35.0                     { return Refused(RateMismatch); }
    if a.swap_state != b.swap_state                   { return Refused(LeadReversalMismatch); }

    let indep = a.var_indep + b.var_indep;                       // σ_b², σ_n², σ_grid², σ_t²
    let gain  = a.sig_gain.powi(2) + b.sig_gain.powi(2)
              - 2.0*rho_gain*a.sig_gain*b.sig_gain;              // ρ=0 unless evidenced
    let rate  = if (a.hr-b.hr).abs() > 10.0 { (0.002*(a.hr-b.hr).abs() as f32).powi(2) } else { 0.0 };
    let bio   = if incl_bio { 2.0*sigma_bio(lead).powi(2) } else { 0.0 };
    let sigma = (indep + gain.max(0.0) + rate + bio).sqrt();

    let floor = if a.tier==Vector && b.tier==Vector { 0.05 } else { 0.10 };
    let mdc   = (1.96*sigma + a.bias + b.bias).max(floor);
    let delta = b.st_j - a.st_j;

    if delta.abs() > mdc && delta.abs() >= CLINICAL_DELTA_ST_MV && !hard_confounder(a,b) {
        Significant { delta, ci: (delta-mdc, delta+mdc) }
    } else if delta.abs() > mdc {
        Indeterminate { mdc, reason: SubThresholdOrConfounded, limiter: worse_of(a,b) }
    } else if delta.abs() + mdc < CLINICAL_DELTA_ST_MV {
        NoChange { bound: delta.abs() + mdc }        // TOST-style: 0.10 mV POSITIVELY excluded
    } else {
        Indeterminate { mdc, limiter: worse_of(a,b) }
    }
}
```

**The rule in one sentence:** a serial change may be reported as notable only when `|Δ| > max(MDC95_pair, clinical criterion)`, no hard confounder is present, both studies have ≥2 gated beats with ≥90% ST-window coverage, both gains were measured from calibration pulses, and both studies' high-pass filters match.

Hard confounders (each downgrades `Significant` → `Indeterminate`, never upgrades): `source_tier_mismatch`, `gain_unverified`, `paper_speed_unverified`, `filter_setting_mismatch`, `lead_reversal_mismatch`, `zero_sum_residual_high`, `heart_rate_mismatch` (>20 bpm), `beats_lt_3`, `pq_baseline_not_flat`, `possible_precordial_electrode_shift`, `lvh_or_lbbb_or_paced` (ST rules only), `rhythm_class_changed`.

**Multiplicity.** Regional flag: ≥2 leads in one anatomical territory each exceeding `z=1.96`. Isolated single-lead flag: Holm–Bonferroni over 12 leads (`z≈2.87`), labelled "isolated lead — interpret cautiously". Hovering an individual lead shows its **uncorrected** 95% CI, because a clinician interrogating a lead they already suspect is not performing 12 tests.

Worked check on the shipped fixture (+0.25 mV in V2/V3/V4): A↔A digitization-only → V2 `Significant`, CI [0.19, 0.31]; V6 `NoChange ≤0.06`. C↔C → V2 `Significant`, CI [0.12, 0.38]; V6 `Indeterminate`. D↔D → both `Indeterminate`. Even the best case cannot say "no change" in V6 once `σ_bio` is included — and that is correct.

---

## 6. CLINICAL REFERENCE DATA

### 6.1 Normal ranges (`ecg-reference-ranges/v1`)

```json
{ "units": {"interval":"ms","amplitude":"mV","angle":"deg","rate":"bpm"}, "adult": {
  "heart_rate":      {"normal":[60,100], "source":"convention"},
  "p_duration":      {"normal_max":120, "source":"AHA/ACCF/HRS Part III (Surawicz 2009)"},
  "p_amplitude_II":  {"normal_max":0.25, "source":"convention"},
  "p_axis_sinus":    {"normal":[0,75],
     "note":"P axis outside 0-75 deg with otherwise sinus morphology is the single best flag for limb-lead reversal",
     "source":"AHA/ACCF/HRS Part II (2009)"},
  "pr_interval":     {"normal":[120,200], "first_degree_avb":">200",
     "REPORTING":"NOT OFFERED IN v1 - see MRD table", "source":"AHA/ACCF/HRS Part III (2009)"},
  "qrs_duration":    {"normal_max":110, "incomplete_rbbb":[110,119], "complete_bbb":">=120",
     "nonspecific_ivcd":">=110 without BBB morphology", "source":"AHA/ACCF/HRS Part III (2009)"},
  "frontal_qrs_axis":{"normal":[-30,90], "lad":[-31,-90], "rad":[91,180], "extreme":[-91,-179],
     "lafb":{"axis":[-45,-90],"requires":["qR in aVL","R-peak time aVL >= 45 ms","QRS < 120 ms"]},
     "lpfb":{"axis":[90,180],"requires":["rS in I and aVL","qR in III and aVF","QRS < 120 ms",
             "exclusion of RVH / lateral MI / vertical heart"]},
     "source":"AHA/ACCF/HRS Part III (2009)"},
  "qt_qtc": {"default_correction":"fridericia",
     "prolonged":{"male":">450","female":">460"}, "markedly_prolonged":{"any":">500"},
     "short":{"any":"<390"},
     "bbb_note":"With QRS >= 120 ms report JT and JTc (QT - QRS) as PRIMARY; QTc thresholds are not validated under BBB.",
     "source":"AHA/ACCF/HRS Part IV (Rautaharju 2009); AHA/ACCF Prevention of TdP (2010)"},
  "st_j_point_upper_limit_normal": {
     "leads_other_than_V2_V3": {"male":0.10, "female":0.10},
     "V2_V3": {"male_lt40":0.25, "male_ge40":0.20, "female_any_age":0.15},
     "source":"Fourth Universal Definition of MI (Thygesen 2018), Table 3",
     "caveats":["Normal J-point elevation is race-dependent; these thresholds are not race-adjusted.",
                "Not valid with LVH, LBBB, ventricular pacing, or WPW."]},
  "st_depression_criterion": {"value":-0.05, "morphology_required":"horizontal or downsloping",
     "leads":"2 contiguous", "PRODUCT_NOTE":"BELOW our best-case difference floor - see 6.3",
     "source":"UDMI-4 (2018)"},
  "t_wave_inversion_criterion": {"value":-0.10, "requires":"R/S > 1 or prominent R in the same lead",
     "leads":"2 contiguous", "source":"UDMI-4 (2018)"},
  "pathological_q_wave": {
     "V2_V3":{"q_duration_min":20, "or":"QS complex"},
     "I_II_aVL_aVF_V4_V5_V6":{"q_duration_min":30, "q_depth_min":0.10, "or":"QS complex",
                              "leads":"any 2 of a contiguous grouping"},
     "posterior_equivalent":{"V1_V2":{"r_duration_min":40,"r_over_s_min":1.0,
         "requires":"concordant positive T wave, no conduction defect"}},
     "source":"UDMI-4 (2018), Table 3"},
  // NOTE: this grouping is THIS TOOL'S, not a guideline's. The 2018 UDMI defines
  // contiguity anatomically and publishes no lead-set table; anything shown to a
  // reader from these groups must be attributed to the tool, not to the UDMI.
  "contiguous_lead_groups": {"anterior":["V1","V2","V3","V4"], "lateral":["I","aVL","V5","V6"],
     "inferior":["II","III","aVF"], "note":"aVR is never part of a contiguous pair."},
  "r_wave_progression": {"normal_transition_zone":["V3","V4"],
     "poor_progression":{"r_amplitude_V3_max":0.30, "source":"Zema & Kligfield convention, not guideline"}},
  "lvh_voltage": {
     "sokolow_lyon":{"formula":"S(V1) + max(R(V5), R(V6))","threshold":3.5},
     "cornell_voltage":{"formula":"R(aVL) + S(V3)","threshold_male":2.8,"threshold_female":2.0},
     "cornell_product":{"formula":"(R(aVL)+S(V3) [+0.6 mV if female]) * QRS_ms","threshold":244.0,"units":"mV*ms"}}
}}
```

**Sex and age are mandatory inputs.** If either is unknown the app emits `Unmeasurable(demographics_required)` for V2–V3 STE and for QTc thresholds. Two UI controls. Do not guess.

### 6.2 QTc formulas

| id | seconds form | year | behaviour |
|---|---|---|---|
| bazett | `QT / RR^(1/2)` | 1920 | Overcorrects above ~85 bpm, undercorrects below ~60. **Display-only, never drives a verdict.** |
| **fridericia** | `QT / RR^(1/3)` | 1920 | **DEFAULT.** Near-flat QTc/RR residual slope across 40–120 bpm. |
| framingham | `QT + 0.154·(1 − RR)` | 1992 | Comparable to Fridericia, slightly better at very low HR. |
| hodges | `QT + 0.00175·(HR − 60)` | 1983 | Linear in HR, intermediate. |

Rate gates: ΔHR ≤10 bpm → Fridericia trustworthy. 10–20 → emit with `rate_correction_uncertainty`. >20 → ΔQTc forced `Indeterminate`. >35 → `Unmeasurable`. With unstable HR, Bazett and Fridericia produced errors of **73 ms and 47 ms** respectively vs 2 ms with individualised hysteresis correction; no fixed formula is reliable once HR differs by more than 15–20 bpm. Lead II is the longest-QT lead in only ~11% of ECGs, and deviation from the true maximum reaches 50 ms — hence the VM-tangent decision.

### 6.3 Serial-change criteria (`ecg-serial-change-criteria/v1`)

`E` = evidence-based · `C` = consensus · `X` = pure convention. **Every rule additionally requires `|Δ| ≥ MDC95` for that pair.**

| rank | id | basis | metric | absolute criterion | Δ criterion | leads | notes |
|---|---|---|---|---|---|---|---|
| 1 | `new_st_elevation` | E/C | ST_J | other 0.10; V2–V3 M<40 0.25 / M≥40 0.20 / F 0.15 | **0.10** | 2 contiguous | Flag if current meets absolute and prior did not, **OR** Δ≥0.10 regardless of absolute level. A patient with baseline early repolarization 0.18 mV in V3 who reaches 0.28 mV has 0.10 mV of new injury current but never "newly crosses". Conversely a stable 0.22 mV in a 45-y-o man crosses on *both* studies and is **not** a serial change. Invalidated by LBBB, pacing, LVH-by-voltage, WPW. |
| 2 | `new_st_depression` | C | ST_J | −0.05, horizontal/downsloping | **−0.10** | 2 contiguous | The 0.05 absolute criterion is **below our best-case floor**; 0.05–0.09 is `BelowDetectionLimit`. |
| 3 | `new_or_deeper_q` | C | Q dur, Q amp | V2–V3 ≥20 ms; others ≥30 ms and ≥0.10 mV | +10 ms or +0.10 mV | any 2 of a group | Highest-value serial finding for a completed event; also the easiest to fake with a 2 cm precordial shift. Gate on §6.4 plausibility. |
| 4 | `new_t_inversion` | C | T amp | ≤ −0.10 with R/S>1 | **0.20** magnitude of change | 2 contiguous | Polarity flip alone with both magnitudes <0.10 mV is noise — do not report. |
| 5 | `new_conduction_block` | C | QRS + morphology | ≥120 now, <120 prior, with qualifying LBBB/RBBB morphology | — | — | 108→124 ms as nonspecific IVCD is **not** new LBBB. |
| 6 | `qrs_widening` | X | QRS dur | — | **20 ms** | global | Trend, not an event (Grigioni, Heart 2002 supports prognosis, not a cut-point). |
| 7 | `qtc_prolongation` | E(>500) / C(Δ60) | QTcF | M 450 / F 460 / any 500 | **60 ms** | — | Hard gate ΔHR ≤20 bpm. The 60 ms Δ is ICH E14 drug-study convention, **not validated for image-derived serial ECG.** |
| 8 | `axis_shift` | X | frontal axis | — | **30°** *and* crossing −30 or +90 | — | No outcome evidence for any degree threshold; 30° is well within limb-electrode repositioning. Suppress unless a named boundary is crossed. |
| 9 | `loss_of_r_progression` | X | R V1–V4 | R(V3) falls below 0.30 mV, or TZ moves ≥2 positions right | — | — | **Top false-positive generator.** V1/V2 one interspace too high reduces R by ~0.1 mV per interspace, exactly mimicking this. |
| 10 | `voltage_change` | X | R amp, Sokolow, Cornell | — | 25% relative, floor 0.20 mV | — | Hard gate: same modality **and** pulse verified in both. **Cross-modality voltage comparison (vector vs photo) DISABLED BY DEFAULT** — published digitizers systematically underestimate R-peak amplitude and the bias differs by tool. |

Two structural points: **reciprocal change is a confidence modifier on the STE finding, not a separate alert.** And serial ECG change has poor standalone diagnostic performance — in undifferentiated chest pain, sensitivity and PPV <30%, AUC 0.55 versus 0.83 for serial troponin. **The product is a measurement instrument for a clinician, not a classifier. No "MI detected" strings anywhere in the UI.**

### 6.4 Minimum Reportable Difference (`ecg-mrd/v1`)

`null` = suppressed at that tier; report no numeric delta.

| metric | A vector | B scan300 | C photo | D poor |
|---|---|---|---|---|
| `st_level_mV` | 0.10 | 0.15 | 0.25 | null |
| `t_amplitude_mV` | 0.15 | 0.20 | 0.35 | null |
| `r_amplitude_mV` | 0.20 | 0.30 | null | null |
| `q_amplitude_mV` | 0.10 | 0.15 | null | null |
| `q_duration_ms` | 10 | 16 | 24 | null |
| `qrs_duration_ms` | 15 | 20 | 30 | null |
| `pr_interval_ms` | **null at every tier** | | | |
| `qt_ms` | 25 | 32 | 45 | null |
| `qtc_fridericia_ms` | 30 | 38 | 55 | null |
| `frontal_axis_deg` | 20 | 25 | 35 | null |
| `heart_rate_bpm` | 5 | 5 | 8 | 12 |
| `p_duration_ms` | **null at every tier** | | | |

`pr_interval` and `p_duration` are suppressed everywhere: PaperECG — a published, validated tool — produced PR limits of agreement of **−226 to +219 ms with ICC 0.119** from the same signals whose QRS bias was 2.6 ms and QT bias 3.8 ms; Framingham inter-rater ICC for P duration is 0.46. **Never report a measurement class that has not been individually validated.**

### 6.5 Reproducibility and instrument context

| Source | Result |
|---|---|
| Kania 2014, precordial displacement | 1 cm: RMSE 48±28 µV (V2), 67±35 µV (V3). 5 cm: 292±158 / 344±192 µV. Morphology changes prominent beyond 2 cm. V2 > V3 > V1 > V4 ≫ V5, V6 |
| Framingham (Wang 2014), reader ICC | R amplitude 0.98; PR/QRS/QT ≥0.81; **P duration 0.46 inter / 0.57 intra** |
| Inter/intra-observer CV, intervals | inter 3.1/4.0/3.2% (PR/QRS/QT); intra 3.5/4.7/3.0% → ~4 ms on a 100 ms QRS, ~13 ms on a 400 ms QT |
| Molnar 1996, diurnal QTc | 24 h QTc range **95 ± 20 ms** in healthy adults |
| Human ST reading | Intra-observer paired measurements differed by >0.5 mm one fifth of the time; 14% flipped the 2.0 mm classification. Expert core labs: ICC 0.949 |
| CSE tolerances (2σ) | P onset 10.2 ms, P end 12.7, **QRS onset 6.5**, QRS end 11.6, **T end 30.6** — the 5× spread is why ΔQT needs a far wider band than ΔQRS |
| IEC 60601-2-25 | Amplitude within **25 µV, or 5% or 40 µV whichever is greater**; QRS ±10 ms, QT ±25 ms |
| PhysioNet 2024 digitization, hidden test | Winner **12.151 dB**; 2nd 5.493; **9 of 16 teams ≤0 dB**. Per-modality (winner): colour scan 4.93, B&W 3.48, **clean phone photo −1.07**, deteriorated −1.30 |
| ECG-Image-Kit baseline, 200 dpi synthetic | SNR 11.88±8.91 dB; 95th-pct errors RR 0–116.2 ms, QRS 0.4–32.2 ms, QT 0.3–56.6 ms |
| npj Digit. Med. 2025, open source | 19.65 dB flatbed scan; 12.19 dB OnePlus photo; 10.47 dB iPhone photo; **1.05–2.03 dB stained/deteriorated** |
| PaperECG (semi-automatic, ~50% needed manual refinement) | r 0.977, mean diff 9.3 µV, **RMSE 25.9 µV**; QRS bias 2.6 ms; QT bias 3.8 ms |

**The single most consequential fact for product posture:** the best fully-automatic system in a global challenge scored ≈0 dB on phone photos of clean paper, and more than half the field was worse than outputting zeros — while a *semi-automatic* tool requiring ~15 s of human input reached 25.9 µV RMSE. That is roughly a 25 dB gap bought by a handful of clicks, and it is the empirical justification for every HITL gate in this spec.

---

## 7. BUILD ORDER

Already done and verified, do not rebuild: vector-PDF operator-list extraction, grid/trace classifier and pitch estimator, synthetic 12-lead generator, vector-PDF printout renderer, the +0.25 mV V2/V3/V4 serial fixture, the Node/Vite toolchain (Deno was removed by decision 0006), vendored pdf.js.

### P0 — the vector-PDF measurement path end to end (nothing ships without this)

1. `dsp/resample.rs` — column envelope, PCHIP, Kaiser sinc, `edge_samples`. **Test:** round-trip a synthetic signal at f_int ∈ {295, 600, 2000} → 500 Hz, assert RMS < 5 µV and no R-peak overshoot.
2. `dsp/median_filter.rs` — O(1) two-level-histogram running median; `provisional_detrend`. **Test:** wide-QRS/tachycardia fixture, assert the adaptive cascade fires.
3. `beats/detect.rs` — Pan–Tompkins retuned, two-pass warm start, global search-back. **Test:** all beats found, 0 FP, R within ±1 sample on the noiseless fixture.
4. `beats/panels.rs` — strip→panel time-base verification, edge margins, per-measurement `BeatSupport`. **Test:** synthesize a panel boundary bisecting a QRS; assert exclusion and `n_used` decrement.
5. `dsp/detrend.rs` — PQ anchor extraction, piecewise-linear detrend, `ProvisionalSignal`/`MeasurementSignal` newtypes. **Test:** assert it is a compile error to measure on pass-1 output.
6. `beats/median.rs` — gating, medoid template, sub-sample alignment, ensemble + `σ_ens`. **Test:** inject fractional shift δ ∈ {0.1…0.9}; recover within 0.05 sample.
7. `fiducial/mod.rs` + `fiducial/tangent.rs` — spatial velocity, two-pass global onset, VM tangent T offset with all four rejection modes. **Test:** flat-T, biphasic-T, edge-truncated-T fixtures each return the right rejection and **no number**.
8. `measure/` — ST_J / ST_J60 grid-period means, rate guards, QRS/QT/JT, area-based axis, Q/R/S.
9. `serial/register.rs` — rigid cross-study NCC + interlocks; Δ(t); per-lead and global scalars.
10. `serial/gate.rs` — σ̂ fusion, MDC95, five-state verdict, regional coherence, confounder gating.
11. `clinical/` — the §6 tables as generated Rust consts + the `adjudicate` function.
12. **Acceptance (the release gate):** on the +0.25 mV pair, recovered ΔST_J = **0.25 ± 0.03 mV in V2–V4 and |ΔST| < 0.03 mV in all other leads**. *The off-target leads are the real test.* Plus the **negative control**: run the same pair through a causal 0.5 Hz Butterworth instead of the PQ detrend and assert the test **fails** — if it passes, the pipeline is not sensitive to the thing it must be sensitive to and the whole test is vacuous.
13. `web/` UI: three-row overlay per lead, fixed mV/div, Δ(t) with ±MDC band, verdict copy from §7 of the validate slice verbatim, conditioning chip, raw toggle, two uncertainty bands.
14. **HITL, all five, before any raster work:** gain+speed confirm, sex+age, global onset nudge (linked across studies, ON by default), beat include/exclude, isoelectric pin.

### P1 — raster ingest, in strict dependency order

15. `web/src/ingest/image-decode.ts` — EXIF probe, orientation table, HEIC sniff and refusal, worker `ImageBitmap` transfer, 4096-px re-decode guard.
16. `raster/illum.rs` — van Herk/Gil–Werman O(1) grey closing, flat-field division, local contrast normalisation, glare detection → **NaN, never interpolation**.
17. `raster/grid.rs` — colour separation (chromatic + neutral branches), projection autocorrelation → harmonic → comb regression, period-5 modulation, decimation-consistency anti-moiré test, per-tile pitch.
18. `geom.rs` — Jacobi eigensolver, vanishing points, stratified rectification, normalised DLT, bilinear warp with anti-alias prefilter (preview only).
19. `raster/quality.rs` — the nine gates. **This lands before the tracker**; a tracker with no gate in front of it is a fabrication engine.
20. `raster/segment.rs` — row bands from baseline ink ridges, column boundaries with the `w_col` consistency check, rhythm-strip identification by boundary crossing, per-row calibration pulses.
21. `raster/label.rs` + `tools/make-label-templates.ts` — template bank, two-pass search with the constant-offset trick, sub-glyph discriminators.
22. `ident.rs` — the 4320-hypothesis solver, Cabrera alphabet, `−aVR` negation on accept.
23. `raster/trace.rs` — Sauvola, grid model subtraction, `ColRuns`, the min-sum DP, apex refine, clipping detection, sequential claims, repair-brush partial re-solve.
24. **HITL raster:** four-corner drag, per-row gain confirm, repair brush, exclude span, band drag, baseline pin, date confirm.
25. `tools/rasterize.ts` + `crates/ecg-harness` — the degradation ladder S0–S4, seeded and bit-reproducible, plus the fixed **ecg-image-kit-parity level**. If we score above ~25 dB on that level, **CI fails with "the degradation model is too easy"**.
26. σ̂ calibration run; ship `docs/accuracy/` with the σ̂-vs-observed-p95 plot, the Q-vs-error curve, the per-axis tornado chart, and Bland–Altman per tier.

### P2 — after both paths are honest

27. Lead-reversal detector (cross-study permutation + single-ECG plausibility + dextrocardia guard), propose-never-apply.
28. Confounder detectors: precordial shift (transition zone), limb placement, global scaling / alternans, filter inference from calibration-pulse droop and SEF99.
29. ΔVG / ΔST-vector / spatial QRS-T angle via Kors, suppressed under `NON_STATIONARY_10S`.
30. Mains detection + Levkov subtraction (default off).
31. Opt-in `RepolOnly` and banded DTW modes, with type-level suppression of everything they invalidate.
32. Thin-plate-spline non-planar refine for creased paper (only if the homography residual gate is firing in practice).
33. N-study (>2) comparison view and per-lead trend sparklines.

---

## 8. TOP 10 RISKS OF A SILENTLY WRONG CLINICAL NUMBER

| # | Risk | Why it looks fine | Mitigation | Runtime detector |
|---|---|---|---|---|
| 1 | **Wrong gain (5 vs 10 vs 20 mm/mV, or split-gain rows)** — every amplitude off by 2×, fabricating LVH, low voltage, or a whole anterior STEMI evolution | The tracing is perfectly normal-looking; only the scale is wrong. Split-gain fakes a *regional* change, which is worse | Pulse height measured **per row**; cross-check vs header text; require **two independent agreeing sources**; no pulse in both studies → no amplitude output ever | `pulse_row_spread > 8%` → per-row gain + banner; `|pulse_gain/header_gain − 1| > 12%` → modal block; pulse-implied gain not within 12% of {5,10,20} → discard pulse, cap at class C; `gain_confirmed` precondition in `gate_st` |
| 2 | **Wrong paper speed (25 vs 50 mm/s)** — every interval halves or doubles, QTc becomes nonsense, and beat registration aligns the wrong beats | Waveforms look normal; only HR is off, and nobody checks HR against the header | Column width must equal 2.5 s × speed; rhythm strip must span 250 mm per 10 s ±2% | `HR_ours/HR_printed ∈ {≈0.5, ≈2.0}` → hard stop; `w_col` off by >4 mm at both speeds → "page cropped"; QRS duration outside [50, 220] ms → block |
| 3 | **High-pass filter mismatch (0.5 Hz monitor vs 0.05 Hz diagnostic)** — up to 0.30 mV of filter-induced J-point offset, in the direction and magnitude of the finding | The tracing is a real tracing; the ST shift is coherent across all leads and looks like global ischaemia | **Hard block on all ST deltas.** No correction is offered because none exists | Header regex `/(\d+\.?\d*)\s*[-–~]\s*(\d+)\s*Hz/`; calibration-pulse droop across the plateau (`f_hp = −ln(1−droop)/(2πT)`; 0.05 Hz → 6.1% droop, 0.5 Hz → 46.6% at T=200 ms); `median_l(TP_l − PQ_l) > 0.03 mV` in one study and `< 0.01` in the other; unreadable → +0.030 mV in quadrature |
| 4 | **Panel↔lead mis-assignment or Cabrera read as standard** — you are comparing V2 in study A to V3 in study B, or one whole lead is inverted | Every panel is a plausible ECG trace; nothing looks broken | Within-column null-vector residual **plus** cross-column Goldberger in feature space; `III = II − I` is a free, exact, hard block; mandatory human confirm for any non-CONFIDENT precordial label | `ρ_E > 0.20` or `ρ_G > 0.30` or `margin < 1.25` → reject; `DERIVED_LEAD_INCONSISTENT` (RMS > 3σ_prov) → **hard block, no comparison produced**; panel timing pattern must match its assumed 2.5 s window within ±20 ms for ≥2 beats |
| 5 | **Median filter or high-pass eats the real ST elevation** — the follow-up study reports the patient as improved | There is no artifact to see; the trace is smooth and the ST segment sits on the baseline | Median cascade confined to pass 1, output discarded; adaptive `w2 ≥ 1.2·QT`; PQ-anchored detrend on the *original* signal; `ProvisionalSignal`/`MeasurementSignal` newtypes | Fires the wide cascade at QRS>130 ms or RR<700 ms; assert `w2 ≥ 1.2·QT_measured` at runtime; the negative-control acceptance test (§7.12) fails the build if a 0.5 Hz HPF would pass |
| 6 | **Neighbour lead intrudes and is averaged into the ensemble** — a phase-locked fake Q wave or notched R, reproducible across every beat | Random noise averages out; this does not — it is at the same phase in all four panels of the row, so it *strengthens* with more beats | Connectivity-dominated transition cost; runs extracted over full page height; sequential decode with exclusive claims; **never report an amplitude from a merged span** | Run height > `len_merge` → `F_MERGED`, conf ×0.4; two tracks through the same run for ≥3 columns → `F_MERGED` on both; rhythm-strip R times projected into neighbouring panels pre-mark high-risk columns (`w_gap += 1.5`, require conf ≥0.6) |
| 7 | **Occlusion or glare silently interpolated under a measurement window** — a clean ST number computed entirely from invented pixels | Linear interpolation across 6 mm produces a smooth, plausible ST segment; the rendered trace looks continuous | Bridge only up to 6 mm, **linear only** (PCHIP/Catmull-Rom overshoot at re-entry and invent a deflection); glare is NaN-marked, never interpolated; **if an interpolated span intersects a measurement window, the number is not displayed** | `F_INTERP` per column with conf ≤0.20 decaying to 0 by 25 px; saturated blobs >25 mm² → NaN + named affected leads; `coverage_st < 0.90` → `Refused(LowCoverage)` |
| 8 | **Uncorrected perspective or anisotropy** — 6–8% amplitude error with perfect-looking timing; across a scan/photo pair it reads as a uniform 12-lead voltage change, or as fake poor R-wave progression | The page looks flat; a phone "document scanner" auto-rectifies to an assumed aspect ratio, producing something that looks like a perfect scan | Independent per-axis pitch; per-tile pitch; homography from the rules' own vanishing points; **never resample for measurement** | `max/min` tile pitch − 1 > 2% → force four-corner HITL; `|px_y/px_x − 1| > 0.15` → suspect (check for a 2×/5× harmonic first); cross-study global gain fit — `|g−1| > 0.03` with `IQR(r_l) < 0.10` → `GlobalGainMismatch`, suppress ΔST/ΔR until confirmed |
| 9 | **Unequal beat counts / a single-beat lead reported like a four-beat lead** — a 1-beat median carries full single-beat noise and *zero* alignment blunting; comparing it to a 4-beat median manufactures a "new Q wave" or "resolved Q wave" | Both panels render as one clean complex; the beat count is invisible unless you print it | Propagate `σ_ens` per lead per sample; t-inflate at n=2 and n=3; **σ̂ = ∞ at n=1**; `n` displayed next to every number | `MIN_BEATS_FOR_DELTA = 2` precondition; unit test asserting `sigma_st(n_beats ≤ 1) == INFINITY`; `n_used`/`n_rejected` in the report JSON and on the panel |
| 10 | **Reporting a Δ smaller than the pair's own detection limit**, or rendering `Indeterminate` as reassurance | "no significant change" and "no change" read identically to a tired clinician at 3 a.m. | Five-state verdict; `NoChange` requires TOST-style positive exclusion of 0.10 mV; `BelowDetectionLimit` and `Unmeasurable` render in the *same muted style* so a suppressed metric never reads as reassurance; every delta rendered as `Δ (detection limit ±X)`; export carries the interval | `mdc ≥ CLINICAL_DELTA_ST_MV` → the copy string is `indeterminateBelowThreshold`, which states outright that a clinically significant change "can neither be confirmed nor excluded"; σ̂ calibration plot in CI; `false_confidence_rate == 0` is a release gate on the harness sweep (zero cases where class A and true scale error > 2%) |

**Runner-up, not detectable, must be published rather than mitigated:** respiratory modulation across columns (5–10% limb amplitude, non-cancelling between studies) and precordial electrode repositioning (`σ_bio` 0.040 mV in V1–V3). These are irreducible. The hatched acquisition band exists precisely so the clinician sees them.

---

**Primary sources.** UDMI-4 (Thygesen 2018) · AHA/ACCF/HRS Standardization Parts I–V (2007–2009) · IEC 60601-2-25 Ed. 2.0 · Buendía-Fuentes 2012 (ISRN Cardiol) · Lenis 2017 (Comput Math Methods Med) · Levkov 2005 (Biomed Eng Online) · Vandenberk 2016 (JAHA) · Postema 2008 (Heart Rhythm, "teach the tangent") · Kania 2014 (Med Biol Eng Comput) · Wang 2014 (J Electrocardiol, Framingham) · Molnar 1996 (JACC) · Martínez 2004 (wavedet, CSE tolerances) · Batchvarov 2007 (Europace, cable interchange) · PhysioNet/CinC Challenge 2024 official digitization scores · Krones 2024 (ECG-Digitiser, challenge winner) · Fortune 2022 (PaperECG) · Santamónica 2024 (ECGMiner) · Shivashankara 2024 (ECG-Image-Kit) · npj Digit. Med. 2025 (digitizing paper ECGs at scale) · Perreault & Hébert 2007 (constant-time median) · Sauvola & Pietikäinen 2000 · Hartley & Zisserman (stratified rectification).
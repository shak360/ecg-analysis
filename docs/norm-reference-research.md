<!--
Research pass, 2026-07-31: how neuroimaging builds templates and probabilistic
atlases, and what of it transfers to an ECG reference built from public corpora.

Nine agents, ~940k tokens. Kept as the record of why the reference is scoped the
way it is -- in particular why a per-sample probabilistic atlas of amplitudes is
NOT being built. Findings still to be acted on are tracked as tasks, not here.
-->

# THE ECG REFERENCE — MERGED ARCHITECTURE

**Naming, settled first.** `docs/atlas-deid-spec.md` already owns *atlas* for the user's local labelled case library (`ATLS1`, `AtlasKind = personal|fixture|reference`). The population object in this document is a different thing and gets a different name: **NORM**. Container `ECGNORM1`, Rust `crates/ecg-core/src/norm/`, TS `web/src/norm/`. A `NormRef` is not a study and must be unrepresentable in `entries` — enforce at the type level, same technique as AD D34. Do not extend `AtlasKind`.

---

## 1. THE HONEST VERDICT

### 1.1 The short version

Build a **template, a fiducial search-bracket table, an extraction sanity gate, and — the item nobody counts as an atlas — a within-subject biological-variation table that feeds MDC95.** Do not build a full probabilistic atlas of per-sample amplitudes as a clinical instrument. Ship a per-sample normative *ribbon* as display context only, with one FWE-controlled omnibus statistic behind it, and ship no per-sample amplitude percentile at all in v1.

Three independent arguments converge on the same cut, and any one of them alone would be sufficient:

**(a) The statistics do not support it.** Between-subject SD on the ST segment is 50–90 µV in the precordials. The AHA threshold is 100 µV. A clinically decisive ST shift is **1.2–2.0 σ_pop**. The FWE peak threshold over a 12-lead beat is z ≈ 3.4–3.8; 80 % power needs ≈ 4.3 σ_pop ≈ 220–260 µV. A per-sample ST atlas is silent exactly when it matters. Meanwhile the familiar "95 % normative band" flags ~241 of 4 812 samples on *every* healthy person, and the 99 % band flags ~48 samples in ~2.5 contiguous runs appearing on 5–7 of the 12 displayed traces — where lead redundancy makes them look corroborated. The expected single largest |z| on a normal beat is 3.1 ± 0.36. "Three sigma" is the typical maximum on a healthy person.

**(b) The reference population cannot be made honest for amplitudes.** ARIC: ST-J upper normal limit in V2–V3 is 200 µV in African-American men, 150 µV in white men, 100 µV in women. HELIUS (n = 10 783 apparently healthy): 2.3–3.0 % of Dutch adults meet international STEMI ST thresholds versus 21.7–27.5 % of Ghanaian men under 40. No redistributable corpus records ancestry — PTB-XL cannot, by Dutch law. Body habitus, the largest single determinant of precordial amplitude, is missing from every corpus. Electrode placement scatters 2.9 cm in routine practice (Wenger 1996), and 1 cm of displacement produces 67 ± 35 µV of QRS RMSE in V3 (Kania 2014) — so a cross-sectionally estimated "biological" band in V1–V4 is inflated by roughly 200 µV of pure technique. A band that wide is reassurance, which is the worst possible artefact.

**(c) For this product's core job, the population layer is structurally the weaker axis.** Index of individuality for QRS duration is **0.29** (Wu 2025): 92 % of the population variance in QRS duration is stable between-subject constitution. A serial widening of 10 ms is ≈ 3.4 within-subject SD (unambiguous) and 0.8 population SD (utterly ordinary). Both statements are true; only one is the product.

### 1.2 What genuinely transfers from neuroimaging

| Idea | Transfers? | Note |
|---|---|---|
| Unbiased template, `mean(T) = Id` (Guimond 2000; DARTEL) | **Yes, and it becomes one line.** Our transform group is (ℝ,+): flat, abelian. Fréchet mean = arithmetic mean. `δ_i ← δ_i − mean(δ)`. What costs ANTs four damped iterations costs us one subtraction. | The single most valuable import. |
| Reference-subject bias (B1) | **Structurally absent.** Every study is anchored on its *own* global QRS onset. There is no reference subject and never was. This is a genuinely stronger position than MNI152 occupies, and it means the expensive machinery can be skipped. | Say so in the docs so nobody rebuilds it. |
| Coarse-to-fine schedule (ICBM152 NLin) | **Yes**, directly, as the `SEARCH_MS`/`SMOOTH_MS` schedule for anchor-noise reduction. |
| Age-appropriate / conditional templates (Fonov 2011; Dalca 2019) | **Yes, in 1-D closed form.** Their CNN outputs a deformation field over a volume; ours outputs two coefficients per sample. |
| Normative modelling with a warp (Marquand 2016; Fraza 2021; Bethlehem 2022) | **Yes** — SHASH warped BLR is the right model class, and transfers *better* here than in imaging because our covariates (sex, age, rate) are strong and causal. |
| Permutation / max-statistic FWE (Nichols & Holmes 2002), cluster failure (Eklund 2016) | **Yes, decisively.** We have the corpus at build time, so the exact null is computable offline and ships as a few hundred floats. |
| Leave-one-site-out validation | **Yes** → leave-one-corpus-out. |
| Processing-asymmetry bias (Reuter & Fischl 2011) | **Yes, and it is a live bug in our code today.** §7 P0. |
| Circular analysis / double dipping (Kriegeskorte 2009) | **Yes**, three distinct instances. §8. |

### 1.3 What is a superficial analogy and would add machinery without adding truth

| Idea | Why it does not transfer |
|---|---|
| **Diffeomorphic registration / DTW / any time warp** | In MRI, deformation is nuisance and its Jacobian is itself the measurement (volume). In ECG, time deformation **is** the measurement: QRS duration, QT. The Jacobian is confounded ~1:1 with heart rate, so there is no "Jacobian as finding" story left. DTW additionally permits γ′ ∈ {0,∞}, which creates and deletes short deflections. Existing project decision correct; the literature supports it rather than reopening it. |
| **Intensity normalisation (N4, z-scoring, histogram matching)** | MRI intensity has no units and no zero; normalisation recovers a comparable quantity. ECG millivolts have both, and the zero (PQ isoelectric) is the clinical definition. Normalising deletes LVH, low voltage and ST magnitude. Total disanalogy. |
| **Affine size normalisation** | Head size is nuisance; ECG amplitude is a finding. |
| **Multi-atlas label fusion for *values* (STAPLE/JLF exemplar transfer into measurement)** | Labels in MRI are expensive and neighbourhood-defined. ECG fiducials are cheap and intrinsically estimable from the patient's own 12 leads over 5–8 gated beats. A population-shrunk fiducial pulls a long QT shorter, monotonically in how unusual the patient is — the atlas erasing the finding, arriving through a new door. **Forbidden in the measurement path.** (Multi-*detector* fusion on the patient's own signal is a different thing and is permitted — §5.2.) |
| **Probabilistic tissue-class maps** | A sample is not a mixture of tissue classes. No analogue. |
| **Thresholded probabilistic map as an ROI mask** | The most transferable *mistake*. `norm.is_normal()` does not exist and will not be added. |
| **RFT cluster-extent inference** | 1-D EC densities are exact for a *stationary Gaussian* field. Our residual FWHM varies 8-fold across the beat (≈4 samples in QRS, ≈25 in ST) and the marginals are skewed. Eklund's 70 %-vs-5 % failure is worse here. Use it as a cross-check only. |
| **Cross-lead smoothing / 2-D lead×time random field** | There is no metric on lead space. V1 and V2 are adjacent on the chest; I and aVF are adjacent in nothing. And 4 of 12 leads are exact linear combinations of 2 others. |
| **Group-level mass-univariate SPM** | n = 1 at query time. |
| **Talairach proportional scaling** | The direct analogue is rescaling each beat so QT matches the template's — the warp error with a 1988 pedigree. Available as an explicitly labelled display view only; never the basis of a number. |

### 1.4 The narrower thing that is worth it, stated positively

1. **σ_bio(measure, lead, Δt-class) — a within-subject biological-variation table.** ~4 KB. It is the only defensible source for the 2σ_bio² term in MDC95, which the app currently has to guess, and it is measurable from open repeat-ECG data on our own 401-sample frame. This is the highest-leverage item in the entire document and it is not the one the analogy suggests.
2. **A rate-conditional template beat, per sex × age.** Jobs: extraction sanity gate (polarity, gain ×2/×10, paper speed, panel↔lead mis-assignment), fiducial *search brackets*, and the display ribbon.
3. **Interval/duration/axis level-centiles** (PR, QRS duration, QT with RR as covariate, QTcF, frontal axis, HR). These are the measures where σ_pop is tight relative to the clinical threshold, where race effects are small or absent (ARIC: QT does not differ by race), and where a percentile is a defensible sentence.
4. **One FWE-controlled omnibus deviation statistic**, tier-conditioned, primarily as an extraction-plausibility signal and secondarily as a gross-abnormality flag.
5. **Not built:** per-sample amplitude/ST percentiles, atlas-derived fiducial point estimates, atlas-derived lead reconstruction, template denoising or gap infill, Δz displayed alongside Δ, any race axis.

---

## 2. DECISIONS

| # | Decision | Picked | Reason |
|---|---|---|---|
| D1 | Name / container | **NORM**, `ECGNORM1` | `atlas`/`ATLS1` already means the local case library. |
| D2 | Container mechanics | Magic + JSON manifest + section table + raw LE typed arrays; no in-file compression; precompressed `.br`/`.gz` siblings | `DecompressionStream('br')` is Chromium-only; HTTP negotiation is universal. CBOR/Parquet add a decoder to save nothing. |
| D3 | Stored precision | int16 @ **5 µV/LSB** for signal surfaces; uint16 @ 1 µV for σ | Measured: f32 is 11× larger after brotli. 5 µV/√12 = 1.4 µV ≪ every noise floor. |
| D4 | Predictor | ΔQ (vs median row) then ΔT along samples | Measured 26.0 → 10.2 KiB per stratum block. |
| D5 | Primary runtime reference | **SHASH warped BLR**, per (lead, sample) and per scalar; continuous in sex, age, log RR | Closed-form inverse, 20 lines of Rust, no runtime optimiser; handles the skew that makes a plain z wrong in young men's V2/V3. |
| D6 | Secondary reference | Empirical quantiles on sex × 6 age bands + population marginal | Audit surface and calibration gate. The parametric model always answers; this is what catches it lying. |
| D7 | Rate | Covariate (`log RR`, and `RR^{1/3}` for QT to match Fridericia), never a stratum, never applied to the patient | Rate conditioning inside the build is legal and mandatory; rate correction in the serial path is forbidden. **The reference moves; the patient never moves.** |
| D8 | Stratification | sex × 6 age bands (18–29 … 70+) tabulated; HR and QRS width parametric | 72-cell grids die on n, not on bytes. |
| D9 | `n_min` per published cell | **400** (SE(q₀.₀₂₅) ≤ 0.15σ). No neighbour interpolation, ever. Absent cell ⇒ "no reference for this patient". | Interpolating across a stratum boundary is the Talairach mistake with extra steps. |
| D10 | **Amplitude / ST level-centiles** | **OFF. Not shipped, not behind a flag.** | Three independent kills: ancestry unmodellable, habitus absent, and 1.2–2.0 σ_pop gives no power anyway. |
| D11 | ST abnormality anchor | Fixed clinical thresholds at the **widest published limit** (200 µV V2–V3 men, 150 µV women, 100 µV elsewhere), never an atlas percentile | Asymmetric caution: a missed population flag is recoverable; a race-driven false alarm with a shaded band behind it is not. |
| D12 | Race / ancestry | **No axis. No field. Never stored, never inferred.** | Cannot be done from these corpora; a badly-powered race stratum is worse than an honest pooled one; and D10 removes most of the exposure. |
| D13 | Fiducials from the reference | **Search brackets only** (`SearchBracket{lo,hi}`), never point estimates, never MAP priors | A template-driven fiducial is a shrinkage estimator that shortens a genuinely long QT. |
| D14 | Fiducial fusion | Multi-**detector** fusion on the patient's own beat, frozen θ, single E-step, left-to-right HMM as a *legality filter with flat transitions* | Legitimate: no population prior on the value. Exemplar transfer (JLF) is **cut from v1** — it is the shrinkage vector. |
| D15 | Global QRS onset/offset | Keep the existing single global spatial-velocity channel | Never switch to earliest/latest per lead: with σ = 4 ms over 8 independent leads that is a **+11 ms** inflation of QRS duration, growing with noise. |
| D16 | Serial registration shift | **One δ per study pair**, on the RSS vector-magnitude channel, applied to all 12 leads | A per-lead δ absorbs new IVCD in V5–V6 or new incomplete RBBB in V1 — the temporal twin of gain normalisation. |
| D17 | Fractional delay | Bandlimited sinc (reuse `SincTable`, 16 taps), **exactly one** delay per beat, composed `δ_i + τ_s` | Linear shift on the comparison study only is a one-signed 15–60 µV R-wave attenuation and 11–41 % loss at 75–150 Hz — manufactured progressive voltage loss. |
| D18 | Within-patient template | Unbiased, `Σ τ_s = 0`, per-sample median, chronological ordering only | Reuter 2012. Reference chosen by data quality is double dipping. Template must never produce a delta (shrinks by (S−1)/S). |
| D19 | Estimator across subjects | Per-sample **median** | 0.455× the mean's blur bias under anchor jitter, on top of robustness. |
| D20 | Template refinement | 3 passes, coarse-to-fine, then recentre; **fail the build if the template's own onset offset > 1 ms** | The recentring constraint can be satisfied while the template is still displaced; the onset detector is non-linear. |
| D21 | Multiplicity | Build-time permutation null (max-\|z\| and cluster mass), **one per ingest tier**, shipped as ~256 quantiles each | Zero runtime cost, exact FWE, no distributional assumption — and tier-conditioning fixes the anti-conservatism for photographed traces. |
| D22 | Statistical lead set | **8 independent leads** for every statistic; the derived 4 are display-only | Correcting for 12 is wrong by algebra. Store all 12 quantile surfaces anyway (quantiles do not commute with linear combination). |
| D23 | α | FWE **0.01 per ECG**, build-time constant, printed on the report, never a user control | 5 % per ECG is 5 false-flagged studies a day in a 100-ECG clinic. |
| D24 | Per-sample colouring | Only inside an FWE-passing cluster that also clears the clinical threshold at a **pre-specified landmark** | Location and magnitude must never come from the same maximisation (46 % inflation at u = 3.8). |
| D25 | σ_bio table | **Ships. Highest-value block.** Built from CC-BY repeat pairs only. Enters MDC95 additively. | You cannot estimate a variance from n = 2. This is a prior, not a second measurement. |
| D26 | Atlas ↔ serial boundary | `serial::compare(&Study, &Study)` never takes `&Norm`. Atlas contribution to the change path may **only increase** MDC95. Assert it. | Synthetic reference ⇒ σ_B = 0 ⇒ manufactured significance (AD D34); corpus σ_pop in a change denominator ⇒ hidden change. |
| D27 | Δz (rate-corrected serial delta) | **Not computed, not displayed, v1** | A clinician reading Δz ≈ 0 concludes "no change" when raw Δ was 40 ms. |
| D28 | Template corpus, waveform | **PTB-XL v1.0.3 only** | 500 Hz native (no resample), 1 µV/LSB, per-record quality flags, human-validation flag, patient IDs, CC-BY. **Chapman-Shaoxing/Ningbo is excluded from all waveform statistics** — its released signals were 50 Hz Butterworth low-passed, LOESS-detrended and non-local-means denoised before publication. An ST atlas built on it measures the filter. |
| D29 | Scalar/interval corpora | PTB-XL + CODE-15 % (+ Chapman for scalar cross-check only) | CODE-15 % is the only large CC-BY *community* population and the only admixed one; use it as the leave-one-corpus-out offset estimate. |
| D30 | MIMIC-IV-ECG | **No derived byte ships**, under either licence reading | Slices disagree (ODbL 1.0 share-alike vs PhysioNet Credentialed 1.5.0). Both readings forbid shipping. Validation only; flag for counsel. |
| D31 | Corpus/device confound | Mask any (lead, sample) with `ICC_corpus > 0.10`. **No ComBat.** | ComBat needs the target batch at fit time; ours is a specific cart printed on paper and photographed, inductively unseen. And harmonising launders a real population difference into an apparent artefact. |
| D32 | Ingest-path confound | Round-trip the corpus through `tools/synth/pdf.ts` + the real ingestion; ship `σ_ingest` per tier; ship the **Recovered** variant only | The corpus is clean digital; our inputs are recovered traces. Column-envelope clips fast deflections low. Without this every patient looks low-voltage. |
| D33 | Version safety | `pipeline_contract_hash` in the header; mismatch ⇒ **hard refusal to load** for all quantitative use | Move the J point by 4 ms and every centile silently shifts. Missing feature is visible; wrong number is not. |
| D34 | Records vs patients | One record per patient, deterministic (lowest record id) | 21 799/18 869 ⇒ bands ~7 % too narrow ⇒ systematic over-calling. |
| D35 | Build language/location | Rust binary in the same cargo workspace, `path` dep on `ecg-core`; `ecg-wfdb` never in the wasm graph | The reference must be entered into the standard space by exactly the code that later compares a patient to it. |
| D36 | Reproducibility | Byte-identical `.ecgnorm1` across linux/macOS CI; `corpora.lock` sha256 per file; no wall-clock in the hashed content | An unauditable authority is the failure mode this whole document is trying to avoid. |

---

## 3. THE NORM OBJECT

### 3.1 Container

```
0    8    magic  "ECGNORM1"
8    4    u32  format_version = 1
12   4    u32  manifest_len            (UTF-8 JSON, 8-byte padded)
16   M    manifest JSON
..   4    u32  section_count
..  40*N  section table
..   ..   payloads, each 8-byte aligned
```

```rust
#[repr(C)]
struct Section {
    id: [u8; 4],        // COEF SUPP QNTL SIGM MODE EIGV SCAL SBIO NULL MASK NEFF
    dtype: u8,          // 0=i16 1=u16 2=u8 3=f32
    predictor: u8,      // 0=none 1=delta_t 2=delta_q_then_delta_t
    reserved: u16,
    scale: f32,         // physical units per LSB
    dims: [u16; 4],     // row-major, last dim = time; unused = 0
    offset: u64, len: u64,
}
```

Decode is ~30 lines of TS over a zero-copy `Int16Array`; the encoder in `crates/ecg-norm-build/src/pack.rs` is its mirror. One implementation of the predictor per language, round-trip fixture in CI.

### 3.2 Sections, and what each number means

| id | Shape | dtype | What one number means | brotli |
|---|---|---|---|---|
| `COEF` | `[12][401][20]` | i16 @5 µV / f32 for warp params | SHASH-warped BLR coefficients: 9 for μ(x), 9 for log σ(x), plus ε, δ. `x = [1, sex, ns(age,5), sex·age, log(RR/0.857)]`. Evaluating gives the conditional mean and scale **in absolute millivolts** for this patient's covariates. | 25 KiB |
| `SUPP` | `[16 age][2 sex][12 hr]` | u32 | Effective n behind that covariate cell. **Below 400 the model refuses to answer.** Without this, the parametric model's habit of always returning a number becomes the reference's biggest lie. | 2 KiB |
| `QNTL` | `[13][12][7][401]` | i16 @5 µV | Empirical quantile at p ∈ {.025,.10,.25,.50,.75,.90,.975} for 12 sex×age cells + the population marginal, in mV. This is the **audit surface**: what the "What is normal here?" panel draws, with its n. | 110 KiB |
| `SIGM` | `[13][12][401]` | u16 @1 µV | Robust residual SD, **biological component only** — technical variance is held separately and never shown as biology. | 12 KiB |
| `MASK` | `[13][12][401]` | u8 | Per-point validity: `OK` / `MULTIMODAL` (Hartigan dip p < 0.01) / `ICC_CORPUS` / `INSUFFICIENT_N` / `LOW_ALIGN_CONFIDENCE`. Expect `MULTIMODAL` across mid-QRS in V2–V4 (precordial transition is genuinely bimodal with modes of opposite sign) and across the T wave in V1–V2 (T polarity is a normal variant). That is correct behaviour, rendered as its own state. | 3 KiB |
| `MODE`/`EIGV` | `[12][16][401]`, `[12][16]` | i16, f32 | Global low-rank shape basis (K = 16) and eigenvalues. Used for the residuum statistic `d_lowrank = ‖(1−P_K)(x−μ)‖/σ_res` — the ECG analogue of T-wave residuum. | 24 KiB |
| `SCAL` | `[13][M][7]` + coefficients | f32 | Level-centile models for the six shipped scalars (PR, QRS duration, QT\|RR, QTcF, frontal axis, HR). QT is modelled with log RR as covariate; **QTcF is derived for display and is never a response**. | 8 KiB |
| `SBIO` | `[M][12][3]` + scalars | f32 | **Within-subject SD** of a single recording, by measure × lead × elapsed-time class {Same <1 h electrodes reapplied, Days 1 d–3 mo, Years >3 mo}. Units µV/ms/deg. The only block that touches the change path. | 4 KiB |
| `NULL` | `[3 tier][2 stat][256]` | f32 | Quantiles of the max-\|z\| and max cluster-mass null, computed at build time on held-out normals **round-tripped through each ingest tier**. One threshold lookup gives exact FWE at runtime. | 6 KiB |
| manifest | — | JSON | §4.3 | 8 KiB |
| | | | **Total** | **≈ 200 KiB brotli / ≈ 1.4 MiB raw** |

**Stratification:** sex (2) × age band (6: 18–29, 30–39, 40–49, 50–59, 60–69, 70+) tabulated, plus the marginal = 13 cells. HR and QRS width enter parametrically. Age 80+ is folded into 70+ because the 80–89 male cell in the best published cohort has n = 46 and reports a PQ 98th percentile of 290 ms — that is one observation, not a percentile. Under 18: **no reference, ever.** Paediatric ECG is a different model, not an extension.

**One asset, precached, nothing lazy.** An artifact that is sometimes absent forces a second, untested UI path. Ceiling: 250 KiB brotli; anything above 1 MiB would have to be on demand, and we are not close.

### 3.3 Rust surface — the boundary is the type system

```rust
pub struct Norm { /* zero-copy over the bundled blob */ }

pub enum NormAnswer {
    Level { z: f32, centile: f32, ci: (f32, f32), n_eff: u32, cell: CellId },
    Refused(NormRefusal),
}

pub enum NormRefusal {
    OutsideDomain(DomainViolation), InsufficientN{n_eff:u32, needed:u32},
    Multimodal, CorpusConfounded, MeasurementDominates,
    FilterUnknownOrHighpassTooHigh, TierTooLow, AmplitudeCentilesDisabled,
    VerdictNotReportable, PipelineHashMismatch, AgeOutOfRange,
}

impl Norm {
    /// LEVEL axis. Takes the already-computed verdict so it can never precede or override it.
    pub fn level(&self, m: ScalarId, x: &Covariates, y: f32,
                 sigma_meas: f32, verdict: &Verdict) -> NormAnswer;
    /// Search brackets ONLY. There is no point-estimate accessor.
    pub fn bracket(&self, b: Boundary, x: &Covariates) -> SearchBracket;
    /// Within-subject prior for MDC95. Returns a variance, never a value.
    pub fn sigma_bio(&self, m: MeasureId, lead: Lead, dt: ElapsedClass) -> f32;
    pub fn ribbon(&self, lead: Lead8, x: &Covariates) -> Ribbon;   // display only
    pub fn fwe_threshold(&self, tier: Tier, stat: Stat) -> f32;
    pub fn plausibility(&self, beat: &EnsembleBeat) -> ExtractionFlags;
}
```

There is no `apply_to()`, no method returning a transform, shift, warp or resampler, and no `is_normal() -> bool`. `NormAnswer` rather than `f32` is the enforcement mechanism: there is no way to get a number out without handling the refusal.

**Directory boundary:** `tools/norm-build/` (offline, may use rate regression, robust cross-subject estimators, corpus readers) does not link `ecg-core::serial`; `ecg-core::serial` does not link `ecg-core::norm`. Assert both in CI with a module-graph test.

---

## 4. THE BUILD PIPELINE

### 4.1 Corpora and what each is for

| Corpus | Licence / DOI | Role | Why not more |
|---|---|---|---|
| **PTB-XL v1.0.3** — 21 799 rec / 18 869 pt, 500 Hz | CC-BY 4.0, `10.13026/kfzx-aw45` | **Sole waveform source** for template, ribbon, MODE, QNTL, SIGM | Single German site, Schiller, 1989–96. Monoculture is stated, not hidden. |
| **CODE-15 %** — 345 779 exams / 233 770 pt, 400 Hz | CC-BY 4.0, `10.5281/zenodo.4916206` | Scalar centiles; the **leave-one-corpus-out offset map**; repeat exams (1-y resolution) for σ_bio Years class | 400 Hz, zero-padded to 4096 (strip before resampling), 6 labels only |
| **Chapman-Shaoxing + Ningbo** | CC-BY 4.0, `10.13026/wgex-er52` | **Scalar cross-check only** | Released signals were pre-filtered and denoised. Excluded from every waveform statistic. |
| **LUDB v1.0.1** — 200 rec, per-lead manual P/QRS/T on/offsets | ODC-By 1.0, `10.13026/eegm-h675` | Fiducial-detector validation and the frozen θ for detector fusion | Enriched for pathology; never a normal cohort |
| **QT Database** — 105 rec, 2-lead, 250 Hz | ODC-By 1.0, `10.13026/C24K53` | Second annotation convention for θ; encode its ±2 ms grid quantisation in the rater model | 2 leads, coarse grid |
| **PTB-XL+** | CC-BY family | Regression harness: Uni-G and GE 12SL fiducials on the *same* records | Acceptance: median \|ΔQRS_onset\| ≤ 4 ms, \|ΔQT\| ≤ 8 ms vs 12SL |
| **MIMIC-IV-ECG** | Credentialed / ODbL — **disputed** | Validation only; σ_bio cross-check. **No shipped byte.** | Enforce in `pack`: hard error if any record with `redistributable = false` contributed to a written section |
| Rijnbeek 2014 (n = 13 354 population-cohort healthy) | published tables | **Acceptance oracle**, not data | Waveforms unobtainable; converts an unavailable dataset into a validation oracle |

### 4.2 Stages

```
S0 fetch      aws s3 sync --no-sign-request; verify every file against atlas/corpora.lock
S1 decode     vendored WFDB reader (~250 lines: .hea + fmt16 + fmt212); CODE-15% HDF5 via one
              digest-pinned container -> flat f32. Test against LUDB's published values.
S2 canon      strip zero padding; Kaiser resample to 500 Hz (ASSERT-AND-BYPASS at 500 --
              a unity-ratio Kaiser pass still low-passes); mains removal; Pan-Tompkins;
              PQ-anchored detrend; ensemble beat; global fiducials -- ALL via ecg-core,
              same constants as runtime. Reject anything the app itself would reject.
S3 roundtrip  render each retained record via tools/synth/pdf.ts at tier A/B/C/D;
              re-ingest through the REAL pipeline; emit the Recovered variant + per-tier
              bias map and sigma_ingest.  <-- this is the step everyone forgets
S4 select     filters/normal-v1.toml (below); one record per patient, lowest id
S5 aggregate  per stratum: weighted median / MAD / quantiles; PCA -> MODE (K=16, sign-fixed);
              subject-level bootstrap B=200 for SE
S6 refine     3 coarse-to-fine NCC passes, ONE delta per study over all 12 leads, weighted by
              TEMPLATE QRS energy; recentre delta_i -= mean(delta) EXACTLY; re-median
S7 fit        SHASH warped BLR per (lead,sample) and per scalar; ridge 1e-3 + second-difference
              smoothness 1e-2 along t; Hartigan dip -> MASK; ICC_corpus -> MASK
S8 sigma_bio  repeat-pair extraction from PTB-XL multi-record patients + CODE-15% repeat exams;
              stratify by elapsed class; robust SD
S9 nulls      per tier: max|z| and max cluster-mass on held-out normals
S10 validate  §4.4 gates. pack REFUSES to write on any failure.
S11 pack      ECGNORM1 + brotli/gzip siblings + manifest.json + sha256
```

**Inclusion criteria as data** (`filters/normal-v1.toml`), applied in order, every gate emitting a count:

```
G1  positive NORM statement REQUIRED (scp_codes contains NORM, likelihood >= 80).
    Absence of a label is NOT normality -- it is an unread ECG.
G2  no other diagnostic-class code; no form-class code; rhythm codes subset of {SR}
G3  no Uncertain(15|35|50) assertion anywhere.  likelihood == 0 means NOT STATED, not 0%.
    A record whose only evidence for C is Uncertain belongs to NEITHER the C cohort nor normal.
G4  validated_by_human == true
G5  static_noise, burst_noise, baseline_drift, electrodes_problems, extra_beats, pacemaker
    ALL empty
G6  50 <= HR <= 100; RR CV < 10%
G7  age in [18, 89] AND age != 300 (HIPAA masking); sex present
G8  hp_hz <= 0.05 known; lp_hz known           <- admission criterion, not a stratum
G9  our own gates: >=5 gated beats, no NON_STATIONARY_10S, no ALL_BEATS_DISCORDANT,
    no NO_ISOELECTRIC_ANCHOR, no CLIPPED, sigma_ens <= 0.030 mV
G10 derived-lead algebra: ||III-(II-I)|| / ||II-I|| ~ 0; net QRS area in aVR negative;
    median R in V5 in [0.4, 2.5] mV        <- fails the CORPUS, not the record
G11 one record per patient, lowest record id
```

Do **not** exclude a record merely for looking unusual — that truncates the tails, narrows the band, and makes the app over-call in healthy people. Exclude by diagnosis, medication and technical quality only. Sanity check on the result: ~6.0 % of the retained men and ~1.6 % of the women should meet Sokolow-Lyon LVH. If they do not, the selection is wrong.

Expected attrition on PTB-XL: 21 799 → ~9 500 (G1) → ~8 900 (G2) → ~6 340 (G4) → ~4 900 (G5) → ~4 250 (G9) → **≈ 3 900 patients**. Publish the full attrition table. A build that excludes 82 % is telling you something; one that keeps everything is telling you nothing.

### 4.3 Manifest and provenance

Carries: `schema`, `norm_id`, `norm_version` (semver), `content_hash` (BLAKE3 over sections + config + corpora.lock, **excluding build_date**), `build_date` (informational, unhashed), `git_sha`, `rustc`, **`pipeline_contract_hash`** (hash of `ecg-core`'s constant table + frame definition + detrend/ensemble/fiducial function versions), the space definition, per-corpus `{name, version, doi, licence, licence_url, attribution, records_available, subjects_included, device, years, country, modifications}`, `corpora_excluded` with reasons, the inclusion filter and its sha256, per-cell n and per-corpus n contribution, `template_onset_offset_ms` per cell, `blur_index` per cell, `sigma_ingest_uv` per tier, ICC-masked point count, exclusion counts by reason, and the validation report hash.

**Licence obligations are discharged by the manifest, and the manifest is embedded** so the obligation travels with the file. CC-BY §3(a)(1) requires attribution, a licence URI, **and an indication that the material was modified with a statement of the modifications** — `modifications` is a licence condition, not decoration. Generate the attribution string at render time from the manifest; a hand-maintained credits page goes stale on the first rebuild and the violation is silent.

**Version semantics.** Major: standard space or lead set changed (old artifacts unreadable). Minor: corpora or inclusion criteria changed — numbers move, and if any ST-adjacent percentile shifts by > 25 µV that goes in release notes in plain language. Patch: identical inputs, no percentile moves > 5 µV. `norm-diff v1.1.0 v1.2.0` is a release artefact.

### 4.4 Ship gates — `pack` refuses on any failure

| Gate | Criterion |
|---|---|
| A1 External anchor, intervals | Cell medians within ±6 ms (durations), ±0.15 mV (amplitudes) of Rijnbeek 2014; our 2.5/97.5 band must contain their 2nd/98th limits |
| A2 External anchor, ST | Our ~98th percentile of ST-J in V2/V3 per sex/age cell within ±0.05 mV of the Fourth Universal Definition thresholds |
| A3 Blur index | `0 ≤ QRSd(template) − median_i QRSd(member_i) ≤ 4 ms`. Negative ⇒ over-refinement collapse |
| A4 Onset offset | Template's own spatial-velocity onset within ±1.0 ms of t = 0 |
| A5 Split-half | `max_s \|β₀_A − β₀_B\| ≤ 0.03 mV` per lead over disjoint random patient halves |
| A6 Coverage | Held-out global coverage of the 95 % band ∈ [0.940, 0.960]; no point below 0.900; `Pr(p̂ < 0.025)` ∈ [0.021, 0.029], stratified by sex × age band × rate decile |
| A7 Parametric vs empirical | ≤ max(15 µV, 0.10σ) at every point in every cell with n ≥ 400 |
| A8 Lead identity | III/aVR/aVL/aVF reconstructed from I,II within 2 LSB |
| A9 Corpus confound | pairwise matched-stratum classification AUC ≤ 0.65; ICC-masked fraction ≤ 0.05 |
| A10 Round-trip | Tier-A bias map ≤ 15 µV anywhere in the ST window (else fix the ingest, not the reference) |
| A11 Rate residual | Second-order term in `(RR^{1/3}−1)²` not significant at α = 0.01 after correction, in the repolarisation window |
| A12 Negative controls | Held-out CLBBB flagged deviant ≥ 0.90 at the FWE threshold; a label-shuffled build must fail A1/A2 |
| A13 Reproducibility | `sha256(norm-core.ecgnorm1)` identical on ubuntu-latest and macos-latest |
| A14 Non-convergence | ≤ 0.5 % of the 4 812 SHASH fits |

Leave-one-corpus-out is **reported, not gated**: it is the honest measurement of composition bias and it goes in the header and the provenance panel. If any corpus moves a lead by > 0.10 mV, that corpus's composition is named on the ribbon.

---

## 5. RUNTIME USE, AND HOW IT COMPOSES WITH MDC95

### 5.1 The domain predicate — machine-checked, conjunctive

```
NORM_DOMAIN (any failure => Refused(OutsideDomain), carrying the failed clause)
  rhythm_class == SinusRhythm ; 50 <= hr <= 100 (40..120 for non-repolarisation scalars)
  qrs_ms <= 120 ; no BBB/IVCD/pre-excitation/pacing
  n_beats >= 5 ; grade in {A,B} ; gain_source != Unknown && gain_confirmed
  hp_hz known and <= 0.05 ; lp_hz known
  identity_ok && derived-lead residual check passed
  18 <= age <= 89 ; sex present
  all 8 independent leads present, coverage >= 0.90
  SUPP[cell] >= 400
  pipeline_contract_hash matches
```

Outside the domain, **fiducial brackets and the extraction sanity gate still run** (shape-based, robust, and most needed exactly when things are hard). Nothing else does. A reference of narrow-QRS sinus beats has literally nothing to say about an LBBB beat; a z of 12 in V5 there is a category error rendered in red.

### 5.2 The four runtime uses

**U1 — Extraction sanity gate. Highest value, least impressive-sounding, build first.** Score the recovered 12×401 against a deliberately coarse template with a ±4 SD envelope. Catches whole-lead polarity inversion (ρ ≪ 0 where it should be ≫ 0), gain off by 2× or 10× (RMS ratio outside [0.4, 2.5]), paper speed off by 2× (QRS width vs template), panel↔lead mis-assignment (V2's trace scoring better against the V5 template), electrode-reversal hypotheses by log-likelihood ratio over a small permutation set (LA/RA reversal inverts lead I, and lead I's P and QRS are positive in > 95 % of adults, so the LLR is enormous), and gridline-mistaken-for-signal. Needs no probabilistic precision, tolerates every bias in §8, and **flags, never auto-corrects** — genuine global low voltage is the same observation and is itself a finding.

**U2 — Fiducial search brackets and multi-detector fusion.** The reference supplies `SearchBracket{lo, hi}` and nothing else. Fusion runs 5 detectors on the patient's own beat (existing spatial-velocity rule; wavelet modulus-maxima; low-pass differentiation; area/integral; tangent-method T offset), with a confusion matrix θ estimated offline on LUDB + QTDB and **frozen** — a single E-step at inference, i.e. a fixed log-likelihood-ratio weighted vote. A 7-state left-to-right HMM with **flat self-loop probabilities** runs forward–backward to enforce ordering and produce boundary CDFs, giving `point = F⁻¹(0.5)` and `ci95 = (F⁻¹(0.025), F⁻¹(0.975))`. The HMM is a *legality filter*, not an estimator: if the flat-prior posterior is multimodal or boundaries are out of order, return `Unmeasurable` rather than let a duration prior pick. Cost ~5.6 k ops. **Acceptance test:** on the longest-QT decile of held-out records, fused QT must not be shorter than the best single-detector QT by more than 2 ms. Fail ⇒ the fusion is shrinking and does not ship.

**U3 — Level centiles, intervals only.** PR, QRS duration, QT (with RR as covariate), QTcF (derived for display from the QT model, never a response), frontal axis (quantile regression on the angle — no monotone warp makes a wrapped variable Gaussian), HR. Amplitudes are `Refused(AmplitudeCentilesDisabled)` with the reason shown.

**U4 — One omnibus deviation statistic.** Signed 1-D TFCE (H = 2.0, E = 1.0 — in 1-D, E = 1 makes extent proportional to *duration*, which is what a clinician means), computed by exact component-tree integration, connectivity strictly within-lead along t, over the 8 independent leads; plus a burden statistic `Σ max(|z| − 2.6, 0)`; combined by Tippett on the same null pool, thresholded against `NULL[tier]` at FWE 0.01. **Rendered as an extraction-plausibility signal first and a gross-abnormality flag second**, and only if leave-one-corpus-out false-positive rates differ by less than 2×. If they differ by more, it ships as extraction QC only.

### 5.3 Composition with the existing per-pair gate — the exact rule

Three statistics, three denominators, never summed, never allowed to change each other's verdict.

```
CHANGE  (primary, unchanged in structure)
  sigma_delta^2 = sigma_A^2 + sigma_B^2 - 2*rho*sigma_A*sigma_B  +  2*sigma_bio^2(m, lead, dt)
  MDC95         = 1.96 * sqrt(sigma_delta^2)
  floors:  MDC95 >= 100 uV for any amplitude delta ; >= 4 ms for any duration delta
  report change only when |delta| > max(MDC95, clinical_threshold)

LEVEL   (secondary, subordinate, intervals only)
  s_pop^2 = phi' Sigma_w phi                      # epistemic
          + exp(2 * v'phi_sigma)                  # aleatoric, heteroskedastic
          + sigma_u^2 + sigma_al^2*(exp(2 sigma_tau^2)-1)   # unseen batch, marginalised
          + (dmu/dage)^2 * w^2/12                 # age band interval-censoring
          + p(1-p)(mu_M - mu_F)^2  if sex unspecified
          + J^2 * max(sigma_M_ours^2 - sigma_M_corpus^2, 0)   # ATTENUATION CORRECTION
  z = (W(y) - mu_z) / sqrt(s_pop^2)
  refuse if sigma_M_ours > 0.5 * sigma_pop_native   -> MeasurementDominates

Z-DIFF  (not built in v1; see D27)
```

**Is σ_bio in the change denominator double-counting?** No, and the distinction is worth stating precisely, because it is the one place the reference legitimately touches the change path. σ_bio is a *within-subject* variance component that **cannot be estimated from a pair** — you cannot estimate a variance from n = 2. It is a prior, supplied once, additively, and it makes MDC95 **larger**. σ_pop is a *between-subject* variance and answers a different question ("where does this value sit"); it must never appear in a change denominator, because between-subject variance is 3–10× larger than test–retest and would hide real change. Substituting the reference *median* as a synthetic second study gives σ_B = 0 and manufactures change (AD D34). Both are blocked structurally.

**The four double-counting routes, each blocked by construction:**
1. `s_pop` in a change denominator — `MdcInputs` has no field the norm module can populate; `Norm` exposes no accessor returning σ_pop to the change path.
2. Summing `s_pop` and `σ_Δ` into one "total uncertainty" — they live in different result types (`Verdict` vs `NormAnswer`) rendered in physically separated UI regions.
3. Forgetting the attenuation correction — scoring a tier-C photo (σ_M = 40 µV) against a corpus σ_pop whose σ_M is ~5 µV shrinks the apparent spread and pushes ordinary values into the tails. Unit test: `z → 0` as `σ_M_ours → ∞`. A tier-C photo must produce *weaker* statements than a tier-A vector PDF, automatically.
4. Any atlas term that could *reduce* MDC95 — assert `mdc_with_norm >= mdc_without_norm` in code, on every call, in release builds.

**Ordering enforces subordination.** `Verdict` is computed first, from the pair alone. `norm_level(..., verdict: &Verdict)` is computed second and early-returns `Refused(VerdictNotReportable)` when the measure is `Unmeasurable`. A centile of an unmeasurable number is a fabrication.

### 5.4 Two rules that prevent the reference laundering its own selection

- **Location and magnitude never come from the same maximisation.** At u = 3.8 with a true effect of 3.0, `E[ẑ | ẑ > u] = 4.37` — a 46 % inflation, which turns a true 100 µV ST shift into a printed 146 µV, across the clinical line by selection alone. Report magnitude at a pre-specified landmark (J+60 for ST, T-peak for T amplitude, T-offset for QT); report location only as a qualitative span.
- **The reference is immutable and shipped.** No online adaptation, no "learn from this clinic's population", no path merging local `entries` into the artifact. If the patient's own prior studies ever enter, every subsequent comparison is circular and the patient looks falsely normal. Enforce by type: the loader returns a `ReadonlyNorm` with no mutating method, and the export writer takes no norm argument.

---

## 6. WHAT THE UI SHOWS

### 6.1 Layout

Change remains the headline and the primary visual object. Level is a subordinate annotation in its own row.

1. **12-lead grid of the registered ensemble beat.** Outer ribbon = conditional 2.5–97.5 percentiles from `COEF`, 12 % opacity, neutral grey-blue, **asymmetric** (never μ ± 2σ). Inner 25–75 ribbon at 20 % opacity — not decoration: without it the eye reads the outer edge as a decision boundary.
2. **Patient trace on top**, 1.6 px, near-black.
3. **Colour appears only inside a cluster passing FWE 0.01 *and* the clinical threshold at its landmark.** If nothing passes, nothing is coloured, and the absence of colour must be visually unmistakable. Colour is otherwise reserved for the change axis.
4. **Grey diagonal hatching** over `MASK ≠ OK` spans and over `UNMEASURABLE` spans, tooltip naming the dominant term: "multimodal — T polarity in V1 is a normal variant", "gain uncertainty 1.8 %", "2 beats in ensemble", "registration jitter 4.1 ms", "corpus-confounded".
5. **At most six scalars**, each as a percentile dot on a small distribution strip with its 95 % CI — never a bare number.
6. **Achieved detection limit, printed on every negative result.** "No reference-flagged deviation. Given this study's noise, the smallest ST shift detectable at 80 % power was 190 µV sustained over 80 ms." This converts a negative from meaningless to informative and stops over-reading a quiet report on a bad photograph.
7. **Persistent, non-dismissible provenance footer** on any view showing reference content; every reference-derived number is click-through to the stratum card (n, per-corpus n, inclusion summary in prose, version + `content_hash[0..8]`, licences).

### 6.2 The six verdict × level cells

| Pair verdict | Level | Wording |
|---|---|---|
| Significant | typical | "QRS +10 ms — change exceeds this pair's detection limit (±3 ms). Both values are within the usual range for a 62-year-old man (78th → 88th centile, n = 8 412). A real change between two ordinary values." |
| Significant | extreme | Same headline, then "and the current value is now above the 98th centile for this age and sex." Extreme level adds a number, never urgency wording. |
| BelowDetectionLimit | extreme | "Change (+4 ms) is below this pair's detection limit (±9 ms) — not reportable. The current value sits at the 99th centile for age and sex, as did the prior. This is a longstanding finding, not a change." — the highest-value cell in the matrix. |
| NoChange (TOST-positive) | extreme | "No change (0.10 mV positively excluded). Value has been at the 99th centile in both studies." |
| Indeterminate | any | State "the *change* cannot be assessed on this pair" **before** the centile. |
| Unmeasurable | — | **No centile. No population statement of any kind.** |

### 6.3 Exact wording it must not claim

**Banned strings, in `strings.ts`, with a lint rule:**

- ~~"normal"~~ / ~~"abnormal"~~ applied to a centile. Use: *"outside the 2nd–98th centile of N = 3 912 adults with a normal cardiologist statement, [sex], age [band]."*
- ~~"this change is normal"~~ → *"this amount of change is common in the reference cohort over this interval."*
- ~~"healthy population"~~ → *"people who had a clinical ECG and whose ECG was read as normal — not a healthy population."*
- ~~"Black normal" / any race-labelled band~~ → not offered.
- ~~"99.4th percentile"~~ where n cannot support it. Print to the nearest whole percentile; to 0.1 only when n_eff ≥ 2 000; never "0th" or "100th"; cap at the most extreme quantile the cell supports and name it: *"the most extreme this reference supports is the 97.5th centile (n = 431)."*
- No diagnostic string may ever render adjacent to a centile.
- No centile may render in the serial-delta view.
- No red badge, no colour coding, on a centile alone. Grey scale only.
- No percentile without (n_eff, CI, cohort name) in the same visual unit.

**Required footer, literal:**

> Reference: `normal-v1` v1.2.0 (`9f2c8a41`), from 3 912 PTB-XL ECGs recorded in Germany 1989–1996 on Schiller carts, from adults with a normal cardiologist statement. These are people who had a clinical ECG, not a healthy population. Ancestry and body size are not recorded and are not modelled. Population centile is not a diagnosis. Built 2026-07-31.

**Out-of-support is a refusal, not a caveat.** No band, no centile, no greyed approximation — the tracing alone, plus the reason.

---

## 7. BUILD ORDER

**Existing state:** measurement path and comparison window done. Case library, de-identifying ingest, rule-based label suggestion, explainer designed but unbuilt.

### P0 — pipeline fixes and scaffolding. Do these first; most improve the product with no reference at all, and the reference cannot be built correctly without them.

| # | Item | Effort |
|---|---|---|
| 0.1 | Replace linear `shift`/`shift_frame` with sinc `frac_delay` (reuse `SincTable`, 16 taps); widen `frame_at` margin to 417 samples and reject rather than pad | ~50 lines |
| 0.2 | Compose transforms: three-pass ensemble so each beat is fractionally delayed **exactly once** by `δ_i + τ_s` from the original array | ~80 lines |
| 0.3 | Unbiased within-patient template, `Σ τ_s = 0`, per-sample median, chronological reference only. S = 2 collapses to ±δ/2. Template never produces a delta. | ~120 lines |
| 0.4 | One δ per study pair on the RSS vector-magnitude channel; per-lead δ becomes a QC statistic only (`MAD_l(δ_l) > 1 sample ⇒ AlignLeadDisagreement`) | ~40 lines |
| 0.5 | `register_lead` must use `(min(onset), max(offset))` across **both** studies for the correlation window — otherwise a short reference window excludes the terminal QRS, where new RBBB and hyperkalaemic widening live, and the morphology interlock never fires | ~10 lines |
| 0.6 | Suppress `QrsMorphologyChanged` when QRS p-p < 0.20 mV in that lead (NCC is scale-invariant; ρ in aVL/III is noise-dominated) | ~10 lines |
| 0.7 | Clamp must be loud: when `XSTUDY_CLAMP_MS` fires, **suppress the difference trace entirely** rather than show one computed on frames known to be misaligned | ~10 lines |
| 0.8 | `pipeline_contract_hash` computed and asserted; hard refusal on mismatch | ~40 lines |
| 0.9 | QC-7 **null self-registration**: split each study's beats odd/even, run the entire serial pipeline on the two halves. Every delta must fall inside MDC95. If not, suppress change calls for that study and say why. Also a CI test on the sample ECGs. Single best guard against a mis-calibrated uncertainty model. | ~60 lines |
| 0.10 | `crates/ecg-wfdb` (header + fmt16 + fmt212), `crates/ecg-norm-build` skeleton, `ECGNORM1` writer/reader + round-trip fixture, `corpora.lock`, reproducible-build CI | ~5 d |
| 0.11 | Ingest round-trip harness (`tools/synth/pdf.ts` → real pipeline) producing per-tier bias and `σ_ingest` | ~3 d |

### P1 — the reference that is actually worth shipping

| # | Item |
|---|---|
| 1.1 | **σ_bio table.** Extract repeat pairs from PTB-XL multi-record patients and CODE-15 % repeat exams; run the real pipeline; robust SD by measure × lead × elapsed class. Wire into MDC95 with the monotonicity assertion and the 100 µV / 4 ms floors. **Ship this before anything else in P1** — it improves the product's core statistic immediately. |
| 1.2 | PTB-XL-only, S = 1 population marginal template + `MODE` + extraction sanity gate (U1). ~7 KiB. Ship it; the UI gets something honest to draw. |
| 1.3 | Validation harness: coverage map, external anchors (Rijnbeek, UDMI), lead identities, attrition table. **Wire the ship gates. Do not proceed to 1.5 before this exists** — a normative model without a calibration harness is an unfalsifiable band. |
| 1.4 | sex × 6 age bands, `n_min` collapse rule, refusals, provenance footer and stratum card |
| 1.5 | SHASH warped BLR fit + `SUPP` gating + parametric-vs-empirical gate; interval level-centiles (U3) |
| 1.6 | Fiducial search brackets (U2, brackets only — no fusion yet) |
| 1.7 | Add CODE-15 % for scalars; ICC mask; leave-one-corpus-out offset map reported in the manifest |

### P2 — earn it

| # | Item |
|---|---|
| 2.1 | Multi-detector fiducial fusion with frozen θ and flat-prior HMM, with the shrinkage acceptance test |
| 2.2 | Per-tier permutation nulls + TFCE omnibus (U4), initially as extraction QC only; promoted to a patient-facing flag only if the leave-one-corpus-out FPR ratio is < 2 |
| 2.3 | Generative null conditioned on the patient's own noise (replaces the stored null; B = 2000, ~0.6 s single-thread, +560 KB basis) — only if 2.2 shows the stored null is materially miscalibrated |
| 2.4 | T-wave-only diffeomorphic warp markers (`dw_NL`, `da`), window floored at J+40 ms **in code**, DEFAULT OFF pending a validated normal range. Never touches the difference trace or any measurement. |
| 2.5 | Session-only, never-stored, clinician-supplied ancestry as a display overlay. Recommended: do not build. Revisit only if a corpus with ancestry becomes redistributable. |

**Interaction with the unbuilt roadmap items.** The de-identifying ingest and the case library are unaffected — the NORM is a bundled static asset, hydrated read-only, never written to IndexedDB, invisible to the storage meter and to delete-all. The rule-based label suggestion engine may consume `Norm::plausibility` (U1) and the interval centiles, but must not consume the omnibus statistic or any per-sample z. The explainer may cite a centile only with the full clause set from §6.

---

## 8. TOP RISKS

**R1 — The reference encodes a biased "normal" and lends false authority to a wrong comparison.** *Mechanism:* the corpus is one German hospital's referral population on 1989–96 Schiller carts, with no ancestry field, no body habitus, and 2.9 cm of electrode-placement scatter baked in. Applied to a healthy Black man with 180 µV of physiological J-point elevation in V2, a PTB-XL-derived band whose ceiling sits near 150 µV reports a deviation that is not one — with a shaded band's visual authority behind it. Averaging does not dilute a phase-locked artefact; **more subjects make it sharper** (the exact mechanism by which registering everyone to one subject bakes that subject's sulcus in). *Mitigations:* amplitude centiles off entirely (D10); ST anchored to the widest published limit as a fixed threshold (D11); the composition rendered on every view, not buried; leave-one-corpus-out offsets reported; A1/A2 external anchors gate the build. *Runtime detector:* if the study's covariates fall outside the corpus's convex hull, or `SUPP[cell] < 400`, refuse. Ship a per-release monitor of the fraction of studies receiving a refusal for each reason; a sudden change in that mix means the deployed population has drifted away from the reference.

**R2 — "Normal" means "a cardiologist wrote nothing".** Filtering on absence of a label builds an atlas of *unread* ECGs and widens the bands, so the app under-calls. Filtering on ECG appearance truncates the tails and narrows them, so the app over-calls. *Mitigation:* G1 requires a positive statement; exclusion is by diagnosis and technique only, never by appearance. *Detector:* Sokolow-Lyon positivity in the retained cohort must be ≈ 6.0 % (M) / 1.6 % (F); the QNTL 2.5–97.5 band must contain Rijnbeek's 2nd/98th limits (A1). Both fail the build.

**R3 — Ingest-path mismatch: the reference is cleaner than any real input.** Corpus records are digital simultaneous 12-lead; ours are recovered from vector PDFs and photographs, where column-envelope clips fast deflections **low**. Build on digital and apply to recovered and every patient looks low-voltage; and the shipped permutation null, built on clean signals, is anti-conservative for rough ones. *Mitigation:* D32 — ship the Recovered variant only; per-tier nulls; `σ_eff² = σ_atlas² + σ_ingest(tier)²`; the attenuation refusal at `σ_M > 0.5 σ_pop`. *Detector:* the band must **visibly widen** on a worse photograph. A band that does not move when input quality collapses is a lie told with a shaded region — make that a UI regression test.

**R4 — Interpolation-induced progressive voltage loss (live bug today).** Study 1 is never interpolated; every later study receives one linear fractional shift, which is a one-signed low-pass: 15–60 µV of R-wave attenuation and 11–41 % loss at 75–150 Hz. It presents as low voltage, R-wave amputation, or resolving QRS fragmentation — three findings this product exists to surface — and it grows monotonically across the series. *Mitigation:* P0 items 0.1–0.3. *Detector:* CI test on a synthetic series of identical beats — every pairwise delta must be exactly zero after the fix; before the fix it is not.

**R5 — Mass-univariate false positives.** KORA measured it: with 96 measurements at per-measurement P5/P95, **69.5 %** of ordinary two-year follow-ups are flagged; requiring ≥ 5 measurements beyond P1/P99 brings it to 3.0 %. Per-sample it is 50× worse. *Mitigation:* D21/D23/D24 — build-time permutation FWE at α = 0.01, per-sample colouring only inside a passing cluster that also clears the clinical threshold. *Detector:* on a held-out normal set, ≤ 1 % of studies may produce any flag; print the achieved rate in the manual and the release notes.

**R6 — Circularity, in three forms.** (a) Defining a stratum by the measurement the reference will judge (an LVH atlas built from a *voltage-criteria* label cannot fail). (b) Selecting the registration reference by data quality. (c) The patient's own studies entering the reference. *Mitigations:* stratify by our own measurement and publish the label-vs-measurement disagreement (> 20 % ⇒ the stratum does not ship); chronological reference only; immutable shipped artifact with no merge path. *Detector:* a build-time assertion that no `own`-provenance record id appears in the corpora manifest, and a type-level test that `NormAnswer` cannot be constructed from inside the verdict path.

**R7 — Version drift between the reference and the pipeline.** Move the J point 4 ms, change the detrend, change the tangent-method T offset, and every centile shifts with no error anywhere. *Mitigation:* `pipeline_contract_hash` (D33). *Detector:* mismatch ⇒ the artifact loads in U1 sanity-gate mode only; all quantitative comparison disabled until rebuild. Missing feature is visible; wrong number is not.

**R8 — The parametric model always answers.** Its worst property. A 22-year-old woman at 44 bpm about whom the corpus knows nothing gets a smooth, confident, wrong band. *Mitigation:* `SUPP` gating at n_eff ≥ 400, hard age limits [18, 89], the parametric-vs-empirical ship gate (A7). *Detector:* a synthetic subject at age 94 and at HR 150 must return `Refused(OutOfRange)`, in CI.

**R9 — Rate confounding read as morphology.** A 55 bpm study against an 85 bpm study through a rate-naive reference produces "new ST depression and T flattening" that is entirely physiological. *Mitigation:* rate is a covariate everywhere it matters (QT, JT, ST, T amplitude, QRS-T angle as a second-degree polynomial; **not** P duration or frontal axis). *Detector:* if `|HR₁ − HR₂| > 20 bpm`, ST/T/JT deltas are reported as rate-confounded with both raw and adjusted values shown, each with its own MDC. If either HR is outside 50–100, the reference is out of support — refuse rather than extrapolate.

**R10 — Pseudo-replication and n inflation.** 800 k ECGs / 160 k patients (MIMIC), 345 k / 234 k (CODE), 21 799 / 18 869 (PTB-XL). Treating records as independent shrinks bands by ~√(records/patients) and makes the reference look more authoritative than it is. *Mitigation:* D34. *Detector:* assert `n_records == n_patients` per cell in the build.

**R11 — Over-refinement collapse.** Too many NCC passes with too narrow a window drive δ to whatever maximises correlation with the current template, sharpening it beyond physiology — the 1-D form of a template collapsing to a delta. It reads as improvement, because the template gets sharper each pass. *Mitigation:* cap at 5 passes; A3 blur index must be in [0, 4] ms; `sd(δ)` must stay above 0.5 samples. *Detector:* build fails on either.

**R12 — Licence contamination.** One MIMIC-derived cell forces the whole artifact under ODbL share-alike (or breaches the credentialed DUA — the two slices disagree on which licence applies, and both forbid shipping). *Mitigation:* per-corpus `redistributable` flag; `pack` hard-errors if any non-redistributable record contributed to a written section; validation runs as a separate binary invocation emitting scalars only. *Detector:* CI test that deliberately marks PTB-XL non-redistributable and asserts `pack` fails.

---

### Primary sources

Guimond/Meunier/Thirion *CVIU* 2000;77:192 · Joshi et al. *NeuroImage* 2004;23:S151 · Ashburner *NeuroImage* 2007;38:95 · Avants et al. *NeuroImage* 2010;49:2457 · Fonov et al. *NeuroImage* 2011;54:313 · Reuter et al. *NeuroImage* 2012;61:1402 and Reuter & Fischl *NeuroImage* 2011;57:19 · Kriegeskorte et al. *Nat Neurosci* 2009;12:535 · Eklund/Nichols/Knutsson *PNAS* 2016;113:7900 · Nichols & Holmes *HBM* 2002;15:1 · Smith & Nichols *NeuroImage* 2009;44:83 · Marquand et al. *Biol Psychiatry* 2016;80:552 · Fraza et al. *NeuroImage* 2021;245:118715 · Bethlehem et al. *Nature* 2022;604:525 · Bayer/Kia et al. *NeuroImage* 2022 · Rehák Bučková et al. *eLife* 2025;13:RP95823 · Warfield/Zou/Wells *IEEE TMI* 2004;23:903 · Wang et al. *IEEE TPAMI* 2013;35:611 · Rijnbeek et al. *J Electrocardiol* 2014;47:914 (n = 13 354; tables at normalecg.org) · Palhares et al. *BMC Cardiovasc Disord* 2017;17:152 (n = 486 014, CC-BY) · Rautaharju et al. *J Electrocardiol* 2014;47:342 (ARIC) · van der Ende et al. *JAHA* 2020;9:e015477 (HELIUS) · Wu et al. *West J Emerg Med* 2025;26:978 · Perz et al. *Comput Cardiol* 2008;35:101 (KORA) · Jekova et al. *J Electrocardiol* 2016;49:784 · Wenger & Kligfield *J Electrocardiol* 1996;29:179 · Kania et al. *Med Biol Eng Comput* 2014;52:109 · Malik et al. *Heart* 2002;87:220 · Toman et al. *Sci Rep* 2020;10:2551 · Thygesen et al. *Circulation* 2018 (Fourth UDMI) · Kligfield et al. *Circulation* 2007;115:1306 · Wagner et al. *Sci Data* 2020;7:154 (PTB-XL, CC-BY, `10.13026/kfzx-aw45`) · Ribeiro et al. CODE-15 % (`10.5281/zenodo.4916206`, CC-BY) · Zheng et al. *Sci Data* 2020;7:48 (Chapman, `10.13026/wgex-er52`) · LUDB `10.13026/eegm-h675` (ODC-By) · QTDB `10.13026/C24K53` (ODC-By) · MIMIC-IV-ECG `10.13026/4nqg-sb35` (licence disputed — counsel before any use).
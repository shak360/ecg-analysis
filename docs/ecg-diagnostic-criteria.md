<!--
Research pass, 2026-08-01: published, measurable diagnostic criteria per ECG
finding, gathered for the evidence-highlighting view (task #30).

Six agents, ~950k tokens, primary guidelines only. Kept in full because the
DISAGREEMENTS are the load-bearing part: a teaching tool that states one
threshold as fact when two are in use teaches something false.
-->

# ECG diagnostic criteria, for evidence highlighting

## Ventricular conduction: complete/incomplete LBBB and RBBB, left anterior and left posterior fascicular block, nonspecific intraventricular conduction delay, and ventricular pre-excitation (WPW)

### Complete left bundle branch block (CLBBB) — AHA/ACCF/HRS 2009 Part III reference definition  `CLBBB`

**Rule.** QRS >= 120 ms with a broad notched or slurred R wave in the lateral leads (I, aVL, V5, V6), absent initial q waves in I, V5 and V6, and prolonged R peak time in V5-V6 with normal R peak time in the right precordial leads; ST-T usually discordant to the QRS.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| QRS duration (global: earliest QRS onset to latest QRS offset across simultaneously recorded leads) | all 12, measured globally | >= 120 ms | Adults. Pediatric: > 100 ms age 4-16 y; > 90 ms age < 4 y. No sex-specific threshold in this document. |
| R wave morphology (broad notched or slurred R; an RS pattern is explicitly allowed in V5/V6 when the transition is displaced) | I, aVL, V5, V6 | notch or slur present in the R wave (no amplitude/width quantification given) | none |
| Initial q wave amplitude/presence | I, V5, V6 | q absent (0 mV); a narrow q is permitted in aVL only | 'in the absence of myocardial pathology' for the aVL exception |
| R peak time (QRS onset to peak of R or R') | V5, V6 | > 60 ms | none |
| R peak time | V1, V2, V3 | normal (i.e. not prolonged; normal upper limit for right precordial R peak time is 35 ms) | applies only when small initial r waves can be discerned in V1-V3 |
| ST segment / T wave axis relative to QRS | all | ST-T usually opposite in direction to the dominant QRS deflection (discordance) | stated as 'usually', not a required criterion; positive T with upright QRS may be normal; ST depression / negative T in leads with negative QRS is abnormal |

**Not computable from samples.** 'Notched or slurred' is not quantified anywhere in the 2009 statement — a program must supply its own operational notch/slur definition (see the Xia 2017 entry). The ST-T clause is descriptive, not a decision rule. Separating true complete conduction block from LVH-related QRS widening cannot be done from the samples (Auricchio's His-bundle work showed ~1/3 of patients meeting these criteria have intact His-Purkinje LV activation) — that requires invasive recordings. Rate-dependence and intermittency require multiple beats/prior tracings.

**Guidelines disagree.** This is the loosest definition in use. (1) It does NOT require QS or rS in V1 — ESC 2013 and MADIT-CRT do. (2) Duration threshold 120 ms vs Strauss 140 ms (men) / 130 ms (women). (3) ESC 2021 keeps 120 ms but adds a mandatory mid-third notch/slur in >= 2 of V1,V2,V5,V6,I,aVL plus R peak time > 60 ms in V5-V6. (4) Applying ESC-2021 vs ESC-2013 to the same cohort of 281 'LBBB' patients: 100% met ESC 2013 but only 12% met ESC 2021 (Calle S et al., Neth Heart J 2022;30:495-498). A teaching tool must not present '>= 120 ms + broad R' as the definition of LBBB.

*Source:* Surawicz B, Childers R, Deal BJ, Gettes LS. AHA/ACCF/HRS Recommendations for the Standardization and Interpretation of the Electrocardiogram, Part III: Intraventricular Conduction Disturbances. Circulation. 2009;119:e235-e240 (also J Am Coll Cardiol. 2009;53:976-981). FLAG: the primary full text is paywalled (ahajournals and jacc both returned HTTP 403). Every criterion above was verified verbatim against the reproduction of the same text in Table 3 of Kusumoto FM et al., 2018 ACC/AHA/HRS Bradycardia Guideline, Heart Rhythm 2019;16:e227-e279 (open PDF on hrsonline.org), and cross-checked against two independent reproductions.

### Complete LBBB — strict / 'true' LBBB (Strauss criteria)  `CLBBB`

**Rule.** Complete LBBB requires a longer QRS than 120 ms because ~1/3 of conventionally-diagnosed LBBB is LVH or incomplete block; sex-specific duration plus dominant negativity in V1-V2 plus mid-QRS notching/slurring in at least two leads.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| QRS duration | global 12-lead | >= 140 ms | MEN |
| QRS duration | global 12-lead | >= 130 ms | WOMEN (sex-specific by design; the rationale is smaller female LV size) |
| QRS morphology in the right precordial leads | V1 and V2 | QS or rS (i.e. no dominant/positive R) | none |
| Count of leads showing mid-QRS notching or slurring | among V1, V2, V5, V6, I, aVL | >= 2 of those 6 leads | notch/slur must be mid-QRS (middle third), not initial or terminal |

**Not computable from samples.** Nothing intrinsically unmeasurable, but 'mid-QRS notching or slurring' is not defined quantitatively in the source paper; an implementation must adopt an explicit detector (thresholds published by Xia 2017 — see separate entry). Notch detection is noise-sensitive: the validated automatic implementation used 1000 Hz signal-averaged ECGs, which PTB-XL (500 Hz, single beats) does not match.

**Guidelines disagree.** Directly contradicts the AHA/ACCF/HRS 2009 120 ms threshold, and is the only widely-cited LBBB definition with SEX-SPECIFIC duration thresholds. The 2021 ESC pacing guideline declined to adopt sex-specific cut-offs but acknowledged the issue: 'Simulations accounting for the smaller LV size in female CRT patients predict 9-13 ms lower QRS duration thresholds for females' (Glikson M et al., Eur Heart J 2021;42:3427-3520). The same guideline states plainly that 'ECG criteria of intraventricular conduction disturbance, LBBB, and non-LBBB have not been consistently defined and reported in any of the past CRT studies.'

*Source:* Strauss DG, Selvester RH, Wagner GS. Defining left bundle branch block in the era of cardiac resynchronization therapy. Am J Cardiol. 2011;107(6):927-934. FLAG: paywalled; criteria verified through three independent reproductions (Kong NW et al., Front Physiol 2022;13:962042; Pérez-Riera AR et al., Ann Noninvasive Electrocardiol 2019;24:e12572; Xia X et al., Ann Noninvasive Electrocardiol 2017;22).

### Complete LBBB — ESC 2013 pacing/CRT guideline and MADIT-CRT trial definition  `CLBBB`

**Rule.** QRS >= 120 ms (>= 130 ms in MADIT-CRT), QS or rS in V1, broad frequently notched or slurred R waves in I, aVL, V5 or V6, and absent q waves in V5 and V6.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| QRS duration | global 12-lead | >= 120 ms (ESC 2013); >= 130 ms (MADIT-CRT enrolment definition) | no sex specificity |
| QRS morphology in V1 | V1 | QS or rS (no dominant R) | MADIT-CRT and ESC 2013 both require this; AHA 2009 does not |
| Broad R wave, frequently notched or slurred | at least one of I, aVL, V5, V6 (stated with 'or', unlike AHA 2009's 'and') | present | none |
| q wave presence | V5, V6 | absent | note: lead I is NOT included in the q-wave exclusion here, unlike AHA 2009 |

**Not computable from samples.** Notch/slur again unquantified. 'Frequently notched' is not a requirement, so a program must decide whether to treat notching as mandatory (it is not, under this definition).

**Guidelines disagree.** Differs from AHA 2009 by adding a V1 requirement and by dropping the R peak time and ST-T criteria; differs from Strauss by not requiring notching and by using a single non-sex-specific duration. MADIT-CRT's 130 ms floor was an enrolment criterion, not a diagnostic threshold — it is frequently misquoted as a general LBBB definition.

*Source:* Brignole M et al. 2013 ESC Guidelines on cardiac pacing and cardiac resynchronization therapy. Eur Heart J. 2013;34:2281-2329; Zareba W et al. Effectiveness of CRT by QRS morphology in MADIT-CRT. Circulation. 2011;123:1061-1072. FLAG: verified via multiple concordant reproductions (Calle S, Neth Heart J 2022;30:495-498; Kong NW, Front Physiol 2022) rather than the paywalled originals.

### Complete LBBB — ESC 2021 pacing/CRT guideline definition  `CLBBB`

**Rule.** QRS >= 120 ms with notches or slurring in the MIDDLE THIRD of the QRS in at least two of V1, V2, V5, V6, I, aVL, together with R peak time > 60 ms in V5-V6, and a discordant ST segment followed by an asymmetrical T wave.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| QRS duration | global 12-lead | >= 120 ms | no sex specificity |
| Count of leads with notch/slur located in the middle third of the QRS | among V1, V2, V5, V6, I, aVL | >= 2 leads | position within QRS is explicitly the middle third — computable once QRS onset/offset are known |
| R peak time | V5, V6 | > 60 ms | none |
| ST-segment polarity relative to QRS, T-wave symmetry | leads with dominant R | ST slightly opposed to QRS polarity, followed by an asymmetrical T wave; described as typical when QRS >= 140 ms | descriptive |

**Not computable from samples.** T-wave 'asymmetry' has no threshold given; the frontal/horizontal-plane morphology sub-items in the guideline are qualitative descriptions ('the QRS axis is variable') and are not decidable rules.

**Guidelines disagree.** ESC 2021 is far more restrictive in practice than ESC 2013 despite the same 120 ms floor: in 281 CRT patients all met ESC 2013 but only 12% met ESC 2021, and among 27 CRT super-responders 100% vs 19% (Calle S 2022). This is the single largest guideline-to-guideline discrepancy in this whole family and should be stated explicitly in any teaching tool.

*Source:* Glikson M et al. 2021 ESC Guidelines on cardiac pacing and cardiac resynchronization therapy. Eur Heart J. 2021;42:3427-3520 (full open PDF read directly for the sex/QRS-threshold discussion). Criteria itemisation verified via Calle S et al., Neth Heart J. 2022;30:495-498.

### Complete LBBB — Minnesota Code 7-1-1 (and 7-1-2 intermittent LBBB)  `CLBBB`

**Rule.** QRS >= 0.12 s in a majority of beats of the same QRS pattern in any limb lead, plus R peak duration >= 0.06 s in a majority of beats in any of I, II, aVL, V5, V6.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| QRS duration, per-lead, in the majority of beats of the same QRS pattern | any of I, II, III, aVL, aVF | >= 0.12 s (120 ms) | note this is a per-lead measurement in a majority of beats, NOT a global 12-lead measurement — it will disagree with global QRS duration by up to ~10-15 ms |
| R peak duration (= R peak time) | any of I, II, aVL, V5, V6 | >= 0.06 s (60 ms) | note >= 60 ms here versus AHA's > 60 ms |
| Coexisting codable Q wave | any | if any other codable Q wave coexists with the LBBB pattern, code the Q and downgrade 7-1-1 to 7-4 (nonspecific intraventricular block) | none |
| Intermittency (7-1-2) | any | same as 7-1-1 but with normally conducted QRS complexes of a different shape present in the same recording | computable within a 10 s record if both morphologies appear |

**Not computable from samples.** Exclusions are rule-based and computable except for pacing (6-8, artificial pacemaker) which requires spike detection, and complete AV block (6-1) which requires rhythm analysis. No morphology (notch, q-wave, V1 pattern) is required at all.

**Guidelines disagree.** Minnesota requires no morphologic criterion whatsoever beyond R peak duration — so it will label as LBBB many complexes AHA 2009 would not (e.g. dominant R in V1), and it will downgrade to 7-4 anything with a codable Q wave, which AHA 2009 would still call LBBB. Minnesota also uses per-lead rather than global QRS duration.

*Source:* Minnesota Code, ventricular conduction defect section, quoted verbatim from ARIC Study Manual 5: Electrocardiography, Version 1.0, August 1987, Appendix A (NHLBI/ARIC, cscc.unc.edu) — read directly. Current reference: Prineas RJ, Crow RS, Zhang Z-M. The Minnesota Code Manual of Electrocardiographic Findings, 2nd ed., Springer 2010. FLAG: the 2010 edition may differ in detail from the 1987 reprint I verified; the lead list for the R-peak-duration criterion is printed as 'I, II, aVL, V5, V6' in the standard code but the OCR of the ARIC reprint is ambiguous between V1 and V5 for one entry.

### Incomplete left bundle branch block (ILBBB) — AHA/ACCF/HRS 2009  `ILBBB`

**Rule.** QRS duration 110-119 ms with an LVH pattern, R peak time > 60 ms in V4-V6, and absent q waves in I, V5, V6.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| QRS duration | global 12-lead | 110 to 119 ms (inclusive) | Adults. Pediatric: 90-100 ms age 8-16 y; 80-90 ms age < 8 y (note: the age bands here are 8-16/<8, unlike the 4-16/<4 bands used for complete blocks — this asymmetry is in the source document). |
| Left ventricular hypertrophy pattern | per LVH voltage criteria (AHA/ACCF/HRS 2009 Part V) | present | the statement does not say WHICH LVH criterion — Sokolow-Lyon, Cornell, Romhilt-Estes all give different answers |
| R peak time | V4, V5, V6 | > 60 ms | note V4 is included here but not in the complete-LBBB criterion |
| q wave presence | I, V5, V6 | absent | none |

**Not computable from samples.** 'Presence of left ventricular hypertrophy pattern' is under-specified: it is measurable only after you commit to a particular LVH criterion set, and that choice changes the ILBBB label. Progression from incomplete to complete LBBB requires serial tracings, which a single record cannot provide.

**Guidelines disagree.** Minnesota Code 7-6 sets the ILBBB window at >= 0.10 s and < 0.12 s (i.e. 100-119 ms) versus AHA's 110-119 ms, requires the duration in EACH of I, aVL and V5 or V6, requires absence of any codable Q or QS wave, and does NOT require an LVH pattern or an R-peak-time criterion. ILBBB is widely regarded as a poorly reproducible entity; expect low inter-rater and inter-algorithm agreement on this PTB-XL label.

*Source:* Surawicz B et al. Circulation. 2009;119:e235-e240 / J Am Coll Cardiol. 2009;53:976-981; reproduced verbatim in Kusumoto FM et al., Heart Rhythm 2019;16:e227-e279, Table 3 (read directly). Pediatric age bands additionally cross-checked against Pérez-Riera AR et al., Ann Noninvasive Electrocardiol. 2019;24:e12572. FLAG: one reproduction (wikidoc) gives the ILBBB pediatric bands as 4-16 y / < 4 y; two others give 8-16 y / < 8 y. I could not resolve this against the paywalled original.

### Incomplete LBBB — Minnesota Code 7-6  `ILBBB`

**Rule.** QRS duration >= 0.10 s and < 0.12 s in the majority of beats in each of leads I, aVL, and V5 or V6, in the absence of any codable Q or QS wave.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| QRS duration, per lead, majority of beats | each of I, aVL, and (V5 or V6) | >= 100 ms and < 120 ms | all three lead conditions must hold simultaneously |
| Codable Q or QS wave | any | must be absent (exclusion) | 'codable' = meets a Minnesota 1-x Q-wave code |

**Not computable from samples.** None — this code is fully computable, which is why it is used in epidemiology. It is also why Minnesota-coded and AHA-coded ILBBB prevalences are not comparable.

**Guidelines disagree.** 100 ms lower bound vs AHA's 110 ms — a 10 ms window in which Minnesota calls ILBBB and AHA calls normal. No LVH requirement, unlike AHA.

*Source:* Minnesota Code 7-6, verbatim from ARIC Study Manual 5: Electrocardiography, Version 1.0, August 1987, Appendix A. Current reference: Prineas/Crow/Zhang, Minnesota Code Manual, 2nd ed., 2010.

### Complete right bundle branch block (CRBBB) — AHA/ACCF/HRS 2009  `CRBBB`

**Rule.** QRS >= 120 ms with a terminal rightward delay: rsr', rsR', rSR' (rarely qR) in V1 or V2, an S wave in I and V6 that is wider than the R wave or > 40 ms, and normal R peak time in V5-V6 with R peak time > 50 ms in V1.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| QRS duration | global 12-lead | >= 120 ms | Adults. Pediatric: > 100 ms age 4-16 y; > 90 ms age < 4 y. |
| QRS morphology pattern | V1 or V2 | rsr', rsR', rSR', or rarely qR; the R' (or r') deflection is usually wider than the initial R. A minority show a wide, often notched, monophasic R in V1 and/or V2. | none |
| S wave duration, and S duration vs R duration | I and V6 | S duration > R duration, OR S duration > 40 ms | adults |
| R peak time | V1 | > 50 ms | required only when a pure dominant R wave (with or without notch) is present in V1 |
| R peak time | V5, V6 | normal (not prolonged) | none |
| Criterion combination logic | n/a | the first 3 criteria (duration, V1/V2 pattern, S in I and V6) must all be present for the diagnosis; criterion 4 (R peak time in V1) must additionally be satisfied when V1 shows a pure dominant R | this combination rule is explicit in the 2009 statement and is what makes CRBBB the most programmable finding in this family |

**Not computable from samples.** Nothing in the core rule. However, RBBB coexisting with LAFB/LPFB, prior MI, or Brugada pattern requires additional logic; and 'the R' is usually wider than the initial R' is a soft descriptor rather than a threshold.

**Guidelines disagree.** Minnesota Code 7-2-1 defines RBBB differently (see separate entry): it accepts 'R' > R in V1 OR QRS mainly upright' plus R peak duration >= 60 ms in V1/V2, OR S duration > R duration in lead I or II — i.e. it will code RBBB on beats that fail the AHA V1/V2 pattern requirement. Note also that AHA sets the V1 R-peak-time threshold at > 50 ms while Minnesota uses >= 60 ms.

*Source:* Surawicz B et al. Circulation. 2009;119:e235-e240 / J Am Coll Cardiol. 2009;53:976-981. Criteria 1-4 verified verbatim from Kusumoto FM et al., Heart Rhythm 2019;16:e227-e279, Table 3 (read directly). The 'first 3 should be present / criterion 4 when a pure dominant R is present in V1' combination rule appears in the 2009 statement but I could only verify it against secondary reproductions — FLAG.

### Complete RBBB — Minnesota Code 7-2-1 (and 7-2-2 intermittent)  `CRBBB`

**Rule.** QRS >= 0.12 s in a majority of beats in any limb lead, plus either a dominant terminal R in V1 with prolonged R peak duration, or an S wave longer than the R wave in lead I or II.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| QRS duration, per lead, majority of beats of the same QRS pattern | any of I, II, III, aVL, aVF | >= 0.12 s (120 ms) | per-lead, not global |
| Terminal V1 morphology | V1 | R' > R, or QRS mainly upright | none |
| R peak duration | V1 or V2 | >= 0.06 s (60 ms) | alternative branch of the OR |
| S duration vs R duration | all beats in lead I or lead II | S duration > R duration | alternative branch: satisfies the code without any V1 criterion |
| Intermittency (7-2-2) | any | same as 7-2-1 plus normally conducted complexes of different shape in the same record | none |

**Not computable from samples.** None; exclusions (complete AV block 6-1, WPW 6-4-1, pacemaker 6-8, ventricular rhythms 8-2-1/8-2-2) require rhythm and pacing-spike detection.

**Guidelines disagree.** Uses >= 60 ms R peak duration in V1/V2 where AHA 2009 uses > 50 ms in V1; permits diagnosis via lead I/II S-duration alone; no requirement for an rsR'-type pattern.

*Source:* Minnesota Code 7-2-1/7-2-2, verbatim from ARIC Study Manual 5: Electrocardiography, Version 1.0, August 1987, Appendix A.

### Incomplete right bundle branch block (IRBBB) — AHA/ACCF/HRS 2009  `IRBBB`

**Rule.** Same QRS morphology criteria as complete RBBB but with QRS duration 110-119 ms.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| QRS duration | global 12-lead | 110 to 119 ms (the 2009 text says 'between 110 and 120 ms') | Adults. Pediatric: 90-100 ms age 4-16 y; 86-90 ms age < 8 y (the age bands as printed overlap and are internally inconsistent — this is a defect in the source, not a transcription error). |
| QRS morphology pattern | V1 or V2 | rsr', rsR', or rSR' | identical to complete RBBB |
| S wave duration, S vs R duration | I and V6 | S duration > R duration or > 40 ms | identical to complete RBBB |
| R peak time | V1 (prolonged, > 50 ms) with normal R peak time in V5, V6 | > 50 ms in V1 | same conditional application as complete RBBB |
| Terminal rightward deflection duration (pediatric alternative) | right precordial | >= 20 ms and < 40 ms | children only; FLAG — this pediatric alternative was found in a secondary reproduction and I could not verify it in the primary |

**Not computable from samples.** The clinically important part — distinguishing IRBBB from the normal-variant rSr' of a thin chest, from high V1/V2 electrode placement, and from Brugada type 2 — is not addressed by the criteria at all. Electrode placement itself is not recoverable from the samples (a negative P wave in V1 is a partial surrogate).

**Guidelines disagree.** Minnesota Code 7-3 requires only QRS < 0.12 s in EACH limb lead plus R' > R in V1 or V2 — no lower duration bound at all, so a 90 ms rSr' is coded IRBBB by Minnesota and is normal under AHA. Minnesota additionally has code 7-5 for an R-R' pattern in V1/V2 with R' <= R, which has no AHA equivalent. This is the label in PTB-XL most likely to be inconsistent.

*Source:* Surawicz B et al. Circulation. 2009;119:e235-e240; 'Same QRS morphology criteria as complete RBBB but with a QRS duration between 110 and 119 ms' verified verbatim in Kusumoto FM et al., Heart Rhythm 2019;16:e227-e279, Table 3. Pediatric bands from secondary reproductions — FLAG.

### rSr' in V1-V2: separating IRBBB from normal variant and from Brugada type 2 (measurable discriminators)  `IRBBB, BRUG`

**Rule.** When V1-V2 shows rSr', use the beta angle, the width of the triangle at 5 mm below the r' apex, the ST slope ratio and the V1-vs-V6 QRS duration mismatch to separate benign IRBBB from a type-2 Brugada pattern.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Beta angle (angle between the upstroke of the S wave and the downstroke of the r') | V1, V2 | > 58 degrees favours Brugada type 2 (PPV 73%, NPV 87%) | none |
| Base of the triangle measured 5 mm below the r' apex ('high take-off') | V1, V2 | > 4 mm favours Brugada type 2; < 4 mm typical of athletes/normal variant | amplitude-calibrated, so gain must be verified |
| r' high take-off amplitude and minimum ST ascent | V1, V2 | high take-off of r' >= 2 mm; minimum ST-segment ascent >= 0.5 mm | Brugada type 2 pattern |
| ST slope index (STJ / ST80 amplitude ratio) | V1, V2 | ratio > 1 (downsloping) favours Brugada; <= 1 (upsloping) favours athlete/normal variant | none |
| QRS duration in V1 vs V6 | V1 vs V6 | V1 longer than V6 favours Brugada; equal durations favour a normal variant | none |
| P wave polarity in V1 | V1 | negative P in V1 suggests high electrode placement rather than true IRBBB | none |

**Not computable from samples.** Family history, fever at the time of recording, drug-challenge response, and whether the electrodes were actually placed one or two intercostal spaces high — none recoverable from the samples.

**Guidelines disagree.** This is a review-derived algorithm, not a guideline criterion; the AHA/ACCF/HRS statement offers no discriminator at all. Flag to users that IRBBB in PTB-XL will include benign variants.

*Source:* Baranchuk A, Enriquez A, Garcia-Niebla J, Bayes-Genis A, Villuendas R, Bayes de Luna A. Differential diagnosis of rSr' pattern in leads V1-V2: comprehensive review and proposed algorithm. Ann Noninvasive Electrocardiol. 2015;20(1):7-17 (read directly, open access).

### Left anterior fascicular block (LAFB) — AHA/ACCF/HRS 2009  `LAFB`

**Rule.** Frontal-plane QRS axis between -45 and -90 degrees, qR in aVL with R peak time in aVL >= 45 ms, and QRS < 120 ms.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Frontal plane QRS axis | limb leads (I, II, III, aVR, aVL, aVF) | between -45 and -90 degrees | does not apply to congenital heart disease with left-axis deviation present in infancy |
| QRS pattern in aVL | aVL | qR (small q, tall R) | none |
| R peak time in aVL | aVL | >= 45 ms (2009 text: '45 ms or more') | a useful corollary is R peak time in V6 < R peak time in aVL |
| QRS duration | global 12-lead | < 120 ms | if >= 120 ms with an RBBB pattern, this becomes RBBB + LAFB, not LAFB alone |

**Not computable from samples.** The exclusion for congenital heart disease with infantile left-axis deviation depends on clinical history and is not computable. Whether a leftward axis reflects fascicular block versus inferior MI, LVH, emphysema or a horizontal heart cannot be settled from the axis alone.

**Guidelines disagree.** IMPORTANT: Kusumoto 2018 reproduces the 2009 LAFB criteria with a FIFTH criterion the 2009 list does not contain — 'rS pattern (small r, deep S) in leads II, III and aVF'. Minnesota Code 7-7 uses a different rule again: QRS < 0.12 s in the majority of beats in I, II, III, aVL, aVF, PLUS a Q wave in lead I of amplitude >= 0.25 mm and < 0.03 s duration, PLUS axis <= -45 degrees. Many automated systems and older texts call -30 to -45 degrees LAFB; AHA and Minnesota both require -45. Also note the frontal axis itself is method-dependent (net QRS area vs peak amplitudes vs initial 40 ms) and near the -45 boundary the two methods disagree — state the method used.

*Source:* Surawicz B et al. Circulation. 2009;119:e235-e240; verified verbatim in Kusumoto FM et al., Heart Rhythm 2019;16:e227-e279, Table 3 and in the ECGpedia transcription of the 2009 table.

### LAFB — Minnesota Code 7-7 (left anterior hemiblock) and 7-8 (LAH + RBBB)  `LAFB`

**Rule.** Narrow QRS with a small q wave in lead I and an axis of -45 degrees or more negative; 7-8 codes the combination of left anterior hemiblock with RBBB.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| QRS duration, per lead, majority of beats | I, II, III, aVL, aVF | < 0.12 s (120 ms) | none |
| Q wave amplitude and duration in lead I | I | amplitude >= 0.25 mm AND duration < 0.03 s | amplitude-calibrated |
| Frontal plane QRS axis | limb leads | <= -45 degrees (i.e. -45 or more negative) | none |
| Combination code 7-8 | n/a | code 7-8 when RBBB (7-2) coexists with axis < -45 degrees and the lead I q wave meets the above criteria | this is the Minnesota encoding of bifascicular RBBB+LAFB |

**Not computable from samples.** None — fully computable.

**Guidelines disagree.** Minnesota requires a measurable q in lead I (>= 0.25 mm, < 30 ms) which AHA 2009 does not; AHA requires qR and R peak time >= 45 ms in aVL which Minnesota does not. Minnesota provides NO code for left posterior fascicular block at all — a program trained on Minnesota-coded corpora will have no LPFB signal.

*Source:* Minnesota Code 7-7 and 7-8, verbatim from ARIC Study Manual 5: Electrocardiography, Version 1.0, August 1987, Appendix A.

### Left posterior fascicular block (LPFB) — AHA/ACCF/HRS 2009  `LPFB`

**Rule.** Frontal-plane QRS axis between +90 and +180 degrees in adults, rS in I and aVL, qR in III and aVF, QRS < 120 ms, after excluding right ventricular hypertrophy and lateral myocardial infarction.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Frontal plane QRS axis | limb leads | between +90 and +180 degrees | ADULTS ONLY. Because of the more rightward axis in children up to 16 years, apply to them only when a distinct rightward change in axis is documented (i.e. requires a prior tracing). |
| QRS pattern | I and aVL | rS (small r, deep S) | none |
| QRS pattern | III and aVF | qR (small q, tall R) | none |
| QRS duration | global 12-lead | < 120 ms | none |

**Not computable from samples.** LPFB is explicitly a diagnosis of exclusion: right ventricular hypertrophy and lateral MI must be excluded (partially computable via RVH/Q-wave criteria, but the guideline does not say which), and the common non-cardiac causes of right-axis deviation (tall thin habitus, chronic lung disease, acute pulmonary embolism, sodium-channel-blocker toxicity) are not recoverable from the samples. The pediatric rule requires a PRIOR TRACING — not computable from a single record. Mark LPFB as low-confidence in any automated tool.

**Guidelines disagree.** The AHA axis window (+90 to +180) is far wider than what most textbooks and automated programs use in practice (commonly >= +100 or >= +120 degrees) because +90 to +100 overlaps heavily with normal vertical hearts. Minnesota Code has no LPFB code. There is no consensus threshold — say so.

*Source:* Surawicz B et al. Circulation. 2009;119:e235-e240; verified verbatim (including the pediatric caveat) in Kusumoto FM et al., Heart Rhythm 2019;16:e227-e279, Table 3, and in the ECGpedia transcription of the 2009 table.

### Nonspecific intraventricular conduction delay / disturbance (IVCD) — AHA/ACCF/HRS 2009  `IVCD`

**Rule.** QRS duration greater than 110 ms in adults where the morphology criteria for RBBB and for LBBB are not met.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| QRS duration | global 12-lead | > 110 ms | Adults. Pediatric: > 90 ms age 8-16 y; > 80 ms age < 8 y. |
| Morphology exclusion | all | criteria for complete or incomplete RBBB and LBBB are NOT present | this makes IVCD a residual category — it is only as good as the block detectors that precede it |

**Not computable from samples.** Nothing intrinsically, but the label inherits every ambiguity of the LBBB/RBBB rules it excludes, and it silently absorbs pre-excitation, hyperkalaemia, drug effect and paced/ventricular-origin beats unless those are separately excluded.

**Guidelines disagree.** MAJOR DISAGREEMENT — Minnesota Code 7-4 sets intraventricular block at QRS >= 0.12 s (120 ms), and most clinical usage and most published IVCD epidemiology use >= 120 ms, not > 110 ms. There is thus a 110-119 ms band that AHA 2009 calls IVCD and Minnesota/most literature calls normal or 'borderline'. A teaching tool must show both. The same 110 ms boundary is also where AHA places 'incomplete' LBBB/RBBB, so a 115 ms QRS with an rsR' in V1 is simultaneously eligible for IRBBB and excluded from IVCD.

*Source:* Surawicz B et al. Circulation. 2009;119:e235-e240; verified verbatim in Kusumoto FM et al., Heart Rhythm 2019;16:e227-e279, Table 3: 'QRS duration >110 ms where morphology criteria for RBBB or LBBB are not present'. Supporting: Prevalence of Intraventricular Conduction Disturbances in a Large French Population (PMC6931561) uses the same definition.

### Intraventricular block — Minnesota Code 7-4  `IVCD`

**Rule.** QRS duration >= 0.12 s in a majority of beats in any limb lead, when the LBBB/RBBB codes do not apply (and as the downgrade target when a codable Q coexists with an LBBB pattern).

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| QRS duration, per lead, majority of beats | any of I, II, III, aVL, aVF | >= 0.12 s (120 ms) | per-lead, not global |
| Code precedence | n/a | 7-4 suppresses all Minnesota 2- (axis), 3- (R amplitude), 4- and 5- (ST/T) codes | important if you are mapping Minnesota-coded corpora onto PTB-XL labels |

**Not computable from samples.** None.

**Guidelines disagree.** 120 ms vs AHA's 110 ms, and per-lead vs global measurement. Also note that under Minnesota an LBBB pattern with any codable Q wave is re-coded 7-4, so Minnesota 'IVCD' contains cases AHA would call LBBB.

*Source:* Minnesota Code 7-4, verbatim from ARIC Study Manual 5: Electrocardiography, Version 1.0, August 1987, Appendix A.

### Upper limit of normal QRS duration (the anchor for every threshold above)  `IVCD, NORM`

**Rule.** A QRS duration greater than 110 ms in subjects older than 16 years should be regarded as abnormal.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| QRS duration | global 12-lead (earliest onset to latest offset across simultaneously recorded leads) | > 110 ms is abnormal | age > 16 y; the committee explicitly declined to set sex-specific limits, noting the data were still evolving |
| Reference distribution | global | in 725 normal males > 18 y, QRS ranged 74-114 ms, mean 95 ms | males; female QRS duration is empirically ~4-10 ms shorter, which the statement acknowledges but does not codify |

**Not computable from samples.** None, but the measurement CONVENTION dominates the result: global (multi-lead superimposed) QRS duration exceeds any single-lead measurement, and automatic measurements differ systematically between ECG manufacturers. The 2021 ESC pacing guideline explicitly notes that ECG recording modality and manufacturer affect automatically measured QRS duration.

**Guidelines disagree.** AHA 2009 declines sex-specific normal limits while the Strauss LBBB criteria and the FDA CRT meta-analyses use them; ESC 2021 states that simulations predict 9-13 ms lower thresholds for women. Whichever you implement, publish the number.

*Source:* Surawicz B et al. AHA/ACCF/HRS Part III. Circulation. 2009;119:e235-e240. FLAG: the '725 normal males, 74-114 ms, mean 95 ms' passage and the '>110 ms in subjects older than 16 years' recommendation were verified only against secondary quotations of the paywalled original. Manufacturer/modality caveat: Glikson M et al., Eur Heart J 2021;42:3427-3520 (read directly).

### Ventricular pre-excitation / Wolff-Parkinson-White pattern (WPW) — AHA/ACCF/HRS 2009  `WPW`

**Rule.** During sinus rhythm: PR interval < 120 ms, a delta wave (slurring of the initial portion of the QRS that interrupts the P wave or arises immediately after its termination), QRS duration > 120 ms, and secondary ST-T changes directed opposite to the major delta/QRS vectors.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| PR interval (P onset to QRS onset), measured during sinus rhythm | global (earliest P onset to earliest QRS onset) | < 120 ms | < 90 ms in children |
| QRS duration | global 12-lead | > 120 ms | > 90 ms in children |
| Delta wave: slurred initial QRS upstroke | any/all; polarity of the delta vector determines pathway location | present — initial slurring occupying roughly the first 40-60 ms of the QRS; the statement gives no slope or amplitude threshold | the guideline's own definition is morphological, not numeric |
| ST-T direction | leads with a dominant delta/QRS vector | secondary ST-T changes opposite in direction to the major delta and QRS vectors | supportive, not required |
| P-J interval (P onset to QRS end) — classical corollary | global | typically remains normal (<= 260 ms) because PR shortening is offset by QRS widening | FLAG: widely taught, but I could not verify it in the 2009 primary text |

**Not computable from samples.** The distinction between 'WPW pattern / ventricular pre-excitation' (an ECG finding) and 'WPW syndrome' (pre-excitation PLUS documented symptomatic tachyarrhythmia) is by definition not computable from a single 12-lead recording — it needs symptoms and arrhythmia documentation. PTB-XL's WPW label should therefore be read as pre-excitation PATTERN. Intermittent/concealed pre-excitation, and pathway location beyond a delta-polarity heuristic, are also beyond a single record.

**Guidelines disagree.** Minnesota Code 6-4-1 is stricter and fully computable: PR < 0.12 s AND QRS >= 0.12 s AND R peak duration > 0.06 s all coexisting in the same beat, in a majority of beats. Note the inequality mismatch: AHA uses QRS > 120 ms, Minnesota QRS >= 120 ms. Minnesota also codes intermittency separately (6-4-2, WPW pattern in < 50% of beats), which AHA does not. AHA's short-PR-without-delta case is Minnesota 6-5 (PR < 0.12 s in all beats of any two limb leads) — a distinct code that PTB-XL has no label for.

*Source:* Surawicz B et al. AHA/ACCF/HRS Part III. Circulation. 2009;119:e235-e240 / J Am Coll Cardiol. 2009;53:976-981. FLAG: verified through the wikidoc/ECGpedia transcriptions of the 2009 table, not the paywalled original; the 2018 ACC/AHA/HRS bradycardia guideline does not reproduce a pre-excitation definition. Concordant primary guideline: Page RL et al., 2015 ACC/AHA/HRS Guideline for the Management of Adult Patients With Supraventricular Tachycardia, Circulation. 2016;133:e506-e574 — 'shortened PR interval (<120 ms), slurred QRS upstroke (delta wave), prolonged QRS duration (>120 ms)'. Predecessor primary source: Willems JL et al., Criteria for intraventricular conduction disturbances and pre-excitation (WHO/ISFC Task Force), J Am Coll Cardiol. 1985;5:1261-1275 — paywalled, NOT verified, but note its Appendix states the criteria in formal Boolean logic, which is likely the single most useful primary document for an implementer who can obtain it.

### WPW pattern — Minnesota Code 6-4-1 (persistent) and 6-4-2 (intermittent)  `WPW`

**Rule.** Sinus P wave with PR < 0.12 s plus QRS >= 0.12 s plus R peak duration > 0.06 s, all coexisting in the same beat and present in the majority of beats.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| PR interval | any of I, II, aVL and the left precordial leads | < 0.12 s (120 ms) | requires a sinus P wave |
| QRS duration | same lead as the PR measurement (same beat) | >= 0.12 s (120 ms) | all three quantities must coexist in the SAME beat |
| R peak duration (R peak time) | same beat/lead | > 0.06 s (60 ms) | this is Minnesota's computable stand-in for 'delta wave' — no delta-wave detector required |
| Beat fraction | any of I, II, aVL, V4, V5, V6 (as printed; the OCR of the reprint is ambiguous on the precordial lead list) | majority of beats for 6-4-1; <= 50% of beats for 6-4-2 (intermittent) | computable within a 10 s record |

**Not computable from samples.** None — this is the most directly implementable pre-excitation rule available, because it replaces 'delta wave' with an R peak duration threshold.

**Guidelines disagree.** Substitutes R peak duration > 60 ms for the delta wave, so it will miss pre-excitation with a narrow-ish QRS and will falsely flag some LBBB/LVH with a short PR. AHA requires an actual delta wave.

*Source:* Minnesota Code 6-4-1/6-4-2, verbatim from ARIC Study Manual 5: Electrocardiography, Version 1.0, August 1987, Appendix A.

### R peak time (formerly 'intrinsicoid deflection') — the measurement convention the LBBB/RBBB/LAFB criteria depend on  `CLBBB, CRBBB, ILBBB, LAFB`

**Rule.** R peak time is the interval from the earliest onset of the QRS complex, preferably determined from multiple simultaneously recorded leads, to the peak (maximum) of the R wave, or of R' if present.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| R peak time — measurement definition | any named lead, but QRS onset taken globally | onset = earliest QRS onset across simultaneous leads; endpoint = peak of R (or R' if present) in the named lead | using the local (single-lead) QRS onset instead of the global onset systematically shortens R peak time and will flip borderline LBBB/LAFB calls |
| Normal upper limit, right ventricular | V1, V2 | <= 35 ms | none |
| Normal upper limit, left ventricular | V5, V6 | <= 45 ms | none |
| Values used in the block criteria | V5-V6 / V1 / aVL / V4-V6 | > 60 ms (CLBBB, V5-V6); > 50 ms (CRBBB, V1); >= 45 ms (LAFB, aVL); > 60 ms (ILBBB, V4-V6) | note the inequality is strict (>) everywhere except LAFB in aVL (>=) — reproduce this exactly |

**Not computable from samples.** None, but the peak must be located on a notched/slurred R where the 'peak' may be one of several local maxima; the convention is the maximum (and the R' peak when an R' exists). Sampling rate and any low-pass filtering shift the located peak.

**Guidelines disagree.** Minnesota Code calls the same quantity 'R peak duration' and applies it per-lead with a local onset and a >= 0.06 s threshold, versus AHA's global onset and > 60 ms. Same name, different number, different measurement — one of the easiest ways to teach something false.

*Source:* Definition quoted in Pérez-Riera AR, de Abreu LC, Barbosa-Barros R, Nikus KC, Baranchuk A. R-Peak Time: An Electrocardiographic Parameter with Multiple Clinical Applications. Ann Noninvasive Electrocardiol. 2016;21(1):10-19 (read directly, open access), reproducing the AHA/ACCF/HRS 2009 terminology recommendation that 'R peak time' replace 'intrinsicoid deflection'.

### Operational (computable) definition of mid-QRS notching and slurring  `CLBBB`

**Rule.** For automated strict-LBBB detection, a notch is a local peak/nadir pair within a defined mid-QRS window meeting joint height/width thresholds; a slur is a concavity in the first derivative meeting a duration threshold that scales with the amplitude ratio.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Notch time window within the QRS | I, aVL, V1, V2, V5, V6 | begins after the first 40 ms of the QRS but before 50% of QRS duration, and ends at approximately 2/3 through the QRS | requires reliable global QRS onset/offset |
| Notch height and width (joint thresholds, any one satisfied) | as above | height >= 75 uV with width >= 5 ms; OR height >= 50 uV with width >= 10 ms; OR height >= 30 uV with width >= 25 ms | noise-adaptive detection threshold 10-50 uV depending on measured noise |
| Slur detection via first derivative concavity, duration scaled by amplitude ratio H2/H1 | as above | H2/H1 > 8: duration > 10 ms; H2/H1 between 5 and 8: duration > 20 ms; H2/H1 between 3 and 5: duration > 40 ms | none |
| Signal quality requirement | all | validated on 1000 Hz signal-averaged ECGs | PTB-XL is 500 Hz (100 Hz downsampled variant also distributed) and not signal-averaged — expect degraded notch sensitivity and say so in the tool |
| Lead count for the strict-LBBB rule | among I, aVL, V1, V2, V5, V6 | >= 2 leads with a qualifying notch or slur | combined with QRS >= 140 ms (men) / >= 130 ms (women) and QS or rS in V1-V2 |

**Not computable from samples.** None — this entry exists precisely to make the guideline's unmeasurable 'notched or slurred' computable. But note these thresholds are one group's validated implementation, not a guideline standard; a different detector will produce a different LBBB prevalence.

**Guidelines disagree.** No guideline specifies notch/slur numerically. Two published automatic implementations (threshold-based vs wavelet-based) exist and do not agree case-by-case. Any tool that reports 'notching present' must disclose its detector.

*Source:* Xia X, Couderc J-P, Strauss DG, et al. Validation of an automatic diagnosis of strict left bundle branch block criteria using 12-lead electrocardiograms. Ann Noninvasive Electrocardiol. 2017;22 (read directly, open access via PMC). Independent alternative implementation: Martín-Yebra A, Martínez JP. Automatic diagnosis of strict left bundle branch block using a wavelet-based approach. PLoS ONE. 2019;14(2):e0212971.

### Bifascicular block (RBBB + LAFB, or RBBB + LPFB) and the 'trifascicular block' terminology problem  `CRBBB, LAFB, LPFB`

**Rule.** Report the components separately: complete RBBB coexisting with a fascicular block pattern. The 2009 statement discourages the aggregate terms.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Complete RBBB criteria AND LAFB criteria simultaneously | V1/V2 + I/V6 for RBBB; limb leads + aVL for LAFB | QRS >= 120 ms with rsR' in V1/V2 and wide S in I and V6, PLUS frontal axis -45 to -90 with qR and R peak time >= 45 ms in aVL | the LAFB 'QRS < 120 ms' criterion is waived when the widening is attributable to the RBBB — this is an interpretation, not a stated rule; FLAG |
| Complete RBBB criteria AND LPFB criteria simultaneously | V1/V2 + I/V6 for RBBB; limb leads for LPFB | RBBB pattern PLUS frontal axis +90 to +180 with rS in I/aVL and qR in III/aVF | adults only; RVH and lateral MI must be excluded |
| Minnesota encoding | n/a | code 7-8 = 7-7 (LAH) + 7-2 (RBBB) | Minnesota has no RBBB+LPFB code |

**Not computable from samples.** 'Trifascicular block' is not a measurable ECG entity: bifascicular block plus first-degree AV block does not localise the delay to the third fascicle (the PR prolongation may be nodal), and this cannot be resolved without an HV interval from an invasive study. Report the components (e.g. 'RBBB with LAFB and first-degree AV block') rather than the aggregate term.

**Guidelines disagree.** PTB-XL has no bifascicular label; such records will carry CRBBB plus LAFB (or LPFB) as co-occurring codes. Note also that the 2018 bradycardia guideline's practical rules key off HV interval >= 70 ms at EP study and off alternating bundle branch block — neither computable from one 10 s record.

*Source:* Component criteria: Surawicz B et al., Circulation. 2009;119:e235-e240, verified via Kusumoto FM et al., Heart Rhythm 2019;16:e227-e279 Table 3. Minnesota 7-8 verbatim from ARIC Manual 5 Appendix A. FLAG: the claim that the 2009 statement discourages the terms 'bifascicular block' and 'trifascicular block' could NOT be verified against the paywalled primary text — it appears only in secondary sources, and the 2018 ACC/AHA/HRS bradycardia guideline itself still uses 'bifascicular or trifascicular block' in its recommendations.

**Notes.** SOURCE-ACCESS CAVEAT, READ FIRST. The primary document the task centres on — Surawicz B, Childers R, Deal BJ, Gettes LS, AHA/ACCF/HRS Recommendations for the Standardization and Interpretation of the Electrocardiogram, Part III: Intraventricular Conduction Disturbances, Circulation 2009;119:e235-e240 (= J Am Coll Cardiol 2009;53:976-981, PMID 19228822) — is paywalled; ahajournals.org and jacc.org both returned HTTP 403 for the abstract, full text and PDF, and Semantic Scholar reports the record as CLOSED with no open-access PDF. I therefore verified its criteria against a verbatim reproduction inside another PRIMARY guideline: Table 3 ("Conduction tissue disease") of Kusumoto FM et al., 2018 ACC/AHA/HRS Guideline on the Evaluation and Management of Patients With Bradycardia and Cardiac Conduction Delay, Executive Summary, Heart Rhythm 2019;16:e227-e279 (open PDF hosted by HRS), which reproduces the complete/incomplete RBBB, complete/incomplete LBBB, nonspecific IVCD, LAFB and LPFB criteria in the 2009 wording. Where a criterion appears ONLY in secondary reproductions (ECGpedia, wikidoc, review articles) I have flagged it in the source field — chiefly: the pediatric QRS bands, the pre-excitation criteria, the RBBB "first 3 criteria" combination rule, and the terminology recommendations. If you want the 2009 tables reproduced verbatim in the product, obtain the PDF through an institutional subscription and re-check those flagged items.

WHAT I READ DIRECTLY (full text, not summaries): Kusumoto 2018 bradycardia guideline executive summary PDF (HRS); the 2021 ESC pacing/CRT guideline full PDF (Glikson M et al., Eur Heart J 2021;42:3427-3520); the Minnesota Code ventricular-conduction and AV-conduction sections verbatim from ARIC Study Manual 5: Electrocardiography, Version 1.0, August 1987, Appendix A (NHLBI/ARIC); and four open-access Annals of Noninvasive Electrocardiology / PMC papers (Pérez-Riera 2016 R-peak time; Pérez-Riera 2019 LBBB; Baranchuk 2015 rSr'; Xia 2017 automatic strict LBBB), plus Calle S et al., Neth Heart J 2022;30:495-498.

NOT VERIFIED AT ALL (cited but paywalled, flag to users): Willems JL et al., Criteria for intraventricular conduction disturbances and pre-excitation, WHO/ISFC Task Force, J Am Coll Cardiol 1985;5:1261-1275 — this is the direct predecessor the 2009 statement revised, and its Appendix reportedly states every criterion in formal Boolean logic, which would be the highest-value document for this project if you can get it. Also not verified: Rautaharju PM et al., The Novacode criteria for classification of ECG abnormalities, J Electrocardiol 1998;31:157-187 — I could not obtain any NOVACODE conduction-defect criteria from a primary source, so I have deliberately included NO NOVACODE thresholds rather than guess. Strauss 2011 (Am J Cardiol 107:927-934) is paywalled but its criteria were identical across four independent reproductions.

IMPLEMENTATION POINTS THAT MATTER MORE THAN THE THRESHOLDS THEMSELVES:
1. Measurement convention. AHA thresholds assume GLOBAL QRS duration (earliest onset to latest offset across simultaneously recorded leads) and a global QRS onset for R peak time. The Minnesota Code uses PER-LEAD durations in a majority of beats. The same recording will produce different labels under the two conventions, typically by 5-15 ms. Whatever you implement, display the convention next to the number.
2. Strict vs non-strict inequalities. AHA uses >= 120 ms for QRS but > 110 ms for IVCD, > 60 ms for R peak time in V5-V6, > 50 ms in V1, > 40 ms for S duration, and >= 45 ms for aVL R peak time. Several widely-circulated reproductions (including wikidoc) silently convert all of these to >=. At a 500 Hz sample rate one sample is 2 ms, so the boundary cases are real.
3. The 110-119 ms band is contested territory. AHA 2009 calls it incomplete LBBB/RBBB (with morphology) or nonspecific IVCD (without); Minnesota calls it normal unless it meets 7-6 (ILBBB, 100-119 ms) or 7-3 (IRBBB, no lower bound). Expect PTB-XL's ILBBB/IRBBB/IVCD labels to be noisy in this band.
4. Frontal-axis method dependence. The fascicular-block criteria hinge on an axis boundary (-45 for LAFB, +90 for LPFB). Axis computed from net QRS area, from peak amplitudes, or from the initial 40 ms of the QRS will differ by several degrees, which flips borderline cases. State the method.
5. Notching is the weak link. Neither AHA 2009, ESC 2013, ESC 2021 nor Strauss defines a notch numerically. Only the automated-detection literature does (Xia 2017 thresholds included above, validated on 1000 Hz signal-averaged ECGs — PTB-XL is 500 Hz, not averaged). Any tool claiming to apply Strauss or ESC 2021 criteria must disclose its notch detector and its sensitivity limits at 500 Hz.
6. Sex-specific thresholds exist in exactly one place in this family: the Strauss LBBB duration (>= 140 ms men, >= 130 ms women). AHA 2009 explicitly declined to set sex-specific QRS limits; ESC 2021 declined but noted modelling predicts 9-13 ms lower thresholds for women. There are no ancestry-specific thresholds anywhere in this family that I could verify. (Unlike the ST-elevation thresholds, where sex- and lead-specific values are formally in the guideline — that is Part VI, not Part III.)
7. PTB-XL SCP mapping. The relevant codes are CLBBB, ILBBB, CRBBB, IRBBB, LAFB, LPFB, IVCD and WPW, all in the CD superclass (subclasses CLBBB, ILBBB, CRBBB, IRBBB, LAFB/LPFB, IVCD, WPW). There is no bifascicular-block code — RBBB+LAFB records carry both codes. There is no code for short PR without delta wave (Minnesota 6-5), and WPW in PTB-XL necessarily means the pre-excitation PATTERN, not the syndrome, since the syndrome requires arrhythmia documentation that no ECG-derived label can supply.

## Myocardial infarction and Q waves (anterior, anteroseptal, anterolateral, inferior, lateral, posterior; pathological Q waves; poor R-wave progression)

### Pathological Q wave — the V2–V3 precordial rule (prior or silent/unrecognised MI). PTB-XL: QWAVE (form), ASMI/AMI (diagnostic), MI (superclass)  `QWAVE, ASMI, AMI, MI`

**Rule.** In the absence of LVH and LBBB, any Q wave in leads V2–V3 longer than 0.02 s, or a QS complex in leads V2–V3, counts as pathological. As written this rule carries no minimum depth and, unlike the general rule, states no explicit two-lead requirement.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Q wave duration (onset of QRS to the zero crossing of the initial negative deflection) | V2, V3 | > 0.02 s (> 20 ms) | None. Same threshold both sexes, all ages |
| QRS morphology: QS complex (entirely negative QRS, no R wave anywhere in the complex) | V2, V3 | presence = positive | A QS complex in lead V1 alone is explicitly normal and must not be coded |
| Minimum deflection amplitude for a negative deflection to be called a Q wave at all | all | ≥ 0.1 mV (≥ 1 mm) — Minnesota Code convention, not stated in UDMI | UDMI does not define a minimum detectable Q amplitude; the Minnesota Code does, and any implementation needs one |

**Not computable from samples.** 'In the absence of non-ischaemic causes' cannot be evaluated from samples: cardiomyopathy, Takotsubo, cardiac amyloidosis, myocarditis, acute cor pulmonale, hyperkalaemia are named as Q-wave mimics. Pre-excitation, LBBB, LAFB, LVH and RVH ARE computable from the same recording and should be run as gates. 'New' vs. pre-existing Q waves requires a prior tracing, which a single-record program does not have — so a program can only ever assert 'prior/indeterminate-age MI pattern', never 'new pathological Q waves' (which is what the type 1/4a/5 MI criteria actually require).

**Guidelines disagree.** The 2018 table prints '>0.02 s'; a large secondary literature quotes '≥0.02 s' (the wording of the 2007 second universal definition). I could not verify the 2007 wording against a primary full text — flagged. Second, the table and the narrative conflict: Table 3 makes any V2–V3 Q >0.02 s pathological on its own, while §30 of the same document says minor Q waves ≥0.02 s and <0.03 s that are ≥1 mm deep are merely 'suggestive of prior MI if accompanied by inverted T waves in the same lead group'. Third, Table 3 has no explicit contiguity requirement for this line, whereas the second line does. A teaching tool should show both readings rather than silently pick one.

*Source:* Thygesen K, Alpert JS, Jaffe AS, Chaitman BR, Bax JJ, Morrow DA, White HD; ESC/ACC/AHA/WHF Task Force. Fourth Universal Definition of Myocardial Infarction (2018). Circulation. 2018;138:e618–e651, Table 3 and §30–31. Co-published: Eur Heart J. 2019;40:237–269; J Am Coll Cardiol. 2018;72:2231–2264. Table 3 text verified verbatim from the Circulation typeset PDF.

### Pathological Q wave — the general two-contiguous-lead rule. PTB-XL: QWAVE, and territory codes ASMI/AMI/ALMI/LMI/IMI/ILMI depending on which grouping fires  `QWAVE, AMI, ASMI, ALMI, LMI, IMI, ILMI, MI`

**Rule.** In the absence of LVH and LBBB: a Q wave ≥0.03 s AND ≥1 mm deep, or a QS complex, in leads I, II, aVL, aVF or V4–V6, present in any two leads of one contiguous lead grouping — the groupings being (I, aVL), (V1–V6), and (II, III, aVF). The identical criteria are applied to supplemental posterior leads V7–V9.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Q wave duration | I, II, aVL, aVF, V4, V5, V6 (and V7, V8, V9) | ≥ 0.03 s (≥ 30 ms) | No sex, age or ancestry qualifier stated |
| Q wave depth (amplitude of the initial negative deflection) | I, II, aVL, aVF, V4, V5, V6 (and V7–V9) | ≥ 1 mm (≥ 0.1 mV) | None |
| QRS morphology: QS complex, as an alternative to the duration+depth pair | I, II, aVL, aVF, V4–V6 (and V7–V9) | presence = positive | Not lead V1, where QS is normal |
| Count of qualifying leads within a single contiguous grouping | grouping 1 = {I, aVL}; grouping 2 = {V1, V2, V3, V4, V5, V6}; grouping 3 = {II, III, aVF} | ≥ 2 leads in the same grouping | Grouping 1 has only two members, so a lateral (I/aVL) call requires both |
| Q wave duration threshold that raises specificity | any | > 0.04 s (> 40 ms) | Narrative, not table: 'specificity … is greatest when Q waves occur in several leads or lead groupings, or are >0.04 s' |

**Not computable from samples.** Same non-ischaemic-cause exclusion as above. Note the gate conditions 'absence of LVH' and 'absence of LBBB' ARE computable (voltage criteria, QRS duration ≥120 ms with LBBB morphology) and must be implemented as suppressors, mirroring Minnesota Code's own suppression rules.

**Guidelines disagree.** The qualifying-lead list and the grouping list do not line up, and this is a real implementation hazard: lead III appears in grouping 3 but is NOT in the qualifying-lead list (I, II, aVL, aVF, V4–V6), so a textbook inferior MI with deep Q waves in III and aVF technically satisfies the rule only via aVF plus II; and V1–V3 appear in grouping 2 but are not qualifying leads for the ≥0.03 s rule (V2–V3 have their own >0.02 s rule, V1 has none). The document never states whether a V2 Q of 0.025 s and a V4 Q of 0.035 s together constitute 'two leads of a contiguous lead grouping'. Separately, the 2007 second universal definition used the groupings (I, aVL, V6; V4–V6; II, III, aVF) — i.e. V6 sat in the lateral group and V1–V3 were in no group — which is a different partition from the 2012/2018 (I, aVL; V1–V6; II, III, aVF). I could not verify the 2007 text against a primary source; flagged as unconfirmed. Finally, the Minnesota Code partitions the same 12 leads into three entirely different 'sites' with different thresholds (see the Minnesota Code entry); MC and UDMI Q-wave calls are not interchangeable.

*Source:* Fourth Universal Definition of Myocardial Infarction (2018), Circulation. 2018;138:e618–e651, Table 3 (verbatim). Contiguity concept also in Wagner GS, Macfarlane P, Wellens H, et al. AHA/ACCF/HRS Recommendations for the Standardization and Interpretation of the Electrocardiogram, Part VI: Acute Ischemia/Infarction. Circulation. 2009;119:e262–e270 (also J Am Coll Cardiol. 2009;53:1003–1011).

### Posterior (inferobasal) MI / lateral MI — the R-wave 'Q-wave equivalent' in V1–V2. PTB-XL: PMI, IPMI, IPLMI, and arguably LMI  `PMI, IPMI, IPLMI, LMI, ILMI, MI`

**Rule.** An R wave longer than 0.04 s in V1–V2 together with an R/S amplitude ratio greater than 1 and a concordant (upright) T wave, in the absence of a conduction defect, is the mirror image of a pathological Q wave recorded from the opposite wall and indicates prior posterior/inferobasal (by CMR: lateral) infarction.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| R wave duration (QRS onset to the first zero crossing after the initial positive deflection) | V1, V2 | > 0.04 s (> 40 ms) | None stated |
| R/S amplitude ratio | V1, V2 | > 1 | None stated |
| T wave polarity in the same lead (concordance with the dominant R) | V1, V2 | positive T wave required | None |
| Classical (Perloff) form of the same criterion | V1 only | R/S ratio > 1 and R duration > 40 ms | Original 1964 formulation; single lead, not V1 AND V2 |
| CMR-validated alternative with higher sensitivity (Bayés de Luna 2008) | V1 | R/S ≥ 0.5, or R amplitude > 3 mm (0.3 mV); each gave sensitivity 73.3%, specificity 93.3% | Derived in first inferior (n=15), lateral (n=9) and inferolateral (n=21) MI vs contrast-enhanced CMR; abstract-level verification only |
| Direct posterior recording, when V7–V9 are available | V7, V8, V9 | same pathological-Q criteria as the general rule (Q ≥0.03 s and ≥1 mm, or QS), 2 contiguous leads | UDMI 2018 Table 3 footnote |
| Conduction-defect exclusion (computable) | all | QRS duration ≥ 120 ms, or RBBB/incomplete RBBB morphology, or WPW/short PR with delta wave | Must suppress the call |

**Not computable from samples.** RVH and the normal-variant dominant R in V1 (young thin adults, counterclockwise rotation, high/misplaced V1–V2 electrodes) produce the same numbers and are not separable from posterior MI on samples alone. Lead-placement error in particular is undetectable from the signal.

**Guidelines disagree.** Three live disagreements. (1) Lead requirement: UDMI 2018 writes 'V1–V2', implying both; Perloff's original and the 2008 CMR revalidation use V1 alone. (2) Threshold: R/S >1 (UDMI/Perloff, high specificity, low sensitivity) vs R/S ≥0.5 or R >3 mm in V1 (Bayés de Luna 2008). (3) Naming and anatomy: AHA/ACCF/HRS Part VI (Wagner 2009) explicitly recommends RETAINING the term 'posterior' for ST depression in V1–V2 and subsequent broad R waves, and explicitly declines to adopt the ISHNE recommendation; ISHNE (Bayés de Luna et al., Circulation 2006;114:1755–1760) states, on CMR evidence, that a prominent R in V1–V2 reflects the LATERAL wall and that 'posterior' should be replaced by lateral/inferolateral/basal-lateral; UDMI 2018 splits the difference, calling it 'inferobasal myocardial ischaemia (previously termed posterior infarction)'. PTB-XL keeps PMI/IPMI/IPLMI. Also note the strict-inequality drift: the 2007 definition reportedly used R ≥0.04 s and R/S ≥1, the 2012/2018 use >; only the 2018 form was verified here.

*Source:* Fourth Universal Definition of Myocardial Infarction (2018), Circulation. 2018;138:e618–e651, Table 3 (verbatim). Original criterion: Perloff JK. The recognition of strictly posterior myocardial infarction by conventional scalar electrocardiography. Circulation. 1964;30:706–718 (quoted as 'R/S ratio >1 and R-wave duration >40 ms in lead V1' in Bayés de Luna A, Wagner G, Birnbaum Y, et al., Circulation. 2006;114:1755–1760). Revised criteria: Bayés de Luna A, Cino J, Goldwasser D, et al. New electrocardiographic diagnostic criteria for the pathologic R waves in leads V1 and V2 of anatomically lateral myocardial infarction. J Electrocardiol. 2008;41:413–418.

### Minor Q waves with concordant T-wave inversion — a likelihood modifier, not a diagnosis. PTB-XL: QWAVE plus INVT/NDT  `QWAVE, INVT, NDT, MI`

**Rule.** Minor Q waves ≥0.02 s and <0.03 s that are ≥1 mm deep are suggestive of prior MI if accompanied by inverted T waves in the same lead group. When Q waves are associated with ST deviation or T-wave change in the same leads, the likelihood of MI is increased.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Q wave duration | any of the qualifying leads (I, II, aVL, aVF, V4–V6) | ≥ 0.02 s and < 0.03 s | None |
| Q wave depth | same lead | ≥ 1 mm (≥ 0.1 mV) | None |
| T wave polarity in the same lead group | the same grouping — (I, aVL), (V1–V6) or (II, III, aVF) | inverted (negative T amplitude) | 'Same lead group', not necessarily the same lead |

**Not computable from samples.** Nothing structural, but the output is explicitly probabilistic ('suggestive'), so a program must not emit an MI diagnosis on this alone.

**Guidelines disagree.** This sub-threshold band overlaps the Minnesota Code's 'moderate' and 'minor' Q categories (MC 1-2-x, 1-3-x) but the MC assigns them without requiring T-wave inversion, and NOVACODE handles the same overlap by requiring a Q score ≥15 plus an ST-depression or T-negative score ≥20 (NOVACODE 5.4). Three schemes, three different ways of combining a minor Q with repolarisation change.

*Source:* Fourth Universal Definition of Myocardial Infarction (2018), Circulation. 2018;138:e618–e651, §30 (narrative, verbatim).

### Normal / non-pathological Q waves — the exclusions any Q-wave detector must implement. PTB-XL: NORM (these must not trigger QWAVE-based MI codes)  `NORM, QWAVE`

**Rule.** A QS complex in lead V1 is normal. A Q wave <0.03 s and <0.25 of the R-wave amplitude in lead III is normal if the frontal QRS axis is between −30° and 0°. A Q wave may also be normal in aVL if the frontal QRS axis is between 60° and 90°. Septal Q waves are small, non-pathological Q waves <0.03 s and <0.25 of the R-wave amplitude in leads I, aVL, aVF and V4–V6.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| QS morphology in V1 | V1 | normal — never code | None |
| Q duration AND Q/R amplitude ratio in lead III, conditioned on frontal axis | III | Q < 0.03 s AND Q/R < 0.25, with frontal QRS axis in [−30°, 0°] | Axis-dependent |
| Q wave in aVL conditioned on frontal axis | aVL | may be normal when frontal QRS axis in [60°, 90°] | Axis-dependent; no duration/ratio stated for this one |
| Septal Q wave | I, aVL, aVF, V4, V5, V6 | Q < 0.03 s AND Q/R amplitude ratio < 0.25 | None |

**Not computable from samples.** None — all four are directly computable, provided the frontal QRS axis is computed the same way the guideline assumes (mean QRS axis from the limb leads).

**Guidelines disagree.** Q/R ratio cut-points differ across systems and must not be mixed. UDMI uses 0.25 as the ceiling for a 'normal septal Q'. The Minnesota Code uses ≥1/3 (0.333) for its major/moderate amplitude criteria and ≥1/5 (0.20) for its minor criteria. A Q/R of 0.28 is therefore 'not a normal septal Q' by UDMI, but does not even reach the MC minor threshold in the leads where MC uses 1/3, while it does exceed MC's 1/5 minor cut. Note also that UDMI's confounder list (pre-excitation, cardiomyopathy, Takotsubo, amyloidosis, LBBB, left anterior hemiblock, LVH, RVH, myocarditis, acute cor pulmonale, hyperkalaemia) is broader than the Minnesota Code's coded suppressions (WPW 6-4-1, 6-8, 8-2-1; LBBB 7-1-1; RBBB 7-2-1; etc.).

*Source:* Fourth Universal Definition of Myocardial Infarction (2018), Circulation. 2018;138:e618–e651, §31 'Conditions that confound the electrocardiographic diagnosis of myocardial infarction' (verbatim).

### Anteroseptal infarction territory — lead assignment. PTB-XL: ASMI (diagnostic subclass AMI)  `ASMI, AMI, MI, QWAVE`

**Rule.** Q waves or QS complexes confined to the right precordial leads. Classically V1–V2 (± V3): 'the presence of abnormal Q waves in leads V1 and V2 was related to septal wall MI'. Under UDMI the qualifying tests are the V2–V3 rule (Q >0.02 s or QS) plus the two-lead contiguity requirement inside the V1–V6 grouping; a QS in V1 alone does not count.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Q duration / QS presence | V1, V2, V3 | Q > 0.02 s or QS in V2 and/or V3; V1 QS excluded as normal | None |
| Contiguity | within {V1…V6} | ≥ 2 leads | None |
| Minnesota Code equivalent (anterior site) | V1–V5 | MC 1-1-2: Q ≥0.04 s in any of V1–V5; MC 1-2-7: QS in all of V1, V2, V3; MC 1-3-2: QS in V1 and V2 (suppressed by 3-1 or 7-1-1) | MC has no separate 'septal' site — V1–V5 is one 'anterior' site |

**Not computable from samples.** Anatomical attribution. The label 'anteroseptal' is an inference about myocardium, not a measurement; a program can only report the lead set.

**Guidelines disagree.** Substantial. The ISHNE/CMR statement finds that Q waves confined to V1–V2 correspond to the septal wall plus a small part of the adjacent anterior wall (occlusion of septal branches or of the LAD distal to the diagonals), and that patterns historically read as 'anteroseptal' frequently represent apical-anterior infarction; the group recommends naming infarcts septal / mid-anterior / apical-anterior / extensive anterior rather than anteroseptal. PTB-XL nonetheless codes ASMI. The safest engineering position is to treat ASMI as a lead-set label (V1–V3) and to say so.

*Source:* Fourth Universal Definition of Myocardial Infarction (2018), Circulation. 2018;138:e618–e651, Table 3. Classical lead-to-wall assignment recited in Bayés de Luna A, Wagner G, Birnbaum Y, Nikus K, Fiol M, Gorgels A, Cinca J, Clemmensen PM, Pahlm O, Sclarovsky S, Stern S, Wellens H, Zareba W; ISHNE. A new terminology for left ventricular walls and location of myocardial infarcts that present Q wave based on the standard of cardiac magnetic resonance imaging. Circulation. 2006;114:1755–1760.

### Anterior infarction territory — lead assignment. PTB-XL: AMI  `AMI, MI, QWAVE`

**Rule.** Q waves in the mid-precordial leads. Classically V3–V4 ('in V3 and V4 to anterior wall MI'); the CMR-based equivalent is 'apical-anterior MI': abnormal Q waves extending into V3 and V4 and sometimes V5–V6, with no abnormal Q in I or aVL, usually mid-LAD occlusion.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Q duration and depth | V3 (>0.02 s rule), V4 (≥0.03 s and ≥1 mm, or QS) | V3: Q > 0.02 s or QS; V4: Q ≥ 0.03 s AND ≥ 1 mm, or QS | Two different thresholds inside one territory — V3 falls under the V2–V3 rule, V4 under the general rule |
| Absence of a lateral component (distinguishes AMI from ALMI / extensive anterior) | I, aVL | no pathological Q in I or aVL | CMR-based definition of apical-anterior MI |
| Contiguity | within {V1…V6} | ≥ 2 leads | None |

**Not computable from samples.** Culprit-vessel attribution (mid-LAD) is not computable from the QRS alone.

**Guidelines disagree.** The classical scheme (V3–V4 = anterior wall) and the CMR scheme (V3–V4 = apex with extension into anterior and septal walls, explicitly not the lateral wall) label the same lead pattern differently. Neither changes what the program measures; both change what it should be allowed to claim.

*Source:* Fourth Universal Definition of Myocardial Infarction (2018), Circulation. 2018;138:e618–e651, Table 3; Bayés de Luna A, Wagner G, Birnbaum Y, et al. Circulation. 2006;114:1755–1760 (ISHNE statement, 'Apical-Anterior Myocardial Infarction').

### Anterolateral / extensive anterior infarction territory. PTB-XL: ALMI (diagnostic subclass AMI)  `ALMI, AMI, MI, QWAVE`

**Rule.** Pathological Q waves spanning the precordial leads together with the high-lateral limb leads. Classically Q in V3–V6 plus I and/or aVL. The CMR-based 'extensive anterior MI' is defined as abnormal Q waves in the precordial leads AND in aVL, sometimes I — proximal LAD occlusion above both the first septal and first diagonal branches.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Q duration and depth in precordial leads | V3, V4, V5, V6 | V3: Q > 0.02 s or QS; V4–V6: Q ≥ 0.03 s AND ≥ 1 mm, or QS | None |
| Q duration and depth in high-lateral limb leads | I, aVL | Q ≥ 0.03 s AND ≥ 1 mm, or QS, in BOTH (grouping {I, aVL} has only two members) | Q in aVL may be normal if frontal QRS axis is 60°–90° |
| Acute-phase counterpart (proximal LAD occlusion pattern, Wagner Part VI) | ST elevation in I, aVL, V1–V4 (± V6) with ST depression in II, III, aVF | standard J-point thresholds (see ST-elevation entry) | Wagner Part VI recommends that automated interpretation call this 'extensive anterior wall or anterobasal ischaemia/infarction due to proximal LAD occlusion' |

**Not computable from samples.** Nothing beyond the general non-ischaemic-cause exclusion; the vessel-level statement is an inference the guideline itself sanctions from lead patterns, not a measurement.

**Guidelines disagree.** The ISHNE CMR statement separates 'mid-anterior MI' (Q in aVL and sometimes I, but NOT in V5–V6; first-diagonal occlusion) from the classical 'high lateral MI' label, and states explicitly that abnormal Q in aVL and I without a Q in V6 should be called mid-anterior wall MI, not high lateral MI. So the same I/aVL Q waves are 'high lateral' in the classical scheme (and would push a classifier toward LMI/ALMI) and 'mid-anterior' in the CMR scheme. PTB-XL has no mid-anterior code.

*Source:* Fourth Universal Definition of Myocardial Infarction (2018), Circulation. 2018;138:e618–e651, Table 3; Wagner GS, et al. AHA/ACCF/HRS … Part VI: Acute Ischemia/Infarction. Circulation. 2009;119:e262–e270 (Recommendations 3 and 4 under 'Correlation of ST-Segment Elevation and Depression to the Region Involved'); Bayés de Luna A, et al. Circulation. 2006;114:1755–1760.

### Lateral infarction territory. PTB-XL: LMI  `LMI, MI, QWAVE`

**Rule.** Pathological Q waves in I, aVL and/or V5–V6, and/or the Q-wave equivalent of abnormally prominent R waves in V1–V2. CMR correlate: infarction of the lateral wall, from occlusion of a non-dominant LCx or its marginal branch.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Q duration and depth | I, aVL, V5, V6 | Q ≥ 0.03 s AND ≥ 1 mm, or QS | Two leads of one grouping required: {I, aVL} or two of {V1…V6} |
| R-wave equivalent (see the posterior/lateral entry for full thresholds) | V1, V2 | R > 0.04 s with R/S > 1 and upright T (UDMI), or R/S ≥ 0.5 / R > 3 mm in V1 (Bayés de Luna 2008) | None |
| Minnesota Code equivalent (anterolateral site) | I, aVL, V6 | MC 1-1-1: Q/R ≥ 1/3 plus Q ≥ 0.03 s in I or V6; MC 1-1-2: Q ≥ 0.04 s in I or V6; MC 1-1-3: Q ≥ 0.04 s plus R ≥ 3 mm in aVL | MC's aVL codes carry an R-amplitude precondition that UDMI does not have |

**Not computable from samples.** Nothing structural beyond the standard exclusions.

**Guidelines disagree.** The whole 'lateral' label is contested territory. ISHNE 2006 moves the prominent-R-in-V1/V2 pattern INTO 'lateral' (away from 'posterior') and simultaneously moves the isolated I/aVL Q-wave pattern OUT of 'high lateral' (into 'mid-anterior'). AHA/ACCF/HRS Part VI 2009 declines both moves for the R-wave pattern and keeps 'posterior'. PTB-XL's LMI has no stated lead definition, so any mapping is a modelling choice that should be documented, not asserted.

*Source:* Fourth Universal Definition of Myocardial Infarction (2018), Circulation. 2018;138:e618–e651, Table 3; Bayés de Luna A, et al. Circulation. 2006;114:1755–1760 ('Lateral Myocardial Infarction'); Minnesota Code 1, Anterolateral Site (Prineas RJ, Crow RS, Blackburn HW. The Minnesota Code Manual of Electrocardiographic Findings. Boston: J Wright; 1982), as published by the EPICARE Center, Wake Forest School of Medicine.

### Inferior infarction territory. PTB-XL: IMI (diagnostic subclass IMI)  `IMI, MI, QWAVE`

**Rule.** Pathological Q waves in the inferior leads II, III and aVF — two leads of the (II, III, aVF) grouping — without increased R waves in V1–V2 (which would make it inferolateral/inferoposterior). Usually occlusion of the dominant vessel supplying the posterior descending artery (RCA ≈90%, LCx ≈10%).

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Q duration and depth | II, aVF (and III, see disagreement) | Q ≥ 0.03 s AND ≥ 1 mm, or QS | Q in III <0.03 s and <0.25 of R amplitude is normal when the frontal QRS axis is between −30° and 0° |
| Contiguity | {II, III, aVF} | ≥ 2 leads | None |
| Absence of a posterior/lateral component (separates IMI from ILMI/IPMI/IPLMI) | V1, V2 | R not > 0.04 s and R/S not > 1 | None |
| Minnesota Code equivalent (site labelled 'Posterior (inferior)') | II, III, aVF | 1-1-1: Q/R ≥ 1/3 plus Q ≥ 0.03 s in II; 1-1-2: Q ≥ 0.04 s in II; 1-1-4: Q ≥ 0.05 s in III plus Q > 1.0 mm in the majority of beats in aVF; 1-1-5: Q ≥ 0.05 s in aVF | MC demands a much longer Q in lead III (0.05 s major, 0.04–0.05 s moderate, 0.03–0.04 s minor) than in lead II, precisely because Q in III is so often benign |
| Acute-phase adjunct: right ventricular involvement | V3R, V4R | ST elevation ≥ 0.5 mm (≥ 1 mm in men < 30 years) | UDMI 2018 §28; Wagner Part VI recommends prompting for V3R/V4R whenever ST elevation > 0.1 mV is present in II, III and aVF |

**Not computable from samples.** Dominance of the culprit vessel; RCA vs LCx discrimination is only probabilistic even with the ST-vector rules (III > II elevation with I/aVL depression favours RCA).

**Guidelines disagree.** Lead III is inside the UDMI contiguous grouping (II, III, aVF) but is absent from UDMI's qualifying-lead list (I, II, aVL, aVF, V4–V6) — so a strict reading of Table 3 will not let a Q wave in III contribute at all, which is clinically wrong and almost certainly a drafting artefact. The Minnesota Code, by contrast, gives lead III its own, much stricter duration ladder and requires a corroborating Q ≥1.0 mm in aVF in the majority of beats. Also note the Minnesota Code still calls this the 'posterior (inferior)' site — archaic nomenclature that will confuse anyone cross-reading MC output against PTB-XL's IMI/PMI split.

*Source:* Fourth Universal Definition of Myocardial Infarction (2018), Circulation. 2018;138:e618–e651, Table 3 and §28; Wagner GS, et al. Circulation. 2009;119:e262–e270; Minnesota Code 1, 'Posterior (inferior) Site' (Prineas/Crow/Blackburn 1982, EPICARE publication); Bayés de Luna A, et al. Circulation. 2006;114:1755–1760.

### Posterior infarction as a standalone territory, and the posterior leads. PTB-XL: PMI  `PMI, IPMI, IPLMI, MI`

**Rule.** Direct evidence: pathological Q waves meeting the standard criteria in supplemental leads V7–V9 (V7 left posterior axillary line, V8 left midscapular line, V9 left paraspinal border, all at the fifth intercostal space). Indirect evidence on the standard 12 leads: the mirror-image R-wave criterion in V1–V2, and, acutely, ST depression in V1–V3 with an upright terminal T wave.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Q duration and depth in posterior leads | V7, V8, V9 | Q ≥ 0.03 s AND ≥ 1 mm, or QS, in 2 contiguous leads | UDMI 2018 Table 3 footnote: 'The same criteria are used for supplemental leads V7–V9' |
| Acute ST elevation in posterior leads | V7, V8, V9 | ≥ 0.5 mm (0.05 mV); specificity increased at ≥ 1 mm, and ≥ 1 mm should be used in men < 40 years | Age- and sex-qualified in UDMI 2018 |
| Indirect acute sign on the standard leads | V1, V2, V3 | isolated ST depression ≥ 0.5 mm, especially with a positive terminal T wave | UDMI calls this an ST-elevation equivalent but explicitly 'non-specific' |
| Chronic mirror sign | V1, V2 | R > 0.04 s and R/S > 1 with concordant positive T | See the dedicated entry |

**Not computable from samples.** V7–V9 are not present in a standard 12-lead record, so for a 12-lead-only program every direct posterior criterion is unevaluable and only the V1–V3 mirror signs are computable. PTB-XL is a 12-lead dataset, so PMI labels in it necessarily rest on mirror criteria, not on V7–V9.

**Guidelines disagree.** Direct numerical conflict on the V7–V9 threshold. AHA/ACCF/HRS Part VI (2009) Recommendation 5 states flatly: 'For men and women, the threshold value for abnormal J-point elevation in V7 through V9 should be 0.05 mV (0.5 mm)' — no age or sex exception. UDMI 2018 §28 says 0.5 mm is recommended but '≥1 mm ST-elevation … should be used in men <40 years old'. Both are current, and they disagree for men under 40. Separately, on whether the entity should be called 'posterior' at all, Part VI and ISHNE 2006 are in open, documented disagreement (Part VI: 'the current ECG terminology of posterior be retained'; ISHNE: replace with lateral/inferolateral/basal-lateral).

*Source:* Fourth Universal Definition of Myocardial Infarction (2018), Circulation. 2018;138:e618–e651, §28 and Table 3 (verbatim); Wagner GS, et al. Circulation. 2009;119:e262–e270 (V7–V9 threshold recommendation).

### Combined inferior territories — inferolateral, inferoposterior, inferoposterolateral. PTB-XL: ILMI, IPMI, IPLMI  `ILMI, IPMI, IPLMI, IMI, MI`

**Rule.** Simultaneous satisfaction of the inferior criteria and of the lateral and/or posterior criteria. ISHNE: 'When the RCA or LCX is very dominant and the occlusion is proximal, the infarction encompasses both the inferior and the lateral wall, and then the ECG pattern is the association of criteria of inferior and lateral MI (inferolateral MI).'

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Inferior component | {II, III, aVF} | ≥ 2 leads with Q ≥ 0.03 s and ≥ 1 mm, or QS | None |
| Lateral component | {I, aVL} both, or ≥ 2 of {V5, V6} with a precordial partner | Q ≥ 0.03 s and ≥ 1 mm, or QS | None |
| Posterior component | V1, V2 (mirror) or V7–V9 (direct) | R > 0.04 s and R/S > 1 with upright T; or V7–V9 Q ≥ 0.03 s and ≥ 1 mm | None |

**Not computable from samples.** The distinction between IPMI and ILMI is precisely the distinction that the ISHNE/CMR work says the surface ECG cannot make reliably — the same V1–V2 R-wave pattern is called 'posterior' by one convention and 'lateral' by the other. There is no additional measurement that separates them.

**Guidelines disagree.** PTB-XL carries ILMI, IPMI and IPLMI as three separate codes, but the primary literature offers no measurement that distinguishes the 'posterior' component from the 'lateral' component — the two labels are applied to the same V1–V2 findings by different conventions. Any classifier trained to separate ILMI from IPMI is learning annotator convention, not physiology, and a teaching tool should say so.

*Source:* Fourth Universal Definition of Myocardial Infarction (2018), Circulation. 2018;138:e618–e651, Table 3; Bayés de Luna A, Wagner G, Birnbaum Y, et al. Circulation. 2006;114:1755–1760 ('Inferior Infarction' section, verbatim).

### Acute ischaemia / injury — ST-elevation thresholds at the J point. PTB-XL: STE_, INJAS, INJAL, INJLA, INJIN, INJIL  `STE_, INJAS, INJAL, INJLA, INJIN, INJIL, MI`

**Rule.** In the absence of LVH and bundle branch block: new ST elevation at the J point in 2 contiguous leads, with the cut-point ≥1 mm in all leads other than V2–V3, where sex- and age-specific cut-points apply. Measure the J point using QRS onset as the reference; with a stable baseline the TP segment is more accurate, but QRS onset is what the guideline recommends.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| J-point elevation | V2, V3 | ≥ 2 mm (0.2 mV) | Men ≥ 40 years |
| J-point elevation | V2, V3 | ≥ 2.5 mm (0.25 mV) | Men < 40 years |
| J-point elevation | V2, V3 | ≥ 1.5 mm (0.15 mV) | Women, regardless of age |
| J-point elevation | I, II, III, aVR, aVL, aVF, V1, V4, V5, V6 | ≥ 1 mm (0.1 mV) | Both sexes, all ages |
| J-point elevation, serial comparison | V2, V3 | ≥ 1 mm increase versus a prior ECG | Applies only when a prior tracing exists |
| Contiguity | any | ≥ 2 contiguous leads | Worked example in the source: ≥2 mm in V2 with ≥1 mm in V1 satisfies the pair in a man ≥40 |
| J-point elevation, right precordial | V3R, V4R | ≥ 0.5 mm (0.05 mV); ≥ 1 mm (0.1 mV) in men < 30 years (UDMI) / males < 30 years (Wagner) | Age- and sex-qualified |
| J-point elevation, posterior | V7, V8, V9 | ≥ 0.5 mm (0.05 mV); UDMI adds ≥ 1 mm for men < 40 years | See disagreement |
| Multivessel / left main pattern | ST depression across many leads with elevation in aVR and/or V1 | UDMI 2018: ST depression ≥ 1 mm in 6 leads plus ST elevation in aVR or V1. Wagner 2009: ST depression > 0.1 mV in 8 or more leads plus ST elevation in aVR and/or V1 | None |
| Reference point for the measurement | all | QRS onset is the reference; J point = junction between QRS termination and ST onset | UDMI Figure 8; TP segment is more accurate only with a stable baseline |

**Not computable from samples.** 'New, or presumed new' cannot be established without a prior tracing. The guideline's own caveat — that lesser degrees of ST displacement can also represent ischaemia, and that 'in patients with known or high likelihood of CAD, the clinical presentation is critical to enhance the specificity of these findings' — is clinical, not computable. Distinguishing ischaemic ST elevation from pericarditis, early repolarisation, Brugada, Takotsubo or LVH strain is only partly computable.

**Guidelines disagree.** (1) V7–V9: Wagner Part VI gives a flat 0.05 mV for men and women; UDMI 2018 adds a ≥1 mm requirement for men <40. (2) Multivessel/left-main pattern: 6 leads of ST depression (UDMI 2018) vs 8 or more leads (Wagner 2009). (3) The pre-2009 standard, quoted inside Part VI itself, was >0.2 mV in V1, V2 AND V3 and >0.1 mV elsewhere; the 2009/2018 documents drop V1 to 0.1 mV. (4) The 2013 ACCF/AHA STEMI guideline is widely cited as using ≥2 mm in men with no <40 age split — I did not verify that against the primary text this session, so treat it as unconfirmed. (5) The ISE/ISHNE counterpoint paper (Birnbaum Y, Fiol M, Nikus K, Garcia Niebla J, Bacharova L, Dubner S, Zareba W, Macfarlane PW, Ribeiro AL, Cygankiewicz I, Bayés de Luna A. Ann Noninvasive Electrocardiol. 2020;25:e12786; J Electrocardiol. 2020) argues the Table 2 cut-points 'should probably be limited to patients with narrow QRS and without voltage criteria for LVH', and disputes the document's characterisation of ST elevation as typically convex.

*Source:* Fourth Universal Definition of Myocardial Infarction (2018), Circulation. 2018;138:e618–e651, Table 2, §27–28 (verbatim); Wagner GS, Macfarlane P, Wellens H, Josephson M, Gorgels A, Mirvis DM, Pahlm O, Surawicz B, Kligfield P, Childers R, Gettes LS. AHA/ACCF/HRS … Part VI: Acute Ischemia/Infarction. Circulation. 2009;119:e262–e270 (also J Am Coll Cardiol. 2009;53:1003–1011), 'Threshold Values for ST-Segment Changes', Recommendations 1–6 (verbatim).

### Acute ischaemia — ST-depression and T-wave inversion thresholds. PTB-XL: STD_, ISC_, ISCAL, ISCAS, ISCAN, ISCIN, ISCIL, ISCLA, NST_, INVT  `STD_, ISC_, ISCAL, ISCAS, ISCAN, ISCIN, ISCIL, ISCLA, NST_, INVT, NDT`

**Rule.** New horizontal or downsloping ST depression ≥0.5 mm in 2 contiguous leads, and/or T inversion >1 mm in 2 contiguous leads with a prominent R wave or R/S ratio >1.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| ST depression at the J point, horizontal or downsloping morphology only | any, 2 contiguous | ≥ 0.5 mm (0.05 mV) | UDMI 2018 Table 2 — no lead, sex or age split |
| ST-segment slope classification (needed to exclude upsloping depression) | any | horizontal or downsloping; upsloping excluded from this criterion | Requires a slope estimate, e.g. J to J+80 ms |
| T-wave inversion depth | any, 2 contiguous | > 1 mm (0.1 mV) | Only counts in leads with a prominent R wave or R/S ratio > 1 |
| J-point depression, Wagner Part VI formulation | V2, V3 | ≥ 0.05 mV (0.5 mm) depression | Men and women, all ages |
| J-point depression, Wagner Part VI formulation | all leads other than V2, V3 | ≥ 0.1 mV (1 mm) depression | Men and women, all ages |
| Upsloping ST depression as an LAD-occlusion marker | precordial leads | > 1 mm at the J point, with tall symmetrical T waves and ST elevation > 1 mm in aVR | UDMI 2018 §27; associated with significant LAD occlusion |
| Deep anterior T inversion (post-ischaemic / Wellens-type) | V2, V3, V4 (occasionally V5) | > 0.5 mV inverted T with QT prolongation (Wagner Part VI); > 2 mm symmetrical inversion (UDMI) | Two documents, two thresholds |

**Not computable from samples.** 'New' requires a prior tracing. The counterpoint paper's point that 'T wave inversion in leads with an isoelectric ST segment does not occur with acute ischemia — it can be seen in the subacute phase or after reperfusion' is a temporal claim a single record cannot make.

**Guidelines disagree.** Direct numerical conflict for the limb leads and V1/V4–V6: UDMI 2018 uses ≥0.5 mm ST depression in every lead, while AHA/ACCF/HRS Part VI 2009 sets the abnormal J-point depression threshold at 0.1 mV (1 mm) everywhere except V2–V3 (0.05 mV). A tracing with 0.7 mm of inferior ST depression is abnormal under UDMI and normal under Part VI. Both documents are current and neither has been withdrawn. Also: the deep-anterior-T-inversion threshold is >0.5 mV in Part VI and >2 mm in UDMI. And PTB-XL's INJxx codes are described as 'ischemic ST-T changes compatible with subendocardial injury in <region> leads', where subendocardial injury classically denotes ST DEPRESSION — yet the codes sit in PTB-XL's MI superclass alongside the Q-wave infarct codes; confirm which pattern the annotators meant before mapping INJxx to an ST-elevation rule.

*Source:* Fourth Universal Definition of Myocardial Infarction (2018), Circulation. 2018;138:e618–e651, Table 2 and §27 (verbatim); Wagner GS, et al. Circulation. 2009;119:e262–e270, 'Threshold Values for ST-Segment Changes' Recommendation 6 and 'Postischemic T-Wave Changes' (verbatim).

### MI diagnosis in the presence of conduction disturbance or pacing — the confounder gate. PTB-XL: CLBBB, CRBBB, ILBBB, IRBBB, IVCD, WPW, PACE, LVH  `CLBBB, CRBBB, ILBBB, IRBBB, IVCD, WPW, PACE, LVH, MI`

**Rule.** Both UDMI Table 2 (acute ischaemia) and Table 3 (prior MI) are explicitly stated to apply only 'in the absence of left ventricular hypertrophy and left bundle branch block'. Where LBBB or ventricular pacing is present, ST elevation ≥1 mm concordant with the QRS complex in any lead may indicate acute ischaemia. In RBBB, new or presumed new ST elevation ≥1 mm, or ST/T abnormalities excluding leads V1–V4, may indicate ischaemia.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Gate condition: LBBB | all | QRS ≥ 120 ms with LBBB morphology — suppresses Table 2 and Table 3 | Computable |
| Gate condition: LVH | all | voltage criteria for LVH — suppresses Table 2 and Table 3 | Computable; the specific LVH criterion set is not named in UDMI |
| Concordant ST elevation in LBBB or RV-paced rhythm | any lead with a positive QRS | ≥ 1 mm (0.1 mV), same polarity as the QRS | UDMI 2018 §32 keeps only this criterion |
| Concordant ST depression in LBBB (GUSTO-I derived, quoted in Wagner Part VI) | V1, V2, V3 (leads with a dominant S wave) | ≥ 0.1 mV (1 mm) depression | High specificity, low sensitivity |
| Discordant ST elevation in LBBB (GUSTO-I derived, quoted in Wagner Part VI) | leads with a negative QRS | ≥ 0.5 mV (5 mm) elevation | Part VI notes the most recent study at that time reported very low specificity AND sensitivity for this one |
| RBBB with ischaemia | all except V1–V4 | new ST elevation ≥ 1 mm, or ST/T abnormality | UDMI 2018 §32 |
| Pre-excitation gate | all | WPW pattern suppresses Q-wave coding (Minnesota Code: do not code Code 1 in the presence of 6-4-1, 6-8 or 8-2-1) | Computable |

**Not computable from samples.** Whether a bundle branch block is 'new or presumed new' requires a prior tracing. Whether an RBBB is rate-related requires a rhythm change to observe. 'Recording an ECG with the pacemaker temporarily switched off' is obviously outside a program's reach, and electrical-memory repolarisation changes after pacing cannot be identified from one record.

**Guidelines disagree.** Part VI reproduces all three GUSTO-I (Sgarbossa) criteria including the discordant ≥5 mm rule, while noting its poor performance; UDMI 2018 retains only the concordant ≥1 mm criterion and drops both the V1–V3 concordant-depression and the discordant criteria from its text. Neither document adopts the Smith-modified proportional criterion (ST elevation / S wave ratio), which is in widespread clinical use — I did not verify that against a primary source here, so it is listed only as a known gap. Part VI also states that ST criteria are NOT affected by fascicular blocks or by RBBB, which sits awkwardly with UDMI's separate RBBB carve-out excluding V1–V4.

*Source:* Fourth Universal Definition of Myocardial Infarction (2018), Circulation. 2018;138:e618–e651, Tables 2 and 3 headers and §32 (verbatim); Wagner GS, et al. Circulation. 2009;119:e262–e270, 'Diagnosis of Ischemia/Infarction in the Setting of Intraventricular Conduction Disturbances' (verbatim, citing the GUSTO-I analysis).

### Minnesota Code 1 — Q and QS patterns, the epidemiological standard the UDMI itself points to. Maps onto PTB-XL QWAVE plus the territory MI codes  `QWAVE, ASMI, AMI, ALMI, LMI, IMI, MI`

**Rule.** Three anatomical sites, each with major (1-1-x), moderate (1-2-x) and minor (1-3-x) grades, keyed on Q duration, Q/R amplitude ratio, QS morphology and R amplitude. A negative deflection must be ≥0.1 mV (1 mm) to count as a Q wave at all. Do not code any Code 1 in the presence of WPW (6-4-1), code 6-8, or code 8-2-1.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Anterolateral site, major | I, aVL, V6 | 1-1-1: Q/R ≥ 1/3 plus Q ≥ 0.03 s in I or V6. 1-1-2: Q ≥ 0.04 s in I or V6. 1-1-3: Q ≥ 0.04 s plus R ≥ 3 mm in aVL | No sex/age qualifier anywhere in Minnesota Code 1 |
| Anterolateral site, moderate | I, aVL, V6 | 1-2-1: Q/R ≥ 1/3 plus Q ≥ 0.02 s and < 0.03 s in I or V6. 1-2-2: Q ≥ 0.03 s and < 0.04 s in I or V6. 1-2-3: QS in lead I (not in the presence of 7-1-1) | None |
| Anterolateral site, minor | I, aVL, V6 | 1-3-1: Q/R ≥ 1/5 and < 1/3 plus Q ≥ 0.02 s and < 0.03 s in I or V6. 1-3-3: Q ≥ 0.03 s and < 0.04 s plus R ≥ 3 mm in aVL. 1-3-8: initial R amplitude decreasing to ≤ 2 mm in every beat between V5 and V6 (all V5 beats must have initial R > 2 mm; absent codes 3-2, 7-1-1, 7-2-1, 7-3) | None |
| Inferior site (labelled 'Posterior (inferior)'), major | II, III, aVF | 1-1-1: Q/R ≥ 1/3 plus Q ≥ 0.03 s in II. 1-1-2: Q ≥ 0.04 s in II. 1-1-4: Q ≥ 0.05 s in III plus Q amplitude > 1.0 mm in the majority of beats in aVF. 1-1-5: Q ≥ 0.05 s in aVF | None |
| Inferior site, moderate | II, III, aVF | 1-2-1: Q/R ≥ 1/3 plus Q ≥ 0.02 s and < 0.03 s in II. 1-2-2: Q ≥ 0.03 s and < 0.04 s in II. 1-2-3: QS in II (not with 7-1-1). 1-2-4: Q ≥ 0.04 s and < 0.05 s in III plus Q ≥ 1.0 mm in the majority of beats in aVF. 1-2-5: Q ≥ 0.04 s and < 0.05 s in aVF | None |
| Inferior site, minor | II, III, aVF | 1-3-1: Q/R ≥ 1/5 and < 1/3 plus Q ≥ 0.02 s and < 0.03 s in II. 1-3-4: Q ≥ 0.03 s and < 0.04 s in III plus Q ≥ 1.0 mm in the majority of beats in aVF. 1-3-5: Q ≥ 0.03 s and < 0.04 s in aVF. 1-3-6: QS in each of III and aVF (not with 7-1-1) | None |
| Anterior site, major | V1–V5 (V6 for 1-1-6) | 1-1-1: Q/R ≥ 1/3 plus Q ≥ 0.03 s in any of V2–V5. 1-1-2: Q ≥ 0.04 s in any of V1–V5. 1-1-6: QS when an initial R wave is present in the adjacent lead to the right, in any of V2–V6. 1-1-7: QS in all of V1–V4 or V1–V5 | None |
| Anterior site, moderate | V1–V5 | 1-2-1: Q/R ≥ 1/3 plus Q ≥ 0.02 s and < 0.03 s in any of V2–V5. 1-2-2: Q ≥ 0.03 s and < 0.04 s in any of V2–V5. 1-2-7: QS in all of V1, V2 and V3 (not with 7-1-1) | None |
| Anterior site, minor | V1–V5 | 1-3-1: Q/R ≥ 1/5 and < 1/3 plus Q ≥ 0.02 s and < 0.03 s in any of V2–V5. 1-3-2: QS in V1 and V2 (not with 3-1 or 7-1-1). 1-3-8: initial R decreasing to ≤ 2.0 mm in every beat between V2→V3, V3→V4 or V4→V5 (all beats in the lead immediately to the right must have initial R > 2 mm; absent 3-2, 7-1-1, 7-2-1, 7-3) | None |
| Minimum Q amplitude for detection | all | ≥ 0.1 mV (1 mm) | Global precondition |

**Not computable from samples.** Nothing — Minnesota Code 1 is fully computable by construction, which is exactly why UDMI 2018 §30 names it (with WHO MONICA) as the coding algorithm behind its Q-wave criteria. The only non-signal element is the 'majority of beats' requirement, which needs a multi-beat record rather than a single median beat.

**Guidelines disagree.** MC and UDMI are not interchangeable and will disagree on real records. MC's sites are (I, aVL, V6), (II, III, aVF) and (V1–V5); UDMI's contiguous groupings are (I, aVL), (II, III, aVF) and (V1–V6) — V6 sits in the lateral site for MC and in the precordial grouping for UDMI. MC's amplitude criterion is a Q/R ratio (1/3 or 1/5); UDMI's is an absolute depth (1 mm). MC requires only ONE qualifying lead for most major codes; UDMI requires two leads of a grouping. MC has no equivalent of UDMI's V2–V3 '>0.02 s' rule and no R-wave/posterior criterion at all. MC also uses the archaic label 'Posterior (inferior) Site' for II/III/aVF, which collides head-on with PTB-XL's separate PMI code. Note too that AHA/ACCF/HRS Part VI states the Minnesota Code 'was developed for the diagnosis of infarction rather than the quantification of its size and correlates poorly with anatomically measured infarct size'.

*Source:* Minnesota Code 1 (Q and QS patterns), reference standard published by the EPICARE Center, Wake Forest School of Medicine, citing Prineas RJ, Crow RS, Blackburn HW. The Minnesota Code Manual of Electrocardiographic Findings: Standards and Procedures for Measurement and Classification. Boston, MA: J Wright; 1982 (2nd edition: Prineas, Crow, Zhang, Springer, 2010). Independently cross-checked against the ARIC study ECG codebook (ARIC Data Book, Cohort Exam 2, variables ECGC09/ECGC10/ECGC11, University of North Carolina Collaborative Studies Coordinating Center). Named as an accepted algorithm in the Fourth Universal Definition of Myocardial Infarction (2018), Circulation. 2018;138:e618–e651, §30.

### NOVACODE category 5 — MI/ischaemia likelihood classes. Relevant to PTB-XL's graded MI and ischaemia codes  `MI, QWAVE, ISC_, STD_, INVT, NORM`

**Rule.** NOVACODE grades a continuous Q score, ST-depression (STD) score and T-negative (TN) score, then bins them: 5.1 Q-wave MI with major Q waves (Q score ≥35 in any lead, with or without ST-T abnormality); 5.2 Q-wave MI, moderate Q waves with ST-T abnormality; 5.3 possible Q-wave MI, moderate Q waves without ST-T abnormality; 5.4 possible Q-wave MI, minor Q waves with ST-T abnormality; 5.5/5.6 isolated ST or T abnormality without Q waves; 5.7 minor Q waves alone; 5.8 minor ST-T abnormality; 5.0 normal.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| NOVACODE 5.0 (no significant Q or ST-T abnormality) | all | Q score < 15 and STD and TN scores < 10 | None |
| NOVACODE 5.1 (Q-wave MI, major Q) | any single lead | Q score ≥ 35 | With or without ST-T abnormality |
| NOVACODE 5.2 (Q-wave MI, moderate Q with ST-T change) | any lead / any lead group | Q score ≥ 25 in any lead AND STD or TN score ≥ 20 in any lead group | None |
| NOVACODE 5.3 (possible Q-wave MI, moderate Q, no ST-T change) | any lead / all lead groups | Q score ≥ 25 in any lead AND STD and TN score < 20 in all lead groups | None |
| NOVACODE 5.4 (possible Q-wave MI, minor Q with ST-T change) | any lead / any lead group | Q score ≥ 15 in any lead AND STD or TN score ≥ 20 in any lead group | None |
| NOVACODE 5.5 / 5.6 (isolated ischaemic abnormality, no Q) | any lead | 5.5: ST-depression score ≥ 20 in any lead with Q score < 15 in all leads and no LVH (code 6.0). 5.6: TN score ≥ 20 in any lead with Q score < 15 in all leads and no LVH | LVH gate is explicit |
| NOVACODE 5.7 / 5.8 (isolated minor abnormalities) | any lead / lead group | 5.7: Q score ≥ 15 with STD and TN < 20. 5.8: STD or TN score ≥ 10 in any lead group | None |
| NOVACODE suppression relevant to Q coding | all | code 0.4: QRS ≥ 120 ms suppresses ST-T scores and code 5 | Direct analogue of the UDMI LBBB/LVH gate |

**Not computable from samples.** Nothing conceptually — but the Q score itself (the 0–100 severity scale built from Q duration and Q/R ratio per lead) is defined in the source paper's tables, which I could NOT retrieve from an accessible primary source this session. The class boundaries above are verified; the score construction is not. Flagged.

**Guidelines disagree.** NOVACODE is a graded-likelihood system (definite / possible / minor), the Minnesota Code is a graded-severity system (major / moderate / minor), and UDMI is binary (pathological or not). They do not map onto one another, and PTB-XL's MI codes carry no likelihood grade at all — so a PTB-XL 'AMI' label may correspond to NOVACODE 5.1, 5.3 or 5.4. Any confidence calibration built on PTB-XL labels inherits that flattening.

*Source:* Rautaharju PM, Park LP, Chaitman BR, Rautaharju F, Zhang ZM. The Novacode criteria for classification of ECG abnormalities and their clinically significant progression and regression. J Electrocardiol. 1998;31(3):157–187. Category text as published by the EPICARE Center, Wake Forest School of Medicine (NOVACODE 5, verbatim). Named as an accepted algorithm in the 2007 universal definition of MI and referenced in the 2018 edition's §30 lineage.

### Poor R-wave progression. PTB-XL has NO dedicated code — closest are ABQRS (abnormal QRS), LVOLT, and the anterior MI codes  `ABQRS, AMI, ASMI, LVOLT, QWAVE`

**Rule.** Failure of the precordial R wave to grow normally from V1 to V6. The only fully verified, computable formulation in a primary coding standard is Minnesota Code 1-3-8. UDMI 2018 mentions 'loss of precordial R wave amplitude' as a sign associated with acute ischaemia but explicitly calls it 'a less specific finding' and sets no threshold.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Minnesota Code 1-3-8, anterior site | V2→V3, V3→V4 or V4→V5 | initial R amplitude decreasing to ≤ 2.0 mm in every beat, with all beats in the lead immediately to the right having initial R > 2 mm | Must be suppressed by codes 3-2 (voltage LVH), 7-1-1 (LBBB), 7-2-1 (RBBB) or 7-3 |
| Minnesota Code 1-3-8, anterolateral site | V5→V6 | initial R amplitude decreasing to ≤ 2 mm in every beat, with all V5 beats having initial R > 2 mm | Same suppressions |
| Minnesota Code 1-1-6 (QS with an R to its right) — the transition-reversal analogue | any of V2–V6 | QS pattern when an initial R wave is present in the adjacent lead to the RIGHT on the chest | Coded as a MAJOR Q abnormality, not as a minor R-progression finding |
| Conventional PRWP definition (Zema & Kligfield) | V2, V3 | R amplitude ≤ 3.0 mm in V3, with R in V2 ≤ R in V3 (10 mm = 1 mV) | NOT verified against the primary full text — the PubMed abstract contains no numbers. Flagged as unconfirmed |
| Reversed R-wave progression (Zema & Kligfield) | V1–V4 | R in V2 < R in V1, or R in V3 < R in V2, or R in V4 < R in V3, or any combination | Same verification caveat |
| UDMI mention | precordial | no numeric threshold given | 'loss of precordial R wave amplitude, a less specific finding' |

**Not computable from samples.** PRWP is a syndrome with four stated major causes — anterior MI, LVH, RVH, and a normal variant with diminished anterior forces — and the ECG alone cannot arbitrate between them without the accompanying LVH/RVH criteria. Precordial electrode misplacement (a very common cause of apparent PRWP) is undetectable from the samples. A program should report the measurement and the differential, never 'anterior MI'.

**Guidelines disagree.** There is no agreed threshold. The Minnesota Code uses an absolute initial-R ceiling of 2 mm with a right-neighbour precondition; the widely quoted Zema & Kligfield definition uses 3 mm in V3; neither guideline body (AHA/ACCF/HRS Part VI, UDMI 2018) states any numeric criterion at all. In addition, PTB-XL provides no PRWP statement, so there is nothing in that label set to train or validate against — any PRWP output from a PTB-XL-based tool is unsupervised by the dataset's own annotations.

*Source:* Minnesota Code 1, codes 1-3-8 and 1-1-6 (Prineas RJ, Crow RS, Blackburn HW, 1982; EPICARE Center, Wake Forest School of Medicine publication) — verified verbatim. Fourth Universal Definition of Myocardial Infarction (2018), Circulation. 2018;138:e618–e651, §27 — verified verbatim. Zema MJ, Kligfield P. ECG poor R-wave progression: review and synthesis. Arch Intern Med. 1982;142(6):1145–1148 — abstract verified (four causes), quantitative definitions NOT verified against the full text.

### Quantitative chronic infarct size — the Selvester QRS score. No PTB-XL code; complements the QWAVE/MI codes  `QWAVE, MI`

**Rule.** A weighted QRS scoring system derived from a computer model of human ventricular activation, intended to quantify chronic infarct size rather than to make a binary diagnosis. AHA/ACCF/HRS Part VI recommends that ECG algorithms capable of computing the Selvester score in tracings meeting criteria for prior infarction be developed and made available.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Number of weighted criteria | 10 of the 12 standard leads: I, II, aVL, aVF, V1, V2, V3, V4, V5, V6 (III and aVR excluded) | 54 weighted criteria | Complete/original version |
| Total possible score | as above | 32 QRS points | None |
| Infarct size per point | n/a | each point ≈ 3% of the left ventricular wall | None |
| Individual criterion weights and per-lead point caps | per lead | NOT reproduced in Part VI and not verified here | The 54 criteria are Q duration, R duration, R/Q and R/S amplitude ratio, and R amplitude thresholds per lead; the full table is in the Selvester source papers, which I could not retrieve |

**Not computable from samples.** Nothing conceptually — the score is by design fully computable from the QRS. But Part VI states the estimates 'are most useful in the setting of a single infarct', and the score is not validated in the presence of conduction defects or LVH without the separate BBB/LVH-adjusted variants.

**Guidelines disagree.** Part VI states 54 criteria / 32 points; a widely circulated description of the same system gives 50 criteria / 31 points, and separate simplified (abbreviated) Selvester scores are in use and score differently. I verified only the Part VI numbers. Part VI also explicitly rates the Minnesota Code as correlating poorly with anatomically measured infarct size, so MC-based and Selvester-based infarct quantities should not be presented as comparable.

*Source:* Wagner GS, Macfarlane P, Wellens H, Josephson M, Gorgels A, Mirvis DM, Pahlm O, Surawicz B, Kligfield P, Childers R, Gettes LS. AHA/ACCF/HRS Recommendations for the Standardization and Interpretation of the Electrocardiogram, Part VI: Acute Ischemia/Infarction. Circulation. 2009;119:e262–e270 (also J Am Coll Cardiol. 2009;53:1003–1011), 'Quantitative QRS Changes for Estimation of Infarct Size' — verified verbatim.

### Measurement mechanics that every criterion above depends on — fiducial points, amplitude reference, and calibration. Affects every PTB-XL MI/injury code  `QWAVE, MI, STE_, STD_`

**Rule.** The J point is the junction between QRS termination and ST onset; QRS onset is the recommended reference (zero) for measuring the magnitude of ST displacement. With a stable baseline the TP segment is a more accurate reference and is also better at separating pericarditis (PTa depression) from ischaemia, but tachycardia and baseline drift make that unreliable in the acute setting. Measurements of both the reference and the displaced point are taken from the top of the ECG line tracing. Standard calibration is 10 mm = 1 mV.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| ST displacement reference point | all | QRS onset (recommended); TP segment (more accurate only with a stable baseline) | UDMI 2018 §27 and Figure 8 |
| Amplitude calibration | all | 1 mm = 0.1 mV | Stated explicitly in UDMI 2018 §27 |
| Where on the trace to measure | all | from the top of the ECG line tracing for both the reference and the J point | UDMI Figure 8 legend |
| Q wave onset | all | the initial onset of the Q wave serves as the reference point (arrow 1 in UDMI Figure 8) | None |
| Beat selection | all | Minnesota Code requires findings 'in the majority of beats' for several inferior-lead codes and 'in every beat' for the R-progression codes | Implies multi-beat analysis, not a single median beat |

**Not computable from samples.** None; this entry is entirely about implementation of the measurements. Note only that the guideline says nothing about global QRS-onset detection across leads versus per-lead onset, which is a real source of Q-duration disagreement between algorithms.

**Guidelines disagree.** UDMI recommends QRS onset as the reference while acknowledging the TP segment is more accurate — an internal tension the document resolves on practical grounds, not measurement grounds. Also, whether Q duration is measured from a global QRS onset (earliest onset across all leads) or a per-lead onset materially changes which Q waves cross 0.02 s and 0.03 s; no primary source I found specifies which.

*Source:* Fourth Universal Definition of Myocardial Infarction (2018), Circulation. 2018;138:e618–e651, §27 and Figure 8 (verbatim); Minnesota Code 1 (Prineas/Crow/Blackburn 1982, EPICARE publication).

### What a program is NOT permitted to conclude — the diagnostic boundary around the ECG criteria. Affects the interpretation of every PTB-XL MI label  `MI, QWAVE, ASMI, AMI, ALMI, IMI, ILMI, IPMI, IPLMI, LMI, PMI`

**Rule.** Acute MI requires a rise and/or fall of cardiac troponin with at least one value above the 99th percentile URL, PLUS at least one of: ischaemic symptoms, new ischaemic ECG changes, development of pathological Q waves, imaging evidence of new loss of viable myocardium or a new regional wall motion abnormality in an ischaemic pattern, or identification of a coronary thrombus. Prior or silent/unrecognised MI can be met by pathological Q waves alone (Table 3, with or without symptoms, in the absence of non-ischaemic causes), by imaging evidence, or by pathological findings.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Pathological Q waves per Table 3 | as detailed in the entries above | as detailed above | This is the ONLY limb of the prior-MI criteria a 12-lead recording can satisfy |

**Not computable from samples.** Everything else: troponin values and their rise/fall kinetics, the 99th percentile URL, symptoms, echocardiographic or CMR wall motion, angiographic thrombus, autopsy findings. Also unmeasurable from a single record: whether Q waves are NEW (the type 1/4a/5 MI criterion), whether the patient had an interim revascularisation, and whether lead reversal or misplacement produced the Q waves — UDMI explicitly warns that 'improper lead placement, QRS abnormalities, or technical errors (eg, lead reversal) may result in the appearance of new Q waves or QS complexes' and requires a repeat recording with correct lead placement before a new silent Q-wave MI is accepted.

**Guidelines disagree.** None between guidelines on this point — but there is a systematic disagreement between the guideline and what PTB-XL labels mean. PTB-XL's MI codes are cardiologist ECG interpretations, not adjudicated Universal-Definition MI diagnoses; nothing in the dataset establishes troponin, symptoms or imaging. A tool trained on PTB-XL predicts 'a cardiologist would read this tracing as anteroseptal MI pattern', which is a strictly weaker claim than 'this patient had an anteroseptal MI'. Silent/unrecognised Q-wave MI accounted for 9%–37% of all non-fatal MI events in serial-ECG studies, so the ECG-only route is real, but it is still the weakest of the three limbs.

*Source:* Fourth Universal Definition of Myocardial Infarction (2018), Circulation. 2018;138:e618–e651, 'Criteria for prior or silent/unrecognized myocardial infarction' box and §30 (verbatim).

**Notes.** VERIFICATION STATUS — what I read directly versus what I could not.

Verified verbatim from primary full texts obtained this session:
1. Fourth Universal Definition of Myocardial Infarction (2018). Thygesen K, Alpert JS, Jaffe AS, Chaitman BR, Bax JJ, Morrow DA, White HD, on behalf of the Joint ESC/ACC/AHA/WHF Task Force. Circulation. 2018;138:e618–e651 (DOI 10.1161/CIR.0000000000000617); co-published Eur Heart J. 2019;40:237–269 (ehy462) and J Am Coll Cardiol. 2018;72:2231–2264. I extracted the typeset Circulation PDF and read Tables 2 and 3 and sections 26–33 verbatim, and cross-checked against the Imperial College accepted-manuscript version of the EHJ text.
2. AHA/ACCF/HRS Recommendations for the Standardization and Interpretation of the Electrocardiogram, Part VI: Acute Ischemia/Infarction. Wagner GS, Macfarlane P, Wellens H, Josephson M, Gorgels A, Mirvis DM, Pahlm O, Surawicz B, Kligfield P, Childers R, Gettes LS. Circulation. 2009;119:e262–e270; J Am Coll Cardiol. 2009;53:1003–1011. Full 9-page text read verbatim.
3. Minnesota Code 1 (Q and QS patterns), the official EPICARE Center (Wake Forest School of Medicine) publication of the code, citing Prineas RJ, Crow RS, Blackburn HW, The Minnesota Code Manual of Electrocardiographic Findings, J Wright, 1982 (2nd ed. Prineas, Crow, Zhang, Springer, 2010). Every subcode read verbatim and independently cross-checked against the ARIC study ECG codebook (variables ECGC09, ECGC10, ECGC11).
4. NOVACODE category 5 (MI/ischaemia likelihood), EPICARE publication, citing Rautaharju PM, Park LP, Chaitman BR, Rautaharju F, Zhang ZM, J Electrocardiol. 1998;31(3):157–187.
5. Bayés de Luna A, Wagner G, Birnbaum Y, Nikus K, Fiol M, Gorgels A, Cinca J, Clemmensen PM, Pahlm O, Sclarovsky S, Stern S, Wellens H, Zareba W (ISHNE committee). A new terminology for left ventricular walls and location of myocardial infarcts that present Q wave based on the standard of cardiac magnetic resonance imaging. Circulation. 2006;114:1755–1760. Full text read.
6. PTB-XL SCP statement set, read from the local dataset at /Users/svisagan/Programs/ecg-analysis/data/ptbxl/scp_statements.csv.

Verified at abstract level only (flagged in the entries):
7. Bayés de Luna A, Cino J, Goldwasser D, et al. New electrocardiographic diagnostic criteria for the pathologic R waves in leads V1 and V2 of anatomically lateral myocardial infarction. J Electrocardiol. 2008;41:413–418 — R/S ≥0.5 or R >3 mm in V1, sensitivity 73.3%, specificity 93.3%.
8. Birnbaum Y, Fiol M, Nikus K, Garcia Niebla J, Bacharova L, Dubner S, Zareba W, Macfarlane PW, Ribeiro AL, Cygankiewicz I, Bayés de Luna A. A counterpoint paper: comments on the electrocardiographic part of the 2018 Fourth Universal Definition of Myocardial Infarction, endorsed by ISE and ISHNE. Ann Noninvasive Electrocardiol. 2020;25:e12786 (also J Electrocardiol. 2020). Read via PMC; it critiques the ST-segment sections but does not address the Q-wave table.

NOT verified — do not present as fact without further checking:
9. The 2007 second universal definition (Thygesen/Alpert/White, Circulation 2007;116:2634–2653; Eur Heart J 2007;28:2525–2538) Table 4 wording, specifically the contiguous groupings '(I, aVL, V6; V4–V6; II, III, aVF)' and the '≥' rather than '>' symbols. Paywalled and image-based in every copy I reached. The change from that partition to the 2012/2018 '(I, aVL; V1–V6; II, III, aVF)' is the single most consequential undocumented shift for anyone implementing territory logic.
10. Zema MJ, Kligfield P. ECG poor R-wave progression: review and synthesis. Arch Intern Med. 1982;142:1145–1148 — the quantitative thresholds (R ≤3.0 mm in V3; reversed progression definitions). The abstract contains no numbers; the full text is paywalled.
11. The full 54-criterion Selvester QRS score table (per-lead weights and point caps).
12. The 2013 ACCF/AHA STEMI guideline ST-elevation thresholds (widely cited as ≥2 mm in men with no <40 split), and the Smith-modified Sgarbossa proportional criterion for LBBB.
13. WHO MONICA Q-wave coding, which UDMI 2018 names alongside the Minnesota Code but which I did not retrieve.

PTB-XL MAPPING CAVEATS THAT MATTER FOR IMPLEMENTATION.
(a) PTB-XL has no poor-R-wave-progression statement. The nearest labels are ABQRS ('abnormal QRS') and LVOLT; there is nothing in the dataset to supervise a PRWP output.
(b) PTB-XL's INJAS/INJAL/INJLA/INJIN/INJIL are described as 'ischemic ST-T changes compatible with subendocardial injury in <region> leads' yet are assigned to the MI superclass. Subendocardial injury conventionally means ST DEPRESSION, not the ST elevation of transmural injury. Confirm the annotators' intent before wiring these to an ST-elevation rule; the diagnostic_subclass field puts INJAS/INJAL/INJLA under AMI and INJIN/INJIL under IMI, which suggests territory rather than polarity was the organising idea.
(c) QWAVE in PTB-XL is a FORM statement ('Q waves present'), not a diagnostic one — it has no diagnostic_class. The diagnostic MI codes are the territory codes. So a pathological-Q detector maps to QWAVE; a territory classifier maps to ASMI/AMI/ALMI/LMI/IMI/ILMI/IPMI/IPLMI/PMI.
(d) PTB-XL rolls ASMI, ALMI and AMI into the diagnostic_subclass 'AMI', and ILMI, IPMI and IPLMI into 'IMI'. That subclass collapse is a reasonable hedge against exactly the inter-convention disagreement documented above.
(e) There is no ANEUR-equivalent in the Q-wave criteria; PTB-XL's ANEUR ('ST-T changes compatible with ventricular aneurysm') sits under STTC, but persistent ST elevation with Q waves is the classic aneurysm pattern and will co-occur with anterior MI codes.

THE THREE DISAGREEMENTS MOST LIKELY TO BITE A TEACHING TOOL.
First, the posterior-versus-lateral naming dispute is unresolved in the primary literature and the two positions are held by named committees in print: AHA/ACCF/HRS Part VI (2009) recommends retaining 'posterior'; ISHNE (2006) recommends replacing it with lateral/inferolateral/basal-lateral on CMR evidence; UDMI 2018 uses 'inferobasal (previously termed posterior)'. PTB-XL has both PMI and LMI. Present all three.
Second, the ST-depression threshold genuinely differs between the two current documents: ≥0.5 mm in any lead (UDMI 2018 Table 2) versus 0.05 mV in V2–V3 and 0.1 mV elsewhere (Part VI 2009 Recommendation 6). A tool that states one number as fact is wrong roughly half the time it matters.
Third, UDMI Table 3's qualifying-lead list and its contiguous-grouping list are inconsistent (lead III and leads V1–V3 appear in groupings but not in the qualifying-lead list). Any implementation must make an explicit, documented choice here; there is no reading of the table that is both literal and clinically sensible.

FINALLY, THE HARD LIMIT. Every acute criterion in these documents is phrased as 'new, or presumed new'. Nothing in a single 12-lead recording establishes newness. A program working from samples alone can report 'pathological Q wave pattern consistent with prior infarction in territory X' and 'ST elevation meeting the J-point threshold for lead group Y', and nothing stronger. The Universal Definition's acute-MI criteria all require troponin, and its prior-MI criteria all require the exclusion of non-ischaemic causes that no ECG can exclude.

## ST segment and T wave: acute ischaemia (ST elevation / depression), T-wave inversion, non-specific ST-T change, and early repolarisation

### Acute myocardial ischaemia — ST ELEVATION at the J point (STEMI cut-points). Sex-, age- and lead-specific.  `STE_, AMI, ASMI, ALMI, IMI, ILMI, LMI, INJAS, INJAL, INJIN, INJLA, INJIL`

**Rule.** New (or presumed new) ST elevation measured at the J point in two contiguous leads, in the absence of LVH and bundle branch block, exceeding a cut-point that depends on the lead, and in V2-V3 on sex and age. V2-V3 carry a higher cut-point because normal J-point elevation is physiologically largest there and larger in men, decreasing with age.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| ST amplitude at the J point | all 12 leads EXCEPT V2 and V3 (i.e. I, II, III, aVR, aVL, aVF, V1, V4, V5, V6) | >= 0.1 mV (1 mm) elevation | none — same for both sexes, all ages |
| ST amplitude at the J point | V2 and V3 | >= 0.2 mV (2 mm) elevation | men >= 40 years |
| ST amplitude at the J point | V2 and V3 | >= 0.25 mV (2.5 mm) elevation | men < 40 years |
| ST amplitude at the J point | V2 and V3 | >= 0.15 mV (1.5 mm) elevation | women, regardless of age |
| Number of leads meeting the cut-point (contiguity requirement) | 2 contiguous leads; contiguous groupings given by the same document are (I, aVL), (V1-V6), (II, III, aVF). Worked example in the text: >=2 mm in V2 plus >=1 mm in V1 satisfies 'two contiguous leads' in a man >=40 | >= 2 leads, each meeting its own lead-specific cut-point | none |
| Serial change in J-point amplitude vs a prior tracing | V2, V3 | new J-point elevation >= 0.1 mV (1 mm) relative to the earlier ECG counts as an ischaemic response even if below the absolute cut-point | none |
| Amplitude explicitly declared normal (negative rule) | V2-V3 only | >= 1 mm and < 2 mm in men (< 1.5 mm in women) seen only in V2-V3 may be a normal finding | sex-dependent |

**Not computable from samples.** 'New or presumed new' and the serial-comparison footnote both require a prior tracing — not computable from a single record. The exclusion clause 'in the absence of LVH and bundle branch block' requires running separate LVH/BBB classifiers first, and the guideline gives no numeric LVH definition here. Calling the result 'myocardial infarction' rather than 'ST elevation' additionally requires troponin and clinical context, which are outside the samples.

**Guidelines disagree.** (1) The 2013 ACCF/AHA STEMI guideline (O'Gara et al., Circulation 2013;127:e362-e425) omits the age split entirely: '>=2 mm (0.2 mV) in men or >=1.5 mm (0.15 mV) in women in leads V2-V3 and/or >=1 mm in other contiguous chest leads or the limb leads'. A tool using 2.5 mm for a 30-year-old man and a tool using 2 mm are both citing 'the guideline'. (2) Minnesota Code 9-2 uses no sex or age split at all (>=1 mm in I/aVL/V6, in II/III/aVF, or in V5; >=2 mm in V1-V4). (3) AHA Part VI states the non-V2/V3 threshold as '0.1 mV' for men but 'greater than 0.1 mV' for women — a strict-vs-inclusive inconsistency inside one document; the 4th UDMI uses '>= 1 mm' for everyone. (4) The 2018 UDMI and the 2009 Part VI define the ST amplitude against DIFFERENT baselines (see the measurement-convention entry), so the same '2 mm' is not the same measurement.

*Source:* Thygesen K, Alpert JS, Jaffe AS, Chaitman BR, Bax JJ, Morrow DA, White HD, et al. Fourth universal definition of myocardial infarction (2018). Eur Heart J 2019;40:237-269, Table 2 and section 27 (simultaneously Circulation 2018;138:e618-e651; J Am Coll Cardiol 2018;72:2231-2264). Same numbers independently in Wagner GS, Macfarlane P, Wellens H, et al. AHA/ACCF/HRS Recommendations... Part VI: Acute Ischemia/Infarction. J Am Coll Cardiol 2009;53:1003-1011 (Circulation 2009;119:e262-e270), 'Threshold Values for ST-Segment Changes', recommendations 1-3.

### Acute myocardial ischaemia — ST DEPRESSION and T-WAVE INVERSION (the non-ST-elevation limb of the same table)  `STD_, NST_, ISC_, ISCAL, ISCAS, ISCAN, ISCIN, ISCIL, ISCLA, INJAS, INJAL, INJIN, INJLA, INJIL, NDT, INVT`

**Rule.** New horizontal or downsloping ST depression >= 0.5 mm in two contiguous leads, and/or T inversion > 1 mm in two contiguous leads that have a prominent R wave or R/S ratio > 1.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| ST amplitude at the J point (depression) | any 2 contiguous leads | <= -0.05 mV (>= 0.5 mm depression) AND ST segment horizontal or downsloping | none — no sex or age split is given for depression |
| ST segment slope (qualifying the depression) | same leads | horizontal or downsloping (slope <= 0); upsloping depression does NOT satisfy this criterion | none |
| T-wave amplitude (peak, signed) | any 2 contiguous leads that also satisfy the R-wave condition | < -0.1 mV (inversion > 1 mm) | none |
| R/S amplitude ratio in the same lead (gate for the T criterion) | same leads | R/S > 1, or a 'prominent R wave' | none |

**Not computable from samples.** 'New' requires a prior ECG. 'Prominent R wave' has no numeric definition (only the alternative R/S > 1 is computable). The guideline gives no measurement window for deciding 'horizontal or downsloping' — you must choose one (e.g. J to J+80 ms) and say so. The text also concedes that 'lesser degrees of ST displacement or T wave inversion than those described in Table 2 can also represent an acute myocardial ischaemic response', which is explicitly not thresholdable.

**Guidelines disagree.** AHA/ACCF/HRS Part VI (2009) recommendation 6 gives LEAD-SPECIFIC depression thresholds instead of one number: abnormal J-point depression is <= -0.05 mV (0.5 mm) in V2 and V3 but <= -0.1 mV (1 mm) in all other leads, for men and women of all ages. So a 0.6 mm horizontal depression in II+III is 'ischaemic' by the 2018 UDMI and 'not abnormal' by the 2009 AHA statement. Minnesota Code splits the same range into major (4-1: >=1.0 mm) and minor (4-2: >=0.5 and <1.0 mm). Exercise-testing standards measure depression 60-80 ms after J, not at J.

*Source:* 4th universal definition of MI (2018), Eur Heart J 2019;40:237-269, Table 2.

### Threshold values for abnormal J-point DEPRESSION (AHA standardisation statement, lead-specific)  `STD_, NST_, ISC_`

**Rule.** For men and women of all ages, the threshold value for abnormal J-point depression should be 0.05 mV (0.5 mm) in leads V2 and V3 and 0.1 mV (1 mm) in all other leads.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| ST amplitude at the J point (depression) | V2, V3 | <= -0.05 mV (0.5 mm) | none — explicitly 'men and women of all ages' |
| ST amplitude at the J point (depression) | I, II, III, aVR, aVL, aVF, V1, V4, V5, V6 | <= -0.1 mV (1 mm) | none |

**Guidelines disagree.** Directly contradicts the uniform 0.5 mm of the 4th UDMI in all leads other than V2-V3 (see previous entry). Both are AHA-endorsed documents.

*Source:* Wagner GS, et al. AHA/ACCF/HRS Recommendations... Part VI: Acute Ischemia/Infarction. J Am Coll Cardiol 2009;53:1003-1011, 'Threshold Values for ST-Segment Changes', recommendation 6 (restated in Rautaharju PM, Surawicz B, Gettes LS. Part IV. J Am Coll Cardiol 2009;53:982-991).

### Left main / three-vessel disease pattern (diffuse ST depression with aVR/V1 elevation)  `STD_, NST_, ISC_, INJAS, INJAL, INJIN, INJLA, INJIL`

**Rule.** Widespread ST depression with reciprocal ST elevation in aVR and/or V1 suggests left main or multivessel disease rather than a single occluded artery.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Count of leads with ST depression + ST elevation in aVR/V1 | any leads for the depression; aVR and/or V1 for the elevation | UDMI 2018: ST depression >= 1 mm in SIX leads with ST elevation in aVR or V1 | none |
| Count of leads with ST depression + ST elevation in aVR/V1 | body-surface leads; aVR and/or V1 | AHA Part VI 2009: ST depression > 1 mm in EIGHT or more leads coupled with ST elevation in aVR and/or V1 (reported 75% predictive accuracy for 3-vessel or left main stenosis in rest angina) | none |
| ST elevation amplitude in aVR | aVR | > 1 mm ST elevation in aVR accompanying anterior or inferior STEMI is associated with increased 30-day mortality | none |

**Not computable from samples.** Both documents attach the pattern to clinical state ('angina at rest', 'haemodynamic compromise') which is not in the samples; the pattern is also produced by LVH, cardiomyopathy, LBBB and tachycardia without acute coronary occlusion.

**Guidelines disagree.** Lead count differs: 6 leads (2018 UDMI) vs 8 leads (2009 AHA Part VI), and the depression threshold is '>= 1 mm' vs '> 1 mm'. A counterpoint paper endorsed by the International Society of Electrocardiology (Birnbaum et al., J Electrocardiol 2020, PMC7507065) disputes the specificity of this pattern altogether, noting it occurs in LVH, cardiomyopathy and LBBB without acute MI.

*Source:* 4th universal definition of MI (2018), Eur Heart J 2019;40:237-269, section 27; and Wagner GS et al., Part VI, J Am Coll Cardiol 2009;53:1003-1011, recommendation under 'diffuse ST-segment depression'.

### Isolated posterior / inferobasal ischaemia (ST depression V1-V3 as an ST-elevation equivalent)  `PMI, IPMI, IPLMI, STD_, ISC_`

**Rule.** Isolated ST depression in V1-V3, especially with a positive terminal T wave, may be the reciprocal of posterior (inferobasal) ST elevation from a circumflex occlusion; posterior leads V7-V9 confirm it.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| ST amplitude at J point | V1-V3 | <= -0.05 mV (>= 0.5 mm depression), isolated (no ST elevation elsewhere) | none |
| Terminal T-wave polarity in the same leads | V1-V3 | positive terminal T wave increases suspicion (ST-elevation equivalent) | none |
| ST elevation in posterior leads | V7 (left posterior axillary line), V8 (left mid-scapular line), V9 (left paraspinal border), 5th intercostal space | >= 0.05 mV (0.5 mm); specificity increased at >= 0.1 mV (1 mm), and the 1 mm cut-point SHOULD be used in men < 40 years | sex- and age-dependent (men < 40 y) |
| Chronic counterpart (prior posterior MI) | V1-V2 | R wave > 0.04 s AND R/S > 1 with a concordant positive T wave, in the absence of a conduction defect | none |

**Not computable from samples.** V7-V9 are not part of a standard 12-lead recording — the confirmatory half of this rule cannot be evaluated from 12-lead samples at all; a program can only flag 'posterior leads indicated'. The UDMI itself calls the V1-V3 depression pattern 'non-specific'.

**Guidelines disagree.** Terminology: Bayes de Luna and the International Society for Holter and Noninvasive Electrocardiography argue the region is LATERAL, not posterior, and that 'posterior infarction' should be renamed lateral/inferolateral/basal-lateral; AHA Part VI explicitly declines to adopt this and keeps 'posterior'. PTB-XL uses the posterior nomenclature (PMI, IPMI, IPLMI). Threshold for V7-V9 is 0.5 mm in both 4th UDMI and AHA Part VI, but only the UDMI adds the 1 mm men-<40 variant (Part VI gives a flat 0.05 mV for men and women).

*Source:* 4th universal definition of MI (2018), Eur Heart J 2019;40:237-269, section 28 'Application of supplemental electrocardiogram leads' and Table 3. AHA Part VI (2009) retains the term 'posterior' for ST depression in V1-V2 with later broad R waves.

### Right ventricular infarction (right-sided leads)  `IMI, ILMI, STE_`

**Rule.** In inferior infarction, ST elevation in right-sided precordial leads supports right ventricular involvement; aVR or V1 may also show >= 1 mm elevation.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| ST elevation at J point | V3R, V4R | >= 0.05 mV (0.5 mm); >= 0.1 mV (1 mm) in men < 30 years | sex- and age-dependent (men < 30 y per UDMI; AHA Part VI says 'males less than 30 years of age' for the same 0.1 mV variant) |
| ST elevation | aVR or V1, in the setting of inferior STEMI | >= 1 mm | none |
| Trigger for recording right-sided leads | II, III, aVF | ST elevation > 0.1 mV in II, III and aVF should make the machine suggest recording V3R and V4R | none |

**Not computable from samples.** V3R/V4R are absent from a 12-lead record; only the trigger condition is computable. The changes are explicitly transient, so absence proves nothing.

**Guidelines disagree.** None on the number (both give 0.5 mm, 1 mm for young men); the age boundary is <30 y for V3R/V4R but <40 y for V7-V9 and V2-V3 — an easy off-by-a-decade error in implementations.

*Source:* 4th universal definition of MI (2018), section 28; Wagner GS et al., Part VI, J Am Coll Cardiol 2009;53:1003-1011, recommendations on right-sided leads (thresholds recommendation 4).

### Acute ischaemia in the presence of LEFT BUNDLE BRANCH BLOCK (Sgarbossa criteria and the Smith modification)  `CLBBB, ILBBB, PACE, STE_, STD_`

**Rule.** In LBBB (and in right-ventricular-paced rhythm) the ordinary ST thresholds do not apply; concordant ST deviation, or discordant ST elevation that is disproportionate to the QRS, indicates acute occlusion.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Concordant ST elevation (same direction as the QRS) | any lead with a positive (dominant R) QRS | >= 0.1 mV (1 mm) — 5 points in the original weighted score | none |
| Concordant ST depression | V1, V2 or V3 (leads with a dominant S wave) | >= 0.1 mV (1 mm) — 3 points | none |
| Excessively discordant ST elevation (absolute) | any lead with a negative (dominant S) QRS | >= 0.5 mV (5 mm) — 2 points; score >= 3 gives high specificity | none |
| Excessively discordant ST elevation (proportional; Smith modification) | any lead with discordant ST deviation >= 1 mm and an R or S of opposite polarity; ST measured relative to the PR segment, to the nearest 0.5 mm | ST/S ratio <= -0.25 (i.e. discordant ST elevation >= 25% of the depth of the preceding S wave); unweighted rule, any 1 of 3 criteria positive. Sensitivity 91% vs 52% weighted / 67% unweighted original; specificity 90% | none |

**Not computable from samples.** Whether the LBBB is 'new' cannot be determined without a prior ECG (the UDMI leans on this heavily). Rate-related (intermittent) block cannot be distinguished from fixed block on a single 10-second strip.

**Guidelines disagree.** Substantial. The 4th UDMI endorses ONLY 'ST-segment elevation >= 1 mm concordant with the QRS complex in any lead' and is silent on the other two criteria. AHA Part VI reports the concordant criteria as high-specificity/low-sensitivity and states the 5 mm discordant criterion 'had very low specificity and sensitivity'. Smith 2012 replaces the 5 mm rule with ST/S <= -0.25 and drops the weighting. Also note Smith measures ST relative to the PR segment whereas the UDMI measures relative to QRS onset.

*Source:* Sgarbossa EB, Pinski SL, Barbagelata A, et al. Electrocardiographic diagnosis of evolving acute myocardial infarction in the presence of left bundle-branch block. N Engl J Med 1996;334:481-487 (GUSTO-1). Smith SW, Dodd KW, Henry TD, Dvorak DM, Pearce LA. Diagnosis of ST-elevation myocardial infarction in the presence of left bundle branch block with the ST-elevation to S-wave ratio in a modified Sgarbossa rule. Ann Emerg Med 2012;60:766-776. Restated in Wagner GS et al., Part VI, J Am Coll Cardiol 2009;53:1003-1011.

### Acute ischaemia in RIGHT bundle branch block and in ventricular pacing  `CRBBB, IRBBB, PACE, STE_`

**Rule.** In RBBB, new or presumed new ST elevation >= 1 mm, or ST-segment/T-wave abnormalities as in the standard ischaemia table, may indicate acute ischaemia — but leads V1-V4 must be excluded because RBBB produces secondary repolarisation change there. Fascicular blocks and RBBB do not otherwise alter the ST criteria.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| ST elevation at J point | all leads EXCLUDING V1-V4 when RBBB is present | >= 0.1 mV (1 mm), or ST/T abnormality meeting the standard ischaemia thresholds | none |
| Applicability rule | all | ST criteria are NOT affected by fascicular block or RBBB (per AHA Part VI); they ARE affected by LBBB | none |

**Not computable from samples.** 'New or presumed new' RBBB needs a prior tracing. Biventricular pacing is explicitly described as harder still, with no numeric rule offered.

**Guidelines disagree.** The UDMI excludes V1-V4 in RBBB; AHA Part VI states flatly that RBBB does not affect the ST criteria and offers no lead exclusion. Implementations differ accordingly.

*Source:* 4th universal definition of MI (2018), Eur Heart J 2019;40:237-269, section 32 'Conduction disturbances and pacemakers'; Wagner GS et al., Part VI, 'Diagnosis of Ischemia/Infarction in the Setting of Intraventricular Conduction Disturbances'.

### Post-ischaemic / deep symmetric T-wave inversion (Wellens-type pattern, proximal LAD stenosis) and the CVA pattern  `INVT, NDT, ISCAN, ISCAS, ISCAL, NT_, TAB_`

**Rule.** After an episode of chest pain, deeply inverted symmetric T waves in the anterior precordial leads, often with QT prolongation and without evolving ST elevation or Q waves, indicate critical proximal LAD stenosis (or an intracranial event).

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| T-wave amplitude (negative) | V2, V3, V4 (occasionally V5) | deeper than -0.5 mV (> 5 mm inversion), typically with QT prolongation | none |
| T-wave amplitude (negative), UDMI wording | anterior precordial leads | symmetrical, often deep (> 2 mm) T-wave inversions associated with significant LAD occlusion | none |
| QT interval accompanying the pattern | global | 'significant QT prolongation' — use the Part IV limits: QTc >= 460 ms women, >= 450 ms men | sex-dependent |

**Not computable from samples.** 'Symmetry' of the T wave has no published numeric definition in these documents. The pattern is defined partly by history ('after an episode of chest pain', 'without further ECG evidence of evolving infarction'), and the differential (intracranial haemorrhage, cardiomyopathy) is not resolvable from samples.

**Guidelines disagree.** The depth threshold differs by a factor of 2.5 between the two primary documents: > 5 mm (0.5 mV) in AHA Part VI vs '> 2 mm' in the 4th UDMI. Also, the ISE/ISHNE counterpoint paper (Birnbaum et al., J Electrocardiol 2020) disputes the UDMI's framing of T-wave inversion as a marker of ACTIVE ischaemia, arguing inversion is a post-ischaemic (reperfusion) change.

*Source:* Wagner GS et al., Part VI, J Am Coll Cardiol 2009;53:1003-1011, 'Postischemic T-Wave Changes' and its recommendation; 4th universal definition of MI (2018), section 27. Original description: de Zwaan C, Bar FW, Wellens HJJ, Am Heart J 1982 (cited by Part VI as ref 30).

### Hyperacute T waves (earliest ischaemic change) and the de Winter / upsloping-depression pattern of proximal LAD occlusion  `TAB_, NT_, STD_, ISCAN, ISCAS`

**Rule.** Increased T-wave amplitude with prominent symmetrical T waves in at least two contiguous leads may precede ST elevation. A related pattern — upsloping precordial ST depression with tall symmetric T waves plus aVR elevation and NO precordial ST elevation — indicates proximal LAD occlusion.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Upsloping ST depression at the J point | precordial leads (V1-V6) | > 1 mm at the J point, with upsloping ST segment | none |
| ST elevation | aVR | > 1 mm (present in most cases of this pattern) | none |
| T-wave morphology accompanying it | precordial | tall, prominent, symmetrical T waves; absence of precordial ST elevation | none |
| Hyperacute T contiguity | any 2 contiguous leads | 'increased amplitude, prominent symmetrical' — NO numeric amplitude given | none |

**Not computable from samples.** The hyperacute T-wave criterion has no threshold in any primary guideline: no mV cut-off, no T/R or T/QRS ratio, no symmetry index. It is genuinely unmeasurable as written and must be flagged as such rather than implemented with an invented number. 'Increased' is also implicitly a serial comparison.

**Guidelines disagree.** No guideline quantifies hyperacute T waves; proposals in the literature (T/QRS ratios, T-wave area) are research-grade and not endorsed by any of the primary documents above. Flagged as unverified against a primary standard.

*Source:* 4th universal definition of MI (2018), Eur Heart J 2019;40:237-269, section 27 (quantitative parts: upsloping depression > 1 mm at J, aVR elevation > 1 mm). Original pattern description: de Winter RJ, Verouden NJ, Wellens HJJ, Wilde AAM. A new ECG sign of proximal LAD occlusion. N Engl J Med 2008;359:2071-2073 (a Letter — no abstract, criteria stated in figure legends).

### Quantitative T-wave descriptors: inverted / deep negative / giant negative / flat / low T  `INVT, NDT, NT_, TAB_, LOWT`

**Rule.** The AHA standardisation statement proposes explicit amplitude bands for reporting T-wave abnormality, independent of any ischaemic interpretation.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| T-wave amplitude (negative) | I, II, aVL, V2-V6 | 'inverted': -0.1 mV to -0.5 mV (1-5 mm) | none |
| T-wave amplitude (negative) | I, II, aVL, V2-V6 | 'deep negative': -0.5 mV to -1.0 mV | none |
| T-wave amplitude (negative) | I, II, aVL, V2-V6 | 'giant negative': more negative than -1.0 mV | none |
| T/R amplitude ratio | same lead as the R wave | 'low' T: T amplitude < 10% of the R-wave amplitude in that lead | none |
| T-wave peak amplitude | I, II, aVL (only when R > 0.3 mV), V4-V6 | 'flat': peak T between +0.1 and -0.1 mV | none |
| Upper normal T amplitude (positive) | V2 (most positive lead, or V3) | men 1.0-1.4 mV (up to 1.6 mV at ages 18-29); women 0.7-1.0 mV | sex- and age-dependent; source range reflects disagreement between reference populations |

**Not computable from samples.** Part IV states that a cause-specific classification of MINOR T-wave abnormality is 'virtually impossible' and recommends the label 'slight or indeterminate T-wave abnormality' — i.e. NDT/NT_ are, by the guideline's own admission, a residual category, not a criterion.

**Guidelines disagree.** The Part IV band starts inversion at -0.1 mV with no R-wave condition; the 4th UDMI requires inversion > 1 mm PLUS a prominent R or R/S > 1 before calling it ischaemic; Minnesota Code 5-2 requires >= 1.0 mm negative and treats < 1.0 mm as the minor code 5-3. Three different operational definitions of 'T-wave inversion' in current use.

*Source:* Rautaharju PM, Surawicz B, Gettes LS. AHA/ACCF/HRS Recommendations... Part IV: The ST Segment, T and U Waves, and the QT Interval. J Am Coll Cardiol 2009;53:982-991 (Circulation 2009;119:e241-e250), 'T-Wave Abnormalities'.

### Normal T-wave polarity by lead and age (when inversion is abnormal at all)  `INVT, NDT, NORM`

**Rule.** T-wave inversion is normal in specified leads and ages; only outside those does it constitute an abnormality.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Expected T polarity, adults >= 20 years | aVR inverted (normal); aVL, III, V1 upright OR inverted (both normal); I, II and V3-V6 upright | inversion in I, II or V3-V6 in an adult >= 20 y is abnormal | age >= 20 years |
| Expected T polarity, ages 12-19 | aVF may be slightly inverted; V2 may be inverted | inversion in V2 is within normal limits below age 20 | age 12-19 years |
| Expected T polarity, children > 1 month | V1, V2, V3 | T inversion is often normal | paediatric |
| Prevalence of slight negative T in lateral chest leads (background rate) | V5, V6 | T slightly negative (< 0.1 mV) in 2% of white men and women >= 60 y and 2% of black men and women >= 40 y; negative by >= 0.1 mV in 5% of black men and women >= 60 y | age- and ancestry-dependent |

**Not computable from samples.** Ancestry is required to apply the last row and is not recorded in PTB-XL; the guideline gives prevalences, not diagnostic thresholds, so no ancestry-specific cut-point actually exists to implement.

**Guidelines disagree.** No competing primary statement, but note that no guideline converts the ancestry prevalence data into an ancestry-specific threshold — implementations that adjust thresholds by race are going beyond every primary source.

*Source:* Rautaharju PM, Surawicz B, Gettes LS, Part IV, J Am Coll Cardiol 2009;53:982-991, 'T-Wave Abnormalities'.

### Normal limits of ST amplitude by sex and ancestry, at the J point and at J+60 ms (calibration data for 'non-specific ST elevation')  `STE_, NST_, NORM`

**Rule.** Upper normal (98th percentile) limits of ST amplitude in the lead where it is largest (V2) differ by sex, age, ancestry AND by the instant of measurement; the diagnostic thresholds above are a 'practical compromise' against these distributions.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| 98th percentile J-point amplitude, V2 (reference source 20) | V2 | ~0.30 mV white men < 40 y (up to 0.33 mV at ages 24-29); ~0.25 mV white men >= 40 y; ~0.15 mV white women, roughly age-independent | sex-, age- and ancestry-specific (white) |
| 98th percentile J-point amplitude, V2 (reference source 21, age >= 40) | V2 | ~0.15 mV white men, ~0.20 mV black men; ~0.10 mV white women, ~0.15 mV black women | sex- and ancestry-specific, age >= 40 y |
| 98th percentile ST amplitude 60 ms after J (ST60), V2, age >= 40 | V2 | ~0.30 mV white men, ~0.35 mV black men; ~0.20 mV white women, ~0.25 mV black women | sex- and ancestry-specific |
| Morphology qualifier for normal J-point elevation | V1, V2 | normal J-point elevation in V2 (and especially V1) is followed by a steeply DOWN-sloping ST; normal ST elevation at J+60 goes with an UPSLOPING ST, whereas ischaemia gives a more horizontal ST | none |

**Not computable from samples.** Ancestry is not available in PTB-XL. The two reference sources cited inside the same AHA document disagree by up to 0.15 mV for the same quantity, so no single normal limit can be implemented as fact.

**Guidelines disagree.** Explicit inside the source: 'the upper normal limit for J-point elevation in V2 varies to a certain degree in various reference sources, probably largely as a result of differing selection criteria for the normal group'. 0.30 mV vs 0.15 mV for white men in the same lead. Ancestry-specific normal limits exist as DATA in this statement but no guideline turns them into thresholds.

*Source:* Rautaharju PM, Surawicz B, Gettes LS, Part IV, J Am Coll Cardiol 2009;53:982-991, 'ST-Segment Abnormalities' (citing its refs 20 and 21).

### Minnesota Code 4 — ST junction and segment depression (epidemiological standard; basis of 'major' vs 'minor' ST abnormality)  `STD_, NST_, ISC_, NDT`

**Rule.** ST depression is coded by the ST-J amplitude below the P-R baseline combined with the ST slope, separately within three lead groups. Codes 4-1 and 4-2 are 'major' ST abnormalities; 4-3 and 4-4 are 'minor'.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| ST-J depression with horizontal or downsloping ST (code 4-1-1) | within each group: (I, aVL, V6), (II, III, aVF), (V1-V5) | >= 2.0 mm below the P-R baseline | none |
| ST-J depression with horizontal or downsloping ST (code 4-1-2) | same groups | >= 1.0 mm and < 2.0 mm | none |
| ST-J depression with horizontal or downsloping ST (code 4-2) | same groups | >= 0.5 mm and < 1.0 mm | none |
| Downsloping ST with nadir criterion (code 4-3) | (I, aVL, V6), (II, III, aVF), (V2-V5) | no ST-J depression as much as 0.5 mm, BUT ST segment downsloping and the ST-segment or T-wave nadir >= 0.5 mm below the P-R baseline | none |
| ST-J depression with upsloping or U-shaped ST (code 4-4) | same groups | >= 1.0 mm ST-J depression with ST upsloping or U-shaped | none |

**Not computable from samples.** Nothing structural; but the Minnesota Code is defined on a paper tracing at 25 mm/s, 10 mm/mV, with amplitudes read to the nearest 0.5 mm — a digital implementation will disagree at the rounding boundary. Whether the ST is 'U-shaped' needs a curvature definition the code does not give numerically.

**Guidelines disagree.** Baseline is the P-R segment (Minnesota) vs QRS onset (4th UDMI) vs TP or PR (AHA Part IV) vs end of PR / P-Q junction (AHA exercise standards). Also the Minnesota lead groups (I, aVL, V6 / II, III, aVF / V1-V5) are NOT the UDMI contiguous groupings (I, aVL / V1-V6 / II, III, aVF) — same ECG, different grouping, different result. Note also that the ARIC data book text erroneously repeats 'leads I, aVL, or V6' in the inferior and precordial rows; the lead group is given by the variable name (L4/F4/V4).

*Source:* Prineas RJ, Crow RS, Zhang Z-M. The Minnesota Code Manual of Electrocardiographic Findings, 2nd ed., Springer 2010. Verified verbatim here through the ARIC Study data book for the composite Minnesota-coded ECG variables (ECGMC12/13/14, Cohort Exam 3), https://aric.cscc.unc.edu/aric9/sites/default/files/public/visitdocuments/v3/ECGMC35.pdf — the book itself is not open access.

### Minnesota Code 5 — T-wave items (epidemiological standard)  `INVT, NDT, NT_, TAB_, LOWT`

**Rule.** T-wave abnormality is coded by negative or diphasic T amplitude within three lead groups, gated in some leads by R-wave amplitude. 5-1 and 5-2 are 'major' T abnormalities; 5-3 and 5-4 are 'minor'.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Negative T amplitude (code 5-1) | I or V6, or aVL when R >= 5.0 mm; also any of V2-V5 | T negative >= 5.0 mm (0.5 mV) | none |
| Negative or diphasic T (code 5-2) | I, V6, aVL (R >= 5.0 mm); II, or aVF when QRS mainly upright; any of V2-V5 | negative phase >= 1.0 mm but < 5.0 mm | none |
| Flat / shallow negative / diphasic negative-positive T (code 5-3) | I, V6, aVL (R >= 5.0 mm); II (NOT coded in aVF); any of V3-V5 | T amplitude zero (flat), or negative, or diphasic negative-positive with < 1.0 mm negative phase | none |
| Low positive T relative to R (code 5-4) | I, aVL, V6; II; (R wave must be >= 10.0 mm) | T positive and T/R amplitude ratio < 1/20 (0.05) | none |

**Guidelines disagree.** MC 5-1 sets 'deep' inversion at 5.0 mm; AHA Part IV sets 'deep negative' at 5-10 mm and 'giant' beyond 10 mm; the UDMI ischaemia table triggers at 1 mm with an R/S gate. MC applies an R-amplitude gate (aVL R >= 5 mm, T/R with R >= 10 mm) that neither AHA document uses.

*Source:* Minnesota Code Manual of Electrocardiographic Findings, 2nd ed. 2010; verified verbatim via ARIC data book variables ECGMC15/16/17 (Cohort Exam 3), aric.cscc.unc.edu.

### Minnesota Code 9-2 — ST segment elevation (epidemiological standard, no sex/age adjustment)  `STE_, NST_`

**Rule.** ST elevation is coded when it reaches a fixed amplitude in one of the three lead groups, with a higher requirement in the right precordial leads.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| ST elevation | any of I, aVL, V6 | >= 1.0 mm | none |
| ST elevation | any of II, III, aVF | >= 1.0 mm | none |
| ST elevation | V5 | >= 1.0 mm | none |
| ST elevation | any of V1-V4 | >= 2.0 mm | none |

**Guidelines disagree.** Head-on with the 4th UDMI: MC 9-2 requires 2.0 mm in V1-V4 for EVERYONE (so a woman with 1.6 mm in V2-V3 is UDMI-positive and Minnesota-negative, and a man < 40 with 2.2 mm is Minnesota-positive and UDMI-negative), applies 2 mm to V4 (which the UDMI treats as a 1 mm lead), and applies 1 mm to V1 (which the UDMI also treats as 1 mm — agreement there only).

*Source:* Minnesota Code Manual of Electrocardiographic Findings, 2nd ed. 2010; verified verbatim via ARIC data book variables ECGMC18/19/20 (Minnesota Code L92/F92/V92), aric.cscc.unc.edu. The 4th UDMI cites the Minnesota Code as a reference coding algorithm.

### Early repolarisation pattern (end-QRS notching / slurring)  `STE_, NORM`

**Rule.** Early repolarisation is present if ALL of: an end-QRS notch or slur on the downslope of a prominent R wave; Jp >= 0.1 mV in two or more contiguous leads excluding V1-V3; and QRS duration < 120 ms. ST elevation is explicitly NOT a required criterion, and ST elevation WITHOUT a notch or slur must not be reported as early repolarisation.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Jp (amplitude at the peak of an end-QRS notch, or at the onset of an end-QRS slur) | >= 2 contiguous leads, EXCLUDING V1, V2, V3 (in practice inferior II/III/aVF and/or lateral I/aVL/V4-V6) | >= 0.1 mV (1 mm) | none — the consensus gives no sex/age split |
| Location of the notch/slur on the R-wave downslope | same leads | must occur in the FINAL 50% of the R-wave downslope (a notch midway down the R wave is fragmentation, not early repolarisation); a notch must lie entirely above the baseline, and the onset of a slur must be above baseline | none |
| QRS duration | measured from leads WITHOUT a notch or slur | < 120 ms | none |
| ST-segment slope subtype (reporting requirement) | the leads showing the pattern | 'ascending' if upsloping ST followed by upright T; 'horizontal or descending' otherwise. If ascending in >= 2 leads per territory and horizontal/descending in 1 lead, classify as ascending; slope measured over 100 ms windows from Jp/Jt | none |

**Not computable from samples.** Detecting a notch vs a slur is a morphology decision the paper defines only geometrically (final 50% of the downslope) — implementable but sensitive to filtering and to the QRS-end estimate. The paper also notes automated QRS duration includes notched leads and therefore overestimates, while the criterion wants it measured from unnotched leads.

**Guidelines disagree.** Major, and the paper exists because of it. Before 2015, 'early repolarization' was used for (a) J-point elevation >= 0.1 mV with notch/slur (Haissaguerre/Tikkanen usage), (b) plain ST elevation with upward concavity in young people, and (c) the ST elevation itself. The consensus rejects (b)/(c) — ST elevation without a notch or slur is NOT early repolarisation — but earlier literature and most ECG textbooks still use the ST-elevation definition. Also the term 'J point' itself is used for three different landmarks (Jo, Jp, Jt) by different authors, which the paper had to standardise. PTB-XL has NO early-repolarisation SCP code; such records fall to STE_ or NORM.

*Source:* Macfarlane PW, Antzelevitch C, Haissaguerre M, Huikuri HV, Potse M, Rosso R, Sacher F, Tikkanen JT, Wellens H, Yan GX. The Early Repolarization Pattern: A Consensus Paper. J Am Coll Cardiol 2015;66:470-477.

### Normal-variant ST elevation (early repolarisation) vs subtle LAD occlusion — 4-variable formula  `STE_, AMI, ASMI, NORM`

**Rule.** Where the differential is anterior normal-variant ST elevation vs subtle LAD occlusion (no obvious STEMI, no Q waves, no anterior ST depression, no terminal QRS distortion, no ST elevation > 5 mm), a logistic formula outperforms any single ST threshold.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| 4-variable formula value = 0.052 x QTc-B(ms) - 0.151 x QRSV2(mm) - 0.268 x RV4(mm) + 1.062 x STE60V3(mm) | V2 (QRS amplitude), V3 (ST elevation 60 ms after the J point), V4 (R-wave amplitude), plus global Bazett-corrected QT | >= 18.2 favours LAD occlusion (accuracy 92.0%, sens 88.8%, spec 94.7%); >= 17.75 at matched specificity gives sens 90.2% | none |
| 3-variable predecessor = 1.196 x STE60V3 + 0.059 x QTc-B - 0.326 x RV4 | V3, V4, global | >= 23.4 favours LAD occlusion (sens 86%, spec 90.6%) | none |

**Not computable from samples.** The exclusion set that makes the formula applicable is partly morphological: 'terminal QRS distortion', 'one straight or convex ST segment in V2-V6'. Convexity and terminal QRS distortion (absence of both S wave and J wave in V2 or V3) are computable with a definition you supply, but the paper does not give one numerically. The authors state the formula 'needs to be validated'.

**Guidelines disagree.** This is not a guideline criterion and no society endorses it; it is included because it is the only measurable rule that addresses the case the guideline thresholds handle worst. It also measures ST at J+60 ms in V3, contradicting the UDMI's at-the-J-point convention.

*Source:* Driver BE, Khalil A, Henry T, Kazmi F, Adil A, Smith SW. A new 4-variable formula to differentiate normal variant ST segment elevation in V2-V4 (early repolarization) from subtle left anterior descending coronary occlusion - Adding QRS amplitude of V2 improves the model. J Electrocardiol 2017;50:561-569.

### Persistent ST elevation of left ventricular aneurysm vs acute anterior STEMI  `ANEUR, AMI, ASMI, STE_`

**Rule.** With anterior ST elevation and Q waves, the ratio of T-wave amplitude to QRS amplitude separates acute infarction from chronic aneurysmal ST elevation.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Sum of T-wave amplitudes divided by sum of QRS amplitudes | V1-V4 (sums across the four leads) | > 0.22 predicts acute STEMI; <= 0.22 favours LV aneurysm (sens 91.5%, spec 68.8%) | none |
| Maximum single-lead T/QRS amplitude ratio | any one of V1-V4 | >= 0.36 predicts acute STEMI (sens 91.5%, spec 81.3%) | none |

**Not computable from samples.** The PTB-XL label ANEUR ('ST-T changes compatible with ventricular aneurysm') implies PERSISTENCE of ST elevation weeks after infarction, which requires a prior tracing or clinical history — unmeasurable from one record. Only the T/QRS discriminator is computable.

**Guidelines disagree.** No competing quantitative rule exists in any society document; the AHA/UDMI documents note only that persistent ST elevation may reflect 'ventricular dyskinesis' without giving a threshold. Flag to the user that this is single-centre evidence, not guideline.

*Source:* Klein LR, Shroff GR, Beeman W, Smith SW. Electrocardiographic criteria to differentiate acute anterior ST-elevation myocardial infarction from left ventricular aneurysm. Am J Emerg Med 2015;33:786-790 (validation of rules originally derived by Smith SW, Am J Emerg Med 2005).

### MEASUREMENT CONVENTION — where on the waveform ST amplitude is measured, and against what baseline (the J vs J+60/J+80 question)  `STE_, STD_, NST_`

**Rule.** Every ST threshold above is meaningless without the measurement instant and the isoelectric reference. Resting-ECG diagnosis uses the J point; stress testing uses 60-80 ms after the J point; the reference baseline differs by document.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Measurement instant — resting diagnosis | all | AT THE J POINT (junction of QRS termination and ST onset). Used by: 4th UDMI 2018; AHA/ACCF/HRS Part VI 2009; Minnesota Code (ST-J) | none |
| Measurement instant — exercise / stress testing | all | 60 to 80 ms AFTER the J point, averaged over >= 3 consecutive beats in the same lead with a stable baseline. Used by: AHA Exercise Standards 2013 | none |
| Measurement instant — permitted range in the AHA ST/T statement | all | 'usually measured at the J point, and in some settings such as exercise testing, 40 and up to 80 ms after the J point' | none |
| Isoelectric reference — 4th UDMI | all | the ONSET OF THE QRS is recommended as the reference point for J-point determination (TP segment is stated to be more accurate in a stable baseline, but tachycardia and drift make it unreliable acutely) | none |
| Isoelectric reference — AHA Part IV | all | ST and T amplitudes are referenced against the TP or PR segment | none |
| Isoelectric reference — AHA Exercise Standards / Minnesota Code / Smith modified Sgarbossa | all | end of the PR segment (the P-Q junction) / the P-R baseline / the PR segment respectively | none |
| Stress-test positivity threshold | all | horizontal or downsloping ST depression >= 1 mm (0.1 mV) at 60-80 ms after the J point; upsloping depression is 'equivocal' (2.0 mm at 80 ms upsloping has been proposed for high-risk symptomatic patients); in post-MI Q-wave leads, > 0.10 mV J-point elevation at 60 ms after J is abnormal | none |

**Not computable from samples.** Baseline-wander filtering destroys true DC level: the AHA statement notes that after low-frequency filtering, 'elevation of the ST segment may reflect PR/TP depression, true ST elevation, or both'. So the sign of the deviation is a convention, not a physical measurement.

**Guidelines disagree.** This is the single largest source of silent disagreement in the family. QRS onset (UDMI) vs TP/PR (Part IV) vs P-Q junction (exercise standards, Minnesota, Smith). And J point (diagnosis) vs J+60/J+80 (stress). AHA Part IV's own normal-limit tables show the size of the effect: 98th percentile ST in V2 for white men >= 40 is ~0.15 mV at the J point but ~0.30 mV at J+60 ms — a factor of two for the same lead and population. A teaching tool must display which convention it used.

*Source:* 4th universal definition of MI (2018), Eur Heart J 2019;40:237-269, section 27 and Figure 8; Rautaharju PM, Surawicz B, Gettes LS, Part IV, J Am Coll Cardiol 2009;53:982-991; Fletcher GF, Ades PA, Kligfield P, et al. Exercise Standards for Testing and Training: A Scientific Statement From the American Heart Association. Circulation 2013;128:873-934, 'ST-Segment Deviation' and 'J-Point Deviation and Upsloping ST Depression'.

### Non-specific ST-T change (the residual category)  `NST_, NDT, NT_, TAB_, STD_, STE_, LOWT`

**Rule.** ST-T deviation that is present but does not meet ischaemic thresholds, or T-wave abnormality that cannot be attributed to a cause. There is no primary criterion set defining it positively; the operational definitions in use are the Minnesota 'minor' codes and the AHA's descriptive advice.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Minnesota 'minor' ST-T abnormality set | the three MC lead groups | codes 4-3 (downsloping ST with nadir >= 0.5 mm below P-R, ST-J depression < 0.5 mm), 4-4 (ST-J depression >= 1.0 mm with upsloping/U-shaped ST), 5-3 (flat/negative/diphasic T with < 1.0 mm negative phase), 5-4 (positive T with T/R < 1/20 and R >= 10 mm) | none |
| Minnesota 'major' ST-T abnormality set (for contrast) | the three MC lead groups | codes 4-1, 4-2, 5-1, 5-2 | none |
| AHA reporting threshold for ST depression in a routine report | all | the report should note ST depression when it is 0.1 mV (1 mm) or more pronounced | none |

**Not computable from samples.** 'Non-specific' is by construction a statement about the ABSENCE of an attributable cause; Part IV states plainly that for minor T-wave abnormalities it is 'virtually impossible to develop a cause-specific classification' and recommends the label 'slight or indeterminate'. Any program output here is a description, not a diagnosis, and should be labelled as such. Distinguishing primary from secondary (rate-, conduction-, hypertrophy- or drug-related) repolarisation change requires the QRS classification and often clinical data.

**Guidelines disagree.** No primary source defines 'non-specific ST-T change' numerically at all; PTB-XL's NST_/NDT/NT_/TAB_ come from the SCP-ECG statement vocabulary, not from a diagnostic guideline. Different cohorts operationalise 'minor ST-T abnormality' differently (MC 4-3/4-4/5-3/5-4 is the common one but some use 4-2/5-2 as minor).

*Source:* Rautaharju PM, Surawicz B, Gettes LS, Part IV, J Am Coll Cardiol 2009;53:982-991, 'ST-Segment Abnormalities' and 'T-Wave Abnormalities' recommendations; Minnesota Code Manual 2nd ed. 2010 (major/minor split as used in ARIC and other cohorts).

### Secondary repolarisation change: ST-T abnormality attributable to LVH, bundle branch block, pacing, drugs or electrolytes (the exclusion clause of every ischaemia criterion)  `NST_, NDT, DIG, EL, LVH, VCLVH, SEHYP, CLBBB, CRBBB, PACE, ANEUR`

**Rule.** ST-T abnormalities that are secondary to abnormal depolarisation (LVH, BBB, pre-excitation, pacing) or to drugs/electrolytes must be labelled as such and must not be interpreted with the ischaemia thresholds — the UDMI table is explicitly conditional on 'the absence of left ventricular hypertrophy and bundle branch block'.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Gate on the ischaemia thresholds | all | apply the UDMI ST thresholds ONLY when LVH and BBB classifiers are negative (QRS < 120 ms and voltage criteria not met) | none |
| Hypokalaemia U-wave relationship | V2, V3 (U wave most evident); any lead for the comparison | U-wave amplitude exceeding the T-wave amplitude in the same lead has been associated with serum K < 2.7 mmol/L; an inverted U wave in V2-V5 is abnormal; U amplitude ~0.33 mV or 11% of T is typical normal; U rarely present at rates > 95 bpm | none |
| Reporting rule | all | the ECG report must state whether ST-T changes are primary or secondary; automated algorithms should be programmed to identify them | none |

**Not computable from samples.** Digitalis effect (PTB-XL DIG) has NO quantitative criteria in any primary source: it is a morphology call ('sagging'/scooped downsloping ST with shortened QT) and requires knowing the patient is on digoxin. Similarly EL ('electrolytic disturbance or drug') requires serum chemistry; there is no guideline-endorsed mV threshold for hyperkalaemic peaked T waves. Both must be marked unmeasurable rather than implemented with invented numbers.

**Guidelines disagree.** None on principle. Flagged: I could not find any primary-source numeric criterion for digitalis effect or for hyperkalaemic T-wave morphology; the widely quoted numbers (e.g. 'T > 10 mm precordial') do not trace to AHA/ESC/Minnesota documents.

*Source:* Rautaharju PM, Surawicz B, Gettes LS, Part IV, J Am Coll Cardiol 2009;53:982-991, 'Primary and secondary repolarization abnormalities', 'The U Wave'; 4th universal definition of MI (2018), Table 2 header and section 31.

### Long QT as an ST-T family label (PTB-XL puts LNGQT in the STTC superclass)  `LNGQT, EL, STTC`

**Rule.** Rate-adjusted QT above sex-specific limits is reported as a prolonged QT interval; short QT below a common limit.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Rate-adjusted QT (QTc) | global measurement across leads | >= 460 ms | women |
| Rate-adjusted QT (QTc) | global | >= 450 ms (text elsewhere in the same paper says 'longer than 450 ms'; the Recommendation says '450 ms or longer') | men |
| Rate-adjusted QT (QTc) — short QT | global | <= 390 ms | both sexes |
| Regulatory severity levels | global | > 450 ms, > 480 ms, > 500 ms (FDA reporting tiers cited by the statement) | none |
| Paediatric limit | global | 98th percentile Bazett-corrected QT ~450 ms in children < 12 y; an 8 ms sex difference appears at ages 12-16 | age-dependent |
| Conduction-defect adjustment | global | with prolonged QRS, use QT and RR with QRS duration as covariates, or use the JT interval (QT - QRS) with JT-specific normal limits | applies when QRS is prolonged |

**Not computable from samples.** The statement warns that Bazett's formula 'may produce false QT prolongations'; choosing the rate-correction formula changes the answer, and no single formula is mandated. T-end determination in the presence of T-U fusion is explicitly noted as unreliable.

**Guidelines disagree.** Within the one document: the narrative gives 'men, longer than 450 ms' while the Recommendation gives 'men 450 ms or longer'. The FDA tiers (480/500 ms) are used for drug studies and are far above the diagnostic limits. Other bodies use 470/480 ms for men/women — those are not from this primary source and are not asserted here.

*Source:* Rautaharju PM, Surawicz B, Gettes LS, Part IV, J Am Coll Cardiol 2009;53:982-991, 'The QT Interval' and its Recommendation.

### Regional attribution of ischaemic ST-T change (which leads map to which PTB-XL region code)  `ISCAL, ISCAS, ISCAN, ISCIN, ISCIL, ISCLA, INJAS, INJAL, INJIN, INJLA, INJIL, AMI, ASMI, ALMI, IMI, ILMI, LMI`

**Rule.** The affected region is identified by the body-surface position of the leads showing the ST deviation; specific lead patterns map to specific coronary occlusion sites.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Contiguous lead groupings (UDMI) | (I, aVL), (V1-V6), (II, III, aVF); the same criteria extend to V7-V9 | two leads within one grouping | none |
| Proximal LAD occlusion pattern | ST elevation in I and aVL plus V1-V4 (sometimes V6), with ST depression in II, III, aVF | meets the lead-specific elevation thresholds; automated interpretation should suggest extensive anterior / anterobasal ischaemia due to proximal LAD occlusion | none |
| Mid/distal LAD occlusion pattern | ST elevation in V3-V6 WITHOUT ST depression in II, III, aVF | as above; suggests mid or distal LAD | none |
| RCA vs LCx discrimination in inferior MI | II, III, aVF, I, aVL | RCA: ST elevation greater in III than in II, often with ST depression in I and aVL. LCx: ST elevation greater in II than III, with I and aVL isoelectric or elevated | none |

**Not computable from samples.** Culprit-vessel attribution is probabilistic and cannot be verified from the ECG alone. PTB-XL's ISC*/INJ* codes come from the SCP-ECG statement vocabulary, which does NOT publish the exact lead set behind each regional name (anteroseptal / anterior / anterolateral / lateral / inferior / inferolateral) — any lead-to-region mapping in the tool is your convention, not a guideline's, and must be documented.

**Guidelines disagree.** AHA Part VI explicitly RECOMMENDS AGAINST labelling leads as anterior/inferior/lateral ('leads should be identified according to their original nomenclature'), while PTB-XL's entire ISC*/INJ* code family is built on exactly those regional labels. Part VI also recommends the Cabrera display order (aVL, I, -aVR, II, aVF, III) so that limb leads are anatomically contiguous — under the conventional display, 'contiguous' limb leads are not adjacent on the page.

*Source:* Wagner GS et al., AHA/ACCF/HRS Part VI, J Am Coll Cardiol 2009;53:1003-1011, 'Correlation of ST-Segment Elevation and Depression to the Region Involved and to the Occluded Vessel' and its recommendations; 4th universal definition of MI (2018), Table 3 footnote for the contiguous groupings.

**Notes.** SOURCE STATUS. Verified verbatim from primary full text that I downloaded and text-extracted (files kept in /private/tmp/claude-501/-Users-svisagan-Programs-ecg-analysis/7ee0b2a3-a09f-4310-815d-3cf961573357/scratchpad/): 4th Universal Definition of MI, Eur Heart J 2019;40:237-269 (udmi4.txt, Tables 2 and 3 and sections 27/28/31/32); AHA/ACCF/HRS Part VI Acute Ischemia/Infarction, JACC 2009;53:1003-1011 (partVI.txt); AHA/ACCF/HRS Part IV ST Segment, T and U Waves, QT, JACC 2009;53:982-991 (partIV.txt); Macfarlane et al. Early Repolarization Pattern consensus, JACC 2015;66:470-477 (er2015.txt); AHA Exercise Standards, Circulation 2013;128:873-934 (exstd2013.txt); Minnesota Code 4/5/9-2 definitions via the ARIC composite Minnesota-code data book (ecgmc35.txt). Verified from PubMed primary abstracts: Sgarbossa NEJM 1996;334:481-487; Smith Ann Emerg Med 2012;60:766-776; Driver J Electrocardiol 2017;50:561-569; Klein Am J Emerg Med 2015;33:786-790.

FLAGGED AS NOT FULLY VERIFIED AGAINST PRIMARY TEXT: (a) the 2013 ACCF/AHA STEMI guideline wording that omits the men-<40 age split — ahajournals.org and jacc.org return HTTP 403 to automated fetches; I have the sentence only through a search-engine extract of the Circulation article, so treat the exact punctuation as unconfirmed even though the substance (no age split) is corroborated by the guideline's own citation of the 2007 universal definition. (b) The 2025 ACC/AHA/ACEP/NAEMSP/SCAI ACS guideline (Circulation 2025, doi 10.1161/CIR.0000000000001309) — same 403; a search extract indicates it DOES carry the age split and recommends V7-V9 for ongoing symptoms with a non-diagnostic ECG or V1-V3 depression, but I could not read the primary table. (c) NOVACODE ST-T criteria (Rautaharju et al., J Electrocardiol 1998;31:157-187) — not obtainable; the ARIC ECG manual confirms NOVACODE runs alongside the Minnesota Code at the EPICARE core lab, but I did not verify any NOVACODE threshold and have asserted none. (d) The EPICARE Minnesota Code reference pages (epicare.phs.wakehealth.edu) were unreachable from this network; the code text above comes from the ARIC data book instead, and the ARIC book has an evident copy-paste error repeating 'leads I, aVL, or V6' in the inferior and precordial rows of code 4 — the lead group is given by the variable name (L4 = I/aVL/V6, F4 = II/III/aVF, V4 = V1-V5), which is how I have reported it. PDF text extraction also lost the '>=' glyph in that document (rendered as '='); I have restored it per the standard code definitions.

PTB-XL MAPPING CAVEATS THAT MATTER FOR A TEACHING TOOL. (1) STE_, STD_, NST_, NDT, NT_, TAB_, INVT, LOWT are FORM statements in scp_statements.csv (form=1.0), not diagnostic ones — STE_/STD_/QWAVE/LOWT/HVOLT etc. have an empty diagnostic column and no diagnostic_class, so they never appear in the STTC superclass even though they are the ST-T descriptors. (2) The diagnostic STTC superclass contains NST_, NDT, DIG, LNGQT, ISC_, ISCAL, ISCAS, ISCAN, ISCIN, ISCIL, ISCLA, ANEUR, EL — while the INJ* 'subendocardial injury' codes sit in the MI superclass (INJAS/INJAL/INJLA under AMI; INJIN/INJIL under IMI) despite being ST-depression findings. Any tool that treats 'ST-T family' as STTC will miss the INJ* codes. (3) There is NO early-repolarisation code in PTB-XL's statement set; such records will be NORM or STE_. (4) V7-V9 and V3R/V4R criteria cannot be evaluated at all from the 12-lead records — flag these rules as 'requires additional leads', do not silently approximate them from V1-V3. (5) Ancestry is not in the PTB-XL metadata; age and sex are, so every sex/age threshold above is implementable but no ancestry adjustment is (and none is guideline-endorsed anyway).

THE ONE THING MOST LIKELY TO BE TAUGHT WRONGLY: '1 mm of ST elevation' is not a single quantity. It depends on the reference baseline (QRS onset per the 4th UDMI; TP or PR per AHA Part IV; P-Q junction per the exercise standards, Minnesota Code and Smith's modified Sgarbossa) and on the instant (J point for diagnosis, J+60 to J+80 ms for stress). AHA Part IV's own normal-limit data show the 98th percentile in V2 roughly doubling between the J point and J+60 ms. Display both the convention and the measured value.

## Hypertrophy and chamber enlargement (LVH, RVH, biventricular, left/right atrial abnormality)

### Left ventricular hypertrophy — Sokolow-Lyon precordial voltage index (PTB-XL: LVH; the voltage-only form statement is VCLVH)  `LVH, VCLVH`

**Rule.** Sum the S-wave amplitude in V1 and the R-wave amplitude in V5 (or V6, whichever is taller) and call it LVH above 35 mm (3.5 mV). Note that the AHA/ACCF/HRS 2009 Table 1 prints this criterion as SV1 + RV5 > 35 mm, naming V5 only, whereas Sokolow and Lyon's 1949 paper and essentially all subsequent use take the larger of RV5 and RV6.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| SV1 + max(RV5, RV6) — peak-to-baseline S depth in V1 plus peak R height in V5/V6 | V1 plus V5 and V6 | >= 35 mm (>= 3.5 mV); AHA Part V Table 1 prints '> 35 mm' | None applied in the original criterion. AHA Part V explicitly warns the criterion is validated for adults > 35 years; accuracy is low at 16-35 years and in trained athletes. Sokolow-Lyon has HIGHER sensitivity / LOWER specificity in African-Americans than Euro-Americans, and is LESS often positive in obesity (adipose insulation and increased heart-to-electrode distance). |
| Same sum, LIFE-trial entry variant | V1 plus V5/V6 | > 38 mm (> 3.8 mV) | Used as a trial-eligibility threshold, not a diagnostic one (LIFE, Okin/Devereux/Dahlof) |

**Not computable from samples.** The AHA-mandated adjustments for race/ancestry and body habitus cannot be applied from the waveform: PTB-XL carries age and sex for all 21,799 records but no ancestry field, and height is present in only 6,974 and weight in only 9,421 records, so BMI-conditioned interpretation is unavailable for the majority. AHA Part V also states criteria should only be used 'without modification from the tested form' — a program that re-tunes the 35 mm cut is no longer running Sokolow-Lyon.

**Guidelines disagree.** THREE separate disagreements on one criterion. (1) Lead set: AHA Part V Table 1 prints 'SV1 + RV5 > 35 mm' (V5 only); the original paper and Pewsner's BMJ 2007 systematic review both use 'SV1 + RV5 or V6'. (2) Inequality: AHA Table 1 prints strict '>', Pewsner 2007 and the Peguero meta-analysis use '>= 3.5 mV'. At integer-mm resolution these differ for exactly 35 mm. (3) Threshold: LIFE used > 38 mm for enrolment. Sensitivity estimates diverge wildly by population — Pewsner 2007 median 21% (range 4-52%), specificity 89% (53-100%); the Peguero meta-analysis pooled 0.24 sensitivity / 0.94 specificity; one echo-referenced series reported 1.9% sensitivity.

*Source:* Sokolow M, Lyon TP. The ventricular complex in left ventricular hypertrophy as obtained by unipolar precordial and limb leads. Am Heart J 1949;37:161-186. Reproduced in Hancock EW, Deal BJ, Mirvis DM, Okin P, Kligfield P, Gettes LS. AHA/ACCF/HRS Recommendations for the Standardization and Interpretation of the Electrocardiogram, Part V: Electrocardiogram Changes Associated With Cardiac Chamber Hypertrophy. Circulation 2009;119:e251-e261 (copublished J Am Coll Cardiol 2009;53:992-1002), Table 1.

### Left ventricular hypertrophy — R wave in aVL alone (Sokolow-Lyon limb-lead criterion)  `LVH, VCLVH`

**Rule.** R-wave amplitude in lead aVL above 11 mm is by itself a criterion for LVH.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| R amplitude in aVL | aVL | > 11 mm (> 1.1 mV) per AHA Part V Table 1; commonly stated as >= 11 mm | AHA Part V: R-wave amplitude in leads I and aVL is NOT a reliable LVH criterion in the presence of left anterior fascicular block, because the LAFB vector shift itself enlarges R in I and aVL |

**Not computable from samples.** Nothing intrinsically — but the criterion must be suppressed or flagged when LAFB is detected, which requires a separate LAFB classification step rather than a raw amplitude read.

**Guidelines disagree.** AHA Table 1 prints '> 11 mm'; the 2018 ESH/ESC hypertension guideline and much clinical literature state '>= 11 mm'. Some sources instead quote R aVL >= 12 mm. A separate, unrelated criterion, R in aVR >= 11 mm, appears in at least one published comparison study conflated with the Sokolow-Lyon index — that is an error; aVR >= 4 mm is an RVH criterion, not an LVH one.

*Source:* Sokolow M, Lyon TP. Am Heart J 1949;37:161-186; tabulated in Hancock et al., Circulation 2009;119:e251-e261, Table 1.

### Left ventricular hypertrophy — Cornell voltage (sex-specific)  `LVH, VCLVH`

**Rule.** Add the R-wave amplitude in aVL to the S-wave amplitude in V3. Threshold differs by sex: above 28 mm in men, above 20 mm in women.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| RaVL + SV3 | aVL and V3 | > 28 mm (> 2.8 mV) | MEN |
| RaVL + SV3 | aVL and V3 | > 20 mm (> 2.0 mV) | WOMEN. AHA Part V states SV3 is the single measurement with the largest male-female difference, and that the difference persists after adjustment for body size and cardiac mass. |

**Not computable from samples.** Race adjustment: AHA Part V reports Cornell voltage has LOWER sensitivity and HIGHER specificity in African-Americans than Euro-Americans, but gives no adjusted threshold, and ancestry is absent from PTB-XL metadata. Obesity: Okin et al. showed the Cornell family is MORE often positive in obese patients (the opposite direction to Sokolow-Lyon), but no validated BMI-adjusted cut exists.

**Guidelines disagree.** The 1985 Casale paper reports more than one partition. Its abstract states criteria of 'RaVL + SV3 total more than 35 mm' in men and 'more than 25 mm' in women for one age/T-wave-stratified rule, while the simple sex-specific partition that entered guidelines and every automated system is > 28 mm / > 20 mm. Do not implement the 35/25 numbers as 'Cornell voltage'. Separately, some sources state '>=' rather than '>'. Reported accuracy varies enormously: Pewsner BMJ 2007 gave low median sensitivity; the Peguero meta-analysis pooled 0.29 sensitivity / 0.92 specificity; a single-centre echo-referenced series reported 3.9% sensitivity / 96.5% specificity.

*Source:* Casale PN, Devereux RB, Kligfield P, Eisenberg RR, Miller DH, Chaudhary BS, Phillips MC. Electrocardiographic detection of left ventricular hypertrophy: development and prospective validation of improved criteria. J Am Coll Cardiol 1985;6:572-580. Tabulated in Hancock et al., Circulation 2009;119:e251-e261, Table 1 (attributed there as 'Casale 1985'). Sex-specific autopsy validation: Casale PN, Devereux RB, Alonso DR, et al. Improved sex-specific criteria of left ventricular hypertrophy for clinical and computer interpretation of electrocardiograms: validation with autopsy findings. Circulation 1987;75:565-572.

### Left ventricular hypertrophy — Cornell voltage-duration product (Cornell product)  `LVH, VCLVH`

**Rule.** Multiply the Cornell voltage (RaVL + SV3, with a fixed millimetre allowance added in women) by the QRS duration in milliseconds; a product above roughly 2440 mm·ms indicates LVH.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| (RaVL + SV3) x QRS duration — original Molloy 1992 partition, no sex offset stated | aVL and V3 for voltage; global QRS duration | > 2436 mm·ms | AHA Part V Table 1 prints the unit as 'mm/sec', which is a typographical error; the quantity is millimetres x milliseconds |
| (RaVL + SV3 + 8 mm in women) x QRS duration — original LIFE entry definition | aVL and V3; global QRS duration | > 2440 mm·ms | WOMEN receive +8 mm added to the voltage sum; men receive no offset |
| (RaVL + SV3 + 6 mm in women) x QRS duration — amended LIFE definition | aVL and V3; global QRS duration | > 2440 mm·ms | WOMEN receive +6 mm. The LIFE protocol was amended mid-trial: the sex adjustment was reduced from 8 mm to 6 mm and Sokolow-Lyon > 38 mm was added as an alternative entry route. |
| QRS duration used as the multiplier | Global (12-lead) QRS duration, not a single-lead value | Measured in ms from earliest QRS onset to latest QRS offset across leads | Using a single-lead QRS duration instead of the global one systematically shortens the product and will move cases below threshold |

**Not computable from samples.** Nothing — this is one of the few fully computable composite criteria, provided the program has a reliable global QRS onset/offset. Its accuracy claim, however, is conditioned on populations (hypertensives aged 55-80 in LIFE) that a general dataset does not match.

**Guidelines disagree.** MATERIAL DISAGREEMENT ON THE FEMALE OFFSET. Three numbers are in active use: no offset (Molloy 1992, threshold 2436 mm·ms), +8 mm (original LIFE entry criterion, threshold 2440 mm·ms, and the definition used by Pewsner's BMJ 2007 systematic review), and +6 mm (amended LIFE protocol and the majority of subsequent LIFE publications, threshold 2440 mm·ms). An 8-vs-6 mm difference at a typical 100 ms QRS shifts the product by 200 mm·ms — roughly 8% of the threshold — so a teaching tool must not state one as the number. Also note the threshold itself differs: 2436 vs 2440 mm·ms. Molloy 1992 reported 51% sensitivity for the Cornell product versus 36% for Cornell voltage at a matched 95% specificity against autopsy LV mass (n=220, 95 with LVH); Okin 1995 reported 37% vs 28% at a matched 96% specificity — the same direction of improvement, very different absolute numbers.

*Source:* Molloy TJ, Okin PM, Devereux RB, Kligfield P. Electrocardiographic detection of left ventricular hypertrophy by the simple QRS voltage-duration product. J Am Coll Cardiol 1992;20:1180-1186. Okin PM, Roman MJ, Devereux RB, Kligfield P. Electrocardiographic identification of increased left ventricular mass by simple voltage-duration products. J Am Coll Cardiol 1995;25:417-423. Tabulated in Hancock et al., Circulation 2009;119:e251-e261, Table 1.

### Left ventricular hypertrophy — total 12-lead voltage and 12-lead voltage-duration product  `LVH, VCLVH`

**Rule.** Sum the absolute R and S amplitudes across all 12 leads; that sum alone, or that sum multiplied by QRS duration, is a criterion.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Total 12-lead voltage (sum of absolute R + S amplitudes in all 12 leads) | All 12 leads | > 175 mm (> 17.5 mV) | Derived in severe aortic valve disease (Siegel & Roberts 1982) |
| Total 12-lead voltage x QRS duration | All 12 leads; global QRS duration | > 1742 mm·ms | AHA Part V Table 1 again prints 'mm/sec' in error |

**Not computable from samples.** None for the arithmetic, but the sum is extremely sensitive to baseline-wander correction and to how R' and S' components of fragmented or notched QRS complexes are counted; the primary papers do not define this at the sample level.

**Guidelines disagree.** Molloy 1992 reported the 12-lead product at 45% sensitivity vs 31% for 12-lead voltage alone at matched 95% specificity; Okin 1995 reported the analogous pair at a matched 96% specificity with different absolute values. The Siegel 175 mm criterion was derived in severe aortic stenosis and its specificity in an unselected population is not established.

*Source:* Siegel RJ, Roberts WC. Electrocardiographic observations in severe aortic valve stenosis. Am Heart J 1982;103:210-221. Molloy TJ, Okin PM, Devereux RB, Kligfield P. J Am Coll Cardiol 1992;20:1180-1186. Both tabulated in Hancock et al., Circulation 2009;119:e251-e261, Table 1.

### Left ventricular hypertrophy — Romhilt-Estes point score  `LVH`

**Rule.** Award points across six domains — QRS amplitude, secondary ST-T change, left atrial abnormality, left axis deviation, QRS duration and intrinsicoid deflection — and total them. 5 or more points is definite LVH, exactly 4 is probable LVH, 3 or fewer is negative.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Amplitude criterion (any one of three sub-conditions satisfies it) | Any limb lead (I, II, III, aVR, aVL, aVF) for the first sub-condition; V1 or V2 for the second; V5 or V6 for the third | 3 POINTS if: R or S in any limb lead >= 20 mm (2.0 mV), OR S in V1 or V2 >= 30 mm (3.0 mV), OR R in V5 or V6 >= 30 mm (3.0 mV) | None |
| Secondary ST-T abnormality (ST segment and T wave directed opposite to the QRS) | Assessed in V5 or V6 in the ARIC operationalisation; the 1968 original phrases it as the ST-T vector opposite the mean QRS vector | 3 POINTS if present in a patient NOT taking digitalis; 1 POINT if present in a patient taking digitalis | None |
| Left atrial abnormality — P terminal force in V1 (terminal negative deflection) | V1 | 3 POINTS if terminal negativity is >= 1 mm (0.10 mV) deep AND >= 40 ms (0.04 s) wide | None |
| Frontal-plane mean QRS axis | Frontal plane (computed from limb leads) | 2 POINTS if axis <= -30 degrees | None |
| QRS duration | Global | 1 POINT if >= 90 ms (0.09 s) | None |
| Intrinsicoid deflection / R-wave peak time (QRS onset to R peak) | V5 or V6 | 1 POINT if >= 50 ms (0.05 s) | None |
| Total score | n/a | >= 5 points = definite LVH; = 4 points = probable LVH; <= 3 points = LVH unlikely. Maximum attainable total is 13 (the digitalis and non-digitalis ST-T rows are mutually exclusive). | None |

**Not computable from samples.** THE DIGITALIS BRANCH IS NOT COMPUTABLE FROM THE SAMPLES. Whether the ST-T domain scores 3 points or 1 point depends on whether the patient is taking digitalis — a medication history, not an ECG measurement. PTB-XL carries no drug field. A program must either assume no digitalis (scoring 3, which inflates the score in digitalised patients and can push a 4 to a 6) or refuse to score the domain. This single unmeasurable input changes the definite/probable/negative classification. Additionally, 'ST-T in a direction opposite to the QRS' is a morphology judgement in the original; the ARIC operationalisation reduces it to V5/V6 discordance, which is computable, but that reduction is an interpretation, not the published criterion.

**Guidelines disagree.** (1) AMPLITUDE ROW CONFLICT: AHA Part V Table 1 prints the Romhilt 1968 limb-lead row as 'R+S in any limb lead > 19 mm' — a SUM of R and S. Every reproduction of the original point score, including ARIC's, states 'R OR S in any limb lead >= 20 mm'. R+S and max(R,S) are different computations and will disagree on real tracings. I could not obtain the 1968 original to adjudicate; FLAG AS UNRESOLVED and prefer the 'R or S >= 20 mm' form, which is what every validation study used. (2) POINT ALLOCATION CONFLICT: one peer-reviewed comparison study assigns 2 points to delayed intrinsicoid deflection and 2 points to QRS duration '>= 0.90 s' — both wrong; the correct values are 1 point each and 0.09 s. Do not use that paper's table. (3) MAXIMUM SCORE: some sources say 14, counting both ST-T rows, which cannot both apply; 13 is the attainable maximum. (4) CUTOFF: Pewsner BMJ 2007 evaluated >= 4 and >= 5 separately and found specificity 99% (range 71-100%) at >= 5 with correspondingly poor sensitivity; negative likelihood ratio at >= 4 was 0.85 (range 0.34-1.03) — i.e. a negative Romhilt-Estes does not rule out LVH.

*Source:* Romhilt DW, Estes EH Jr. A point-score system for the ECG diagnosis of left ventricular hypertrophy. Am Heart J 1968;75:752-758. Component-level operationalisation with exact thresholds reproduced in Jain A, et al. (ARIC investigators) — Individual components of the Romhilt-Estes left ventricular hypertrophy score differ in their prediction of cardiovascular events: the Atherosclerosis Risk in Communities (ARIC) study, Am Heart J 2015 (PMC4684592), and in the ARIC manuscript proposal #2476 documentation. Listed in Hancock et al., Circulation 2009;119:e251-e261, Table 1 as 'Voltage-STT-LAA-axis-QRS duration Point score, Romhilt 1968'.

### Left ventricular hypertrophy — limb-lead voltage criteria (Lewis, Gubner-Ungerleider, Goldberger, Schack)  `LVH, VCLVH`

**Rule.** Historical single-lead and limb-lead-combination amplitude thresholds, all listed in AHA/ACCF/HRS Part V Table 1 as validated but not preferred.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| (R I - S I) + (S III - R III) — Lewis index | I and III | > 16 mm (> 1.6 mV) | None |
| R I + S III — Gubner-Ungerleider index | I and III | > 25 mm (> 2.5 mV) | None |
| R I alone | I | > 15 mm (> 1.5 mV) | None |
| R aVF | aVF | > 20 mm (> 2.0 mV) | None |
| Q or S in aVR | aVR | > 19 mm (> 1.9 mV) | None |

**Not computable from samples.** None — all are pure amplitude arithmetic. The R I and aVL-based members must be suppressed in left anterior fascicular block per AHA Part V.

**Guidelines disagree.** Pewsner BMJ 2007 defines Gubner as 'R I + S III >= 25 mm' (their text erroneously prints mV for mm) whereas AHA Table 1 prints '> 25 mm'. Pewsner found Gubner the least sensitive index of all evaluated: median sensitivity 10.5% (range 0-39%), with a negative likelihood ratio of 0.91 (0.70-1.01) — statistically indistinguishable from useless for ruling out LVH.

*Source:* Lewis T, 1914; Gubner R, Ungerleider HE, 1943; Goldberger E, 1949; Schack JA et al., Am Heart J 1950;40:696-705. All tabulated in Hancock et al., Circulation 2009;119:e251-e261, Table 1.

### Left ventricular hypertrophy — precordial voltage criteria (Wilson, Mazzoleni, Grant, McPhie, Wolff, Murphy, Romhilt 1969, Holt, Manning)  `LVH, VCLVH`

**Rule.** The remaining validated precordial amplitude criteria tabulated in AHA/ACCF/HRS Part V Table 1. AHA recommendation 3 states computer systems should apply ALL criteria supported by valid evidence, and recommendation 4 states the interpretation must name which criteria were used and which were abnormal.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| S V1 | V1 | > 23 mm (> 2.3 mV) | None |
| S V2 | V2 | > 25 mm (> 2.5 mV) | None |
| S V2 + R V5 or V6 | V2 plus V5/V6 | > 45 mm (> 4.5 mV) | None |
| S V2 + R V4 or V5 | V2 plus V4/V5 | > 45 mm (> 4.5 mV) | None |
| max(S V1, S V2) + max(R V5, R V6) | V1/V2 plus V5/V6 | > 35 mm (> 3.5 mV) | None |
| max(S V1, S V2) + R V6 | V1/V2 plus V6 | > 40 mm (> 4.0 mV) | None |
| R + S in any single precordial lead | Any of V1-V6 | > 35 mm (> 3.5 mV) | None |
| R in any single precordial lead | Any of V1-V6 | > 26 mm (> 2.6 mV) | None |
| R V5 | V5 | > 33 mm (> 3.3 mV) | None |
| R V6 | V6 | > 25 mm (> 2.5 mV) | None |
| R V5 : R V6 ratio | V5 and V6 | > 1.0 | None |
| (R + S) in aVF + (R + S) in V2 + (R + S) in V6 — Manning composite | aVF, V2, V6 | > 59 mm if AGE > 30 years; > 93 mm if AGE < 30 years | AGE-DEPENDENT. Note the criterion is undefined at exactly 30 years as printed. |

**Not computable from samples.** None arithmetically. But AHA Part V is explicit that QRS voltages fall with increasing age, that the commonly used criteria apply to adults over 35 years, that standards for ages 16-35 are not well established, and that LVH diagnosis by voltage alone in athletes is 'especially problematic'. Athletic status is not in the signal.

**Guidelines disagree.** AHA Part V Table 1 prints all of these with a strict '>'. Many are quoted elsewhere with '>='. The Manning age split has no defined behaviour at exactly age 30. None of these criteria has per-criterion sensitivity/specificity reported in Part V; the guideline gives only the blanket statement that sensitivity is usually below 50% and specificity often 85-90%.

*Source:* Wilson FN et al. 1944; Wolff L 1956; Grant RP 1957; McPhie J, Australas Ann Med 1958;7:317-327; Holt JH 1962; Manning GW 1964; Mazzoleni A 1964; Romhilt DW, Bove KE, Norris RJ, et al. 1969; Murphy ML et al. 1984. All tabulated in Hancock et al., Circulation 2009;119:e251-e261, Table 1.

### Left ventricular hypertrophy — Peguero-Lo Presti criterion (post-2009, not in AHA Part V)  `LVH, VCLVH`

**Rule.** Find the deepest S wave in any one of the 12 leads and add it to the S-wave amplitude in V4; compare against a sex-specific threshold. If the deepest S wave is itself in V4, that amplitude is counted twice.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| S_D + S_V4, where S_D is the amplitude of the deepest S wave in any single lead | Any single lead (for S_D) plus V4 | >= 2.8 mV (28 mm) | MEN |
| S_D + S_V4 | Any single lead plus V4 | >= 2.3 mV (23 mm) | WOMEN |
| Special case when the deepest S wave lies in V4 | V4 | S_V4 is added to itself (doubled) | None |

**Not computable from samples.** None — fully computable.

**Guidelines disagree.** THRESHOLDS ARE WIDELY MISQUOTED. A large amount of secondary literature states 2.3 mV for men and 1.9 mV for women. The correct published values, confirmed against the systematic review that reproduces them, are >= 2.8 mV in men and >= 2.3 mV in women. Also: this criterion post-dates AHA/ACCF/HRS Part V (2009) and therefore carries NO guideline endorsement; AHA recommendation 1 ('use only validated criteria, without deviation') does not cover it. Its accuracy is also disputed — the meta-analysis pooled 0.52 sensitivity / 0.85 specificity across six trials (0.56 / 0.90 after excluding healthy subjects), but a single-centre echo-referenced series found only 19.2% sensitivity. Do not present the 62% original figure as typical.

*Source:* Peguero JG, Lo Presti S, Perez J, Issa O, Brenes JC, Tolentino A. Electrocardiographic criteria for the diagnosis of left ventricular hypertrophy. J Am Coll Cardiol 2017;69:1694-1703. Reported sensitivity 62% (95% CI 50-72%) at specificity >= 90%, in a test cohort of 94 and a validation cohort of 122, against echocardiographic LV mass index.

### Left ventricular hypertrophy — Minnesota Code high-amplitude R waves (Code 3)  `LVH, VCLVH`

**Rule.** The Minnesota Code does not code 'LVH' as a diagnosis; it codes high-amplitude R waves as morphological findings, with amplitudes measured from the second-to-last complete normal beat in each lead.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Minnesota Code 3-1 (left) | V5 or V6; I, II, III, aVF; aVL | R > 26 mm in V5 or V6, OR R > 20.0 mm in any of I, II, III, aVF, OR R > 12.0 mm in aVL | None |
| Minnesota Code 3-2 (right) — an RVH-direction finding | V1 and leads to its left | R >= 5.0 mm AND R >= S in the majority of beats in V1, when S > R somewhere to the left of V1 on the chest | None |
| Minnesota Code 3-3 (left, optional) | I; V5 or V6 plus V1 | R > 15.0 mm but <= 20.0 mm in I, OR (R in V5 or V6) + (S in V1) > 35.0 mm | None |
| Minnesota Code 3-4 | n/a | Criteria for both 3-1 and 3-2 present simultaneously | None |

**Not computable from samples.** The 'second-to-last complete normal beat' rule requires beat classification (identifying normal vs ectopic beats and complete vs truncated complexes) before any amplitude is read — a beat-selection step that most naive implementations skip, silently changing the measured amplitudes. The 3-2 clause 'when S is greater than R somewhere to the left on the chest of V1' requires a cross-lead comparison over the precordial progression.

**Guidelines disagree.** Minnesota 3-3 uses '> 35.0 mm' for (R V5/V6 + S V1) — the same numeric threshold as Sokolow-Lyon but with the summands ordered differently and classified as an 'optional' left code rather than a diagnosis. Minnesota deliberately does not assert 'LVH'; mapping Code 3 onto the PTB-XL LVH label is an interpretive leap, not an equivalence.

*Source:* Prineas RJ, Crow RS, Zhang Z-M. The Minnesota Code Manual of Electrocardiographic Findings. Definitions as operationalised in the ARIC Study ECG Manual (Manual 5, Electrocardiography, Version 1.0, August 1987; dbGaP phs000280).

### Left ventricular hypertrophy in the presence of left anterior fascicular block  `LVH, LAFB`

**Rule.** LAFB shifts the QRS vector posteriorly and superiorly, enlarging R in I and aVL and deepening S in V5-V6, so the standard criteria mislead. Criteria that incorporate left-precordial S-wave depth are used instead.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| S V1 + R V5 + S V5 | V1 and V5 | > 25 mm (> 2.5 mV) | None |
| max(S V1, S V2) + R V6 + S V6 | V1/V2 and V6 | > 25 mm (> 2.5 mV) | None |
| S III + max(R/S amplitude in any lead) | III plus any lead | > 30 mm (> 3.0 mV) | MEN |
| S III + max(R/S amplitude in any lead) | III plus any lead | > 28 mm (> 2.8 mV) | WOMEN |

**Not computable from samples.** These criteria are conditional on LAFB having already been established, which requires a separate conduction-defect classification (axis, qR in I/aVL, rS in II/III/aVF, QRS duration) — the criteria themselves do not define LAFB. AHA Part V also states R-wave amplitude in I and aVL is 'not reliable' in this setting, which is a suppression rule, not a threshold.

**Guidelines disagree.** AHA Table 1 prints the Bozzi thresholds as '> 25' with NO UNIT given (the surrounding rows are in mm; mm is the near-certain intent, but the guideline table itself omits it). FLAG: unit inferred, not stated.

*Source:* Bozzi G, Figini A, 1976; Gertsch M, Theler A, Foglia E. Am J Cardiol 1988;62:590-593. Tabulated in Hancock et al., Circulation 2009;119:e251-e261, Table 1 (section 'Criteria for use with left anterior fascicular block').

### Left ventricular hypertrophy in the presence of right bundle branch block  `LVH, CRBBB`

**Rule.** RBBB reduces right-precordial S-wave amplitude and lowers the sensitivity of standard LVH criteria. RBBB-specific criteria exist, and left atrial abnormality plus left axis deviation gain diagnostic weight.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Largest R/S amplitude in any precordial lead, in the presence of left axis deviation | V1-V6, conditional on frontal axis left of -30 degrees | > 29 mm (> 2.9 mV) | Requires concurrent left axis deviation |
| S V1 | V1 | > 2 mm (> 0.2 mV) | None |
| R V5 or R V6 | V5, V6 | > 15 mm (> 1.5 mV) | None |
| S III + largest R/S in a precordial lead, with left axis deviation | III plus V1-V6, conditional on axis left of -30 degrees | > 40 mm (> 4.0 mV) | Requires concurrent left axis deviation |
| R I | I | > 11 mm (> 1.1 mV) | None |
| Reported accuracy of this RBBB-specific criteria set | n/a | Sensitivity 46% to 68%; specificity 57% to 71% | None |

**Not computable from samples.** Requires prior establishment of RBBB. AHA Part V also states that left atrial abnormality and left axis deviation have 'enhanced value' in this setting without giving a combining rule or a weight — so that enhancement is not implementable as stated.

**Guidelines disagree.** The specificity of 57-71% for these RBBB criteria is dramatically worse than the 85-90% specificity the guideline attributes to LVH criteria generally. A tool that applies LVH criteria uniformly regardless of conduction status will silently report a much less specific result in RBBB without saying so.

*Source:* Vandenberg BF, Sagar K, Paulsen W, Romhilt DW, 1991; Vandenberg BF, Romhilt DW. Electrocardiographic diagnosis of left ventricular hypertrophy in the presence of bundle branch block. Am Heart J 1991. Accuracy range reported in Hancock et al., Circulation 2009;119:e251-e261, text and Table 1.

### Left ventricular hypertrophy in the presence of complete left bundle branch block  `LVH, CLBBB`

**Rule.** AHA/ACCF/HRS recommendation 8 states the diagnosis of LVH in the presence of complete LBBB should be made with caution because the evidence is conflicting. A small set of features has relatively high specificity: left atrial P-wave abnormality, QRS duration greater than approximately 155 ms, and precordial-lead voltage criteria.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| QRS duration | Global | > approximately 155 ms | The word 'approximately' is in the guideline text; no exact partition is given |
| Left atrial P-wave abnormality present | V1 primarily (P terminal force), plus global P duration | See the left atrial abnormality entry | None |
| Precordial-lead voltage criteria met | V1-V6 | Not specified further in Part V — the guideline does not say which precordial criterion or which cut | None |

**Not computable from samples.** SUBSTANTIALLY UNMEASURABLE AS SPECIFIED. (1) The threshold is 'greater than approximately 155 ms' — 'approximately' is not a number a program can apply. (2) 'Precordial lead voltage criteria' is not resolved to a specific criterion or threshold. (3) The guideline notes that estimates of specificity are distorted because anatomic LVH prevalence in LBBB reaches 90% or more in autopsy series, and that strict LBBB definitions (requiring monophasic notched or plateau-topped R waves in I, aVL, V5, V6) versus broad ones (QRS > 120 ms plus slurred predominant R left / slurred predominant S right) produce different results — a morphology judgement, not a measurement. (4) 'Complete' LBBB may not be truly complete, and LVH alone can widen QRS beyond 120 ms without a bundle lesion; Part V states this distinction may be difficult to define at all.

**Guidelines disagree.** THE GUIDELINE ITSELF DOCUMENTS AN UNRESOLVED SPLIT: some published studies conclude the diagnosis should not be attempted in LBBB at all, others that it can be made. Part V does not adjudicate; it says only that where the specific high-specificity features are met it is 'reasonable' to diagnose LVH despite low sensitivity, and otherwise the diagnosis should not be attempted. A teaching tool must present this as an open question, not as a rule.

*Source:* Hancock EW, Deal BJ, Mirvis DM, Okin P, Kligfield P, Gettes LS. Circulation 2009;119:e251-e261, section 'Left Bundle-Branch Block' and Recommendation 8.

### Left ventricular hypertrophy — non-voltage supporting features (secondary ST-T abnormality, left axis deviation, left atrial abnormality, QT prolongation)  `LVH, LAO/LAE`

**Rule.** These findings support, but do not by themselves establish, a diagnosis of LVH. AHA/ACCF/HRS Part V explicitly discourages the terms 'strain', 'typical strain', 'systolic overload' and 'diastolic overload'; the preferred term is 'secondary ST-T abnormality'.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Secondary ST-T abnormality — the historical 'typical strain' description is J-point depression, upwardly convex downsloping ST depression, and asymmetrical T-wave inversion | Classically the left precordial leads and I/aVL | NO NUMERIC THRESHOLD IS GIVEN in Part V | Part V states ST-T abnormality provides 'major support' to a voltage-based diagnosis and is associated with larger LV mass and higher cardiovascular risk |
| Frontal-plane QRS axis (left axis deviation) | Frontal plane | No threshold given in the LVH section; the Romhilt-Estes component uses <= -30 degrees | Part V notes it is unknown whether left axis deviation reflects hypertrophy, a degree of LAFB, or age-related leftward drift |
| QT interval | Global | NO THRESHOLD GIVEN — Part V states only that slight QT prolongation is 'consistent with but not diagnostic of' LVH | None |
| QRS onset to R-wave peak time in V5 or V6 | V5, V6 | No independent threshold in the LVH section; Romhilt-Estes uses >= 50 ms | None |
| Loss of septal Q wave with slurred R upstroke in a widened-QRS LVH pattern | I, aVL, V5, V6 | Presence/absence; Part V says it is reasonable to call this associated incomplete LBBB | None |

**Not computable from samples.** ALL FOUR SUPPORTING FEATURES ARE UNDER-SPECIFIED FOR A PROGRAM. Part V gives no mV or ms partitions for ST-T abnormality, no axis cut, and no QT cut in this section. It states three open questions verbatim as unresolved: whether 'typical strain' has different clinical implications from lesser ST-T abnormality, whether ST-T abnormality should diagnose LVH in the ABSENCE of any voltage criterion, and whether ST-T abnormality should allow modification of the voltage thresholds. None of the three can be implemented. P-wave abnormalities are stated to be usable ONLY as a supporting criterion, because adequate accuracy studies do not exist.

**Guidelines disagree.** Terminology: the widely used terms 'strain', 'systolic overload' and 'diastolic overload' are explicitly deprecated by the 2009 guideline, yet remain in circulation in textbooks, in vendor algorithm output, and in the Romhilt-Estes component naming (where the ST-T domain is still commonly labelled 'strain'). Also Recommendation 7: the qualifiers 'probable', 'possible' and 'borderline' should be used with caution because they carry no agreed definition — Part V says specific criteria for their use still need to be proposed.

*Source:* Hancock EW, Deal BJ, Mirvis DM, Okin P, Kligfield P, Gettes LS. Circulation 2009;119:e251-e261, sections 'ST-T Abnormalities With LVH', 'Left Atrial Abnormalities With LVH', 'Left Axis Deviation With LVH', 'Prolonged QT Interval', and Recommendations 6 and 7.

### Left ventricular hypertrophy in children (age-specific voltage limits)  `LVH, VCLVH`

**Rule.** Adult voltage thresholds do not apply below adulthood. AHA/ACCF/HRS Part V Table 3 gives age-banded upper limits derived from the Davignon normal-children study.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| R V6 | V6 | > 12 mm (age 0-7 days); > 23 mm (7 days-1 year); > 23 mm (1-3 years); > 25 mm (3-5 years); > 27 mm (age > 5 years) | AGE-BANDED |
| S V1 | V1 | > 23 mm (0-7 days); > 18 mm (7 days-1 year); > 21 mm (1-3 years); > 22 mm (3-5 years); > 26 mm (> 5 years) | AGE-BANDED |
| S V1 + R V6 | V1 and V6 | > 28 mm (0-7 days); > 35 mm (7 days-1 year); > 38 mm (1-3 years); > 42 mm (3-5 years); > 47 mm (> 5 years) | AGE-BANDED |

**Not computable from samples.** SAMPLING-RATE DEPENDENCE IS EXPLICIT AND CRITICAL. Part V states the Davignon standards were derived at a lower sampling rate, that studies in Scottish children at 500 samples/s and Dutch children at 1200 samples/s showed HIGHER upper-normal voltage limits, and that 'when the higher sampling rates are used, the amplitude criteria in children should be adjusted' — but it gives no adjustment factor. A program reading 500 Hz PTB-XL records cannot apply these numbers unadjusted, and the guideline supplies no way to adjust them. Sex and racial differences in QRS voltage exist in children over 10 years but are not quantified; body-habitus adjustment is stated to be inadequately investigated.

**Guidelines disagree.** Three normative datasets (Canadian/Davignon, Scottish at 500 Hz, Dutch at 1200 Hz) give different upper-normal limits for the same age bands, and the guideline tabulates only the Canadian one while acknowledging the others are higher. Note also that the age bands are non-monotonic in R V6 (12 mm at 0-7 days rising to 23 mm by 7 days). PTB-XL is an adult dataset, so these are relevant only as a reason NOT to extrapolate adult cuts downward.

*Source:* Davignon A, et al., normative Canadian paediatric ECG standards; tabulated as Table 3 in Hancock EW et al., Circulation 2009;119:e251-e261.

### Right ventricular hypertrophy — primary amplitude and ratio criteria  `RVH`

**Rule.** RVH displaces the QRS vector rightward and anteriorly and delays the R-wave peak in right precordial leads. AHA/ACCF/HRS Part V Table 2 lists the validated criteria; right axis deviation and prominent anterior forces should be required in nearly all cases.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| R V1 (tall R) | V1 | > 6 mm (> 0.6 mV) | None |
| R:S ratio in V1 | V1 | > 1.0 | None |
| S V5 (deep S) | V5 | > 10 mm (> 1.0 mV) | None |
| S V6 (deep S) | V6 | > 3 mm (> 0.3 mV) | None |
| R aVR (tall R) | aVR | > 4 mm (> 0.4 mV) | None |
| S V1 (small S) | V1 | < 2 mm (< 0.2 mV) | None |
| R V5 or R V6 (small R) | V5, V6 | < 3 mm (< 0.3 mV) | None |
| R:S ratio in V5 (reduced) | V5 | < 0.75 | None |
| R:S ratio in V6 (reduced) | V6 | < 0.4 | None |
| Ratio of (R:S in V5) to (R:S in V1) | V5 and V1 | < 0.04 | None |
| R V1 + S V5 or S V6 — Sokolow-Lyon RVH index | V1 plus V5/V6 | > 10.5 mm (> 1.05 mV) | None |
| (R I + S III) - (S I + R III) — Lewis index, RVH direction | I and III | < 15 mm as printed in AHA Part V Table 2 | SEE DISAGREEMENT — the printed value is almost certainly missing a negative sign |

**Not computable from samples.** AHA Part V states plainly that ancillary CLINICAL information plays a greater role for RVH than for LVH or the atrial abnormalities, and its Recommendation 3 says probability estimates for RVH should be adjusted in light of available clinical diagnoses of congenital heart disease, valvular heart disease or chronic pulmonary disease. None of that is in the samples or in PTB-XL metadata. The guideline also notes the ECG's ability to detect RVH 'may be expected to be low' because considerable RVH is needed to overcome the dominant left ventricular vector, and that echocardiography is a less definitive reference standard for RVH than for LVH because of the right ventricle's complex 3-D shape.

**Guidelines disagree.** (1) LEWIS INDEX SIGN: AHA Part V Table 2 prints '(R I + S III) - (S I + R III) < 15 mm' for RVH. As printed this is satisfied by almost every normal tracing and cannot be the intended criterion; the RVH form of the Lewis index is conventionally quoted as approximately <= -14 to -15 mm. FLAG AS PROBABLE SIGN ERROR IN THE GUIDELINE TABLE — I could not verify against Lewis 1914 and would not implement the printed form. (2) The 'R:S V5 to R:S V1 < 0.04' row is a ratio-of-ratios and is stated without further definition; its behaviour when S V1 approaches zero is undefined and it will divide by zero on real tracings. (3) No per-criterion sensitivity or specificity is given anywhere in Part V for RVH; the guideline states only that sensitivity is 'generally low' while some criteria have high specificity, with the greatest accuracy in congenital heart disease, intermediate accuracy in acquired heart disease and adult primary pulmonary hypertension, and the LOWEST accuracy in chronic lung disease.

*Source:* Myers GB et al., 1948; Sokolow M, Lyon TP, Am Heart J 1949;37:161-186; Lewis T, 1914. All tabulated in Hancock EW, Deal BJ, Mirvis DM, Okin P, Kligfield P, Gettes LS, Circulation 2009;119:e251-e261, Table 2.

### Right ventricular hypertrophy — Butler-Leggett composite  `RVH`

**Rule.** Take the tallest R (or R') in V1 or V2, add the deepest S in lead I or aVL, then subtract the S wave in V1.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| max(R V1, R V2) + max(S I, S aVL) - S V1 | V1, V2, I, aVL | > 6 mm (> 0.6 mV) as printed in AHA Part V Table 2 | None |

**Not computable from samples.** None arithmetically, but the criterion was derived specifically in RVH due to mitral stenosis, so its transportability to a general population is not established by the source study.

**Guidelines disagree.** AHA Part V Table 2 prints '> 6 mm'; a substantial part of the pulmonary-hypertension literature applies the same formula at >= 0.7 mV (7 mm). A published correction to the 1986 study also exists ('New electrocardiographic criteria for right ventricular hypertrophy: a correction for the 1986 study'), so the operative threshold should be treated as unsettled between 6 and 7 mm. FLAG: I could not obtain the 1986 full text or its correction to adjudicate.

*Source:* Butler PM, Leggett SI, Howe CM, et al. Identification of electrocardiographic criteria for diagnosis of right ventricular hypertrophy due to mitral stenosis. Am J Cardiol 1986;57:639-643. Tabulated in Hancock et al., Circulation 2009;119:e251-e261, Table 2.

### Right ventricular hypertrophy — R-wave peak time and qR pattern in V1  `RVH`

**Rule.** A delayed R-wave peak in V1 in the absence of a wide QRS, or the presence of a qR complex in V1, is a criterion for RVH.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| R-wave peak time in V1 (QRS onset to R peak), conditional on QRS duration being narrow | V1 | > 0.035 s (> 35 ms), applicable only when QRS duration < 0.12 s (< 120 ms) | CONDITIONAL on QRS duration < 120 ms |
| qR pattern in V1 | V1 | Present / absent (an initial q wave followed by an R wave) | None |

**Not computable from samples.** The qR criterion is a morphology classification, not a threshold; it requires reliable detection of a small initial negative deflection in V1, which is where baseline wander and P-wave overlap do the most damage. Part V gives no minimum q amplitude or duration for 'QR V1 present'.

**Guidelines disagree.** None identified on the numeric threshold. The conditional structure (criterion applies only when QRS < 120 ms) is easy to drop in implementation, which would generate false RVH in every RBBB tracing.

*Source:* Myers GB et al., 1948; tabulated in Hancock et al., Circulation 2009;119:e251-e261, Table 2.

### Right ventricular hypertrophy — supporting criteria (presence/absence, no thresholds)  `RVH, RAO/RAE`

**Rule.** AHA/ACCF/HRS Part V Table 2 lists a second block of findings as 'supporting criteria', coded as present or absent rather than against a numeric cut.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| rSR' pattern in V1 with a wide QRS | V1 | Present, when QRS duration > 0.12 s (> 120 ms) | CONDITIONAL on QRS duration > 120 ms |
| S wave greater than R wave in all of leads I, II and III (the S1-S2-S3 pattern) | I, II, III | Present | None |
| S wave in lead I together with a Q wave in lead III (S1-Q3 pattern) | I and III | Present | None |
| R:S ratio in V1 exceeding the R:S ratio in V3 or V4 | V1 versus V3, V4 | Present (R:S V1 > R:S V3,4) | None |
| Negative T waves in V1 through V3 | V1, V2, V3 | Present | Part V says these are better called 'secondary ST-T abnormality' than 'strain' |
| P wave amplitude in lead II | II | > 2.5 mm (> 0.25 mV) — i.e. right atrial abnormality used as RVH support | None |

**Not computable from samples.** 'S > R in I, II, III' and 'S I and Q III' have no amplitude floors in the guideline, so a 0.05 mV q in III technically satisfies 'Q III present'. Any implementation must invent a minimum amplitude, and that invention is not in the primary source.

**Guidelines disagree.** Part V gives no rule for how many supporting criteria are needed, nor how to combine them with the primary criteria. Recommendation 1 for RVH says explicitly that no single criterion or limited set can be recommended exclusive of others, and that the effect of using larger numbers of criteria on sensitivity and specificity 'should be further studied' — i.e. the combination rule is an open research question, not a settled algorithm.

*Source:* Hancock EW, Deal BJ, Mirvis DM, Okin P, Kligfield P, Gettes LS. Circulation 2009;119:e251-e261, Table 2, 'Supporting criteria' block.

### Right ventricular hypertrophy in the chronic obstructive pulmonary disease pattern  `RVH`

**Rule.** COPD produces a characteristic pattern that reflects mainly a low diaphragm from lung hyperinflation, not RVH. In the presence of that pattern, RVH is suggested only if R-wave amplitude in V1 is relatively increased.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Limb-lead QRS amplitude | I, II, III, aVR, aVL, aVF | Low voltage — Part V does not give the mV cut here | None |
| Frontal-plane QRS axis | Frontal plane | Rightward, superior, or indeterminate — no degrees given | None |
| P-wave axis | Frontal plane | Rightward, i.e. greater than 60 degrees | None |
| Persistent S waves across the precordium | V1 through V6 | Present in all precordial leads — no amplitude floor given | None |
| R-wave amplitude in V6 | V6 | Low — no mV cut given | None |
| R-wave amplitude in V1 (the gate for calling RVH) | V1 | 'Relatively increased' — NO NUMERIC THRESHOLD | None |

**Not computable from samples.** MOSTLY UNMEASURABLE AS WRITTEN. Four of the six components ('low voltage', 'indeterminate axis', 'persistent S waves', 'low R in V6') carry no numeric partition in Part V, and the decisive gate — R in V1 'relatively increased' — is relative to nothing specified. Identifying the COPD pattern in the first place is also a clinical inference about lung disease. This section is a caution to the interpreter, not an implementable rule.

**Guidelines disagree.** Part V states RVH accuracy is LOWEST in chronic lung disease, which is precisely the population in which RVH is most often suspected. It also warns that right axis deviation and prominent anterior right-precordial forces occur for reasons other than RVH including 'a not-infrequent normal variant' — so the two features the guideline says should be REQUIRED for the diagnosis are themselves nonspecific.

*Source:* Hancock EW, Deal BJ, Mirvis DM, Okin P, Kligfield P, Gettes LS. Circulation 2009;119:e251-e261, section 'Right Ventricular Hypertrophy'.

### Biventricular hypertrophy  `LVH, RVH`

**Rule.** Suggested by the presence of accepted criteria for BOTH RVH and LVH. Recognition has particularly low sensitivity because the increased QRS vectors of RVH and LVH partly cancel.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Both an LVH criterion and an RVH criterion satisfied simultaneously | As per the individual criteria | Conjunction of the two criterion sets | None |
| Prominent S waves in V5 or V6 in the presence of ECG LVH | V5, V6 | 'Prominent' — NO NUMERIC THRESHOLD given | None |
| Right axis deviation in the presence of ECG LVH | Frontal plane | No degrees given in this section | None |
| Unusually tall biphasic R/S complexes in several leads | 'Several leads' — not enumerated | No amplitude given, and 'several' is not quantified | None |
| Combined tall R plus deep S in V2 to V4 suggesting LVH in a patient with congenital heart disease and RVH (a Katz-Wachtel-type criterion) | V2, V3, V4 | Combined amplitude > 60 mm (> 6.0 mV) | Stated specifically for patients with CONGENITAL HEART DEFECTS and known RVH |

**Not computable from samples.** Only one of the five components carries a number. 'Prominent S waves', 'unusually tall biphasic R/S complexes in several leads', and the right-axis-deviation qualifier are all unquantified in the guideline. The 60 mm V2-V4 criterion is explicitly conditioned on the patient having a congenital heart defect and established RVH — a clinical precondition not derivable from the samples.

**Guidelines disagree.** PTB-XL HAS NO SCP CODE FOR BIVENTRICULAR HYPERTROPHY. It must be represented as co-occurrence of LVH and RVH, which is not the same thing as the guideline's construct. The guideline itself says only that biventricular hypertrophy 'should be suggested' and that 'the low sensitivity of such patterns should be noted' — it does not define a positive test.

*Source:* Hancock EW, Deal BJ, Mirvis DM, Okin P, Kligfield P, Gettes LS. Circulation 2009;119:e251-e261, section 'Biventricular Hypertrophy' and its Recommendations 1-2.

### Left atrial abnormality / left atrial overload-enlargement — P terminal force in lead V1 (Morris index)  `LAO/LAE`

**Rule.** Multiply the depth of the terminal negative component of the P wave in V1 by its duration. A sufficiently large negative product indicates left atrial abnormality. AHA/ACCF/HRS Part V states this is the most frequently used of the various criteria, but that P-wave duration and P-wave notching appear to have equal value.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| P terminal force in V1 = (depth of terminal negative P component) x (duration of that component) | V1 | Conventionally abnormal when more negative than -0.04 mm·s, i.e. a terminal negativity at least 1 mm (0.1 mV) deep AND at least 0.04 s (40 ms) wide. Morris's own reported partition was more negative than -0.03 mV·s. | None |
| Component depth and duration read separately (the Romhilt-Estes operationalisation) | V1 | Depth >= 1 mm (0.10 mV) AND duration >= 40 ms | None |
| Purely negative P wave in V1 | V1 | Presence — Part V calls this 'suggestive' but notes it can occur without an increased P terminal force | None |

**Not computable from samples.** The measurement requires resolving P-wave onset, the crossing point between the positive and terminal negative components, and P offset in a single lead with the smallest P amplitudes on the tracing — the most error-prone fiducial set on the ECG. Published work documents miscalculation and misclassification of P-wave negativity and P terminal force in V1 as a recognised, common problem. Also: the AHA guideline states P-wave abnormalities should be used ONLY as a supporting criterion for LVH, because adequate accuracy studies of the criterion alone or in combination have not been reported.

**Guidelines disagree.** THRESHOLD AND UNITS ARE INCONSISTENT ACROSS SOURCES. Morris's original reported partition is 'more negative than -0.03 mV·s' (found in 2.5% of normals and 92% of patients with left-sided valvular disease); the value that entered routine practice and the Romhilt-Estes score is -0.04 mm·s (1 mm x 0.04 s). Because 1 mm = 0.1 mV, -0.04 mm·s equals -0.004 mV·s — an ORDER OF MAGNITUDE different from -0.03 mV·s, so the two are not the same partition and the mm-vs-mV unit slip is endemic in the literature. Implementations must fix the unit explicitly. Sign convention is a second trap: some code reports the magnitude and compares against +0.04. Note also that AHA Part V calls the whole family 'atrial abnormality' rather than 'enlargement', while the PTB-XL code is named LAO/LAE (overload/enlargement) — the guideline's Recommendation 1 explicitly deprecates 'enlargement', 'overload', 'strain' and 'hypertrophy' as labels here.

*Source:* Morris JJ Jr, Estes EH Jr, Whalen RE, Thompson HK Jr, McIntosh HD. P-wave analysis in valvular heart disease. Circulation 1964;29:242-252. Endorsed as the most-used left atrial criterion in Hancock EW et al., Circulation 2009;119:e251-e261, section 'Left Atrial Abnormality'.

### Left atrial abnormality — P-wave duration, notching interval, and terminal P-wave axis  `LAO/LAE`

**Rule.** Prolongation of total atrial activation time, a widely notched (double-peaked) P wave, and a leftward terminal P vector all indicate left atrial abnormality. AHA/ACCF/HRS Part V states P duration and notching have value EQUAL to the P terminal force.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Total P-wave duration | Measured as total atrial activation time; conventionally the longest P duration across leads, classically lead II | >= 120 ms (0.12 s). Part V states this is present in a large majority of patients with ECG signs considered to represent left atrial abnormality. | None |
| Interpeak (notch) interval of a double-peaked P wave | Classically lead II | >= 40 ms (0.04 s) between the two peaks | None |
| Frontal-plane axis of the TERMINAL portion of the P wave | Frontal plane, terminal P only | -30 to -90 degrees (leftward and superior) | None |
| P-wave area | Not specified | Part V says P-wave area is 'possibly' useful; NO THRESHOLD GIVEN | None |

**Not computable from samples.** P-wave area has no published partition in the guideline and cannot be implemented from it. Notch detection requires a peak-finding rule (minimum notch depth, minimum prominence) that Part V does not specify — 'widely notched' is qualitative apart from the 40 ms interval. Terminal-P axis requires splitting the P wave into initial and terminal halves, and the guideline does not define the split point.

**Guidelines disagree.** NOMENCLATURE DISPUTE WITH DIAGNOSTIC CONSEQUENCE. Part V's Recommendation 3 asks that INTRAATRIAL CONDUCTION DELAY be recognised as a distinct category of atrial abnormality, applicable specifically where P-wave widening is NOT accompanied by increased amplitude of the right or left atrial components. PTB-XL has no separate code for that — a widened P with normal terminal force maps to LAO/LAE or to nothing. Part V also argues 'intraatrial' is preferable to 'interatrial' even though the delay (Bachmann's bundle) may in fact be interatrial. Finally, the guideline explicitly avoids the P-mitrale / P-congenitale / P-pulmonale terminology entirely.

*Source:* Hancock EW, Deal BJ, Mirvis DM, Okin P, Kligfield P, Gettes LS. Circulation 2009;119:e251-e261, section 'Left Atrial Abnormality'.

### Right atrial abnormality / right atrial overload-enlargement  `RAO/RAE`

**Rule.** Right atrial abnormality increases the amplitude of the INITIAL P-wave forces (in contrast to left atrial abnormality, which increases the later forces) and shifts the P vector rightward. A tall, often peaked upright P wave in lead II is characteristic.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| P-wave amplitude in lead II | II | > 2.5 mm (> 0.25 mV) per AHA Part V; Minnesota Code 9-3 uses >= 2.5 mm in ANY of II, III or aVF in a majority of beats | None |
| Initial POSITIVE deflection of the P wave in V1 or V2 | V1, V2 | >= 1.5 mm (>= 0.15 mV) | None |
| Frontal-plane P-wave axis | Frontal plane | Rightward; Part V quantifies the rightward P axis only in the COPD section, as greater than 60 degrees | None |
| Peaked P-wave morphology without increased amplitude | II, III, aVF | Supportive only — no quantitative definition of 'peaked' | None |
| Total P-wave duration | Global | Usually NORMAL in right atrial abnormality — this is a discriminator from left atrial abnormality, not a positive criterion | EXCEPTION: patients with surgically repaired congenital heart disease, especially single-ventricle physiology, show significant P-wave prolongation, which is a risk factor for atrial tachyarrhythmia |

**Not computable from samples.** 'Peaked or pointed appearance' has no computable definition in the guideline. The surgical-repair exception requires operative history. Part V also warns of PSEUDO-P-PULMONALE: right atrial abnormality raises the INITIAL P forces while left atrial abnormality raises the LATER forces, so a tall lead-II P can arise from left atrial abnormality — distinguishing them requires resolving which half of the P wave carries the amplitude, which the 2.5 mm rule alone does not do.

**Guidelines disagree.** LEAD SET AND INEQUALITY DIFFER BETWEEN SOURCES. AHA Part V specifies lead II with a strict '> 2.5 mm'. Minnesota Code 9-3 specifies '>= 2.5 mm' in ANY of II, III or aVF, and adds a majority-of-beats requirement that AHA does not. AHA Part V Table 2 separately lists 'P II amplitude > 2.5 mm' as a SUPPORTING criterion for RVH, so the same measurement carries two different labels in the same document. Part V also states that little evidence is available on the accuracy of criteria for COMBINED atrial abnormality, which is indicated 'essentially by the presence of some of the features of both' — deliberately vague, and not implementable as a rule.

*Source:* Hancock EW, Deal BJ, Mirvis DM, Okin P, Kligfield P, Gettes LS. Circulation 2009;119:e251-e261, section 'Right Atrial Abnormality'. Minnesota Code 9-3 per the ARIC ECG Manual (Manual 5, Version 1.0, 1987).

### Septal hypertrophy (PTB-XL SEHYP)  `SEHYP`

**Rule.** No criterion. AHA/ACCF/HRS Part V contains no section, table row, or threshold for septal hypertrophy as a distinct ECG entity, and neither the Minnesota Code nor the Novacode defines it.

**Not computable from samples.** ENTIRELY UNMEASURABLE FROM ANY PRIMARY GUIDELINE SOURCE I COULD VERIFY. SEHYP appears in the PTB-XL SCP statement table under 'Ventricular Hypertrophy' with no AHA code, no CDISC code, no aECG REFID and no DICOM code — the only hypertrophy statement in the file lacking all four external mappings, whereas LVH carries AHA 142 / CDISC C71076 and RVH carries AHA 143 / C71077. It occurs in only 29 of 21,799 PTB-XL records. The label appears to originate from the reporting cardiologists' free-text statements rather than from a published criterion set. Anything a program computes for it would be invented, not cited.

**Guidelines disagree.** FLAGGED AS UNVERIFIED AGAINST ANY PRIMARY SOURCE. A teaching tool should either omit SEHYP or state plainly that it has no guideline-defined ECG criteria. With n=29 it is also far too rare in PTB-XL to support any evaluation claim.

*Source:* PTB-XL scp_statements.csv (Wagner P, Strodthoff N, Bousseljot R-D, et al. PTB-XL, a large publicly available electrocardiography dataset. Sci Data 2020). NO primary criterion source located. Absent from Hancock EW et al., Circulation 2009;119:e251-e261.

### Voltage criteria for LVH as a form statement, without the diagnosis (PTB-XL VCLVH)  `VCLVH`

**Rule.** PTB-XL distinguishes 'voltage criteria (QRS) for left ventricular hypertrophy' as a FORM statement from 'left ventricular hypertrophy' as a DIAGNOSTIC statement. VCLVH means a voltage threshold was crossed; LVH means the reader called the diagnosis. This distinction directly mirrors AHA/ACCF/HRS Part V Recommendation 4, that interpretations should specify which diagnostic criteria were used and which were abnormal.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Any of the QRS voltage criteria in AHA Part V Table 1 satisfied | As per the individual criterion | As per the individual criterion | Sex-specific where the criterion is (Cornell voltage, Cornell product, Gertsch) |

**Not computable from samples.** Which specific criterion a given PTB-XL VCLVH annotation was based on is NOT recorded — the label says only that voltage criteria were met, not which ones or at what values. So VCLVH cannot be used to validate any single criterion's implementation. In the dataset VCLVH occurs on 875 records and LVH on 2,132, and they are not nested consistently, so the two cannot be treated as a threshold pair.

**Guidelines disagree.** AHA Part V Recommendation 2 states that no single diagnostic criterion can be recommended over the others, and Recommendation 3 that computer systems should apply ALL criteria supported by valid evidence. A single boolean VCLVH flag is therefore not a faithful implementation of the guideline; the guideline asks for a per-criterion report. Part V also notes that in patients with mild-to-moderate hypertension, only 11.2% of those positive by EITHER Cornell voltage OR Sokolow-Lyon were positive by BOTH — so 'voltage criteria met' means materially different things depending on which criterion fired.

*Source:* PTB-XL scp_statements.csv, 'Ventricular Hypertrophy' category (form=1.0 for VCLVH, diagnostic=1.0 for LVH). Corresponds to Recommendation 4 in Hancock EW et al., Circulation 2009;119:e251-e261.

**Notes.** HOW TO READ THE UNITS. AHA/ACCF/HRS Part V states its convention explicitly: amplitudes are given in millimetres, not millivolts, at normal standardisation where 10 mm = 1 mV and 1 mm = 0.1 mV. I have preserved the guideline's mm figures and given mV in parentheses throughout. Two units errors in the guideline's own Table 1 should be corrected in any implementation: both voltage-duration products are printed with the unit "mm/sec" when the quantity is millimetres x milliseconds (mm·ms).

INEQUALITY DIRECTION. AHA Part V Table 1 and Table 2 print strict ">" and "<" throughout. Much of the derivative literature, including Pewsner's BMJ 2007 systematic review, uses ">=" for the same criteria. At integer-millimetre resolution this matters at exactly the threshold value. I have flagged it per criterion rather than silently picking one.

THE HEADLINE ACCURACY MESSAGE — DO NOT SOFTEN IT. AHA/ACCF/HRS Part V states directly that the sensitivity of the various LVH criteria is generally quite low, usually less than 50%, while specificity is quite high, often 85-90%. The independent evidence is worse than that. Pewsner et al. (BMJ 2007;335:711, PMC2001078), a systematic review restricted to hypertensive populations, found median sensitivities ranging from 10.5% (Gubner, range 0-39%) to 21% (Sokolow-Lyon, range 4-52%), with specificities from 89% (Sokolow-Lyon, range 53-100%) to 99% (Romhilt-Estes >= 5 points, range 71-100%). The negative likelihood ratio for Romhilt-Estes >= 4 was 0.85 (range 0.34-1.03) and for Gubner 0.91 (0.70-1.01) — both close to 1.0, meaning a negative ECG barely changes the probability of LVH. A tool that presents these criteria as a test for LVH, rather than as a low-sensitivity rule-in test, is teaching something false. The correct framing: a positive result modestly raises the probability; a negative result is close to uninformative.

CRITERIA DISAGREE WITH EACH OTHER, NOT JUST WITH THE TRUTH. Part V reports that among patients with mild-to-moderate hypertension, only 11.2% of those meeting either the Cornell voltage or the Sokolow-Lyon criterion met both. Okin et al. showed the two select systematically different people: a raised Cornell product characterised patients who were older, obese and female, while a raised SV1 + RV5 characterised patients who were younger, male, black and non-obese. This is why Part V Recommendation 3 says computer systems should apply ALL evidence-supported criteria and Recommendation 4 says the interpretation must name which were used and which were abnormal. A single "LVH: yes/no" output is contrary to the guideline.

THINGS A PROGRAM CANNOT DO, COLLECTED. (a) Race/ancestry adjustment — Part V documents that African-Americans have higher and Hispanic Americans lower upper-normal QRS voltage than Euro-Americans, and that Sokolow-Lyon and Cornell shift in OPPOSITE directions by ancestry, but gives no adjusted thresholds and PTB-XL carries no ancestry field. (b) Body habitus — obesity raises echocardiographic LV mass without raising QRS voltage (adipose insulation, greater heart-to-electrode distance); the Cornell product is more often positive in obesity while Sokolow-Lyon is less often positive. PTB-XL has height for 6,974 and weight for 9,421 of 21,799 records, so BMI is unavailable for most. (c) Digitalis status, required to score the Romhilt-Estes ST-T domain 3 versus 1. (d) Clinical diagnoses of congenital, valvular or chronic pulmonary disease, which Part V Recommendation 3 for RVH says should adjust the probability estimate. (e) Athletic status, which Part V says makes LVH diagnosis "especially problematic". (f) Prior tracings. Sex and age ARE available for all 21,799 PTB-XL records, so every sex- and age-specific threshold above is implementable.

SAMPLING RATE IS A REAL CONFOUND, NOT A DETAIL. Part V states that paediatric normal limits derived at higher sampling rates (500 samples/s Scottish, 1200 samples/s Dutch) are HIGHER than the widely used Canadian standards, and that amplitude criteria should be adjusted when higher rates are used — without giving an adjustment. Every threshold in this document was derived on analogue or low-rate digital recordings. PTB-XL ships 100 Hz and 500 Hz versions of every record; peak amplitudes measured at 100 Hz will be systematically lower than at 500 Hz for narrow, fast deflections, which shifts every voltage criterion. Measure at 500 Hz and say so.

MEASUREMENT CONVENTIONS THAT CHANGE THE ANSWER. (1) The Cornell product must use GLOBAL QRS duration (earliest onset to latest offset across all leads), not a single-lead duration. (2) Minnesota Code amplitudes are read from the second-to-last complete normal beat in each lead, which requires beat classification first. (3) Amplitudes are peak-to-baseline against the isoelectric level, not peak-to-peak. (4) The Peguero-Lo Presti rule doubles S_V4 when the deepest S in the record lies in V4.

DEPRECATED TERMINOLOGY THE TOOL SHOULD NOT USE. Part V's Recommendation 6 says the terms "strain", "systolic" and "diastolic" should not be used in LVH diagnostic statements; the preferred term is "secondary ST-T abnormality". Its atrial Recommendation 1 says abnormal P waves should be called right or left "atrial abnormality" rather than enlargement, overload, strain or hypertrophy — note this conflicts with the PTB-XL code names themselves (LAO/LAE = "left atrial overload/enlargement", RAO/RAE = "right atrial overload/enlargement"). Recommendation 7 says "probable", "possible" and "borderline" should be used with caution, and Part V states that specific criteria for their use still need to be proposed.

PTB-XL CODE COVERAGE AND PREVALENCE (from scp_statements.csv and ptbxl_database.csv, 21,799 records). LVH n=2,132 (diagnostic, class HYP, AHA code 142, CDISC C71076); RVH n=126 (AHA 143, CDISC C71077); LAO/LAE n=426 (AHA 140); RAO/RAE n=99 (AHA 141); SEHYP n=29 (no external code mappings at all); VCLVH n=875 (form statement, not diagnostic); NORM n=9,514 for reference. There is NO code for biventricular hypertrophy and none for intraatrial conduction delay as a distinct category, both of which Part V treats as named entities. RVH (n=126), RAO/RAE (n=99) and SEHYP (n=29) are too rare to support confident per-criterion evaluation.

SOURCES I COULD NOT VERIFY DIRECTLY — FLAGGED. (1) Romhilt DW, Estes EH Jr, Am Heart J 1968;75:752-758 — I could not obtain the original. The component thresholds above come from the ARIC investigators' operationalisation (Am Heart J 2015, PMC4684592) and a peer-reviewed reproduction of the table, which agree with each other. The unresolved conflict is AHA Part V Table 1's rendering "R+S in any limb lead > 19 mm" versus every reproduction's "R or S in any limb lead >= 20 mm". (2) The Lewis index row for RVH in Part V Table 2, printed "(R I + S III) - (S I + R III) < 15 mm", appears to be missing a negative sign; I could not check Lewis 1914. (3) Butler PM, Leggett SI, et al., Am J Cardiol 1986;57:639-643 and its published correction — full text not obtained; the 6 mm (AHA table) versus 0.7 mV (pulmonary-hypertension literature) threshold conflict is therefore unadjudicated. (4) Casale 1985's abstract quotes an age/T-wave-stratified rule at 35 mm (men) / 25 mm (women) alongside the familiar 28/20 mm partition; only the 28/20 partition entered the guidelines, and the relationship between the two is not resolvable from the abstract. (5) Novacode (Rautaharju et al., J Electrocardiol 1998) — I could NOT obtain its specific hypertrophy criteria or LV-mass regression equations from any accessible primary source. Novacode's approach differs in kind from the others: it estimates continuous LV mass index from the ECG rather than applying a binary voltage partition, and Rautaharju has shown that approach identifies a larger fraction of persons at elevated cardiovascular mortality risk than conventional binary LVH criteria. Nothing above should be attributed to Novacode. (6) AHA/ACCF/HRS Part V was read from a full-text PDF of Circulation 2009;119:e251-e261 (DOI 10.1161/CIRCULATIONAHA.108.191097), all 11 pages, including Tables 1-4 verbatim; the publisher's own site returned HTTP 403, so table rows were reconstructed from the PDF's glyph-encoded text — the encoding maps were verified against unambiguous in-text instances ("1 mm = 0.1 mV", "less than 30 years", "left of -30"), giving high confidence that ">" and "<" are correct as reported.

A NOTE ON WHAT PART V DOES NOT CONTAIN. Circulating summaries attribute specific per-criterion figures to this guideline — for example "Sokolow-Lyon sensitivity 20%", "Cornell voltage sensitivity 51%, specificity 95%", "Romhilt-Estes sensitivity 60%". NONE of those numbers appears anywhere in Hancock et al. 2009. The only accuracy figures in the document are the blanket statement (sensitivity usually under 50%, specificity often 85-90%), the 11.2% Cornell/Sokolow-Lyon concordance figure, and the RBBB-specific range (sensitivity 46-68%, specificity 57-71%). Do not cite the others to this guideline.

## RHYTHM

### Sinus rhythm (SCP: SR; AHA/ACCF/HRS Part II statement code 20)  `SR`

**Rule.** Every QRS is preceded by a P wave of sinus origin with constant morphology and a fixed PR. Operationally, sinus origin is asserted from P-wave polarity (upright in II, negative in aVR, i.e. a normal frontal P axis) with stable P amplitude over at least three consecutive complexes.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| P-wave amplitude (peak) | II | >= 0 uV (P must not be negative) |  |
| P-wave amplitude (peak) | aVR | <= 0 uV (P must not be positive) |  |
| Implied frontal P-wave axis | frontal plane (I, II, aVR, aVF) | -30 deg to +120 deg (NOVACODE, implied by the two polarity rules); 0 deg to +75 deg in common textbook/vendor use |  |
| Beat-to-beat P-amplitude variation | the lead used for P measurement (II) | < 100 uV |  |
| Number of consecutive P-QRS-T complexes satisfying the above | any | >= 3 |  |
| PR-interval variation about the median PR | II | < 20% of median PR (NOVACODE note, not a hard criterion) |  |

**Not computable from samples.** That the impulse actually arises in the sinus node. A high right-atrial ectopic focus gives an identical P axis; 'sinus' is an inference from P polarity, not a measurement. Whether P waves are truly absent versus buried in QRS/T is a detection question, not a threshold.

**Guidelines disagree.** NOVACODE's implied P-axis window (-30 deg to +120 deg) is far wider than the 0 deg to +75 deg window in general use; they disagree for axes in (-30,0) and (+75,+120). More fundamentally, AHA Part II supplies the statement but states verbatim that 'This listing does not specify diagnostic criteria for any of the statements' - there is no AHA numeric definition of sinus rhythm at all.

*Source:* NOVACODE code 1.0 - Rautaharju PM, Park LP, Chaitman BR, Rautaharju F, Zhang Z-M. The Novacode criteria for classification of ECG abnormalities and their clinically significant progression and regression. J Electrocardiol 1998;31(3):157-187 (criteria text read in Appendix B of Prineas RJ, Crow RS, Zhang Z-M, The Minnesota Code Manual of Electrocardiographic Findings, 2nd ed., Springer 2010). Statement name and code 20: Mason JW, Hancock EW, Gettes LS. AHA/ACCF/HRS Recommendations..., Part II: Electrocardiography Diagnostic Statement List. J Am Coll Cardiol 2007;49:1128-1135 (co-published Circulation 2007;115:1325-1332).

### Normal sinus rate band (rate qualifier on SR)  `SR`

**Rule.** Sinus rhythm whose ventricular rate lies between the bradycardia and tachycardia cut-points.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Ventricular rate (from RR intervals) | rhythm lead / any continuous lead | 51-94 bpm (NOVACODE 1.0.1) | adult |
| Ventricular rate | rhythm lead | 51-99 bpm (implied by Minnesota Code 8-7 >=100 and 8-8 <=50) | adult |
| Ventricular rate | rhythm lead | 60-100 bpm (conventional clinical band) | adult |

**Not computable from samples.** Nothing - rate is directly computable. But with only 10 s the rate estimate rests on ~8-17 RR intervals, so a patient sitting at the cut-point will be classified differently on two consecutive recordings.

**Guidelines disagree.** Three different normal bands are in active use: 51-94 (NOVACODE), 51-99 (Minnesota Code), 60-100 (clinical convention). A tool that states one is teaching a false certainty.

*Source:* NOVACODE 1.0.1 (Rautaharju 1998, J Electrocardiol 31:157-187); Minnesota Code 8-7/8-8 (Prineas/Crow/Zhang, Minnesota Code Manual, 2nd ed., Springer 2010, Appendix A 'Minnesota Code 2009').

### Sinus bradycardia (SCP: SBRAD; AHA Part II code 22)  `SBRAD`

**Rule.** Sinus rhythm (P-wave criteria as for SR) with a rate below the bradycardia cut-point.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Sinus/ventricular rate | rhythm lead | <= 50 bpm (Minnesota Code 8-8) | adult |
| Sinus/ventricular rate | rhythm lead | <= 50 bpm (NOVACODE 1.0.2) | adult |
| Sinus rate | rhythm lead | < 50 bpm (2018 ACC/AHA/HRS bradycardia guideline, chosen definition) | adult |
| Heart rate | rhythm lead | < 60 bpm (NIH definition cited and explicitly not adopted by the same guideline) | adults other than well-trained athletes |
| Heart rate, lower 2nd percentile of a healthy population | rhythm lead | 40-55 bpm depending on sex and age | sex- and age-dependent; ages 20-90 (Rijnbeek 2014 data as summarised in the 2018 guideline) |
| Rate for 'marked sinus bradycardia' | rhythm lead | < 40 bpm | adult (Glasgow program) |
| Paediatric bradycardia limit | rhythm lead | continuous age-dependent limit: ~88-105 bpm birth-28 d, 105 bpm to 1 y, falling 105->60 bpm from 1-6 y, 60->50 bpm from 6-12.5 y, 50 bpm above 12.5 y | age; Glasgow program limits, user-programmable |

**Not computable from samples.** Whether the bradycardia is pathological. The 2018 guideline states that sinus bradycardia (or a pause >3 s) alone must not be used to diagnose sinus node dysfunction - symptom correlation is required, and symptoms are not in the signal. Athlete status likewise is not measurable.

**Guidelines disagree.** Direct, explicit and unresolved: the 2018 ACC/AHA/HRS guideline records that NIH defines bradycardia as <60 bpm while population studies use <50 bpm, and adopts <50 bpm 'for the purposes of this document'. Minnesota Code and NOVACODE use <=50 (inclusive of 50); the guideline uses <50 (exclusive). A rate of exactly 50 bpm is bradycardia under the two coding systems and not under the guideline.

*Source:* Kusumoto FM, Schoenfeld MH, Barrett C, et al. 2018 ACC/AHA/HRS Guideline on the Evaluation and Management of Patients With Bradycardia and Cardiac Conduction Delay, Table 3 and Section 2.2. Heart Rhythm 2019;16:e128-e226 (co-published Circulation 2019;140:e382-e482; JACC 2019;74:e51-e156). Minnesota Code 8-8 (Prineas/Crow/Zhang 2010). NOVACODE 1.0.2 (Rautaharju 1998). Paediatric limits: Glasgow 12-lead ECG Analysis Program Physician's Guide (P/N 04145.02 v1.0), sec. 5.1-5.3. Population percentiles: Rijnbeek PR, van Herpen G, Bots ML, et al. Normal values of the electrocardiogram for ages 16-90 years. J Electrocardiol 2014;47:914-921.

### Sinus tachycardia (SCP: STACH; AHA Part II code 21)  `STACH`

**Rule.** Sinus rhythm with rate above the tachycardia cut-point.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Sinus rate | rhythm lead | > 100 bpm at rest (2015 ACC/AHA/HRS SVT guideline definition of sinus tachycardia) | adult |
| Ventricular rate | rhythm lead | >= 100 bpm (Minnesota Code 8-7) | adult |
| Ventricular rate | rhythm lead | >= 95 bpm (NOVACODE 1.0.3) | adult |
| Paediatric tachycardia limit | rhythm lead | continuous age-dependent limit: ~163-180 bpm birth-28 d, 180-181 bpm to 180 d, falling 180->100 bpm from 181 d to 17 y, 100 bpm at >=18 y | age; Glasgow program limits, user-programmable |

**Not computable from samples.** Whether the tachycardia is physiological or inappropriate. Inappropriate sinus tachycardia requires a resting rate >100 bpm AND a mean 24-h rate >90 bpm plus exclusion of hyperthyroidism/anaemia - a 24-h mean and a clinical work-up cannot come from a 10-s record.

**Guidelines disagree.** NOVACODE calls sinus tachycardia at >=95 bpm, five beats below the >=100/>100 used everywhere else, so records at 95-99 bpm are tachycardic in NOVACODE and normal in the Minnesota Code and the guidelines. Guideline says '>100', Minnesota Code says '>=100' - exactly 100 bpm differs.

*Source:* Page RL, Joglar JA, Caldwell MA, et al. 2015 ACC/AHA/HRS Guideline for the Management of Adult Patients With Supraventricular Tachycardia, Table 3 'Relevant terms and definitions'. Heart Rhythm 2016;13:e136-e221 (co-published Circulation 2016;133:e506-e574; JACC 2016;67:e27-e115). Minnesota Code 8-7; NOVACODE 1.0.3.

### Sinus arrhythmia (SCP: SARRH; AHA Part II code 23)  `SARRH`

**Rule.** Sinus rhythm (constant P morphology and PR, no premature complexes) in which the P-P interval varies cyclically, classically with respiration.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| P-P (or R-R) interval range, max minus min, over the record | rhythm lead | > 120 ms (also stated as > 10% of mean P-P) - NOT TRACEABLE TO A PRIMARY SOURCE, see disagreement | most marked in the young; incidence falls with age |
| R-R interval variation range of normally conducted complexes (inverse condition: 'reduced heart rate variability') | rhythm lead | < 40 ms defines REDUCED variability in normal sinus rhythm (NOVACODE 1.0 S 5), excluding complexes following ectopy |  |
| P-wave morphology constancy (to exclude PACs masquerading as irregularity) | II (P amplitude) | P amplitude variation < 100 uV, as in NOVACODE 1.0 C2 |  |

**Not computable from samples.** The respiratory phase relationship. Respirophasic versus non-respirophasic (e.g. ventriculophasic) sinus arrhythmia cannot be separated without a respiration channel; the 12-lead signal alone does not carry it.

**Guidelines disagree.** There is no primary numeric criterion. The Minnesota Code does not code sinus arrhythmia at all; NOVACODE codes only its opposite (reduced HRV, RR range <40 ms); AHA Part II names it without criteria. The widely quoted '>120 ms P-P variation' and '>10% variation' are textbook conventions I could not trace to a guideline, and they are not equivalent to each other (10% of a 1000 ms cycle is 100 ms; of a 600 ms cycle, 60 ms).

*Source:* Statement name/code 23: Mason JW et al., AHA/ACCF/HRS Part II, J Am Coll Cardiol 2007;49:1128-1135 (no criteria given). NOVACODE 1.0 S 5 (Rautaharju 1998, J Electrocardiol 31:157-187). The 120 ms figure appears only in secondary teaching sources (LITFL, Healio, StatPearls) - FLAGGED AS UNVERIFIED against any primary source.

### Atrial fibrillation (SCP: AFIB; AHA Part II code 50)  `AFIB`

**Rule.** Absence of distinct/repeating P waves, irregular atrial activity (fibrillatory waves), and irregular R-R intervals when AV conduction is intact. A standard 10-s 12-lead ECG is accepted as diagnostic documentation.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Presence of discrete P waves | all 12, P best assessed in II, III, aVF, V1 | must be absent (NOVACODE 1.5 C1: 'no P waves present') |  |
| R-R irregularity, operationalised | rhythm lead | irregular = fewer than three R-R intervals fall within any single 40-ms class interval (NOVACODE 1.5 C4) | invalid if AV conduction is impaired - complete AV block with AF gives regular RR |
| Fibrillatory (f) wave amplitude, peak-to-peak | II, III or aVF | >= 100 uV distinguishes coarse f/F waves; f waves have irregular cycle intervals or amplitudes (NOVACODE 1.5 C3) |  |
| Atrial (fibrillatory) rate | II, III, aVF, V1 | 300-500 bpm (2023 ACC/AHA/ACCP/HRS: 'a chaotic, rapid (300-500 bpm), and irregular atrial rhythm') |  |
| Minimum recording duration for a diagnosis | 12-lead vs single/multi-lead device | a standard 12-lead ECG (10 s) suffices; >= 30 s required on single- or multiple-lead devices | 2024 ESC; the 30-s cut-point is described by ESC as expert consensus and 'arbitrary' |
| Ventricular-response modifiers | rhythm lead | 'rapid ventricular response' / 'slow ventricular response' - no numeric thresholds published in the guidelines or in the AHA Part II modifier list (346/347) |  |

**Not computable from samples.** Everything temporal: paroxysmal (<=7 d) vs persistent (>7 d) vs long-standing persistent (>12 mo) vs permanent (a joint patient-clinician decision), AF burden, first-detected vs recurrent, clinical vs subclinical. The 2023 guideline also requires 'visual confirmation that the diagnosis is accurate' by a human - a procedural requirement no algorithm satisfies. Minnesota Code's persistent (8-3-1) vs intermittent (8-3-3, requires >=3 consecutive clear-cut sinus beats in any lead) distinction is only decidable if sinus beats happen to appear in the 10 s.

**Guidelines disagree.** No guideline gives a numeric irregularity threshold - all three (2015 SVT, 2023 ACC/AHA, 2024 ESC) say only 'irregular R-R intervals' / 'no specific pattern to RR intervals'. The single primary computable rule is NOVACODE's 40-ms-bin test, which is not endorsed by any guideline. Duration also disagrees: ESC accepts a 10-s 12-lead but requires >=30 s from single-lead devices, while the ACC/AHA guideline sets no duration at all and accepts 'rhythm strips, wearables, intracardiac electrograms'. Fibrillatory rate is given as 300-500 bpm by ACC/AHA; other primary texts place f waves at 400-600/min - I could not verify a 400-600 figure in a primary source and do not assert it.

*Source:* Joglar JA, Chung MK, Armbruster AL, et al. 2023 ACC/AHA/ACCP/HRS Guideline for the Diagnosis and Management of Atrial Fibrillation, Table 4 'Definitions' and Sec. 2.3. J Am Coll Cardiol 2023;83(1):109-279 (co-published Circulation 2024;149:e1-e156). Van Gelder IC, Rienstra M, Bunting KV, et al. 2024 ESC Guidelines for the management of atrial fibrillation. Eur Heart J 2024;45(36):3314-3414. Page RL et al. 2015 ACC/AHA/HRS SVT guideline, Table 3 (identical three-part ECG definition). NOVACODE 1.5 and 1.5.3 (Rautaharju 1998). Minnesota Code 8-3-1/8-3-3.

### Atrial flutter (SCP: AFLT; AHA Part II code 51)  `AFLT`

**Rule.** Regular, repetitive, sawtooth atrial (F) waves without an isoelectric baseline in the inferior leads, at an atrial rate in the flutter band, with at least partial regularity of the ventricular response (commonly 2:1).

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Atrial (F-wave) rate, typical CTI-dependent flutter | II, III, aVF (F waves), V1 | 250-350 bpm; 'typically range from 250 bpm to 330 bpm'; classic value 300 bpm = cycle length 200 ms | slower with antiarrhythmic drugs, severe atrial disease, or after failed ablation |
| F-wave rate, NOVACODE type 1 flutter | II, aVF or V1 | F <= 333 cpm (F cycle interval >= 180 ms) |  |
| F-wave rate, NOVACODE type 2 flutter | II, aVF or V1 | F > 333 and < 430 cpm (F cycle 141-179 ms) |  |
| F-wave amplitude, peak-to-peak | II, aVF or V1 | >= 100 uV, sustained over >= 5 R-R intervals |  |
| Ventricular-response regularity | rhythm lead | >= 3 R-R intervals within 40 ms of each other (partial regularity); if ventricular rate >= 100 cpm, 4 or fewer R-R intervals are required to be within 40 ms (NOVACODE 1.5.1 C3) |  |
| F-wave polarity, counterclockwise (typical) flutter | II, III, aVF and V1 | dominant negative sawtooth in II, III, aVF with positive deflection in V1 |  |
| F-wave polarity, clockwise (reverse typical) flutter | II, III, aVF and V1 | positive F waves in II, III, aVF with wide negative F waves in V1 |  |
| Ventricular rate suggesting undetected 2:1 flutter | rhythm lead | regular rate near 150 bpm (vendor rule, Mortara Veritas: 'cannot rule out atrial flutter') |  |

**Not computable from samples.** Cavotricuspid-isthmus dependence, i.e. typical vs atypical flutter as the guidelines define them - that is an electrophysiological property established at ablation, not on the surface ECG. F-wave polarity gives only a probabilistic surrogate. Persistent (MC 8-3-2) vs intermittent (MC 8-3-4) again needs >=3 consecutive sinus beats to be visible.

**Guidelines disagree.** Upper bound: NOVACODE splits flutter at 333 cpm into 'type 1' and 'type 2' (up to 430 cpm), whereas the 2015 guideline uses a single band of 250-350 bpm - rates of 334-350 are type 2 flutter in NOVACODE and ordinary typical flutter in the guideline, and 350-430 is flutter in NOVACODE but outside the guideline band entirely. Lower bound: the guideline puts flutter at >=250 bpm while NOVACODE type 1 sets NO lower bound (any regular F <= 333 cpm with >=100 uV amplitude qualifies), so slow atrial tachycardias fall into flutter under NOVACODE. The 2023 AF guideline describes flutter only qualitatively (sawtooth in the inferior leads), giving no rate at all.

*Source:* Page RL et al. 2015 ACC/AHA/HRS SVT guideline, Table 3 and Sec. 8 (Heart Rhythm 2016;13:e136-e221). NOVACODE 1.5.1, 1.5.1.1, 1.5.1.2, 1.5.2 (Rautaharju 1998, J Electrocardiol 31:157-187). Minnesota Code 8-3-2/8-3-4. Vendor rule: Physician's Guide to Veritas with Adult and Pediatric Resting ECG Interpretation, Mortara Instrument, 2015 (REF 9515-001-50-ENG Rev F1).

### Supraventricular tachycardia (SCP: SVTAC; AHA Part II code 55)  `SVTAC, SVARR`

**Rule.** A tachycardia whose mechanism involves tissue at or above the His bundle: rate above 100 bpm at rest, usually with a narrow QRS. By guideline convention the term excludes atrial fibrillation.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Atrial and/or ventricular rate | rhythm lead | > 100 bpm at rest (2015 ACC/AHA/HRS definition of SVT) | adult |
| QRS duration separating narrow- from wide-complex tachycardia | global QRS duration across simultaneous leads | < 120 ms narrow; > 120 ms wide (requires VT discrimination) |  |
| Run length and rate, NOVACODE definition | rhythm lead | >= 6 successive supraventricular ectopic complexes with QRS < 120 ms and ventricular rate >= 95 cpm (NOVACODE 1.4); sub-coded < 130 cpm (1.4.1) and >= 130 cpm (1.4.2) |  |
| Run length and rate, Minnesota Code definition | any lead | 3 consecutive atrial or junctional premature beats at rate >= 100 (MC 8-4-2, 'supraventricular tachycardia intermittent') |  |
| RP interval in a regular narrow-QRS tachycardia with visible P waves | the lead in which the retrograde P is best seen (often II or V1) | RP < PR ('short RP'); RP < 90 ms suggests AVNRT rather than AVRT | from the guideline's narrow-QRS differential algorithm |
| Typical AVNRT ventricular rate | rhythm lead | often 180-200 bpm; range 110 to >250 bpm (rarely <100) | >60% of cases in women; onset commonly >30 y |
| Focal atrial tachycardia rate | rhythm lead | usually 100-250 bpm, regular, discrete P waves with an isoelectric segment between them |  |
| Multifocal atrial tachycardia | all leads; P morphology assessed per lead | >= 3 distinct P-wave morphologies with a distinct isoelectric period between P waves, atrial rate > 100 bpm (> 90 bpm in at least one report), rhythm always irregular |  |

**Not computable from samples.** The mechanism, which is what the label actually names. AVNRT vs AVRT vs atrial tachycardia cannot be established from the surface ECG with certainty (the guideline's own algorithm yields 'AVNRT or other mechanism with P waves not identified'). Whether tissue at or above the His is involved is an EP-study fact. Minnesota Code 8-4-2 requires the tachycardia to be 'intermittent', which needs surrounding sinus beats.

**Guidelines disagree.** Rate floor: guideline >100 bpm vs NOVACODE >=95 cpm. Run length: NOVACODE demands >=6 consecutive ectopic complexes, the Minnesota Code only 3 - a 4-beat run is SVT under the Minnesota Code and merely counted as ectopic complexes under NOVACODE. Narrow-QRS boundary: 2015 ACC/AHA/HRS writes wide as '>120 ms' while the 2019 ESC writes narrow as '<=120 ms'; exactly 120 ms is handled differently. Whether atrial flutter counts as an SVT differs too: the 2015 guideline includes macroreentrant AT/typical flutter under SVT, PTB-XL codes it separately as AFLT.

*Source:* Page RL, Joglar JA, Caldwell MA, et al. 2015 ACC/AHA/HRS SVT Guideline, Table 3, Table 5, Fig. 3 (narrow-QRS algorithm) and Secs. 4-6. Heart Rhythm 2016;13:e136-e221 (Circulation 2016;133:e506-e574; JACC 2016;67:e27-e115). Brugada J, et al. 2019 ESC SVT Guideline (Eur Heart J 2020;41:655-720) uses the same rate >100 bpm and QRS <=120 ms / >120 ms split. NOVACODE 1.4; Minnesota Code 8-4-2.

### Paroxysmal supraventricular tachycardia (SCP: PSVT)  `PSVT, SVTAC`

**Rule.** A clinical syndrome of regular, rapid tachycardia of abrupt onset and abrupt termination; a subset of SVT, characteristic of AVNRT or AVRT and less often AT.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Regularity of the tachycardia | rhythm lead | regular RR (see NOVACODE-style test: >= 3 RR within a 40-ms bin) |  |
| Rate | rhythm lead | > 100 bpm (inherits the SVT definition); AVNRT usually 180-200 bpm |  |
| Abruptness of onset/termination, only if the transition falls inside the record | rhythm lead | a step change in RR at a single beat, as opposed to the gradual 'warm-up'/'warm-down' typical of focal AT - NO numeric threshold is given by any primary source |  |

**Not computable from samples.** The defining feature. 'Paroxysmal' is a property of the episode's onset and offset; in a 10-s window in which the tachycardia is present throughout, PSVT is indistinguishable from sustained SVT. The 2015 guideline defines PSVT as a CLINICAL SYNDROME, not an ECG pattern. Mark as unmeasurable except in the rare record that captures the transition.

**Guidelines disagree.** PTB-XL carries PSVT as a rhythm label distinct from SVTAC even though the source lexicon (AHA Part II) has no separate PSVT statement and the guideline definition is clinical, not electrocardiographic. Any PSVT-vs-SVTAC ground truth in a 10-s corpus rests on information not in the signal.

*Source:* Page RL et al. 2015 ACC/AHA/HRS SVT Guideline, Table 3 'Paroxysmal supraventricular tachycardia (PSVT)'. Heart Rhythm 2016;13:e136-e221. AHA Part II lists no PSVT statement separately (code 55 'Supraventricular tachycardia' with modifier 304 'Intermittent').

### Non-sinus supraventricular rhythm / supraventricular arrhythmia (SCP: SVARR)  `SVARR`

**Rule.** A supraventricular (narrow-QRS) rhythm that is not sinus: junctional, ectopic atrial, or wandering atrial pacemaker.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Persistent supraventricular rhythm (Minnesota Code 8-4-1) | II, III, aVF for P polarity; any limb lead for QRS duration | QRS duration < 0.12 s AND (absent P waves OR P inverted/flat in II, III and aVF) AND regular rhythm | MC 8-4-1 with heart rate >= 140 suppresses the Q/QS codes |
| Junctional rhythm (NOVACODE 1.2) | aVR, I for P polarity; rhythm lead for RR | (P aVR > 0 uV AND P I >= 0 uV, implying P axis -60 to -90 deg, with PR <= 120 ms and PR variation < 20 ms) OR ((retrograde P OR no identifiable P and no flutter/fibrillatory waves) AND RRmax - RRmin <= 40 ms) |  |
| Junctional rate bands (NOVACODE 1.2.1-1.2.3) | rhythm lead | < 45 cpm junctional bradycardia; 45-64 cpm junctional rhythm; 65 to <89 cpm accelerated junctional; >= 90 cpm coded as narrow-QRS tachycardia |  |
| Ectopic atrial rhythm (NOVACODE 1.3) | II, aVR | P II < 0 uV OR P aVR > 0 uV (implying P axis < -30 deg or > 120 deg), with junctional rhythm excluded; rate bands < 50, 50-89, >= 90 cpm |  |
| Wandering atrial pacemaker (NOVACODE 1.1) | lead used for P measurement (II) | >1 P-wave train of >= 3 P waves each, with P amplitudes changing by >= 100 uV between trains |  |
| Multifocal atrial tachycardia | all leads | >= 3 distinct P morphologies, atrial rate > 100 bpm, irregular |  |

**Not computable from samples.** The site of origin itself. P-axis rules are surrogates: a low atrial focus and a junctional focus with retrograde conduction produce the same negative P in II. Where no P is discernible, the distinction between junctional rhythm and fine AF rests on the absence of f waves, which is an SNR question at 100 uV.

**Guidelines disagree.** NOVACODE's junctional/accelerated-junctional/tachycardia boundaries (45 / 65 / 90 cpm) do not match the classical textbook bands (40-60 junctional escape, 60-100 accelerated junctional, >100 junctional tachycardia). MAT atrial rate is >100 bpm in the guideline definition but the same guideline notes at least one report using >90 bpm.

*Source:* Minnesota Code 8-4-1 (Prineas/Crow/Zhang 2010, Appendix A). NOVACODE 1.1, 1.2, 1.2.1-1.2.3, 1.3, 1.3.1-1.3.3 (Rautaharju 1998, J Electrocardiol 31:157-187). MAT: 2015 ACC/AHA/HRS SVT guideline Table 3 and Sec. 4.2.

### Atrial premature complex (SCP: PAC; AHA Part II code 30)  `PAC, BIGU, TRIGU`

**Rule.** A beat arising in the atria (or junction) earlier than the expected sinus beat, conducted with a QRS that matches the sinus QRS, with a P wave that differs from the sinus P (or is absent/retrograde), and usually a less-than-compensatory pause.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| QRS concordance with sinus beats | all simultaneous leads | QRS duration within 20 ms of the sinus QRS and same wave labelling (NOVACODE 1.0 S 1 C2) |  |
| P-wave difference from sinus P | lead used for P measurement (II) | P amplitude differs by more than 100 uV from the sinus P waves, or retrograde P, or no discernible P (C3) |  |
| PR shortening | II | PR >= 40 ms shorter than the PR of sinus complexes (C4) |  |
| Prematurity and pause | rhythm lead | R-R of the early complex 200 ms shorter than the preceding R-R AND >= 240 ms shorter than the R-R following the ectopic complex (C5) | the manual's text as read renders the first bound without an inequality sign; treat as '>= 200 ms shorter' and FLAG |
| Logical combination | - | (C1 sinus/brady context AND C2) AND (C3 OR C4 OR C5) |  |
| Minnesota Code | any | 8-1-1 = presence of ANY atrial or junctional premature beats; 8-1-3 = both atrial/junctional and ventricular premature beats present | presence only - the 2009 Minnesota Code sets no frequency or percentage threshold |
| Bigeminal / trigeminal patterning | rhythm lead | ectopic complex follows every sinus QRS (atrial bigeminy, NOVACODE 1.0 S 1.1); ectopic after every pair of sinus QRS (atrial trigeminy, 1.0 S 1.2) |  |

**Not computable from samples.** Separating atrial from junctional origin when the ectopic P is buried in the preceding T wave - the P-amplitude and PR rules simply fail, and NOVACODE's C3 explicitly admits 'no P wave discernible' as satisfying the criterion, which merges the two. Non-conducted (blocked) PACs are only inferable from a pause plus a deformed T wave, with no numeric criterion in any primary source. 'Frequent' vs 'occasional' (AHA Part II modifiers 308/310) has no numeric definition anywhere in the primary literature.

**Guidelines disagree.** The Minnesota Code (2009, 2nd ed.) codes only PRESENCE of premature beats and, contrary to a widespread belief, contains no 10%-of-beats rule for 'frequent' ectopy in the 8-1 series; NOVACODE by contrast requires a specific prematurity/pause arithmetic before a beat counts at all. So the two systems will disagree on borderline late-cycle PACs. Note also that PTB-XL classifies PAC as a FORM statement, not a rhythm statement.

*Source:* NOVACODE 1.0 S 1, 1.0 S 1.1, 1.0 S 1.2 (Rautaharju 1998, J Electrocardiol 31:157-187; text as reproduced in Minnesota Code Manual 2nd ed., Appendix B). Minnesota Code 8-1-1, 8-1-3 (Appendix A, 'Minnesota Code 2009'). Statement/code 30 and modifiers 308/310/341/342: Mason JW et al., AHA Part II, JACC 2007;49:1128-1135.

### Ventricular premature complex (SCP: PVC; AHA Part II code 60)  `PVC, BIGU, TRIGU`

**Rule.** A premature beat of ventricular origin: wide QRS not preceded by a related P wave, morphologically unlike the conducted sinus QRS, and not explained by aberrant supraventricular conduction.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| QRS duration of the ectopic complex | all simultaneous leads | QRS >= 120 ms OR QRS >= 20 ms longer than the normally conducted QRS (NOVACODE 1.0 S 3 C1) |  |
| Exclusion of aberrant supraventricular conduction | V1 for RSR'; the P-bearing lead | aberrancy is called instead if a P wave precedes the wide QRS, or if RSR' in V1 with R' > R and QRS duration <= 140 ms (NOVACODE 1.0 S 2) |  |
| Couplet / run definition | rhythm lead | 2 ventricular ectopic complexes in succession within one sinus R-R = doublet (1.0 S 3.1); a triplet is coded as VT |  |
| Ventricular tachycardia threshold | rhythm lead | >= 3 successive ventricular ectopic complexes at rate >= 130 cpm (NOVACODE 1.7) vs >= 3 consecutive VPBs at rate >= 100 (Minnesota Code 8-2-3) |  |
| Polymorphic ectopy | all leads | net QRS amplitudes of the ectopic beats differ by >= 50% AND QRS durations differ by >= 20 ms (1.0 S 3.3) |  |
| R-on-T / coalescent ectopy | rhythm lead | the ectopic QRS overlaps the ST-T of the preceding complex (1.0 S 3.2) |  |
| Bigeminy / trigeminy | rhythm lead | ectopic complex follows every sinus QRS (ventricular bigeminy, 1.0 S 3.4); after every pair of sinus QRS (ventricular trigeminy, 1.0 S 3.5) |  |
| Minnesota Code | any | 8-1-2 = presence of ANY ventricular premature beats (no frequency threshold) |  |

**Not computable from samples.** Fusion beats: NOVACODE explicitly instructs that QRS fusion complexes (a sinus P arriving on time) be COUNTED AS ventricular ectopic complexes, so a program following it cannot report fusion separately (AHA Part II code 61 exists but has no criteria). Site of origin, and true ventricular vs supraventricular origin in the presence of pre-existing bundle branch block, are not decidable. 'Frequent' vs 'occasional' PVCs has no numeric definition; PVC burden requires ambulatory monitoring.

**Guidelines disagree.** The VT rate floor differs by 30 bpm between the two epidemiological standards: Minnesota Code 8-2-3 uses >= 100/min, NOVACODE 1.7 uses >= 130 cpm, for the same '>= 3 consecutive ventricular complexes'. A 3-beat run at 115 bpm is VT in one system and a doublet-plus-one in the other. Neither addresses the 30-s sustained/non-sustained distinction used clinically. PTB-XL again classifies PVC as a FORM statement, not a rhythm statement, and has no VT code at all.

*Source:* NOVACODE 1.0 S 2, 1.0 S 3, 1.0 S 3.1-3.5, 1.7 (Rautaharju 1998, J Electrocardiol 31:157-187). Minnesota Code 8-1-2, 8-2-3 (Minnesota Code Manual, 2nd ed., 2010, Appendix A). Statement/code 60 and modifiers 340-345: Mason JW et al., AHA Part II, JACC 2007;49:1128-1135.

### Bigeminal pattern, origin unspecified (SCP: BIGU)  `BIGU`

**Rule.** Every second complex is a premature ectopic beat.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Pattern of ectopic complexes | rhythm lead | an ectopic complex follows every sinus QRS (NOVACODE 1.0 S 1.1 atrial, 1.0 S 3.4 ventricular) | PTB-XL's BIGU deliberately leaves origin unspecified |
| Minimum number of repetitions before the pattern may be called | rhythm lead | NOT SPECIFIED by any primary source | flagged - with ~8-12 beats in 10 s, 2 vs 3 repeats is a real design choice with no external authority |

**Not computable from samples.** Origin (supraventricular vs ventricular) is exactly what the PTB-XL code declines to state; if you can determine it you should be emitting PAC/PVC plus modifier 341 instead. Whether an isolated 4-beat alternation is 'bigeminy' or coincidence cannot be settled from 10 s.

**Guidelines disagree.** None on the pattern itself; the gap is that no primary source states a minimum run length, so implementations differ silently.

*Source:* NOVACODE 1.0 S 1.1 and 1.0 S 3.4 (Rautaharju 1998). AHA Part II modifier 341 'In a bigeminal pattern', which attaches to primary statements 30 and 60 (Mason JW et al., JACC 2007;49:1128-1135) - no criteria given.

### Trigeminal pattern, origin unspecified (SCP: TRIGU)  `TRIGU`

**Rule.** Every third complex is a premature ectopic beat.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Pattern of ectopic complexes | rhythm lead | an ectopic complex after every pair of sinus QRS complexes (NOVACODE 1.0 S 1.2 atrial, 1.0 S 3.5 ventricular) |  |
| Minimum number of repetitions | rhythm lead | NOT SPECIFIED by any primary source | a 10-s record at 70 bpm holds only ~4 trigeminal groups; at 50 bpm, ~2-3 |

**Not computable from samples.** Origin, as for BIGU. At slow rates a 10-s record may not contain enough groups to establish the pattern at all.

**Guidelines disagree.** None stated; same unspecified-run-length gap as bigeminy.

*Source:* NOVACODE 1.0 S 1.2 and 1.0 S 3.5 (Rautaharju 1998, J Electrocardiol 31:157-187). AHA Part II modifier 342.

### Artificial pacemaker rhythm (SCP: PACE, 'normal functioning artificial pacemaker')  `PACE`

**Rule.** Pacing stimulus artefacts (spikes) precede captured complexes: ventricular/dual-chamber pacing gives a wide paced QRS after the spike; atrial pacing gives a spike before a P wave with a narrow QRS.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Ventricular or dual-chamber pacemaker (NOVACODE 1.6.1) | any lead in which spikes are visible | (coupled pacemaker spikes with spike-spike interval >= 80 ms OR single pacemaker spikes) AND QRS >= 120 ms |  |
| Atrial pacemaker (NOVACODE 1.6.2) | any lead with visible spikes; P-bearing lead | single spikes > 80 ms before the QRS, preceding P waves, AND QRS < 120 ms |  |
| Pacemaker stimulus pulse duration (detectability) | - | generally < 0.5 ms; 'cannot be reliably detected by ordinary signal processing technique at 500 to 1000 Hz' | front-end oversampling at 1000-2000 up to 10 000-15 000 samples/s is what makes spikes detectable |
| Minnesota Code | any | 6-8 'Electronic pacemaker' - presence only; 6-8 suppresses essentially all other Minnesota codes |  |
| Pacing-mode statements available (no criteria attached) | - | AHA Part II codes 180 atrial-paced, 181 ventricular-paced, 182 non-RV-apical origin, 183 atrial-sensed ventricular-paced, 184 AV dual-paced |  |

**Not computable from samples.** On a 500 Hz record - which is PTB-XL's native rate and this project's canonical grid - pacing spikes are NOT reliably detectable, by the explicit statement of AHA Part I; modern bipolar stimulus amplitudes are additionally 'often too small to be recognized on the standard ECG'. Anything downstream of spike detection therefore fails: capture/sensing failure (AHA Part II 185-190), pacing mode, and the word 'normal functioning' in the PTB-XL label itself, which is a device-function judgement rather than a waveform measurement. A wide LBBB-like QRS at a fixed rate is a morphological surrogate for which no primary source publishes criteria.

**Guidelines disagree.** NOVACODE requires QRS >= 120 ms before it will call a ventricular/dual pacemaker, so a narrow paced or fusion complex is not coded; the Minnesota Code and AHA Part II require only the presence of pacing activity. NOVACODE's suppression rule (0.6) also blanks nearly all other codes on paced records, whereas PTB-XL freely co-labels PACE with morphology statements.

*Source:* Kligfield P, Gettes LS, Bailey JJ, et al. AHA/ACCF/HRS Recommendations..., Part I: The Electrocardiogram and Its Technology, section on oversampling. Circulation 2007;115:1306-1324 (JACC 2007;49:1109-1127). NOVACODE 1.6.1, 1.6.2 and suppression code 0.6 (Rautaharju 1998). Minnesota Code 6-8 (Minnesota Code Manual, 2nd ed., 2010). Pacemaker statements 180-190: Mason JW et al., AHA Part II, JACC 2007;49:1128-1135.

### Sinus pause, sinoatrial arrest and sinoatrial block (no PTB-XL rhythm code; qualifies SR)  `SR, SARRH`

**Rule.** An unexpected failure of sinus P-wave production, producing a pause; distinguished from SA exit block by whether the pause is a multiple of the basic cycle.

| quantity | leads | threshold | qualifier |
|---|---|---|---|
| Sinus pause | P-bearing lead (II) | sinus node depolarises > 3 s after the last atrial depolarisation (2018 ACC/AHA/HRS) | a >3 s pause barely fits in a 10-s record and is essentially never captured |
| Pause relative to the prevailing cycle (NOVACODE 1.0 S 4) | II and rhythm lead | P-P interval containing the pause prolonged >= 90% versus the median P-P of sinus P waves, no P wave within the prolonged interval, and the preceding complex not ectopic |  |
| Sinoatrial arrest (Minnesota Code 8-5-1) | any | unexpected absence of P, QRS and T with an R-R interval at a fixed multiple of the normal interval, +/- 10% |  |
| Sinoatrial block (Minnesota Code 8-5-2) | any | progressive P-P shortening with fixed R-R intervals +/- 10% |  |

**Not computable from samples.** Sinus node dysfunction as a diagnosis: the 2018 guideline states that sinus bradycardia or a pause >3 s alone must NOT be used to diagnose it - accompanying symptoms are required. Tachycardia-bradycardia syndrome and chronotropic incompetence (failure to reach 80% of predicted maximum HR) require ambulatory or exercise data.

**Guidelines disagree.** Pause thresholds are absolute in the guideline (>3 s) and relative in the coding systems (>=90% prolongation of the median P-P for NOVACODE; a fixed multiple +/-10% for the Minnesota Code). At a sinus rate of 100 bpm the NOVACODE rule fires at ~1.14 s, nearly three times more sensitive than the guideline rule.

*Source:* Kusumoto FM et al. 2018 ACC/AHA/HRS Bradycardia Guideline, Table 3 and Sec. 2.2. Heart Rhythm 2019;16:e128-e226. NOVACODE 1.0 S 4 (Rautaharju 1998). Minnesota Code 8-5-1, 8-5-2 (2010).

**Notes.** SCOPE CORRECTION, IMPORTANT. The brief says to cover "AHA/ACCF/HRS 2009 Part IV" for rhythm. Part IV is not about rhythm: Rautaharju PM, Surawicz B, Gettes LS, "AHA/ACCF/HRS Recommendations for the Standardization and Interpretation of the Electrocardiogram, Part IV: The ST Segment, T and U Waves, and the QT Interval," Circulation 2009;119:e241-e250 (JACC 2009;53:982-991). I read the paper to confirm. The six-part series has NO rhythm part (I technology, II statement list, III intraventricular conduction, IV ST/T/U/QT, V chamber hypertrophy, VI acute ischaemia/infarction). Rhythm appears only in Part II (Mason JW, Hancock EW, Gettes LS, JACC 2007;49:1128-1135), which is a lexicon of 117 primary statements, and which says verbatim under "Criteria for Diagnoses": "This listing does not specify diagnostic criteria for any of the statements." There is therefore no AHA numeric rhythm criteria document to cite. Every number above comes from the Minnesota Code, NOVACODE, or a disease-specific ACC/AHA/HRS or ESC guideline.

WHY THIS MATTERS FOR PTB-XL. The "AHA code" column of data/ptbxl/scp_statements.csv holds exactly the Part II statement numbers: SR=20, STACH=21, SBRAD=22, SARRH=23, PAC=30, AFIB=50, AFLT=51, SVTAC=55, PVC=60. PTB-XL's rhythm label set IS the AHA Part II lexicon - a vocabulary that ships with no criteria. The labels were assigned by cardiologists using the Schiller device output plus unstated personal thresholds. So the PTB-XL rhythm ground truth cannot be reproduced by applying any published criterion set; expect systematic disagreement at every borderline (95-100 bpm, exactly 50 bpm, 4-beat runs, late-cycle PACs).

PTB-XL LABEL-SET QUIRKS. The 12 rhythm-flagged codes are SR, STACH, SBRAD, SARRH, AFIB, AFLT, SVTAC, PSVT, SVARR, BIGU, TRIGU, PACE. PAC and PVC are FORM statements, not rhythm statements, so "sinus rhythm with PVCs" is SR + PVC across two different label groups. BIGU/TRIGU deliberately do not state origin. There is no code for VT, junctional rhythm, wandering atrial pacemaker, AV dissociation, sinus pause, or ventricular fibrillation; AV blocks (1AVB/2AVB/3AVB) sit in the diagnostic CD class, not in rhythm. PSVT is carried as a rhythm label even though its guideline definition is a clinical syndrome (abrupt onset and termination) that a 10-s window cannot express.

WHAT 10 SECONDS CANNOT SUPPORT. Be explicit about this in the teaching tool: (1) AF pattern - paroxysmal (<=7 d), persistent (>7 d), long-standing persistent (>12 mo), permanent (a joint clinical decision) - all unmeasurable; AF burden likewise. (2) The Minnesota Code's persistent-vs-intermittent AF/flutter split (8-3-1/8-3-2 vs 8-3-3/8-3-4) needs >=3 consecutive clear-cut sinus beats to be visible in the same record. (3) "Paroxysmal" in PSVT. (4) Sustained vs non-sustained VT (30 s). (5) Sinus node dysfunction, tachy-brady syndrome, chronotropic incompetence - all require symptoms or ambulatory/exercise data by explicit guideline statement. (6) Inappropriate sinus tachycardia (mean 24-h rate >90 bpm). (7) A sinus pause >3 s barely fits in the window. (8) "Frequent" vs "occasional" ectopy: the AHA Part II modifiers 308/310 have no numeric definition and the 2009 Minnesota Code 8-1 series codes only presence - contrary to a widespread belief there is no 10%-of-beats rule there. (9) Mobitz I vs 2:1 block often needs a longer strip. (10) Pacemaker mode and capture/sensing failure. (11) Heart-rate variability beyond NOVACODE's crude RR-range test. Conversely, 10 s IS accepted as sufficient for the AF diagnosis itself: the 2024 ESC guideline explicitly accepts a standard 12-lead ECG (10 s), reserving the >=30 s requirement for single-/multi-lead devices, and calls the 30 s figure expert consensus and "arbitrary".

SIGNAL-PATH CONSTRAINTS SPECIFIC TO THIS REPO. (a) Sampling: PTB-XL and this project's canonical grid are 500 Hz. AHA Part I states pacing stimuli are "generally shorter in duration than 0.5 ms, and therefore, they cannot be reliably detected by ordinary signal processing technique at 500 to 1000 Hz". Any PACE detector at 500 Hz is inferring from paced-QRS morphology, for which no primary criteria exist - say so in the UI rather than implying a spike was found. (b) Paper layout: README.md notes a 3x4 printout gives each lead only 2.5 s and only the rhythm strip spans 10 s. Several rhythm criteria are lead-specific in ways that collide with this - flutter F waves must be measured in II, aVF or V1 (NOVACODE) or II/III/aVF plus V1 for polarity (2015 SVT guideline), which straddle three different 2.5-s columns; the P-polarity rules for sinus rhythm need II and aVR (columns 1 and 2). Only the rhythm strip can supply the RR series, the ectopy count, and the irregularity test. (c) Amplitude floor: the >=100 uV fibrillatory/flutter-wave and P-amplitude thresholds sit near the noise floor of many records; NOVACODE's own quality suppression code 0.2.1 rejects records with baseline drift >4 mm or >2 mm of noise in the worst lead, and that gate should precede any rhythm call.

THE ONE COMPUTABLE AF IRREGULARITY RULE. No guideline anywhere gives a numeric RR-irregularity threshold - 2015 SVT, 2023 ACC/AHA/ACCP/HRS and 2024 ESC all say only "irregular R-R intervals". The single primary numeric operationalisation I found is NOVACODE 1.5 C4: RR intervals are irregular when fewer than three RR intervals fall within any one 40-ms class interval; its converse (>=3 RR within 40 ms, or >=4 if the ventricular rate is >=100 cpm) is what NOVACODE calls "partial regularity" and uses to separate flutter from fibrillation. If the tool implements RMSSD, coefficient of variation, Shannon entropy or a Poincare/Lorenz measure instead, label it as an engineering choice, not a guideline threshold. Note also the standing caveat attached to the criterion by every guideline: RR irregularity is diagnostic only "when atrioventricular conduction is present" - AF with complete AV block gives a regular ventricular rhythm.

SOURCES I COULD NOT VERIFY, FLAGGED. (1) The "P-P variation > 120 ms" criterion for sinus arrhythmia appears only in secondary teaching sources; no primary guideline, the Minnesota Code, or NOVACODE states it. Do not present it as authoritative. (2) The EPICARE (Wake Forest) online Minnesota Code pages were unreachable from this environment; the Minnesota Code and NOVACODE text above was read from a full-text reproduction of Prineas RJ, Crow RS, Zhang Z-M, The Minnesota Code Manual of Electrocardiographic Findings, 2nd ed. (Springer 2010), Appendices A and B, not from the publisher's own file - the code numbers and thresholds should be checked against a library copy before shipping. One line in that reproduction, NOVACODE 1.0 S 1 C5, renders as "R-R of the early complex 200 ms shorter than the preceding R-R" with the inequality sign apparently lost; read as ">= 200 ms". (3) Per-stratum sex/age heart-rate percentiles from Rijnbeek PR et al., J Electrocardiol 2014;47:914-921 could not be retrieved (normalecg.org has a broken TLS certificate); only the 2018 guideline's summary of that paper (2nd-percentile HR 40-55 bpm depending on sex and age) is cited. (4) The 2015 SVT guideline was read from the Heart Rhythm version hosted by HRS (Heart Rhythm 2016;13:e136-e221); page numbers for the Circulation and JACC co-publications are given from the standard citation and were not independently confirmed. (5) ahajournals.org, jacc.org and heartrhythmjournal.com all return 403 to automated fetches, so several sources were reached via PMC, HRS or society-hosted PDFs.

SEX/AGE/ANCESTRY. Unlike ST elevation, rhythm criteria are almost entirely sex- and ancestry-neutral in the primary literature; the one real dependence is heart rate itself - the 2018 bradycardia guideline records a lowest-2nd-percentile heart rate of 40-55 bpm varying by both sex and age, and vendor programs (Glasgow) apply continuous age-dependent tachycardia and bradycardia limits through childhood, converging on 100 and 50 bpm in adults. No ancestry-specific rhythm threshold was found in any primary source.


---

# Reconciled: what we can explain today

# Reconciled ECG Criteria → Implementable Table

**Scope:** every finding in the four research briefs, reconciled against what `crates/ecg-core/src/measure.rs` actually produces today. Written to drive learner-facing explanations, so the bar is: *if the tool says "this is why", the why must be a thing we measured.*

---

## 0. The measurement surface, stated once

Everything below is expressed in these fields and nothing else.

**Per lead** (`LeadMeasurements`): `st_j_mv`, `st_j60_mv`, `st_slope_mv_s`, `r_amplitude_mv`, `s_amplitude_mv`, `q_amplitude_mv`, `q_duration_ms`, `t_amplitude_mv`, plus `sigma_ens_mv` / `sigma_gain_mv` for gating.

**Per study** (`StudyMeasurements`): `hr_bpm`, `qrs_ms` (single global value), `qt_ms`, `qtc_fridericia_ms`, `qtc_bazett_ms`, `axis_deg`, and the RR series behind `hr_bpm`.

### 0.1 Derived quantities the rules are allowed to use

| name | definition | trap |
|---|---|---|
| `rs_ratio(L)` | `r_amplitude_mv / abs(s_amplitude_mv)` | must return `None` when `s_amplitude_mv` is `None` or below the floor — never `inf`. The RVH criterion "R:S V5 ÷ R:S V1 < 0.04" divides by a ratio that can itself be undefined; do not implement it. |
| `net_polarity(L)` | `sign(r_amplitude_mv − abs(s_amplitude_mv))` | this is the *only* proxy available for "dominant R", "QRS mainly upright", "QS or rS". It is a proxy, not the morphology. |
| `qrs_amp(L)` | `r_amplitude_mv + abs(s_amplitude_mv)` | criteria that say "R+S" mean this; criteria that say "R or S" mean `max()`. Romhilt-Estes is quoted both ways (§5). |
| `q_over_r(L)` | `abs(q_amplitude_mv) / r_amplitude_mv` | needed for every normal-Q exclusion. |
| `st_down_or_flat(L)` | `st_slope_mv_s <= 0` | the operationalisation of "horizontal or downsloping". No guideline states the window; ours is J+20→J+80 (`ST_SLOPE_PTS_MS`). Display it. |
| `rr_irregular` | fewer than 3 RR intervals fall in any single 40 ms bin | NOVACODE 1.5 C4 — the **only** numeric irregularity rule in any primary source. No guideline endorses it. |

### 0.2 Detection floors we must declare because no guideline supplies them

- A negative deflection counts as a Q wave only at `abs(q_amplitude_mv) >= 0.10 mV` (Minnesota Code convention; UDMI states no floor).
- Symmetrically, an R wave counts only at `r_amplitude_mv >= 0.10 mV`; below that the complex is treated as **QS**. Without this, `q_amplitude_mv` ("initial negative before the first positive") and `s_amplitude_mv` ("deepest negative after the R peak") are ambiguous on a genuinely monophasic negative complex, and the V2–V3 QS rule and the "QS in V1 is normal" exclusion both misfire. **This floor is ours, not a guideline's, and must be printed.**

### 0.3 Four conventions that change the answer and must be shown beside every number

1. **Amplitude reference is the PQ isoelectric level** (the detrend stage zeroes it by construction). UDMI-4 recommends **QRS onset**; Part IV uses **TP or PR**; Minnesota, the exercise standards and Smith's modified Sgarbossa use the **P-Q junction**. We are aligned with Part IV / Minnesota / Smith and *misaligned with the document most of our ST thresholds come from*. Part IV's own data show the 98th-percentile ST in V2 roughly doubling between the J point and J+60 — the reference and instant are not details.
2. **`qrs_ms` is a single global value**, but the AHA definition of global QRS duration is "earliest onset to latest offset across **simultaneously recorded** leads". On a 3×4 printout the leads are not simultaneous (I/II/III 0–2.5 s, aVR/aVL/aVF 2.5–5 s, V1–V3 5–7.5 s, V4–V6 7.5–10 s). Our value is derived from spatial velocity across the ensemble and is **not** the guideline quantity. Every 110/120 ms boundary inherits that. Minnesota's per-lead duration is a third quantity again, typically 5–15 ms shorter.
3. **`axis_deg` is computed from net QRS areas in I and aVF.** No guideline specifies a method. Net-area, peak-amplitude and initial-40 ms methods differ by several degrees, which flips cases at the −45° (LAFB) and +90° (LPFB) boundaries. On a 3×4 printout **I and aVF come from different 2.5 s windows**, so the axis is built from non-simultaneous panels.
4. **"Two contiguous leads" is not two simultaneous leads here.** On a 3×4 layout, V2+V3 are simultaneous and II+III are simultaneous, but **V3+V4 are not, II+aVF is not, and {I, aVL} — the only way to satisfy UDMI's lateral grouping — is never simultaneous.** Say this wherever a contiguity rule fires.

### 0.4 Status vocabulary used throughout

- **EVALUABLE** — every element of the published criterion maps to a measured quantity.
- **PARTIAL** — the *discriminating* element is missing. May be reported as a named, explicitly reduced pattern; must never be reported as the criterion.
- **BLOCKED** — the defining feature is not measured. Do not attempt.
- **UNDEFINED** — no criterion exists in any primary source at any resolution.

---

## 1. What we can evaluate today, exactly

### 1.1 Ventricular conduction

| Finding | Status | Fires on (measured fields only) | Discriminating element missing |
|---|---|---|---|
| **Prolonged QRS** (anchor for everything below) | EVALUABLE | `qrs_ms > 110` abnormal (adults >16 y). Bands: 110–119 "incomplete/borderline", `>= 120` "complete" | — (but see §0.3(2): our global duration is not the guideline's) |
| **CLBBB** | **PARTIAL** | `qrs_ms >= 120` AND `net_polarity(V1) < 0` AND `net_polarity(V2) < 0` AND `q_amplitude_mv` absent (below floor) in I, V5, V6 | **R peak time V5–V6 > 60 ms** (AHA, ESC 2021) and **mid-QRS notch/slur** (Strauss, ESC 2021). Both are mandatory in three of the five definitions. |
| **CRBBB** | **PARTIAL** | `qrs_ms >= 120` AND `net_polarity(V1) > 0` — this is the Minnesota 7-2-1 "QRS mainly upright in V1" branch only | **rsR′ / rSR′ pattern** (no R′ detection), **S duration > R duration or > 40 ms in I and V6** (no per-wave durations), **R peak time V1 > 50 ms**. The AHA rule's first three criteria are all-required; we satisfy one and a proxy for another. |
| **ILBBB** | BLOCKED | — | R peak time V4–V6 > 60 ms, plus an LVH criterion the guideline declines to name. Minnesota 7-6 needs per-lead QRS durations in I, aVL, V5/V6. |
| **IRBBB** | BLOCKED | — | The entire finding *is* the terminal r′. Without r′ detection there is no IRBBB and no way to separate it from the normal-variant rSr′, from high V1/V2 placement, or from Brugada type 2 (β angle, 5 mm-below-apex triangle base, ST slope index — all r′ geometry). |
| **LAFB — AHA 2009** | **PARTIAL** | `-90 <= axis_deg <= -45` AND `qrs_ms < 120` AND `q_amplitude_mv` present with `r_amplitude_mv` dominant in aVL (qR) AND `net_polarity < 0` with a small r present in II, III, aVF (rS — Kusumoto's fifth criterion) | **R peak time in aVL ≥ 45 ms** — this is precisely the criterion separating LAFB from plain left axis deviation. |
| **LAFB — Minnesota 7-7** | **EVALUABLE** | `qrs_ms < 120` AND `abs(q_amplitude_mv[I]) >= 0.025 mV` AND `q_duration_ms[I] < 30` AND `axis_deg <= -45` | — (only the per-lead vs global duration convention, §0.3(2)) |
| **LPFB** | EVALUABLE-but-withhold | `90 <= axis_deg <= 180` AND `qrs_ms < 120` AND rS in I and aVL (`net_polarity < 0`, r present) AND qR in III and aVF (`q_amplitude_mv` present, R dominant) | Nothing arithmetic. But it is a diagnosis of exclusion (RVH, lateral MI) and the common causes of right axis — tall thin habitus, lung disease, PE, sodium-channel blockade — are not in the signal. Adults only; the paediatric rule requires a prior tracing. |
| **IVCD** | **PARTIAL** | `qrs_ms > 110` AND neither LBBB-pattern nor RBBB-pattern rule above fired | It is a residual category, and **our residue is larger than the guideline's** because our LBBB/RBBB detectors are partial. An unrecognised RBBB will land here. |
| **WPW** | BLOCKED | — | PR < 120 ms (no P waves) and the delta wave (no initial-slope descriptor). Minnesota's computable substitute is R peak duration > 60 ms — also not measured. |
| **Bifascicular (RBBB+LAFB / +LPFB)** | PARTIAL | Conjunction of the two partial rules; report components separately, never as an aggregate | Inherits both gaps. |
| **"Trifascicular block"** | UNDEFINED | — | Not a measurable ECG entity at any resolution; needs an HV interval. Report components. |

**The safety consequence, stated plainly:** ADR 0003's suppression matrix lists **LBBB, ventricular pacing, WPW and LVH** as voiding the ST-elevation thresholds. Of those four, **pacing and WPW can never be detected with the current measurements**, and LBBB only partially. Two of the four suppressors are structurally unable to fire. That is a false-positive channel for STEMI, not a rounding issue.

**Also:** the example evidence string in ADR 0003 — *"QRS 148 ms (≥120), broad monophasic R in V6, absent q in I/V6"* — claims a morphology descriptor ("broad monophasic R") that the pipeline does not compute. Absent q **is** measurable; broad monophasic R is not. That string needs rewriting before it ships, because it is exactly the kind of unbacked reason this tool exists to avoid.

### 1.2 Q waves and infarction

| Finding | Status | Fires on | Missing |
|---|---|---|---|
| **Pathological Q, V2–V3 rule** | **EVALUABLE** | `q_duration_ms > 20` in V2 or V3, OR QS complex in V2/V3 (no R above the 0.10 mV floor) | — (the floor is ours, §0.2) |
| **Pathological Q, general rule** | **EVALUABLE** | `q_duration_ms >= 30` AND `abs(q_amplitude_mv) >= 0.10`, OR QS, in **≥2 leads of one contiguous grouping** | — arithmetically. The grouping is a modelling choice (§5, row 10) and lead III is a documented drafting defect (§5, row 11). |
| **Higher-specificity Q** | EVALUABLE | `q_duration_ms > 40` — narrative, not table; use as a confidence modifier only | — |
| **Minor Q + concordant T inversion** | EVALUABLE | `20 <= q_duration_ms < 30` AND `abs(q_amplitude_mv) >= 0.10` AND `t_amplitude_mv < 0` in the same grouping | — but output is explicitly "suggestive", never a diagnosis |
| **Normal-Q exclusions** (all four) | **EVALUABLE — implement as hard suppressors** | QS in V1 → never code. Q in III normal if `q_duration_ms < 30` AND `q_over_r < 0.25` AND `-30 <= axis_deg <= 0`. Q in aVL may be normal if `60 <= axis_deg <= 90`. Septal q = `q_duration_ms < 30` AND `q_over_r < 0.25` in I, aVL, aVF, V4–V6 | — this set is fully implementable and is the cheapest specificity you will ever buy |
| **Confounder gates** | PARTIAL | LVH-by-voltage and `qrs_ms >= 120` with LBBB pattern are computable suppressors | Pre-excitation and pacing gates cannot fire (§1.1) |
| **Territory assignment** (ASMI/AMI/ALMI/LMI/IMI) | EVALUABLE as *lead sets*, BLOCKED as *walls* | The lead-set logic is pure bookkeeping over the Q rule | The wall name is an anatomical inference; ISHNE (CMR) and AHA Part VI disagree in print about what V1–V2 and I/aVL represent. Report the lead set, offer both names, own the choice. |
| **Posterior / PMI, R-wave equivalent** | **BLOCKED** | `rs_ratio(V1) > 1` and `t_amplitude_mv[V1] > 0` are computable — 2 of 3 | **R duration > 40 ms in V1–V2 is not measured**, and it is the criterion that distinguishes infarct from RVH, counterclockwise rotation and a high V1/V2 electrode. Bayés de Luna's alternative (R/S ≥ 0.5 or R > 3 mm in V1) *is* fully computable but is abstract-verified only and carries no guideline endorsement. **Do not emit PMI/IPMI/IPLMI.** |
| **ILMI vs IPMI vs IPLMI** | BLOCKED | — | No measurement separates them. The same V1–V2 finding is "posterior" under one convention and "lateral" under another. A classifier trained here learns annotator convention. Say so. |
| **Poor R-wave progression** | PARTIAL | `r_amplitude_mv[V3] <= 0.30 mV` (Zema & Kligfield — **quantitative thresholds unverified against the primary text**) | Minnesota 1-3-8 requires "every beat" and per-beat amplitudes; we have median beats. Top false-positive generator: V1/V2 one interspace high reduces R by ~0.1 mV per interspace and mimics this exactly. Report with the differential (anterior MI / LVH / RVH / normal variant / lead placement), never as anterior MI. |
| **Selvester QRS score** | BLOCKED | — | The 54-criterion weight table was not obtainable from a primary source; nothing to implement. |
| **NOVACODE category 5** | BLOCKED | — | The class boundaries are verified; the underlying Q/STD/TN score construction is not. Do not invent it. |

### 1.3 ST segment and T wave

| Finding | Status | Fires on | Missing |
|---|---|---|---|
| **ST elevation (STEMI thresholds)** | **EVALUABLE** — the strongest rule we have | `st_j_mv >= 0.10` in any lead other than V2/V3; in V2/V3 the sex/age cut (§4). ≥2 leads of a contiguous grouping | Nothing measurement-side. But: baseline is PQ not QRS onset (§0.3(1)); contiguous pairs may be non-simultaneous (§0.3(4)); the LVH/LBBB/pacing/WPW gate is only half-functional (§1.1). |
| **ST depression** | EVALUABLE, usually below the floor | `st_j_mv <= -0.05` AND `st_down_or_flat(L)`, ≥2 contiguous | The 0.05 mV criterion sits below the best-case difference floor for image-derived signal (spec §6.3). 0.05–0.09 must return `BelowDetectionLimit`, not "negative". |
| **T-wave inversion (ischaemic form)** | EVALUABLE | `t_amplitude_mv <= -0.10` AND `rs_ratio(L) > 1`, ≥2 contiguous | "Prominent R wave" (the alternative gate) has no numeric definition; use R/S > 1 only and say so. |
| **T-wave descriptive bands (Part IV)** | EVALUABLE | inverted −0.1 to −0.5 mV; deep negative −0.5 to −1.0; giant beyond −1.0; flat −0.1 to +0.1; low T = `abs(t_amplitude_mv) < 0.1 * r_amplitude_mv` | Part IV itself says a cause-specific classification of minor T abnormality is "virtually impossible" — these are descriptors, not diagnoses. |
| **Left main / multivessel pattern** | EVALUABLE | count of leads with `st_j_mv <= -0.10` ≥ 6 (UDMI) or ≥ 8 (Part VI), AND `st_j_mv > 0` in aVR and/or V1 | Both counts must be shown (§5). The pattern is also produced by LVH, cardiomyopathy, LBBB and tachycardia — an ISE-endorsed counterpoint disputes its specificity outright. |
| **Long QT / short QT** | **EVALUABLE** | `qtc_fridericia_ms` vs sex thresholds (§4); short ≤ 390 both sexes; `qrs_ms >= 120` → report **JT/JTc instead** | Bazett is display-only. T-end in T-U fusion is explicitly unreliable. |
| **Modified Sgarbossa (Smith)** | **EVALUABLE** *given* an LBBB or paced context | concordant STE: `st_j_mv >= 0.10` where `net_polarity > 0`; concordant STD: `st_j_mv <= -0.10` in V1–V3 where `net_polarity < 0`; proportional: `st_j_mv / abs(s_amplitude_mv) <= -0.25` | Smith measures ST against the **PR segment** — which is what we measure against, so this rule is *better* aligned to our pipeline than the UDMI thresholds are. But it requires LBBB established, which is PARTIAL, and paced rhythm, which is BLOCKED. |
| **Early repolarisation** | **BLOCKED — and this is the important one** | — | The consensus criterion is an **end-QRS notch or slur in the final 50 % of the R downslope**, with Jp ≥ 0.1 mV, QRS < 120 ms. ST elevation is explicitly *not* a criterion, and ST elevation without a notch **must not** be called early repolarisation. Without notch detection we cannot exclude ER, so **benign ER will be reported as ST elevation.** That is a named, predictable false positive and the learner must be told it exists. |
| **Driver 4-variable formula** | EVALUABLE as a labelled non-guideline calculator | `0.052·qtc_bazett_ms − 0.151·qrs_amp(V2) − 0.268·r_amplitude_mv[V4] + 1.062·st_j60_mv[V3]` (in mm), ≥ 18.2 favours LAD occlusion | Its applicability conditions (terminal QRS distortion, ST convexity) are not computable. No society endorses it. It measures ST at J+60, contradicting the at-the-J convention everywhere else. Never a label. |
| **Hyperacute T waves** | UNDEFINED | — | No guideline gives any mV cut-off, T/R ratio or symmetry index. Genuinely unmeasurable as written. Do not invent a number. |
| **Wellens / deep anterior T** | PARTIAL | `t_amplitude_mv[V2..V4] < -0.50` (Part VI) or `< -0.20` (UDMI) | "Symmetry" has no numeric definition; the pattern is partly defined by history ("after an episode of chest pain"). The two primary documents differ by 2.5× (§5). |
| **LV aneurysm T/QRS ratio** | EVALUABLE arithmetically, BLOCKED as a label | `sum(t_amplitude_mv, V1..V4) / sum(qrs_amp, V1..V4) > 0.22`; max single-lead ratio ≥ 0.36 | ANEUR means *persistent* ST elevation — a serial fact. Offer as a discriminator when the user has already asserted anterior STE with Q waves; never auto-label. |
| **Non-specific ST-T change (NST_/NDT)** | Descriptive only | ST-T deviation present but below ischaemic thresholds | No primary source defines it numerically. Part IV's recommended wording is "slight or indeterminate". It is a description, not a diagnosis. |
| **Digitalis effect (DIG), electrolyte (EL)** | BLOCKED | — | No quantitative criteria in any primary source; both require information outside the signal (medication list, serum chemistry). |

### 1.4 Hypertrophy and chamber enlargement

| Criterion | Status | Fires on |
|---|---|---|
| **Sokolow-Lyon precordial** | EVALUABLE | `abs(s_amplitude_mv[V1]) + max(r_amplitude_mv[V5], r_amplitude_mv[V6]) >= 3.5 mV` |
| **R in aVL** | EVALUABLE | `r_amplitude_mv[aVL] > 1.1 mV` — **suppress under LAFB** (AHA: R in I and aVL is not reliable there) |
| **Cornell voltage** | EVALUABLE, sex-specific | `r_amplitude_mv[aVL] + abs(s_amplitude_mv[V3])` > 2.8 mV (M) / 2.0 mV (F) |
| **Cornell product** | EVALUABLE, sex-specific | `(R aVL + S V3 [+0.6 mV if female]) * qrs_ms > 244 mV·ms` — female offset disputed (§5) |
| **Total 12-lead voltage / product** | EVALUABLE | `sum(qrs_amp) > 17.5 mV`; `sum(qrs_amp) * qrs_ms > 174.2 mV·ms` |
| **Peguero-Lo Presti** | EVALUABLE, sex-specific | `max_over_leads(abs(s_amplitude_mv)) + abs(s_amplitude_mv[V4]) >= 2.8 mV (M) / 2.3 mV (F)`; **double S(V4) when the deepest S is in V4** |
| **Limb-lead set** (Lewis, Gubner, R I, R aVF, Q/S aVR) | EVALUABLE | pure arithmetic; suppress the I/aVL members under LAFB |
| **Precordial set** (Wilson, Mazzoleni, Grant, McPhie, Murphy, Holt, Manning…) | EVALUABLE | pure arithmetic; Manning is age-split (§4) and undefined at exactly 30 y |
| **LVH under LAFB** (Bozzi, Gertsch) | EVALUABLE *given* LAFB | `S V1 + R V5 + S V5 > 2.5 mV`; `max(S V1,S V2) + R V6 + S V6 > 2.5 mV`; `abs(s_amplitude_mv[III]) + max_over_leads(qrs_amp) > 3.0 mV (M) / 2.8 mV (F)` |
| **LVH under RBBB** (Vandenberg) | EVALUABLE *given* RBBB | `max_over_precordial(qrs_amp) > 2.9 mV` with `axis_deg < -30`; `abs(S V1) > 0.2`; `R V5/V6 > 1.5`; `R I > 1.1` — specificity 57–71 %, far worse than the 85–90 % attributed to LVH criteria generally. **Say that when it fires.** |
| **LVH under LBBB** | **BLOCKED** | The guideline's own threshold is "greater than **approximately** 155 ms" plus an unnamed "precordial lead voltage criteria". Not implementable as written. |
| **Romhilt-Estes point score** | **BLOCKED as a score** | Amplitude row (3 pts), axis row (2 pts), QRS ≥ 90 ms row (1 pt) are computable. **Left atrial abnormality (3 pts) needs P waves; intrinsicoid deflection ≥ 50 ms needs R peak time; the ST-T row's digitalis branch needs a medication history.** The score is systematically under-counted by up to 4 points — it can only ever produce false negatives, and a 4-vs-5 boundary decides definite/probable. Do not report a Romhilt-Estes total. |
| **RVH — individual criteria** | EVALUABLE | `R V1 > 0.6`; `rs_ratio(V1) > 1`; `abs(S V5) > 1.0`; `abs(S V6) > 0.3`; `R aVR > 0.4`; `abs(S V1) < 0.2`; `R V5/V6 < 0.3`; `rs_ratio(V5) < 0.75`; `rs_ratio(V6) < 0.4`; Butler-Leggett `max(R V1,R V2) + max(abs(S I), abs(S aVL)) − abs(S V1) > 0.6 mV` |
| **RVH — as a label** | **BLOCKED** | The guideline states explicitly that no single criterion or limited set can be recommended, and that how to combine them "should be further studied". There is no combination rule to implement. Report which criteria are met; do not emit "RVH". Also: R peak time V1 > 35 ms is not measured; the ratio-of-ratios criterion divides by an undefined quantity; **the Lewis-index RVH row in the guideline table appears to have a lost negative sign — do not implement it.** |
| **RVH in COPD** | BLOCKED | Four of six components carry no number, and the decisive gate ("R in V1 relatively increased") is relative to nothing specified. |
| **LAO/LAE and RAO/RAE** | **BLOCKED** | Every criterion is a P-wave measurement. Nothing to evaluate. |
| **Biventricular hypertrophy** | BLOCKED | Only one component carries a number, and it is conditioned on a known congenital defect plus established RVH. |
| **SEHYP** | **UNDEFINED** | No section, table row or threshold in AHA Part V; no Minnesota code; no NOVACODE entry; no external code mapping in `scp_statements.csv`. Anything computed would be invented. Omit it, or state that it has no guideline-defined criteria. |

**The framing that must accompany every LVH output:** sensitivity is usually under 50 %, specificity 85–90 %; in hypertensive populations, median sensitivities run 10.5 % (Gubner) to 21 % (Sokolow-Lyon), and the negative likelihood ratio for Romhilt-Estes ≥4 is 0.85 — a negative result barely moves the probability. Additionally, among mild-to-moderate hypertensives only **11.2 %** of those positive by *either* Cornell voltage or Sokolow-Lyon were positive by *both*. A single "LVH: yes/no" output is contrary to the guideline, which asks for a per-criterion report.

### 1.5 Rhythm

| Finding | Status | Fires on | Missing |
|---|---|---|---|
| **Heart rate** | EVALUABLE | `hr_bpm` from the RR series | With ~8–17 RR intervals in 10 s, a patient at a cut-point classifies differently on consecutive recordings. |
| **Sinus tachycardia** | PARTIAL | `hr_bpm > 100` — but "sinus" is not established | P-wave polarity. Report "tachycardia at N bpm", not sinus tachycardia. |
| **Sinus bradycardia** | PARTIAL | `hr_bpm < 50` — same problem | Same. Three competing cut-points (§5). |
| **Sinus rhythm (SR)** | **BLOCKED** | — | Sinus origin is asserted from P polarity (upright II, negative aVR). We measure no P waves. **The tool cannot say "sinus rhythm", and therefore cannot say "normal ECG".** |
| **Sinus arrhythmia** | BLOCKED | — | Needs P waves, and the widely quoted ">120 ms P-P variation" traces to no primary source at all. |
| **Atrial fibrillation** | **PARTIAL — do not assert** | `rr_irregular` (NOVACODE 40 ms bin test) is computable | The *specific* half — absence of discrete P waves and presence of fibrillatory activity — is not. Irregular RR alone is also produced by frequent PACs, MAT, sinus arrhythmia and 2nd-degree AV block. Report "irregularly irregular ventricular response" as an observation. ADR 0003 lists AF as suggestible from "RR irregularity + absent consistent P"; the second conjunct is not measured. |
| **Atrial flutter** | BLOCKED | — | F-wave rate, amplitude and polarity. A regular rate near 150 bpm should raise "cannot rule out 2:1 flutter" and nothing stronger. |
| **SVT / SVARR** | PARTIAL | `hr_bpm > 100` AND `qrs_ms < 120` → "narrow-complex tachycardia" | Mechanism is an EP fact. Never name AVNRT/AVRT/AT. |
| **PSVT** | BLOCKED | — | Defined by abrupt onset **and** termination — a property of the episode, not of a window in which the tachycardia is present throughout. It is a clinical syndrome, not an ECG pattern. |
| **PAC, PVC, BIGU, TRIGU** | BLOCKED | — | All require per-beat classification and per-beat QRS morphology. The pipeline builds a median beat per lead and discards the beat cascade by design. |
| **PACE** | **BLOCKED** | — | AHA Part I states pacing stimuli are shorter than 0.5 ms and "cannot be reliably detected by ordinary signal processing technique at 500 to 1000 Hz". Our canonical grid is 500 Hz. Any paced-rhythm call would be inferred from wide-QRS morphology, for which no primary criteria exist. And "normal functioning" is a device judgement, not a waveform measurement. |
| **Sinus pause / SA block** | BLOCKED | — | Needs P waves; a >3 s pause barely fits in a 10 s record. |

---

## 2. What to measure next, ranked by what it unlocks

**1. P-wave delineation (onset, offset, peak amplitude and polarity per lead; PR interval).**
Largest single unlock by a wide margin. It converts: sinus-rhythm determination (and therefore the ability to say "normal") from BLOCKED to EVALUABLE; first-degree AV block; the specific half of atrial fibrillation; **all** of LAO/LAE and RAO/RAE; the Romhilt-Estes left-atrial row (3 of the score's 13 points); the PR half of WPW; and the P-axis check that spec §6.1 already names as "the single best flag for limb-lead reversal" — which is a false-positive suppressor for the entire Q-wave and R-progression family. Nothing else on this list touches five finding families at once.

**2. R peak time (global QRS onset → peak of R, or of R′ where one exists, per lead).**
Cheapest high-yield item: the global onset already exists and this is a constrained peak locator on top of it. It supplies the *mandatory* missing criterion in CLBBB (V5–V6 > 60 ms), CRBBB (V1 > 50 ms), LAFB (aVL ≥ 45 ms), ILBBB (V4–V6 > 60 ms) and RVH (V1 > 35 ms), plus the Romhilt-Estes intrinsicoid row. Turns four PARTIAL rules into EVALUABLE. **Measure it from the global onset, not the local one** — using the per-lead onset systematically shortens it and flips borderline LBBB and LAFB calls.

**3. Per-lead wave segmentation with R′/S′ labelling and per-wave durations.**
Unlocks CRBBB and IRBBB outright (rsR′/rSR′; S duration > R duration or > 40 ms in I and V6), the posterior-MI R-duration criterion (R > 40 ms in V1–V2), Minnesota 7-3 and 7-5, and robust QS detection — which retires the invented amplitude floor in §0.2. It is the difference between "RBBB pattern by a Minnesota branch" and "RBBB".

**4. Beat-level classification on the rhythm strip** (premature vs normal, wide vs narrow, per-beat QRS width and amplitude).
Unlocks PAC/PVC/BIGU/TRIGU entirely, and — less obviously — the Minnesota Code's "majority of beats" and "every beat" qualifiers, which several Q-wave, R-progression and conduction codes depend on. Also supplies Minnesota's beat-selection rule (amplitudes read from the second-to-last complete normal beat), which most naive implementations silently skip.

**5. Mid-QRS and end-QRS notch/slur detection** (Xia 2017 thresholds: height ≥75 µV with width ≥5 ms, or ≥50 µV/≥10 ms, or ≥30 µV/≥25 ms; slur via first-derivative concavity scaled by H2/H1).
Unlocks Strauss and ESC 2021 strict LBBB, and separately the early-repolarisation consensus criterion — which is the fix for the named ER→STE false positive in §1.3. Ranked fifth because the validated implementation used 1000 Hz signal-averaged ECGs and ours is 500 Hz, un-averaged, image-derived: expect degraded sensitivity and disclose the detector.

**6. Per-lead QRS onset/offset alongside the global pair.**
Unlocks the whole Minnesota per-lead family, and — more valuable for a teaching tool — lets you *show* the global-vs-per-lead discrepancy on the same tracing. The discrepancy is the lesson.

**7. Fibrillatory / flutter wave detection in II, III, aVF, V1** (amplitude ≥100 µV, cycle regularity).
Separates AF from flutter and both from a regular narrow-complex tachycardia. Note the ≥100 µV threshold sits near the noise floor of image-derived tracings; gate it behind the quality check.

**8. ST amplitude against a second baseline (TP as well as PQ).**
Low implementation cost, and it is the only way to *demonstrate* the convention disagreement in §0.3(1) rather than assert it.

**9. Pacing-spike detection.**
High value (it is a required suppressor for every ST criterion) but requires front-end oversampling well above 500 Hz. Ranked here on feasibility, not importance. Until it exists, the ST rules run without their pacing gate and the UI must say so.

**10. T-wave onset/offset and a symmetry index.**
Would firm up Wellens-type patterns — but neither primary document defines symmetry numerically, so the payoff is bounded by the sources, not by the measurement.

---

## 3. Findings we should not attempt to explain

Ship these as "this tool does not assess X", not as a weak rule. The distinction between *"no finding"* and *"not assessed"* has to be visible in the UI — ADR 0003 already makes that argument for suppression; it applies identically here.

**No criteria exist anywhere:**
- **SEHYP** (septal hypertrophy) — no guideline, no Minnesota code, no NOVACODE entry, no external code mapping. Nothing to be conservative *about*.
- **Hyperacute T waves** — no guideline supplies any threshold.
- **Digitalis effect, electrolyte disturbance** — morphology calls requiring a drug list or serum chemistry.
- **"Trifascicular block"** — not an ECG entity; bifascicular block plus first-degree AV block does not localise the delay.

**The defining feature is a P wave:**
- Sinus rhythm, sinus arrhythmia, left/right atrial abnormality, WPW, first-degree AV block, and — as a consequence — **"normal ECG"**.

**The defining feature is a morphology we do not compute:**
- **Incomplete RBBB** and the whole rSr′ differential including Brugada type 2 (r′ geometry).
- **Incomplete LBBB** (R peak time + an LVH criterion the guideline declines to name).
- **Strict/Strauss LBBB and ESC 2021 LBBB** (notching).
- **Early repolarisation** (end-QRS notch/slur) — and therefore the tool cannot exclude ER before calling ST elevation.
- **Atrial flutter** (F waves).
- **Posterior MI / PMI / IPMI / IPLMI** (R duration in V1–V2), and the ILMI-vs-IPMI distinction, which no measurement separates at all.

**Requires beat-level or multi-beat analysis we discard by design:**
- PAC, PVC, bigeminy, trigeminy, "frequent" vs "occasional" ectopy (which has no numeric definition in any primary source anyway), and every Minnesota "majority of beats" qualifier.

**Requires a signal path we do not have:**
- **Paced rhythm** at 500 Hz, per AHA Part I's explicit statement.
- Everything on V7–V9 and V3R/V4R. Flag as "requires additional leads"; never approximate posterior or right-sided criteria from V1–V3.

**Requires clinical information, by construction:**
- **LVH in the presence of LBBB** ("greater than approximately 155 ms" is not a number).
- **RVH as a label** (the guideline states there is no combination rule).
- **Romhilt-Estes as a score** (3 of 6 domains unavailable; systematically under-counts).
- **Biventricular hypertrophy**.
- **PSVT** (clinical syndrome), SVT *mechanism*, culprit-vessel attribution.
- **Ventricular aneurysm** (persistence).
- Any acute-MI claim: the Universal Definition requires troponin, and its prior-MI limb requires excluding non-ischaemic causes no ECG can exclude. The strongest honest output is *"pathological Q-wave pattern consistent with prior infarction in leads X"* and *"ST elevation meeting the J-point threshold in lead group Y"*.

**One asymmetry worth stating positively:** every acute criterion in these documents is phrased "new, or presumed new", and a single-record program can never satisfy it. **This tool is a serial comparison tool.** Given a registered prior study and a Δ that clears MDC95, "new" is the one thing it can establish that a single-ECG classifier cannot. That is where the explanation should be strongest, not weakest.

---

## 4. Every sex- and age-specific threshold

**Hard rule (already in spec §6.1, reaffirmed):** if sex or age is unknown, the rules below emit `Unmeasurable(demographics_required)`. Do not fall back to a male threshold, a female threshold, or a midpoint. Applying a male V2–V3 cut to a female record understates elevation by 0.05 mV and looks entirely normal doing it.

### Sex-specific

| Rule | Male | Female | Source |
|---|---|---|---|
| **ST elevation V2–V3** | ≥0.25 mV (<40 y) / ≥0.20 mV (≥40 y) | **≥0.15 mV, all ages** | UDMI-4 Table 2 |
| **QTc prolonged** | ≥450 ms | ≥460 ms | AHA Part IV. Short QT ≤390 ms, both sexes. Marked >500 ms, both. |
| **Cornell voltage** | >2.8 mV | >2.0 mV | Casale 1985 |
| **Cornell product female offset** | none | **+0.6 mV (6 mm) or +0.8 mV (8 mm) — disputed**, §5 | LIFE original vs amended |
| **Peguero-Lo Presti** | ≥2.8 mV | ≥2.3 mV | Peguero 2017 (widely misquoted as 2.3/1.9 — do not use those) |
| **Gertsch (LVH under LAFB)** | S III + max R/S >3.0 mV | >2.8 mV | Gertsch 1988 |
| **Strauss strict LBBB QRS** | ≥140 ms | ≥130 ms | Strauss 2011 — *the only sex-specific QRS duration in the literature*; not implementable here (notching) but must be shown as a disagreement |
| Upper normal QRS duration | >110 ms | >110 ms — **AHA explicitly declined a sex split**, while noting female QRS is empirically 4–10 ms shorter and ESC 2021 notes simulations predict 9–13 ms lower thresholds for women | AHA Part III; ESC 2021 |

### Age-specific

| Rule | Threshold |
|---|---|
| **ST elevation V2–V3, men** | 0.25 mV under 40 y; 0.20 mV at 40 y and above |
| **ST elevation V7–V9** | 0.5 mm; UDMI adds ≥1 mm for **men <40 y** (Part VI gives a flat 0.5 mm for everyone — §5). *Not applicable: no V7–V9.* |
| **ST elevation V3R/V4R** | 0.5 mm; 1 mm in **men <30 y**. Note the boundary is **<30 for right-sided leads and <40 for V2–V3 and V7–V9** — an easy off-by-a-decade bug. *Not applicable.* |
| **Manning LVH composite** | >59 mm if age >30 y; >93 mm if age <30 y. **Undefined at exactly 30 y as printed.** |
| **LVH criteria validity** | Validated for adults **>35 y**. Standards for ages 16–35 are "not well established"; diagnosis in athletes is "especially problematic". Below adulthood, adult cuts do not apply at all. |
| **Paediatric QRS, complete BBB** | >100 ms age 4–16 y; >90 ms age <4 y |
| **Paediatric QRS, incomplete LBBB** | 90–100 ms age 8–16 y; 80–90 ms age <8 y — **note the band boundaries differ from the complete-block bands (4/16 vs 8/16); this asymmetry is in the source, and one secondary reproduction gives 4–16/<4 instead. Unresolved.** |
| **Paediatric QRS, incomplete RBBB** | 90–100 ms age 4–16 y; 86–90 ms age <8 y — **as printed these bands overlap and are internally inconsistent. Defect in the source.** |
| **Paediatric IVCD** | >90 ms age 8–16 y; >80 ms age <8 y |
| **Paediatric WPW** | PR <90 ms, QRS >90 ms |
| **LPFB** | Adults only. Children up to 16 require a documented rightward axis *change* — i.e. a prior tracing. |
| **T-wave inversion normality** | Inversion in I, II, V3–V6 abnormal at ≥20 y. V2 inversion normal at 12–19 y. V1–V3 inversion often normal in children >1 month. |
| **Bradycardia/tachycardia limits** | Adult 50/100 bpm; paediatric limits are continuous age curves (~105 bpm brady limit in infancy falling to 50 bpm by 12.5 y; tachy limit ~180 bpm in infancy falling to 100 bpm by 18 y) |
| **Paediatric LVH voltage** | Age-banded R V6 / S V1 / S V1+R V6 tables — **and the guideline states these were derived at a lower sampling rate, that 500 Hz and 1200 Hz studies give higher limits, and that criteria "should be adjusted" without supplying an adjustment.** Do not extrapolate adult cuts downward, and do not apply the paediatric table at 500 Hz unadjusted. |

### Ancestry — explicitly not implementable
Part IV publishes ancestry-stratified 98th-percentile ST amplitudes, and Part V documents that Sokolow-Lyon and Cornell shift in **opposite directions** by ancestry, that African-American subjects have higher and Hispanic-American lower upper-normal QRS voltage. **No guideline converts any of this into a threshold**, and no ancestry field exists in our inputs. A tool that adjusted by race would be going beyond every primary source. State the effect exists; implement nothing.

---

## 5. Where guidelines disagree — both values, with attribution

Ordered by how often the disagreement changes an answer we can actually compute today.

| # | Quantity | Position A | Position B (and C) | Bites us because |
|---|---|---|---|---|
| 1 | **ST-depression threshold** | **≥0.5 mm in every lead** — UDMI-4 (2018) Table 2 | **0.5 mm in V2–V3, 1.0 mm everywhere else** — AHA/ACCF/HRS Part VI (2009) Rec. 6. Minnesota splits major (4-1, ≥1.0 mm) from minor (4-2, ≥0.5–1.0 mm) | A 0.7 mm inferior depression is ischaemic under UDMI and normal under Part VI. Both documents are current and neither is withdrawn. |
| 2 | **ST amplitude reference baseline** | **QRS onset** — UDMI-4 §27, Fig. 8 | **TP or PR segment** — AHA Part IV. **P-Q junction** — Minnesota, AHA exercise standards, Smith's modified Sgarbossa | **We measure against PQ.** Part IV's own data show the 98th percentile in V2 roughly doubling between the J point and J+60. The number is not portable without the convention. |
| 3 | **Measurement instant** | **At the J point** — resting diagnosis (UDMI, Part VI, Minnesota) | **60–80 ms after J** — AHA exercise standards; Part IV permits 40–80 ms "in some settings" | We compute both (`st_j_mv`, `st_j60_mv`). Label which one each rule used. |
| 4 | **QRS duration convention** | **Global**, earliest onset to latest offset across simultaneous leads — AHA | **Per-lead, majority of beats** — Minnesota Code | 5–15 ms systematic difference on the same recording, straddling both the 110 and 120 ms boundaries. And *neither* is exactly what we compute (§0.3(2)). |
| 5 | **IVCD lower bound** | **>110 ms** — AHA Part III | **≥120 ms** — Minnesota 7-4, and most published IVCD epidemiology | A 115 ms QRS is IVCD under AHA and normal under Minnesota. The same 110 ms line is also where AHA puts incomplete BBB, so a 115 ms QRS with an rsR′ is simultaneously eligible for IRBBB and excluded from IVCD. |
| 6 | **What "LBBB" means** | AHA 2009: ≥120 ms + broad notched/slurred R + absent lateral q + R peak time | ESC 2013 / MADIT-CRT: adds a mandatory QS-or-rS in V1, drops R peak time. **Strauss: ≥140 M / ≥130 F + V1 negativity + mid-QRS notch in ≥2 of 6 leads. ESC 2021: ≥120 ms + mid-third notch in ≥2 leads + R peak time >60 ms.** Minnesota 7-1-1: ≥120 ms + R peak duration ≥60 ms, *no morphology at all* | Applied to the same 281 CRT patients, **100 % met ESC 2013 and 12 % met ESC 2021.** Among super-responders, 100 % vs 19 %. This is the largest guideline-to-guideline discrepancy in the whole corpus. "≥120 ms + broad R" must never be presented as *the* definition. |
| 7 | **ST-elevation age split, V2–V3** | UDMI-4: 2.5 mm men <40, 2.0 mm men ≥40, 1.5 mm women | **2013 ACCF/AHA STEMI guideline: 2 mm men (no age split), 1.5 mm women.** Minnesota 9-2: **2 mm in V1–V4 for everyone**, 1 mm elsewhere | A 30-year-old man at 2.2 mm in V3 is negative under UDMI, positive under the 2013 guideline and positive under Minnesota. A woman at 1.6 mm is UDMI-positive and Minnesota-negative. |
| 8 | **Contiguous lead groupings** | UDMI 2012/2018: **(I, aVL) · (V1–V6) · (II, III, aVF)** | UDMI 2007: (I, aVL, V6) · (V4–V6) · (II, III, aVF). Minnesota "sites": (I, aVL, V6) · (II, III, aVF) · (V1–V5) | **Our spec §6.1 currently uses a fourth partition — anterior V1–V4 / lateral I, aVL, V5, V6 / inferior II, III, aVF — which matches none of them.** That is a legitimate modelling choice, but it is a choice and must be documented as ours, not attributed to UDMI. |
| 9 | **UDMI Table 3's internal inconsistency** | Qualifying leads for the ≥0.03 s Q rule: I, II, aVL, aVF, V4–V6 | Contiguous groupings include **lead III and V1–V3**, which are not in the qualifying list | A textbook inferior MI with deep Q in III and aVF satisfies the rule only via aVF+II. There is no reading of the table that is both literal and clinically sensible — pick one, document it. Minnesota resolves it by giving lead III its own much stricter ladder (≥0.05 s major, with a corroborating Q ≥1.0 mm in aVF). |
| 10 | **Cornell product female offset** | **+8 mm** — original LIFE entry criterion, and Pewsner's systematic review | **+6 mm** — amended LIFE protocol and most subsequent LIFE publications. **No offset at all** — Molloy 1992, at threshold 2436 rather than 2440 mm·ms | At a 100 ms QRS the 8-vs-6 mm difference shifts the product by 200 mm·ms — about 8 % of the threshold. **Our spec uses +0.6 mV (6 mm) and 244 mV·ms; that is a defensible choice and it is a choice.** |
| 11 | **Sokolow-Lyon lead set and inequality** | AHA Part V Table 1 prints **S V1 + R V5 > 35 mm** (V5 only, strict >) | Sokolow's original paper and Pewsner 2007 use **max(R V5, R V6)** and **≥3.5 mV**. LIFE used **>38 mm** for enrolment | Three ways to be "correct" about the most-cited LVH criterion. At integer-mm resolution the >/≥ split decides exactly 35 mm. |
| 12 | **Romhilt-Estes amplitude row** | AHA Part V Table 1: **"R+S in any limb lead >19 mm"** (a sum) | Every reproduction of the original, including ARIC's: **"R or S in any limb lead ≥20 mm"** (a max) | Different computations, different answers. The 1968 original could not be obtained to adjudicate. **Prefer the "R or S ≥20 mm" form — that is what every validation study used.** Moot for us since the score is unreportable (§1.4), but the row matters if the amplitude domain is shown alone. |
| 13 | **Peguero-Lo Presti thresholds** | Published: **≥2.8 mV men, ≥2.3 mV women** | Widely circulated secondary literature: 2.3 mV men, 1.9 mV women | The misquote is common enough to be the default expectation. Print the source values and the correction. |
| 14 | **LAFB axis boundary** | **−45°** — AHA 2009 and Minnesota 7-7 | **−30°** — many automated systems and older texts | The −30 to −45 band is a large population. Compounded by axis-method dependence (§0.3(3)). |
| 15 | **LPFB axis window** | **+90° to +180°** — AHA 2009 | **≥+100° or ≥+120°** in most textbooks and automated programs, because +90–100° overlaps normal vertical hearts | There is no consensus threshold. Say so rather than picking silently. |
| 16 | **RBBB V1 R-peak-time threshold** | **>50 ms in V1** — AHA 2009 | **≥60 ms in V1 or V2** — Minnesota 7-2-1. Minnesota additionally permits diagnosis via lead I/II S-duration alone, with no rsR′ requirement | Same-named quantity, different number, different measurement. |
| 17 | **R peak time itself** | AHA: measured from the **global** QRS onset (earliest across simultaneous leads) to the peak of R or R′ | Minnesota: "R peak duration", measured **per-lead from the local onset**, threshold ≥0.06 s | Same name, different number, different measurement — the single easiest way to teach something false. |
| 18 | **Deep anterior T inversion** | **>5 mm (0.5 mV)** — AHA Part VI | **>2 mm** — UDMI-4 §27 | A factor of 2.5 between two current documents. |
| 19 | **What "T-wave inversion" means** | Part IV: negative from **−0.1 mV**, no R-wave gate | UDMI: **>1 mm** *plus* a prominent R or R/S >1. Minnesota 5-2: ≥1.0 mm negative, with 5-3 for <1.0 mm | Three operational definitions in current use; we can compute all three. |
| 20 | **Left main / multivessel pattern** | UDMI-4: **ST depression ≥1 mm in 6 leads** + elevation in aVR or V1 | Part VI: **>1 mm in 8 or more leads** + elevation in aVR and/or V1 | Both the lead count and the inequality differ. An ISE/ISHNE counterpoint disputes the pattern's specificity altogether. |
| 21 | **Sgarbossa under LBBB** | UDMI-4 retains **only** concordant STE ≥1 mm | Part VI reproduces all three GUSTO-I criteria including discordant ≥5 mm, while noting it had "very low specificity and sensitivity". **Smith 2012 replaces the 5 mm rule with ST/S ≤ −0.25, unweighted** | We can compute all of them. Smith's is the only one aligned to our PQ baseline. |
| 22 | **Butler-Leggett RVH** | AHA Part V Table 2: **>6 mm** | Much of the pulmonary-hypertension literature: **≥0.7 mV (7 mm)**; a published correction to the 1986 study exists | Unadjudicated. Show both or show neither. |
| 23 | **R in aVL (LVH)** | AHA Part V: **>11 mm** | 2018 ESH/ESC and much clinical literature: **≥11 mm**; some sources **≥12 mm** | — |
| 24 | **Bradycardia** | **<50 bpm** — 2018 ACC/AHA/HRS, adopted "for the purposes of this document" | **≤50 bpm** — Minnesota 8-8 and NOVACODE 1.0.2. **<60 bpm** — NIH definition, recorded and explicitly *not* adopted by the same guideline | Exactly 50 bpm classifies three different ways. |
| 25 | **Tachycardia** | **>100 bpm** — 2015 SVT guideline | **≥100 bpm** — Minnesota 8-7. **≥95 bpm** — NOVACODE 1.0.3 | 95–99 bpm is tachycardia in NOVACODE and normal everywhere else. |
| 26 | **Normal sinus rate band** | 60–100 bpm (clinical convention) | 51–94 (NOVACODE) · 51–99 (Minnesota, implied) | Three bands in active use. |
| 27 | **Posterior vs lateral nomenclature** | AHA Part VI (2009): **retain "posterior"**, explicitly declining the ISHNE recommendation | ISHNE (2006), on CMR evidence: the prominent R in V1–V2 reflects the **lateral** wall; replace with lateral/inferolateral/basal-lateral. UDMI-4 splits the difference: "inferobasal (previously termed posterior)" | Two named committees in open, printed disagreement. Present all three positions; do not adjudicate. |
| 28 | **Anteroseptal vs apical-anterior** | Classical: V1–V2 = septal, V3–V4 = anterior | ISHNE/CMR: patterns historically read as "anteroseptal" frequently represent apical-anterior infarction; Q in aVL and I without V6 should be called **mid-anterior**, not high lateral | Changes what the tool is permitted to claim, not what it measures. Treat territory codes as lead-set labels. |
| 29 | **Strict vs inclusive inequalities, generally** | AHA uses **≥**120 ms QRS, **>**110 ms IVCD, **>**60 ms R peak time V5–V6, **>**50 ms V1, **>**40 ms S duration, **≥**45 ms aVL R peak time | Several widely-circulated reproductions (wikidoc among them) silently convert all of these to ≥ | At 500 Hz one sample is 2 ms and amplitude resolution is finite. Boundary cases are real, and they are exactly the cases a learner asks about. Reproduce the inequality exactly as printed. |
| 30 | **QTc male threshold** | Part IV narrative: "longer than 450 ms" | Part IV **Recommendation**: "450 ms or longer" | Internal to one document. Our spec uses `>450`; pick the Recommendation form (`>=450`) or keep `>` and say which. |

---

## Three corrections to existing repo artifacts, surfaced in passing

1. **`docs/engineering-spec.md` §6.1** cites the pathological-Q criteria as *"UDMI-4 (2018), Table 4"*. They are in **Table 3**. (Table 2 is the acute-ischaemia ST criteria.)
2. **`contiguous_lead_groups`** in §6.1 (anterior V1–V4 / lateral I, aVL, V5, V6 / inferior II, III, aVF) matches no published partition — see §5 row 8. Keep it if it is deliberate, but label it as the tool's own grouping.
3. **ADR 0003's suppression matrix** names WPW and ventricular pacing as ST suppressors. Neither can be detected from the current measurement set, so neither suppressor can ever fire. Either add the detectors or state in the UI that the ST rules run without those two gates.
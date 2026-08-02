/**
 * Hypertrophy and chamber enlargement, from `docs/ecg-diagnostic-criteria.md`.
 *
 * The first tranche: the classic left-ventricular voltage criteria, which are
 * the part of the document this tool can most nearly evaluate. Every `printed`,
 * `quantity`, `leads` and `qualifier` string is the document's own cell, and
 * `test/criteria-doc.test.ts` asserts it stays that way. Every `value` was
 * converted from millimetres to millivolts by hand, and the same test asserts it
 * still renders back into the cell it came from.
 *
 * Read the `disagreement` fields before trusting any single number here. Three
 * different female offsets are in active use for the Cornell product (none,
 * +8 mm, +6 mm) against two different thresholds (2436 and 2440 mm·ms); AHA
 * prints Sokolow-Lyon with a strict `>` where the systematic reviews use `>=`,
 * which differ for exactly 35 mm. None of that is a detail to smooth over — it
 * is why the document exists.
 */

import type { CriterionEntry, QuantityExpr } from "./types.ts";

/** SV1 + the taller of RV5 and RV6. AHA's Table 1 names V5 alone; Sokolow and
 *  Lyon's paper and every subsequent use take the larger of the two. */
const SOKOLOW: QuantityExpr = {
  k: "sum",
  terms: [
    { k: "sMv", lead: "V1" },
    { k: "max", terms: [{ k: "rMv", lead: "V5" }, { k: "rMv", lead: "V6" }] },
  ],
};

const R_AVL: QuantityExpr = { k: "rMv", lead: "aVL" };

/** RaVL + SV3. */
const CORNELL: QuantityExpr = {
  k: "sum",
  terms: [{ k: "rMv", lead: "aVL" }, { k: "sMv", lead: "V3" }],
};

/** The voltage-duration products. The multiplier is the *global* QRS duration:
 *  a single-lead value is systematically shorter and moves cases below the
 *  threshold, which the document calls out explicitly. */
const CORNELL_PROD: QuantityExpr = {
  k: "product",
  terms: [CORNELL, { k: "qrsMs" }],
};

/** The LIFE entry definition adds a fixed allowance to the female voltage sum:
 *  +8 mm as originally written, +6 mm after the protocol was amended mid-trial.
 *  Both remain in the literature, so both are carried. */
const CORNELL_PROD_F8: QuantityExpr = {
  k: "product",
  terms: [
    { k: "sum", terms: [CORNELL, { k: "constant", value: 0.8 }] },
    { k: "qrsMs" },
  ],
};

const CORNELL_PROD_F6: QuantityExpr = {
  k: "product",
  terms: [
    { k: "sum", terms: [CORNELL, { k: "constant", value: 0.6 }] },
    { k: "qrsMs" },
  ],
};

export const HYPERTROPHY: CriterionEntry[] = [
  {
    title: "Left ventricular hypertrophy — Sokolow-Lyon precordial voltage index (PTB-XL: LVH; the voltage-only form statement is VCLVH)",
    codes: ["LVH", "VCLVH"],
    role: "definition",
    year: 1949,
    source: "Sokolow M, Lyon TP. The ventricular complex in left ventricular hypertrophy as obtained by unipolar precordial and limb leads. Am Heart J 1949;37:161-186. Reproduced in Hancock EW, Deal BJ, Mirvis DM, Okin P, Kligfield P, Gettes LS. AHA/ACCF/HRS Recommendations for the Standardization and Interpretation of the Electrocardiogram, Part V: Electrocardiogram Changes Associated With Cardiac Chamber Hypertrophy. Circulation 2009;119:e251-e261 (copublished J Am Coll Cardiol 2009;53:992-1002), Table 1.",
    notComputable: "The AHA-mandated adjustments for race/ancestry and body habitus cannot be applied from the waveform: PTB-XL carries age and sex for all 21,799 records but no ancestry field, and height is present in only 6,974 and weight in only 9,421 records, so BMI-conditioned interpretation is unavailable for the majority. AHA Part V also states criteria should only be used 'without modification from the tested form' — a program that re-tunes the 35 mm cut is no longer running Sokolow-Lyon.",
    disagreement: "THREE separate disagreements on one criterion. (1) Lead set: AHA Part V Table 1 prints 'SV1 + RV5 > 35 mm' (V5 only); the original paper and Pewsner's BMJ 2007 systematic review both use 'SV1 + RV5 or V6'. (2) Inequality: AHA Table 1 prints strict '>', Pewsner 2007 and the Peguero meta-analysis use '>= 3.5 mV'. At integer-mm resolution these differ for exactly 35 mm. (3) Threshold: LIFE used > 38 mm for enrolment. Sensitivity estimates diverge wildly by population — Pewsner 2007 median 21% (range 4-52%), specificity 89% (53-100%); the Peguero meta-analysis pooled 0.24 sensitivity / 0.94 specificity; one echo-referenced series reported 1.9% sensitivity.",
    rows: [
    {
      quantity: "SV1 + max(RV5, RV6) — peak-to-baseline S depth in V1 plus peak R height in V5/V6",
      leads: "V1 plus V5 and V6",
      printed: ">= 35 mm (>= 3.5 mV); AHA Part V Table 1 prints '> 35 mm'",
      qualifier: "None applied in the original criterion. AHA Part V explicitly warns the criterion is validated for adults > 35 years; accuracy is low at 16-35 years and in trained athletes. Sokolow-Lyon has HIGHER sensitivity / LOWER specificity in African-Americans than Euro-Americans, and is LESS often positive in obesity (adipose insulation and increased heart-to-electrode distance).",
      marks: ["V1", "V5", "V6"],
      check: { expr: SOKOLOW, relation: ">=", value: 3.5, unit: "mV" },
    },
    {
      quantity: "Same sum, LIFE-trial entry variant",
      leads: "V1 plus V5/V6",
      printed: "> 38 mm (> 3.8 mV)",
      qualifier: "Used as a trial-eligibility threshold, not a diagnostic one (LIFE, Okin/Devereux/Dahlof)",
      marks: ["V1", "V5", "V6"],
      check: { expr: SOKOLOW, relation: ">", value: 3.8, unit: "mV" },
    },
    ],
  },
  {
    title: "Left ventricular hypertrophy — R wave in aVL alone (Sokolow-Lyon limb-lead criterion)",
    codes: ["LVH", "VCLVH"],
    role: "definition",
    year: 1949,
    source: "Sokolow M, Lyon TP. Am Heart J 1949;37:161-186; tabulated in Hancock et al., Circulation 2009;119:e251-e261, Table 1.",
    notComputable: "Nothing intrinsically — but the criterion must be suppressed or flagged when LAFB is detected, which requires a separate LAFB classification step rather than a raw amplitude read.",
    disagreement: "AHA Table 1 prints '> 11 mm'; the 2018 ESH/ESC hypertension guideline and much clinical literature state '>= 11 mm'. Some sources instead quote R aVL >= 12 mm. A separate, unrelated criterion, R in aVR >= 11 mm, appears in at least one published comparison study conflated with the Sokolow-Lyon index — that is an error; aVR >= 4 mm is an RVH criterion, not an LVH one.",
    rows: [
    {
      quantity: "R amplitude in aVL",
      leads: "aVL",
      printed: "> 11 mm (> 1.1 mV) per AHA Part V Table 1; commonly stated as >= 11 mm",
      qualifier: "AHA Part V: R-wave amplitude in leads I and aVL is NOT a reliable LVH criterion in the presence of left anterior fascicular block, because the LAFB vector shift itself enlarges R in I and aVL",
      marks: ["aVL"],
      check: { expr: R_AVL, relation: ">", value: 1.1, unit: "mV" },
    },
    ],
  },
  {
    title: "Left ventricular hypertrophy — Cornell voltage (sex-specific)",
    codes: ["LVH", "VCLVH"],
    role: "definition",
    year: 1985,
    source: "Casale PN, Devereux RB, Kligfield P, Eisenberg RR, Miller DH, Chaudhary BS, Phillips MC. Electrocardiographic detection of left ventricular hypertrophy: development and prospective validation of improved criteria. J Am Coll Cardiol 1985;6:572-580. Tabulated in Hancock et al., Circulation 2009;119:e251-e261, Table 1 (attributed there as 'Casale 1985'). Sex-specific autopsy validation: Casale PN, Devereux RB, Alonso DR, et al. Improved sex-specific criteria of left ventricular hypertrophy for clinical and computer interpretation of electrocardiograms: validation with autopsy findings. Circulation 1987;75:565-572.",
    notComputable: "Race adjustment: AHA Part V reports Cornell voltage has LOWER sensitivity and HIGHER specificity in African-Americans than Euro-Americans, but gives no adjusted threshold, and ancestry is absent from PTB-XL metadata. Obesity: Okin et al. showed the Cornell family is MORE often positive in obese patients (the opposite direction to Sokolow-Lyon), but no validated BMI-adjusted cut exists.",
    disagreement: "The 1985 Casale paper reports more than one partition. Its abstract states criteria of 'RaVL + SV3 total more than 35 mm' in men and 'more than 25 mm' in women for one age/T-wave-stratified rule, while the simple sex-specific partition that entered guidelines and every automated system is > 28 mm / > 20 mm. Do not implement the 35/25 numbers as 'Cornell voltage'. Separately, some sources state '>=' rather than '>'. Reported accuracy varies enormously: Pewsner BMJ 2007 gave low median sensitivity; the Peguero meta-analysis pooled 0.29 sensitivity / 0.92 specificity; a single-centre echo-referenced series reported 3.9% sensitivity / 96.5% specificity.",
    rows: [
    {
      quantity: "RaVL + SV3",
      leads: "aVL and V3",
      printed: "> 28 mm (> 2.8 mV)",
      qualifier: "MEN",
      marks: ["aVL", "V3"],
      check: { expr: CORNELL, relation: ">", value: 2.8, unit: "mV", appliesTo: { sex: "M" } },
    },
    {
      quantity: "RaVL + SV3",
      leads: "aVL and V3",
      printed: "> 20 mm (> 2.0 mV)",
      qualifier: "WOMEN. AHA Part V states SV3 is the single measurement with the largest male-female difference, and that the difference persists after adjustment for body size and cardiac mass.",
      marks: ["aVL", "V3"],
      check: { expr: CORNELL, relation: ">", value: 2.0, unit: "mV", appliesTo: { sex: "F" } },
    },
    ],
  },
  {
    title: "Left ventricular hypertrophy — Cornell voltage-duration product (Cornell product)",
    codes: ["LVH", "VCLVH"],
    role: "definition",
    year: 1992,
    source: "Molloy TJ, Okin PM, Devereux RB, Kligfield P. Electrocardiographic detection of left ventricular hypertrophy by the simple QRS voltage-duration product. J Am Coll Cardiol 1992;20:1180-1186. Okin PM, Roman MJ, Devereux RB, Kligfield P. Electrocardiographic identification of increased left ventricular mass by simple voltage-duration products. J Am Coll Cardiol 1995;25:417-423. Tabulated in Hancock et al., Circulation 2009;119:e251-e261, Table 1.",
    notComputable: "Nothing — this is one of the few fully computable composite criteria, provided the program has a reliable global QRS onset/offset. Its accuracy claim, however, is conditioned on populations (hypertensives aged 55-80 in LIFE) that a general dataset does not match.",
    disagreement: "MATERIAL DISAGREEMENT ON THE FEMALE OFFSET. Three numbers are in active use: no offset (Molloy 1992, threshold 2436 mm·ms), +8 mm (original LIFE entry criterion, threshold 2440 mm·ms, and the definition used by Pewsner's BMJ 2007 systematic review), and +6 mm (amended LIFE protocol and the majority of subsequent LIFE publications, threshold 2440 mm·ms). An 8-vs-6 mm difference at a typical 100 ms QRS shifts the product by 200 mm·ms — roughly 8% of the threshold — so a teaching tool must not state one as the number. Also note the threshold itself differs: 2436 vs 2440 mm·ms. Molloy 1992 reported 51% sensitivity for the Cornell product versus 36% for Cornell voltage at a matched 95% specificity against autopsy LV mass (n=220, 95 with LVH); Okin 1995 reported 37% vs 28% at a matched 96% specificity — the same direction of improvement, very different absolute numbers.",
    rows: [
    {
      quantity: "(RaVL + SV3) x QRS duration — original Molloy 1992 partition, no sex offset stated",
      leads: "aVL and V3 for voltage; global QRS duration",
      printed: "> 2436 mm·ms",
      qualifier: "AHA Part V Table 1 prints the unit as 'mm/sec', which is a typographical error; the quantity is millimetres x milliseconds",
      marks: ["aVL", "V3"],
      check: { expr: CORNELL_PROD, relation: ">", value: 243.6, unit: "mV·ms" },
    },
    {
      quantity: "(RaVL + SV3 + 8 mm in women) x QRS duration — original LIFE entry definition",
      leads: "aVL and V3; global QRS duration",
      printed: "> 2440 mm·ms",
      qualifier: "WOMEN receive +8 mm added to the voltage sum; men receive no offset",
      marks: ["aVL", "V3"],
      check: { expr: CORNELL_PROD_F8, relation: ">", value: 244.0, unit: "mV·ms", appliesTo: { sex: "F" } },
    },
    {
      quantity: "(RaVL + SV3 + 6 mm in women) x QRS duration — amended LIFE definition",
      leads: "aVL and V3; global QRS duration",
      printed: "> 2440 mm·ms",
      qualifier: "WOMEN receive +6 mm. The LIFE protocol was amended mid-trial: the sex adjustment was reduced from 8 mm to 6 mm and Sokolow-Lyon > 38 mm was added as an alternative entry route.",
      marks: ["aVL", "V3"],
      check: { expr: CORNELL_PROD_F6, relation: ">", value: 244.0, unit: "mV·ms", appliesTo: { sex: "F" } },
    },
    {
      quantity: "QRS duration used as the multiplier",
      leads: "Global (12-lead) QRS duration, not a single-lead value",
      printed: "Measured in ms from earliest QRS onset to latest QRS offset across leads",
      qualifier: "Using a single-lead QRS duration instead of the global one systematically shortens the product and will move cases below threshold",
      marks: ["aVL", "V3"],
      notEvaluable: "noThresholdPublished",
    },
    ],
  },
];

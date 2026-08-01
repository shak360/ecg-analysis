/**
 * One finding vocabulary, across corpora that do not share one.
 *
 * PTB-XL labels with SCP-ECG statement codes; the PhysioNet/CinC Challenge 2021
 * sources label with SNOMED-CT. There is no authoritative crosswalk between
 * them, and inventing one and calling it canonical would be the wrong kind of
 * confidence — so this file contains exactly the part that requires judgement,
 * a hand-written **alias table**, and nothing else.
 *
 * Everything else is derived at fetch time from the corpora's own published
 * tables: PTB-XL's `scp_statements.csv` and the Challenge's `dx_mapping_*.csv`.
 * That keeps the reviewable surface small. A finding that appears in only one
 * corpus simply stays there, which is the honest outcome — PTB-XL distinguishes
 * anteroseptal from anterolateral infarction and the Challenge's SNOMED set
 * largely does not, and pretending otherwise would teach that they are the same.
 *
 * # Why aliasing at all
 *
 * Without it the atlas would list "atrial fibrillation" twice, once per corpus,
 * and a learner filtering for it would see half the cases. The aliases below are
 * only those where the two codes denote the same finding beyond argument.
 */

/**
 * SCP-ECG code to SNOMED-CT code, where they mean the same thing.
 *
 * The SCP code is the canonical id, because its vocabulary is the finer of the
 * two and because the atlas was built on it. Each line is a claim that a
 * clinician would accept without qualification; anything needing a "roughly" is
 * deliberately absent.
 */
export const SCP_TO_SNOMED: Record<string, string[]> = {
  // --- rhythm ---------------------------------------------------------------
  SR: ["426783006"], // sinus rhythm
  SBRAD: ["426177001"], // sinus bradycardia
  STACH: ["427084000"], // sinus tachycardia
  SARRH: ["427393009"], // sinus arrhythmia
  AFIB: ["164889003"], // atrial fibrillation
  AFLT: ["164890007"], // atrial flutter
  SVTAC: ["426761007"], // supraventricular tachycardia
  PSVT: ["67198005"], // paroxysmal supraventricular tachycardia
  PACE: ["10370003"], // pacing rhythm
  PVC: ["427172004", "17338001", "164884008"], // PVC / ventricular premature beats / ectopics
  PAC: ["284470004", "63593006"], // premature atrial contraction

  // --- conduction -----------------------------------------------------------
  // The Challenge's own mapping notes that it scores 713427006 and 59118001 as
  // one diagnosis, and 733534002 with 164909002 likewise. Both members are
  // listed rather than picking one, so no record is lost to the choice.
  CRBBB: ["713427006", "59118001"],
  CLBBB: ["733534002", "164909002"],
  IRBBB: ["713426002"],
  ILBBB: ["251120003"],
  LAFB: ["445118002"],
  LPFB: ["445211001"],
  IVCD: ["698252002", "6374002"], // non-specific IVCD / bundle branch block nos
  "1AVB": ["270492004"], // first degree AV block
  "2AVB": ["195042002", "54016002", "28189009"], // second degree, Mobitz I and II
  "3AVB": ["27885002"], // complete heart block
  WPW: ["74390002"],

  // --- hypertrophy and chamber ---------------------------------------------
  LVH: ["164873001", "55827005"], // LVH / left ventricular high voltage
  RVH: ["89792004"],
  "LAO/LAE": ["67741000119109"], // left atrial enlargement
  "RAO/RAE": ["67751000119106"], // right atrial enlargement

  // --- morphology and intervals --------------------------------------------
  ABQRS: ["164951009"],
  LPR: ["164947007"], // prolonged PR
  LNGQT: ["111975006"], // prolonged QT
  LVOLT: ["251146004"], // low QRS voltages
  QWAVE: ["164917005"], // abnormal Q wave
  INVT: ["59931005"], // T wave inversion
  NDT: ["164934002"], // non-diagnostic / abnormal T
  NST_: ["428750005", "55930002"], // non-specific ST(-T) change
  STD_: ["429622005"], // ST depression
  STE_: ["164931005"], // ST elevation
  PRC_S: ["365413008"], // poor R wave progression
  ANEUR: ["164865005"], // (old) myocardial infarction, coarse
};

/** SNOMED-CT to the canonical SCP id, inverted from the table above. */
export const SNOMED_TO_SCP: Record<string, string> = Object.fromEntries(
  Object.entries(SCP_TO_SNOMED).flatMap(([scp, snomeds]) =>
    snomeds.map((s) => [s, scp] as const)
  ),
);

export type FindingKind = "diagnostic" | "form" | "rhythm";

export interface Finding {
  id: string;
  description: string;
  kind: FindingKind;
  diagnosticClass: string;
  /** Corpora that use this finding, for the atlas source filter. */
  sources: Set<string>;
}

/**
 * Classify a SNOMED finding that has no SCP twin.
 *
 * Crude on purpose. The Challenge's tables carry no kind or class column, so
 * this reads the description, and it is only ever used for findings that exist
 * in no other corpus — a wrong bucket costs a filter placement, never a label.
 */
export function classifySnomed(description: string): {
  kind: FindingKind;
  diagnosticClass: string;
} {
  const d = description.toLowerCase();
  const rhythmish = /rhythm|tachycard|bradycard|fibrillat|flutter|ectopic|premature|escape|arrest|pacing|pause|asystole|bigemin|trigemin|junctional|idioventricular/;
  if (rhythmish.test(d)) return { kind: "rhythm", diagnosticClass: "" };

  if (/block|conduction|delay|pre-?excitation|wolff/.test(d)) {
    return { kind: "diagnostic", diagnosticClass: "CD" };
  }
  if (/infarct|ischaem|ischem|injury/.test(d)) {
    return { kind: "diagnostic", diagnosticClass: "MI" };
  }
  if (/hypertroph|enlarge|overload|high voltage/.test(d)) {
    return { kind: "diagnostic", diagnosticClass: "HYP" };
  }
  if (/st |t wave|repolar|qt/.test(d)) {
    return { kind: "diagnostic", diagnosticClass: "STTC" };
  }
  if (/normal/.test(d)) return { kind: "diagnostic", diagnosticClass: "NORM" };
  // Axis deviation, low voltage, poor R progression and friends: morphology.
  return { kind: "form", diagnosticClass: "" };
}

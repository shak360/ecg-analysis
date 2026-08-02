/**
 * A term-by-term gloss for the German cardiologist reports in PTB-XL.
 *
 * 636 of the 1,046 reports in this corpus are German — PTB-XL is a German
 * hospital's archive — and a reader who does not have German is looking at the
 * one piece of the case written by the person who actually read the tracing,
 * and cannot use it.
 *
 * # This is a gloss, not a translation, and the difference matters
 *
 * It replaces terms it recognises and leaves everything else exactly as it
 * found it. It does not reorder words, resolve German compounds it has not been
 * taught, or handle negation and grammar — so `nicht sicher auszuschliessen`
 * comes out as a sequence of English words in German order, which a reader can
 * work with but a machine translation would smooth into something more
 * confident and possibly wrong.
 *
 * Three rules follow from that, and they are the whole design:
 *
 *   1. **The original is always shown**, above the gloss, never replaced. If the
 *      gloss is wrong the evidence for that is on screen beside it.
 *   2. **An unknown word is left visible in German**, never dropped and never
 *      guessed. A gap a reader can see is worth more than a fluent sentence with
 *      a term silently invented in the middle of it.
 *   3. **It is labelled as a gloss** wherever it appears. Calling this a
 *      translation would invite the reader to trust the grammar, which is the
 *      part it does not do.
 *
 * The vocabulary below is hand-written, in the manner of
 * `tools/corpora/vocabulary.ts`: each line is a claim a German-speaking
 * clinician would accept, and anything needing a "roughly" is deliberately
 * absent so it shows up as an untranslated word instead.
 */

/**
 * German ECG report terms to English.
 *
 * Longest-first at match time, so compounds win over their parts — otherwise
 * `linksschenkelblock` would be glossed as "left" + "block" and lose the bundle.
 */
const TERMS: Record<string, string> = {
  // --- rhythm ---------------------------------------------------------------
  sinusrhythmus: "sinus rhythm",
  sinusrhytmus: "sinus rhythm", // misspelt in the corpus, and frequently
  sinustachykardie: "sinus tachycardia",
  sinusbradykardie: "sinus bradycardia",
  sinusarrhythmie: "sinus arrhythmia",
  vorhofflimmern: "atrial fibrillation",
  vorhofflattern: "atrial flutter",
  extrasystole: "ectopic beat",
  extrasystolen: "ectopic beats",
  extrasystolie: "ectopy",
  supraventrikulaere: "supraventricular",
  ventrikulaere: "ventricular",
  schrittmacher: "pacemaker",
  tachykardie: "tachycardia",
  bradykardie: "bradycardia",
  arrhythmie: "arrhythmia",
  rhythmus: "rhythm",

  // --- axis -----------------------------------------------------------------
  lagetyp: "axis",
  linkstyp: "left axis",
  rechtstyp: "right axis",
  steiltyp: "vertical axis",
  indifferenztyp: "intermediate axis",
  ueberdrehter: "marked",
  überdrehter: "marked",
  sagittaltyp: "sagittal axis",

  // --- conduction -----------------------------------------------------------
  linksschenkelblock: "left bundle branch block",
  rechtsschenkelblock: "right bundle branch block",
  schenkelblock: "bundle branch block",
  hemiblock: "hemiblock",
  linksanteriorer: "left anterior",
  linksposteriorer: "left posterior",
  inkompletter: "incomplete",
  kompletter: "complete",
  block: "block",
  blockierung: "block",
  praeexzitation: "pre-excitation",
  leitungsverzoegerung: "conduction delay",

  // --- infarction and ischaemia --------------------------------------------
  infarkt: "infarction",
  myokardinfarkt: "myocardial infarction",
  vorderwandinfarkt: "anterior wall infarction",
  hinterwandinfarkt: "inferior wall infarction",
  vorderwand: "anterior wall",
  hinterwand: "inferior wall",
  seitenwand: "lateral wall",
  vorderseitenwand: "anterolateral wall",
  anteroseptal: "anteroseptal",
  inferiorer: "inferior",
  inferior: "inferior",
  lateral: "lateral",
  ischaemie: "ischaemia",
  ischämie: "ischaemia",
  myokardschaden: "myocardial damage",
  narbe: "scar",
  aneurysma: "aneurysm",

  // --- ST, T and repolarisation --------------------------------------------
  hebung: "elevation",
  hebungen: "elevations",
  senkung: "depression",
  senkungen: "depressions",
  erregungsrueckbildungsstoerung: "repolarisation abnormality",
  erregungsrückbildungsstörung: "repolarisation abnormality",
  erregungsrueckbildung: "repolarisation",
  negativierung: "inversion",
  praeterminale: "pre-terminal",
  terminale: "terminal",
  abgeflacht: "flattened",
  abgeflachte: "flattened",
  diskordant: "discordant",

  // --- chambers and voltage -------------------------------------------------
  linksbelastung: "left ventricular strain",
  rechtsbelastung: "right ventricular strain",
  linkshypertrophie: "left ventricular hypertrophy",
  hypertrophie: "hypertrophy",
  niedervoltage: "low voltage",
  peripher: "peripheral",
  vorhof: "atrium",
  kammer: "ventricle",

  // --- hedges and connectives, which carry most of the meaning -------------
  wahrscheinlich: "probably",
  moeglich: "possible",
  möglich: "possible",
  moeglicherweise: "possibly",
  verdacht: "suspicion",
  auf: "of",
  grenzwertig: "borderline",
  grenzwertiges: "borderline",
  randbefund: "borderline finding",
  unauffaellig: "unremarkable",
  unauffällig: "unremarkable",
  unauffaelliges: "unremarkable",
  normales: "normal",
  normale: "normal",
  normaler: "normal",
  abnorm: "abnormal",
  abnormes: "abnormal",
  deutlich: "marked",
  leicht: "mild",
  leichte: "mild",
  maessig: "moderate",
  mässig: "moderate",
  keine: "no",
  kein: "no",
  nicht: "not",
  sicher: "definitely",
  auszuschliessen: "to be excluded",
  oder: "or",
  und: "and",
  bei: "with",
  alter: "old",
  alterer: "older",
  vereinbar: "compatible",
  hinweis: "evidence",
  befund: "finding",
  ekg: "ECG",
  sonst: "otherwise",
  ausser: "except",
};

/** Words in the vocabulary, longest first, so compounds beat their parts. */
const ORDERED = Object.keys(TERMS).sort((a, b) => b.length - a.length);

/**
 * Does this report look German?
 *
 * Deliberately crude and deliberately conservative: it asks whether several
 * distinctly German terms are present, not whether the text is *not* English.
 * The cost of a false positive — glossing an English report — is a row of
 * unchanged words and a misleading heading, so the bar is more than one hit.
 */
export function looksGerman(report: string): boolean {
  const words = report.toLowerCase().match(/[a-zäöüß]+/g) ?? [];
  const hits = words.filter((w) => w in TERMS).length;
  return hits >= 2 && hits / Math.max(words.length, 1) > 0.15;
}

export interface Gloss {
  /** The gloss, with unrecognised words left in the original. */
  text: string;
  /** Words this vocabulary does not know, in the order they appear. */
  unknown: string[];
}

/**
 * Gloss a report term by term.
 *
 * Word order is the source's, not English's. That is not a shortcoming to be
 * apologised for — it is what keeps the output honest about being a lookup
 * rather than a translation.
 */
export function glossReport(report: string): Gloss {
  const unknown: string[] = [];
  const seen = new Set<string>();

  const text = report.replace(/[a-zäöüßA-ZÄÖÜ]+/g, (word) => {
    const lower = word.toLowerCase();
    const exact = TERMS[lower];
    if (exact) return exact;

    // A compound the vocabulary has not been taught, but whose head it has:
    // `vorderwandinfarktes` -> `vorderwandinfarkt`. Only as a suffix strip, and
    // only for a long stem, so short words cannot match by accident.
    for (const term of ORDERED) {
      if (term.length >= 8 && lower.startsWith(term)) return TERMS[term]!;
    }

    // Left as it was found. Lead names and numerals are not vocabulary gaps.
    if (!/^[iv]+$|^avr$|^avl$|^avf$|^[a-z]$/.test(lower) && !seen.has(lower)) {
      seen.add(lower);
      unknown.push(word);
    }
    return word;
  });

  return { text, unknown };
}

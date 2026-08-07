/**
 * Translating the cardiologist's report into English.
 *
 * 687 of the 1,207 reports in this corpus are not in English — PTB-XL is a
 * German hospital's archive, and 60 of its reports turn out to be Swedish — and
 * a reader without those languages is looking at the one piece of the case
 * written by the person who actually read the tracing, and cannot use it.
 *
 * # This was a word-by-word gloss, and word-by-word was not good enough
 *
 * The first version replaced one word at a time and left the word order alone,
 * on the argument that a gloss cannot invent grammar and so cannot mislead. The
 * argument was sound and the output was still hard to read: `sinusrhythmus
 * lagetyp normal` came out as "sinus rhythm axis normal", which a reader has to
 * decode rather than read.
 *
 * These reports are not free prose. They are built from a small stock of set
 * phrases — `lagetyp normal` appears 233 times, `ischämie oder linksbelastung`
 * 101 — so translating whole phrases gets real English without a translator
 * that could invent anything. A phrase either matches the table or it does not.
 *
 * Three rules carry over from the gloss, and they are still the whole design:
 *
 *   1. **The original is always shown**, above the translation, never replaced.
 *      If the translation is wrong the evidence is on screen beside it.
 *   2. **Unrecognised text is left in its own language**, never dropped and
 *      never guessed. A gap a reader can see is worth more than a fluent
 *      sentence with a term silently invented in the middle of it.
 *   3. **It is labelled**, with the language it came from, so nobody mistakes a
 *      phrase table for a translator that understood the sentence.
 */

/** Which language a report is in, so it is not translated with the wrong table. */
export type Language = "de" | "sv" | "en" | "unknown";

/**
 * German phrases, longest first at match time.
 *
 * Multi-word entries exist so word order comes out English: `lagetyp normal` is
 * "normal axis", not "axis normal". Anything needing a "roughly" is deliberately
 * absent, so it surfaces as untranslated text instead.
 */
const DE: Record<string, string> = {
  // --- whole clauses, which is where the word order actually matters --------
  "nicht sicher auszuschliessen": "cannot be confidently excluded",
  "nicht sicher auszuschließen": "cannot be confidently excluded",
  "unspezifisches abnormales t": "non-specific abnormal T waves",
  "unspezifisches abnormes t": "non-specific abnormal T waves",
  "intraventrikuläre leitungsstörung": "intraventricular conduction delay",
  "intraventr leitungsstörung": "intraventricular conduction delay",
  "unvollständiger rechtsschenkelblock": "incomplete right bundle branch block",
  "unvollständiger linksschenkelblock": "incomplete left bundle branch block",
  "kompletter rechtsschenkelblock": "complete right bundle branch block",
  "kompletter linksschenkelblock": "complete left bundle branch block",
  "ischämie oder linksbelastung": "ischaemia or left ventricular strain",
  "ischaemie oder linksbelastung": "ischaemia or left ventricular strain",
  "periphere niederspannung": "low voltage in the limb leads",
  "linksanteriorer hemiblock": "left anterior hemiblock",
  "linksposteriorer hemiblock": "left posterior hemiblock",
  "überdrehter linkstyp": "marked left axis deviation",
  "ueberdrehter linkstyp": "marked left axis deviation",
  "überdrehter rechtstyp": "marked right axis deviation",
  "ueberdrehter rechtstyp": "marked right axis deviation",
  "sonst normales ekg": "otherwise a normal ECG",
  "unbestätigter bericht": "unconfirmed report",
  "unbest bericht": "unconfirmed report",
  "lagetyp normal": "normal axis",
  "normales ekg": "a normal ECG",
  "sinus arrhythmie": "sinus arrhythmia",
  "verdacht auf": "suspected",
  "p-sinistrocardiale": "left atrial enlargement",
  "p-dextrocardiale": "right atrial enlargement",
  "a-v block": "AV block",
  "in den ableitungen": "in leads",

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
  supraventrikuläre: "supraventricular",
  supraventrikulaere: "supraventricular",
  ventrikuläre: "ventricular",
  ventrikulaere: "ventricular",
  schrittmacher: "pacemaker",
  tachykardes: "rapid",
  tachykardie: "tachycardia",
  bradykardie: "bradycardia",
  arrhythmie: "arrhythmia",
  rhythmus: "rhythm",
  vorhof: "atrium",

  // --- axis -----------------------------------------------------------------
  lagetyp: "axis",
  linkstyp: "left axis",
  rechtstyp: "right axis",
  steiltyp: "vertical axis",
  indifferenztyp: "intermediate axis",
  sagittaltyp: "sagittal axis",
  überdrehter: "marked",
  ueberdrehter: "marked",

  // --- conduction -----------------------------------------------------------
  linksschenkelblock: "left bundle branch block",
  rechtsschenkelblock: "right bundle branch block",
  schenkelblock: "bundle branch block",
  hemiblock: "hemiblock",
  linksanteriorer: "left anterior",
  linksposteriorer: "left posterior",
  unvollständiger: "incomplete",
  unvollstaendiger: "incomplete",
  inkompletter: "incomplete",
  kompletter: "complete",
  leitungsstörung: "conduction delay",
  leitungsverzögerung: "conduction delay",
  leitungsverzoegerung: "conduction delay",
  präexzitation: "pre-excitation",
  praeexzitation: "pre-excitation",
  blockierung: "block",
  block: "block",

  // --- infarction and ischaemia --------------------------------------------
  myokardinfarkt: "myocardial infarction",
  vorderwandinfarkt: "anterior wall infarction",
  hinterwandinfarkt: "inferior wall infarction",
  vorderseitenwand: "anterolateral wall",
  vorderwand: "anterior wall",
  hinterwand: "inferior wall",
  seitenwand: "lateral wall",
  anteroseptaler: "anteroseptal",
  anteroseptal: "anteroseptal",
  inferiorer: "inferior",
  inferior: "inferior",
  lateral: "lateral",
  ischämie: "ischaemia",
  ischaemie: "ischaemia",
  myokardschaden: "myocardial damage",
  myokardaffektion: "myocardial involvement",
  infarkt: "infarction",
  narbe: "scar",
  aneurysma: "aneurysm",

  // --- ST, T and repolarisation --------------------------------------------
  erregungsrückbildungsstörung: "repolarisation abnormality",
  erregungsrueckbildungsstoerung: "repolarisation abnormality",
  erregungsrückbildung: "repolarisation",
  erregungsrueckbildung: "repolarisation",
  negativierung: "inversion",
  präterminale: "pre-terminal",
  praeterminale: "pre-terminal",
  terminale: "terminal",
  abgeflachte: "flattened",
  abgeflacht: "flattened",
  diskordant: "discordant",
  hebungen: "elevations",
  hebung: "elevation",
  senkungen: "depressions",
  senkung: "depression",

  // --- chambers and voltage -------------------------------------------------
  linkshypertrophie: "left ventricular hypertrophy",
  rechtshypertrophie: "right ventricular hypertrophy",
  linksbelastung: "left ventricular strain",
  rechtsbelastung: "right ventricular strain",
  hypertrophie: "hypertrophy",
  niederspannung: "low voltage",
  niedervoltage: "low voltage",
  peripher: "peripheral",
  periphere: "peripheral",
  ableitungen: "leads",
  kammer: "ventricle",

  // --- hedges and connectives, which carry most of the meaning -------------
  wahrscheinlich: "probably",
  möglicherweise: "possibly",
  moeglicherweise: "possibly",
  möglich: "possible",
  moeglich: "possible",
  verdacht: "suspicion",
  grenzwertiges: "borderline",
  grenzwertig: "borderline",
  randbefund: "borderline finding",
  unauffälliges: "unremarkable",
  unauffaelliges: "unremarkable",
  unauffällig: "unremarkable",
  unauffaellig: "unremarkable",
  unbestätigter: "unconfirmed",
  pathologisch: "pathological",
  bericht: "report",
  normales: "normal",
  normale: "normal",
  normaler: "normal",
  abnormes: "abnormal",
  abnorm: "abnormal",
  deutlich: "marked",
  leichte: "mild",
  leicht: "mild",
  mässig: "moderate",
  maessig: "moderate",
  erneut: "again",
  keine: "no",
  kein: "no",
  nicht: "not",
  sicher: "definitely",
  auszuschliessen: "to be excluded",
  auszuschließen: "to be excluded",
  oder: "or",
  und: "and",
  bei: "with",
  alter: "age",
  alt: "old",
  vereinbar: "compatible",
  hinweis: "evidence",
  befund: "finding",
  ekg: "ECG",
  sonst: "otherwise",
  ausser: "except",
  auf: "of",
  in: "in",
};

/**
 * Swedish phrases.
 *
 * A smaller table for a smaller slice — 60 records — but a separate one,
 * because glossing Swedish with a German vocabulary is how `sinusrytm` came
 * out untouched under a heading that said German.
 */
const SV: Record<string, string> = {
  "låga qrs amplituder": "low QRS amplitudes",
  "extremitetsavledningarna": "the limb leads",
  "vänster kammarhypertrofi": "left ventricular hypertrophy",
  "höger kammarhypertrofi": "right ventricular hypertrophy",
  "vänster förmaksbelastning": "left atrial enlargement",
  "vänster främre hemiblock": "left anterior hemiblock",
  "oförändrat jmf med": "unchanged compared with",
  "ospecifikt skänkelblock": "non-specific bundle branch block",
  "förmaksflimmer": "atrial fibrillation",
  "förmaksfladder": "atrial flutter",
  "sinustachykardi": "sinus tachycardia",
  "sinusbradykardi": "sinus bradycardia",
  "myokardaffektion": "myocardial involvement",
  "ischemiförändring": "ischaemic change",
  "t-förändring": "T-wave change",
  "st-t sänkning": "ST-T depression",
  "st-sänkning": "ST depression",
  "st-höjning": "ST elevation",
  "anterolateral": "anterolateral",
  "skänkelblock": "bundle branch block",
  "avvikande": "abnormal",
  "normalt ekg": "a normal ECG",
  "sinusrytm": "sinus rhythm",
  "ospecifikt": "non-specific",
  "el-axel": "electrical axis",
  "såsom vid": "as seen in",
  "sasom vid": "as seen in",
  "kammar": "ventricular",
  "förmaks": "atrial",
  "vänster": "left",
  "höger": "right",
  "främre": "anterior",
  "inferior": "inferior",
  "infarkt": "infarction",
  "ischemi": "ischaemia",
  "förlopp": "course",
  "ålder": "age",
  "extrem": "extreme",
  "måttlig": "moderate",
  "som": "which",
  "vid": "with",
  "eller": "or",
  "och": "and",
  "ekg": "ECG",
};

const TABLES: Record<"de" | "sv", Record<string, string>> = { de: DE, sv: SV };

/** Phrases longest first, so a compound beats its parts. */
const ORDERED: Record<"de" | "sv", string[]> = {
  de: Object.keys(DE).sort((a, b) => b.length - a.length),
  sv: Object.keys(SV).sort((a, b) => b.length - a.length),
};

/** Words that mark a report as Swedish rather than German. */
const SV_MARKERS =
  /\b(sinusrytm|vänster|höger|förmaks\w*|kammar\w*|avvikande|ospecifikt|såsom|avledningarna|oförändrat|skänkelblock|ekg-bild)\b/i;

/**
 * Words that mark a report as German.
 *
 * Deliberately wide, and it had to be. A first version listed only the obvious
 * clinical nouns and missed `infarkt nicht sicher auszuschliessen` entirely —
 * a German sentence with no German *noun* in it, left untranslated because the
 * marker list was thinking about vocabulary instead of language. The function
 * words are what actually identify German here, so they are in the list.
 */
const DE_MARKERS = new RegExp(
  "\\b(" + [
    // clinical nouns
    "sinusrhythmus", "sinusrhytmus", "lagetyp", "linkstyp", "rechtstyp", "steiltyp",
    "normales", "normale", "normaler", "unauff\\w*", "vorhof\\w*", "schenkelblock",
    "erregungsr\\w*", "niederspannung", "verdacht", "befund", "abnorm\\w*",
    "myokard\\w*", "isch[äa]mie", "hebung\\w*", "senkung\\w*", "ableitungen",
    "hypertrophie", "belastung", "extrasystol\\w*", "tachykardie", "bradykardie",
    "unvollst\\w*", "kompletter", "inkompletter", "hemiblock", "leitungs\\w*",
    "niedervoltage", "bericht", "unbest\\w*", "pathologisch", "schrittmacher",
    // function words, which is what a sentence with no German noun still has
    "nicht", "sicher", "auszuschlie[sß]\\w*", "sonst", "keine", "kein",
    "wahrscheinlich", "m[öo]glich\\w*", "[uü]eberdrehter", "[üu]berdrehter",
    "deutlich", "leichte", "m[äa][sß]sig", "vereinbar", "hinweis", "erneut",
    "und", "oder", "bei", "ausser",
  ].join("|") + ")\\b",
  "i",
);

/**
 * Which language a report is written in.
 *
 * Swedish is tested first because the two share enough shape — `ekg`,
 * `infarkt`, `ischemi` — that a German test written to be generous will claim a
 * Swedish report. That is not hypothetical: it happened to five of them, which
 * were then shown under a German heading with almost nothing translated.
 */
export function detectLanguage(report: string): Language {
  const text = (report ?? "").toLowerCase();
  if (!text.trim()) return "unknown";
  if (SV_MARKERS.test(text)) return "sv";
  if (DE_MARKERS.test(text)) return "de";

  // Ask the tables themselves, when no marker fired.
  //
  // Marker lists and phrase tables are two descriptions of the same language,
  // and keeping them independent is how `rechtsschenkelblock` — a word the
  // German table translates perfectly — went undetected: the marker
  // `schenkelblock` cannot match inside a compound. Coverage cannot drift from
  // the table because it *is* the table.
  const de = coverage(text, "de");
  const sv = coverage(text, "sv");
  if (Math.max(de, sv) >= 0.5) return de >= sv ? "de" : "sv";

  // Distinctly English wording, so an English report is never "translated".
  if (/\b(are|the|is|were|with|due to|otherwise|normal ecg|sinus rhythm)\b/.test(text)) {
    return "en";
  }
  return "unknown";
}

/** What fraction of a report's words one table can translate. */
function coverage(lower: string, lang: "de" | "sv"): number {
  const words = lower.match(/[a-zäöüåéß-]+/g) ?? [];
  if (!words.length) return 0;
  let hit = 0;
  for (const w of words) {
    if (TABLES[lang][w] !== undefined) hit++;
    else if (ORDERED[lang].some((p) => p.includes(" ") && p.split(" ").includes(w))) hit++;
  }
  return hit / words.length;
}

/** Kept for callers that only ask the old question. */
export function looksGerman(report: string): boolean {
  return detectLanguage(report) === "de";
}

export interface Translation {
  /** English for every phrase the table knows; the rest as it was found. */
  text: string;
  /** What it was translated from. */
  language: Language;
  /** Words no table knew, in the order they appear. */
  unknown: string[];
}

/**
 * Translate a report, phrase by phrase.
 *
 * Longest match wins, so `lagetyp normal` becomes "normal axis" rather than
 * "axis" followed by "normal". Matching runs over the lower-cased text but
 * splices into the original, so anything unrecognised keeps the spelling and
 * the casing the cardiologist typed.
 */
export function translateReport(report: string): Translation {
  const language = detectLanguage(report);
  if (language !== "de" && language !== "sv") {
    return { text: report, language, unknown: [] };
  }

  const table = TABLES[language];
  const phrases = ORDERED[language];
  const lower = report.toLowerCase();

  // One pass, left to right, taking the longest phrase that starts here.
  const out: string[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  let i = 0;

  const isWordChar = (c: string | undefined) => c !== undefined && /[a-zäöüåéß-]/.test(c);

  while (i < report.length) {
    if (!isWordChar(lower[i])) {
      out.push(report[i]!);
      i++;
      continue;
    }

    let hit: string | null = null;
    for (const p of phrases) {
      if (!lower.startsWith(p, i)) continue;
      // Whole words only, so `alt` cannot match inside `alternans`.
      if (isWordChar(lower[i + p.length])) continue;
      hit = p;
      break;
    }

    if (hit) {
      out.push(table[hit]!);
      i += hit.length;
      continue;
    }

    // Left exactly as it was found, and named once as a gap.
    let j = i;
    while (isWordChar(lower[j])) j++;
    const word = report.slice(i, j);
    const key = word.toLowerCase();
    // Lead names, numerals and single letters are not vocabulary gaps.
    if (!/^[iv]+$|^avr$|^avl$|^avf$|^[a-z]$|^\d+$/.test(key) && !seen.has(key)) {
      seen.add(key);
      unknown.push(word);
    }
    out.push(word);
    i = j;
  }

  // Collapse the whitespace the source is careless with, so the result reads as
  // a sentence rather than a column of fragments.
  const text = out.join("").replace(/\s+/g, " ").trim();
  return { text, language, unknown };
}

/** The previous name, so existing callers keep working. */
export function glossReport(report: string): { text: string; unknown: string[] } {
  const { text, unknown } = translateReport(report);
  return { text, unknown };
}

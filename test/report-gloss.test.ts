/**
 * Translating the cardiologist's report.
 *
 * This was a word-by-word gloss and is now a phrase translation, so the tests
 * changed with it: they used to assert that word order stayed German, which was
 * the old design's honest failure mode. Now they assert the opposite — that a
 * known clause comes out as English — while keeping the rules that did not
 * change: nothing is invented, unrecognised text is left alone and named, and
 * an English report is never "translated".
 */
import { expect, test } from "vitest";

import { detectLanguage, translateReport } from "../web/src/ui/report-gloss.ts";

test("a whole clause comes out as English, not as German words in German order", () => {
  // The reason this stopped being a gloss. Word by word this was "sinus rhythm
  // axis normal otherwise normal ECG", which a reader decodes rather than reads.
  expect(translateReport("sinusrhythmus lagetyp normal sonst normales ekg").text)
    .toBe("sinus rhythm normal axis otherwise a normal ECG");
});

test("negation is resolved, which a word-by-word gloss could not do", () => {
  // "not definitely to be excluded" is what the gloss produced, and it reads as
  // the opposite of what it means to a reader skimming.
  expect(translateReport("infarkt nicht sicher auszuschliessen").text)
    .toBe("infarction cannot be confidently excluded");
});

test("longer phrases beat their parts", () => {
  const t = (s: string) => translateReport(s).text;
  expect(t("ueberdrehter linkstyp")).toBe("marked left axis deviation");
  expect(t("linkstyp")).toBe("left axis");
  expect(t("unvollständiger rechtsschenkelblock")).toBe("incomplete right bundle branch block");
  expect(t("rechtsschenkelblock")).toBe("right bundle branch block");
  expect(t("periphere niederspannung")).toBe("low voltage in the limb leads");
});

test("a whole word is required, so a short entry cannot match inside a longer one", () => {
  // `alt` is "old" and must not fire inside `alternans`.
  const { text, unknown } = translateReport("sinusrhythmus alternans");
  expect(text).toContain("alternans");
  expect(text).not.toContain("oldernans");
  expect(unknown).toContain("alternans");
});

test("an unknown word is left as written and named, never guessed", () => {
  const { text, unknown } = translateReport("sinusrhythmus mit schlingernder Zwischenwelle");
  expect(text).toContain("sinus rhythm");
  expect(text).toContain("schlingernder");
  expect(text).toContain("Zwischenwelle"); // casing preserved as the author typed it
  expect(unknown).toContain("schlingernder");
});

test("lead names and numerals are not reported as vocabulary gaps", () => {
  const { unknown } = translateReport("ST senkung in II III aVF");
  expect(unknown).not.toContain("II");
  expect(unknown).not.toContain("aVF");
});

// --- language ---------------------------------------------------------------

test("an English report is recognised and left alone", () => {
  for (const s of [
    "sinus rhythm. otherwise normal ecg.",
    "ST segments are depressed due to ischaemia",
  ]) {
    expect(detectLanguage(s)).toBe("en");
    expect(translateReport(s).text).toBe(s);
  }
});

test("German is recognised even with no German noun in the sentence", () => {
  // The case a narrower detector missed: a German sentence carried entirely by
  // its function words, left untranslated because the marker list was thinking
  // about vocabulary instead of language.
  expect(detectLanguage("infarkt nicht sicher auszuschliessen")).toBe("de");
  expect(detectLanguage("sinusrhythmus linkstyp normales ekg")).toBe("de");
});

test("Swedish is recognised as Swedish, not glossed as German", () => {
  // 62 of these reports are Swedish. The German table left them essentially
  // untouched under a heading that said German, which is worse than leaving
  // them alone — it claims a translation happened.
  expect(detectLanguage("sinusrytm vänster kammarhypertrofi")).toBe("sv");
  expect(translateReport("sinusrytm vänster kammarhypertrofi").text)
    .toBe("sinus rhythm left ventricular hypertrophy");
  expect(detectLanguage("förmaksflimmer höger el-axel")).toBe("sv");
});

test("the two tables do not translate each other's text", () => {
  // Swedish is tested first on purpose: the languages share enough shape — ekg,
  // infarkt, ischemi — that a generous German test claims Swedish reports.
  const sv = translateReport("sinusrytm ospecifikt skänkelblock");
  expect(sv.language).toBe("sv");
  expect(sv.text).toBe("sinus rhythm non-specific bundle branch block");
});

test("an empty or unreadable report is left alone rather than mangled", () => {
  expect(translateReport("").text).toBe("");
  expect(detectLanguage("")).toBe("unknown");
  expect(detectLanguage("   ")).toBe("unknown");
});

/**
 * The German gloss, and the limits it must keep advertising.
 *
 * Most of these assert restraint. The risk is not that a gloss is unhelpful —
 * it is that it reads as a translation, and a reader then trusts grammar and
 * negation this does no work on at all. A confident wrong reading of a
 * cardiologist's own words is worse than German on the screen.
 */
import { expect, test } from "vitest";
import { glossReport, looksGerman } from "../web/src/ui/report-gloss.ts";

test("a real PTB-XL report becomes readable", () => {
  const { text } = glossReport("sinusrhythmus ueberdrehter linkstyp linksanteriorer hemiblock");
  expect(text).toBe("sinus rhythm marked left axis left anterior hemiblock");
});

test("compounds beat their parts", () => {
  // Glossed word by word, `linksschenkelblock` would come out as "left block"
  // and lose the bundle entirely.
  expect(glossReport("linksschenkelblock").text).toBe("left bundle branch block");
  expect(glossReport("rechtsschenkelblock").text).toBe("right bundle branch block");
  expect(glossReport("vorderwandinfarkt").text).toBe("anterior wall infarction");
});

test("an unknown word is left in German and named, never guessed", () => {
  const { text, unknown } = glossReport("sinusrhythmus mit schlingernder Zwischenwelle");
  expect(text).toContain("sinus rhythm");
  expect(text).toContain("schlingernder");     // still there, untouched
  expect(unknown).toContain("schlingernder");  // and reported as a gap
});

test("lead names and numerals are not reported as vocabulary gaps", () => {
  const { unknown } = glossReport("ST senkung in II III aVF");
  expect(unknown).not.toContain("II");
  expect(unknown).not.toContain("aVF");
});

test("an English report is not glossed", () => {
  // A false positive costs a row of unchanged words under a heading claiming to
  // have translated them, which is worse than doing nothing.
  expect(looksGerman("sinus rhythm. normal ECG.")).toBe(false);
  expect(looksGerman("otherwise normal ecg")).toBe(false);
});

test("a German report is recognised", () => {
  expect(looksGerman("sinusrhythmus linkstyp normales ekg")).toBe(true);
});

test("word order stays German, which is the honest failure mode", () => {
  // "nicht sicher auszuschliessen" -> "not definitely to be excluded". English
  // would say "cannot be reliably excluded". The gloss does not pretend to.
  const { text } = glossReport("infarkt nicht sicher auszuschliessen");
  expect(text).toBe("infarction not definitely to be excluded");
});

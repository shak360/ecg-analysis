/**
 * Text contrast, asserted rather than eyeballed.
 *
 * `--text-faint` sat at 3.31:1 on `--bg-raised` and 2.85:1 on `--bg-sunken` for
 * the life of this stylesheet, against WCAG AA's 4.5:1 for body text, and it is
 * used 22 times at 11–11.5 px. Nobody noticed, because failing contrast does not
 * look broken — it looks like small grey text, which is exactly what it was
 * meant to look like. That is the whole argument for testing it: this is a
 * number, and a number is the one thing an eye is worst at.
 *
 * The tokens are read out of `app.css` rather than duplicated here. A copy would
 * pass forever while the stylesheet drifted underneath it.
 */
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";

const CSS = readFileSync(new URL("../web/styles/app.css", import.meta.url), "utf8");

/** Custom properties from one block, by its opening selector. */
function tokens(startsAfter: string): Record<string, string> {
  const at = CSS.indexOf(startsAfter);
  if (at < 0) throw new Error(`no block matching ${startsAfter}`);
  const block = CSS.slice(at, CSS.indexOf("\n}", at));
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)].map((m) => [m[1]!, m[2]!]),
  );
}

/** Relative luminance, per WCAG 2.x. */
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = ch.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** WCAG AA for body text. Every token here is used below 18 px. */
const AA = 4.5;

const THEMES = {
  light: tokens(":root {"),
  dark: tokens(':root[data-theme="dark"]'),
};

/** Which text tokens are drawn on which surfaces, as the stylesheet uses them. */
const PAIRS: [text: string, surface: string][] = [
  ["--text", "--bg"],
  ["--text", "--bg-raised"],
  ["--text", "--bg-sunken"],
  ["--text-muted", "--bg"],
  ["--text-muted", "--bg-raised"],
  ["--text-muted", "--bg-sunken"],
  ["--text-faint", "--bg"],
  ["--text-faint", "--bg-raised"],
  ["--text-faint", "--bg-sunken"],
];

for (const [theme, t] of Object.entries(THEMES)) {
  test(`${theme}: every text token clears AA on every surface it is used on`, () => {
    const failures: string[] = [];
    for (const [text, surface] of PAIRS) {
      const fg = t[text];
      const bg = t[surface];
      expect(fg, `${theme} is missing ${text}`).toBeDefined();
      expect(bg, `${theme} is missing ${surface}`).toBeDefined();
      const r = contrast(fg!, bg!);
      if (r < AA) failures.push(`${text} on ${surface}: ${r.toFixed(2)}:1`);
    }
    expect(failures, `below ${AA}:1 —\n  ${failures.join("\n  ")}`).toEqual([]);
  });
}

test("the two dark palettes have not drifted apart", () => {
  // Dark is declared twice — once under `prefers-color-scheme` for a reader who
  // never touched the toggle, once under `[data-theme="dark"]` for one who did —
  // and plain CSS cannot share a declaration block between a media-gated
  // selector and an ungated one. Indirection through a third set of tokens
  // trades duplicated values for duplicated mappings, and `light-dark()` needs
  // Safari 17.5 against a stated target of 16.4. So the copies stay, and this
  // asserts they stay copies: fixing `--text-faint` in one block and not the
  // other is exactly the mistake that is otherwise invisible.
  const gated = tokens(':root:not([data-theme="light"])');
  expect(gated).toEqual(THEMES.dark);
});

test("faint stays visibly lighter than muted, or it is not a third level", () => {
  // The obvious way to pass the test above is to darken `--text-faint` until it
  // is `--text-muted`, which trades a contrast failure for a hierarchy that no
  // longer exists. Both must hold.
  for (const [theme, t] of Object.entries(THEMES)) {
    const gap = Math.abs(luminance(t["--text-faint"]!) - luminance(t["--text-muted"]!));
    expect(gap, `${theme}: faint and muted are the same grey`).toBeGreaterThan(0.01);
  }
});

test("the accent reads on the surfaces it is placed on", () => {
  // `--accent` is link and pressed-state text, not just a border.
  for (const [theme, t] of Object.entries(THEMES)) {
    for (const surface of ["--bg-raised", "--bg-sunken"]) {
      const r = contrast(t["--accent"]!, t[surface]!);
      expect(r, `${theme}: --accent on ${surface} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
    }
  }
});

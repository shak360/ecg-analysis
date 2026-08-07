/**
 * The theme toggle has to win against the operating system, in both directions.
 *
 * It did not, on the canvases. The stylesheet was fine — `:root[data-theme=…]`
 * is a plain selector and beats a media query either way — but every renderer
 * asked `osDark && attr !== "light"`, so on a light-OS machine the `&&`
 * short-circuited and no toggle could ever produce a dark tracing. The result
 * was a dark page around an ECG on white paper, and it was invisible to anyone
 * developing on a dark-mode machine, where both halves agree.
 *
 * The table below is the whole rule. Four of these six rows passed under the
 * old expression, which is why it survived.
 */
import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

import { isDark } from "../web/src/ui/theme.ts";

test("an explicit choice beats the operating system, both ways", () => {
  const cases: [string | undefined, boolean, boolean, string][] = [
    // attr        osDark  want   what it is
    ["dark",       false,  true,  "light OS, toggled dark — THE BUG: was false"],
    ["light",      true,   false, "dark OS, toggled light"],
    ["dark",       true,   true,  "dark OS, toggled dark"],
    ["light",      false,  false, "light OS, toggled light"],
    [undefined,    true,   true,  "no choice made, dark OS"],
    [undefined,    false,  false, "no choice made, light OS"],
  ];
  for (const [attr, os, want, what] of cases) {
    expect(isDark(attr, os), what).toBe(want);
  }
});

test("an unrecognised attribute defers to the OS rather than guessing", () => {
  // `data-theme` is set by hand in three places; a typo should degrade to the
  // system preference, not silently pin one appearance.
  expect(isDark("", true)).toBe(true);
  expect(isDark("Dark", false)).toBe(false);
  expect(isDark("auto", true)).toBe(true);
});

test("no renderer asks the OS directly any more", () => {
  // The rule is one decision and lived in six copies, five of them the broken
  // half of it. This is what stops a seventh renderer from rediscovering it:
  // `prefers-color-scheme` in TypeScript belongs in exactly one module.
  //
  // Stylesheets are untouched by this — a media query there is correct, because
  // the `[data-theme]` selectors override it in both directions.
  const offenders: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ts") && p !== "web/src/ui/theme.ts") {
        if (readFileSync(p, "utf8").includes("prefers-color-scheme")) offenders.push(p);
      }
    }
  };
  walk("web/src");
  expect(offenders).toEqual([]);
});

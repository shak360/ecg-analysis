/**
 * A BEM modifier must be able to win against its own base class.
 *
 * `.chip` and `.chip--open` are both a single class, so they tie on specificity
 * and source order is the entire cascade. Consolidating the pill rules moved the
 * base below the modifier, and the chosen chip lost its accent label while
 * keeping its accent fill, accent border and accent count — a selected state
 * that is three-quarters applied. It does not look like a CSS bug, it looks like
 * a rendering glitch, and it survived a screenshot: the fill and border change,
 * so the chip plainly reacts to being clicked.
 *
 * This is a source-order check rather than a rendered-colour check, because the
 * thing that broke is source order. Rendering it would need a browser and would
 * only ever cover the states a test happened to click into.
 */
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";

const CSS = readFileSync(new URL("../web/styles/app.css", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");

interface Rule {
  selectors: string[];
  props: Set<string>;
  at: number;
}

/**
 * Top-level rules, flat. Nested blocks (`@media`) are skipped rather than
 * mis-parsed: a media-gated rule is conditional, so comparing its position with
 * an unconditional one says nothing.
 */
function rules(): Rule[] {
  const out: Rule[] = [];
  for (const m of CSS.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const selectors = m[1]!.split(",").map((s) => s.trim()).filter(Boolean);
    const props = new Set(
      [...m[2]!.matchAll(/(^|;)\s*([a-z-]+)\s*:/g)].map((p) => p[2]!),
    );
    if (selectors.length && props.size) out.push({ selectors, props, at: m.index! });
  }
  return out;
}

const ALL = rules();

/** `.chip--open` -> `.chip`, for a selector that is exactly one class. */
function baseOf(selector: string): string | null {
  const m = /^\.([\w-]+?)--[\w-]+$/.exec(selector);
  return m ? `.${m[1]}` : null;
}

test("no BEM modifier is overridden by its own base class further down the file", () => {
  const violations: string[] = [];

  for (const mod of ALL) {
    for (const sel of mod.selectors) {
      const base = baseOf(sel);
      if (!base) continue;

      for (const later of ALL) {
        if (later.at <= mod.at) continue;
        // Only a bare base class ties on specificity. `.chip__n` is a different
        // element and `.chip--open .chip__n` is more specific, so both are fine.
        if (!later.selectors.includes(base)) continue;

        for (const prop of later.props) {
          if (mod.props.has(prop)) {
            violations.push(
              `${sel} sets ${prop}, but ${base} sets it again later and wins the tie`,
            );
          }
        }
      }
    }
  }

  expect(violations, `modifier(s) unable to override their base —\n  ${violations.join("\n  ")}`)
    .toEqual([]);
});

test("the check is looking at real rules, not an empty parse", () => {
  // A regex that stops matching would make the test above vacuously green,
  // which is the same failure mode it exists to catch.
  expect(ALL.length).toBeGreaterThan(150);
  expect(ALL.some((r) => r.selectors.includes(".chip--open"))).toBe(true);
  expect(ALL.some((r) => r.selectors.includes(".chip") && r.props.has("color"))).toBe(true);
});

/**
 * Every element a page's script reaches for exists in that page's HTML.
 *
 * The quiz page was completely dead for several commits. `quiz.ts` gained a
 * `$("layout")` when the 12×1 render was added, `quiz.html` never gained the
 * control, and `$` throws on a missing id — at module top level, before
 * anything is rendered. So the page loaded, painted its shell, and sat on
 * "Starting engine…" forever. Nothing in the build, the type-checker or the
 * existing tests could see it: the id is a string on one side of a boundary
 * that TypeScript does not model, and the failure looks exactly like a slow
 * WASM load.
 *
 * This walks that boundary. It is deliberately dumb — a regex for `$("...")`
 * against a regex for `id="..."` — because anything cleverer would need to
 * execute the page, and then it would be testing the same thing the browser
 * already tests too late.
 */
import { expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const WEB = new URL("../web/", import.meta.url);

const pages = readdirSync(WEB).filter((f) => f.endsWith(".html"));

/** The entry module a page loads, if it loads one. */
function entryModule(html: string): string | null {
  return /<script[^>]*type="module"[^>]*src="\.\/(src\/[\w./-]+)"/.exec(html)?.[1] ?? null;
}

/**
 * Ids the module demands at load, via the `$` helper.
 *
 * Only `$`, and only string literals: `getElementById` calls are usually
 * null-checked, and an interpolated id cannot be resolved without running the
 * code. Both are outside what this can honestly claim to check.
 */
function requiredIds(src: string): string[] {
  return [...src.matchAll(/\$(?:<[^>]*>)?\(\s*"([\w-]+)"\s*\)/g)].map((m) => m[1]!);
}

for (const page of pages) {
  const html = readFileSync(new URL(page, WEB), "utf8");
  const entry = entryModule(html);
  if (!entry) continue;

  test(`${page}: every id ${entry} requires is in the markup`, () => {
    const src = readFileSync(new URL(entry, WEB), "utf8");
    const present = new Set(
      [...html.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]!),
    );
    const missing = [...new Set(requiredIds(src))].filter((id) => !present.has(id));
    expect(missing, `${entry} calls $() for ids ${page} does not define`).toEqual([]);
  });
}

test("the pages that matter are actually being checked", () => {
  // A regex that stops matching would leave every test above vacuously passing,
  // which is the failure mode this whole file exists to prevent elsewhere.
  const checked = pages.filter((p) => entryModule(readFileSync(new URL(p, WEB), "utf8")));
  expect(checked).toEqual(expect.arrayContaining(["index.html", "quiz.html", "compare.html"]));

  const quiz = readFileSync(new URL("quiz.ts", new URL("src/", WEB)), "utf8");
  expect(requiredIds(quiz).length).toBeGreaterThan(5);
});

/**
 * Whether to draw dark, in one place.
 *
 * The CSS and the canvases were answering this differently, and only in one
 * direction, which is why it survived: a machine whose OS is dark shows a dark
 * page and a dark tracing, and everything looks right. Set the OS to light and
 * press the theme button, and the page turns dark around an ECG that stays on
 * white paper — because every renderer was asking
 *
 *     matchMedia("(prefers-color-scheme: dark)").matches &&
 *       document.documentElement.dataset.theme !== "light"
 *
 * where the `&&` short-circuits on a light OS and the toggle can never win. The
 * stylesheet has no such problem: `:root[data-theme="dark"]` is a plain
 * selector and beats the media query in both directions.
 *
 * The correct expression already existed, once, inline in `atlas.ts`. Five
 * canvas renderers had copies of the broken half. That is the whole argument
 * for this module: the rule is one decision, so it should be one function, and
 * a sixth renderer should not have to rediscover it.
 */

/**
 * The rule itself, as a pure function of the two inputs.
 *
 * Separated from the DOM read so it can be tested without one — the bug was in
 * the logic, not in the lookup, and a test that needs a browser to express it
 * is a test nobody writes.
 *
 * An explicit choice always wins. The OS is consulted only when the reader has
 * not made one.
 */
export function isDark(attr: string | undefined, osPrefersDark: boolean): boolean {
  if (attr === "dark") return true;
  if (attr === "light") return false;
  return osPrefersDark;
}

/** Whether this document should be drawn dark right now. */
export function darkTheme(): boolean {
  return isDark(
    document.documentElement.dataset.theme,
    // `matchMedia` is absent under a bare Node test runner; treat that as light
    // rather than throwing, since an explicit attribute answers first anyway.
    typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches,
  );
}

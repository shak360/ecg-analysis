import { expect } from "vitest";

/**
 * Assert a value is present, and narrow its type.
 *
 * Deno's `assert()` carried an `asserts` signature, so `assert(p)` both failed
 * the test and told the compiler `p` was defined. Vitest's `expect` does
 * neither, and `noUncheckedIndexedAccess` makes every indexed read nullable —
 * so without this the tests fill up with `!`, which suppresses exactly the
 * check worth keeping.
 */
export function assertDefined<T>(
  value: T | undefined | null,
  message = "expected a value",
): asserts value is T {
  expect(value, message).not.toBeUndefined();
  if (value === undefined || value === null) {
    throw new Error(message);
  }
}

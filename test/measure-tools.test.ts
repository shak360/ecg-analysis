/**
 * The two conversions the measuring tools rest on.
 *
 * Both are arithmetic a reader will check against the grid with their own eyes,
 * so being subtly wrong is worse here than being obviously broken: a caliper
 * that reads 10% long looks entirely plausible and quietly teaches a wrong
 * interval. The pixel-to-time conversion lives inside a canvas handler that
 * cannot be unit tested, so the relation it uses is pinned here instead.
 */
import { expect, test } from "vitest";
import { inNormalRange, LIMB_AXES, NORMAL_FROM, NORMAL_TO } from "../web/src/ui/axis-wheel.ts";

/** The same relation `calipers.ts` applies: px -> mm -> seconds. */
const msFor = (px: number, pxPerMm: number, mmPerSec: number) =>
  (px / pxPerMm / mmPerSec) * 1000;

test("one large grid square at 25 mm/s reads 200 ms", () => {
  // 5 mm at 25 mm/s. The number every reader knows, so if this is wrong the
  // tool is wrong in a way that will be noticed immediately — which is the
  // point of asserting it.
  expect(msFor(5 * 4, 4, 25)).toBeCloseTo(200);
  expect(msFor(5 * 8, 8, 25)).toBeCloseTo(200);
});

test("one small grid square reads 40 ms, and 20 ms at double paper speed", () => {
  expect(msFor(4, 4, 25)).toBeCloseTo(40);
  expect(msFor(4, 4, 50)).toBeCloseTo(20);
});

test("a 600 ms span is 100 bpm, which is what the caliper prints", () => {
  const px = 600 / 1000 * 25 * 6; // 600 ms at 25 mm/s, 6 px/mm
  expect(msFor(px, 6, 25)).toBeCloseTo(600);
  expect(60000 / msFor(px, 6, 25)).toBeCloseTo(100);
});

test("the hexaxial leads sit where the convention puts them", () => {
  // Clockwise-positive from lead I, which agrees with canvas y growing downward
  // only because two sign flips cancel. Worth pinning so a future "fix" to one
  // of them fails here rather than silently mirroring the wheel.
  const byName = Object.fromEntries(LIMB_AXES);
  expect(byName.I).toBe(0);
  expect(byName.aVF).toBe(90);
  expect(byName.aVL).toBe(-30);
  expect(byName.aVR).toBe(-150);
  expect(byName.II).toBe(60);
  expect(byName.III).toBe(120);
});

test("the normal sector is the range the criteria document uses", () => {
  expect([NORMAL_FROM, NORMAL_TO]).toEqual([-30, 90]);
  expect(inNormalRange(0)).toBe(true);
  expect(inNormalRange(-30)).toBe(true);
  expect(inNormalRange(90)).toBe(true);
  expect(inNormalRange(-45)).toBe(false);  // left axis deviation
  expect(inNormalRange(120)).toBe(false);  // right axis deviation
});

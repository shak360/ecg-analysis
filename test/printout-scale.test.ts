/**
 * The scale a caliper reads its answer off.
 *
 * `drawPrintout` returns a `PrintoutScale`, and every measuring tool converts
 * pixels to milliseconds through it: a caliper span in pixels becomes
 * `px / pxPerMm / mmPerSec` seconds. So a wrong `pxPerMm` does not look wrong —
 * it produces a caliper that reads confidently and is off by a constant factor,
 * which is the same class of failure as the QT estimator returning the next
 * beat's R wave.
 *
 * None of this was tested. The tools were verified by driving the browser,
 * which proves they draw, not that what they draw is to scale. These are the
 * arithmetic claims, checked against the paper standard they exist to
 * reproduce: at 25 mm/s and 10 mm/mV, one large square is 200 ms and 0.5 mV.
 */
import { beforeAll, expect, test } from "vitest";
import { DEFAULT_PRINTOUT, drawPrintout, type PrintoutStudy } from "../web/src/ui/printout.ts";

/**
 * A canvas that records nothing, since the assertions are about the returned
 * geometry rather than the pixels. jsdom has no 2D context, and a full stub of
 * one is a lot of surface for a test that never reads a pixel back.
 */
function stubCanvas(cssWidth: number): HTMLCanvasElement {
  const calls: string[] = [];
  const ctx = new Proxy(
    { canvas: null as unknown, measureText: () => ({ width: 10 }), getImageData: () => ({ data: [] }) },
    {
      get(target: Record<string, unknown>, prop: string) {
        if (prop in target) return target[prop];
        // Any drawing call is a no-op that records it happened.
        return (...args: unknown[]) => {
          calls.push(`${prop}(${args.length})`);
        };
      },
      set() {
        return true;
      },
    },
  );

  return {
    clientWidth: cssWidth,
    width: 0,
    height: 0,
    style: {} as CSSStyleDeclaration,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
}

/** Twelve leads of flat signal — the geometry does not depend on the samples. */
function study(seconds = 10, fsHz = 500): PrintoutStudy {
  const n = seconds * fsHz;
  const leads = new Map<string, Float32Array>();
  for (const l of ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"]) {
    leads.set(l, new Float32Array(n));
  }
  return { label: "a", colour: "#000", leads, rhythm: new Float32Array(n) };
}

beforeAll(() => {
  // `drawPrintout` asks the document which theme is active.
  if (!globalThis.matchMedia) {
    globalThis.matchMedia = (() => ({ matches: false })) as unknown as typeof globalThis.matchMedia;
  }
});

test("one millimetre of paper is the same number of pixels in both axes", () => {
  const s = drawPrintout(stubCanvas(1000), [study()], DEFAULT_PRINTOUT);
  expect(s.pxPerMm).toBeGreaterThan(0);
  expect(Number.isFinite(s.pxPerMm)).toBe(true);
  // The scale carries the paper standard through unchanged; a tool that reads
  // `mmPerSec` off this must get what the caller asked for, not a default.
  expect(s.mmPerSec).toBe(25);
  expect(s.mmPerMv).toBe(10);
});

test("a large square is 200 ms and 0.5 mV, which is the whole point of the grid", () => {
  const s = drawPrintout(stubCanvas(1000), [study()], DEFAULT_PRINTOUT);
  const largeSquareMm = 5;
  const msPerLargeSquare = (largeSquareMm / s.mmPerSec) * 1000;
  const mvPerLargeSquare = largeSquareMm / s.mmPerMv;
  expect(msPerLargeSquare).toBeCloseTo(200, 6);
  expect(mvPerLargeSquare).toBeCloseTo(0.5, 6);
});

test("a caliper span converts to time the way the tools convert it", () => {
  const s = drawPrintout(stubCanvas(1000), [study()], DEFAULT_PRINTOUT);
  // The conversion `calipers.ts` performs, stated here so a change to the scale
  // that breaks it fails a test rather than silently rescaling every reading.
  const toMs = (px: number) => (px / s.pxPerMm / s.mmPerSec) * 1000;

  // 200 ms is one large square, so it must be exactly 5 mm of pixels.
  expect(toMs(5 * s.pxPerMm)).toBeCloseTo(200, 6);
  // And the relationship is linear through the origin — no offset, no clamp.
  expect(toMs(0)).toBe(0);
  expect(toMs(10 * s.pxPerMm)).toBeCloseTo(2 * toMs(5 * s.pxPerMm), 6);
});

test("the printout is fit to width, so paper speed rescales the grid, not the trace", () => {
  // `pxPerMm = cssW / totalMm`, and `totalMm` grows with `mmPerSec`, so the
  // trace occupies the same pixels at any paper speed and the millimetre grid
  // gets finer around it. This is worth pinning because the obvious expectation
  // is the opposite — that 50 mm/s spreads the trace out — and a future change
  // that made it true would silently rescale every caliper reading on screen.
  const slow = drawPrintout(stubCanvas(1000), [study()], DEFAULT_PRINTOUT);
  const fast = drawPrintout(stubCanvas(1000), [study()], { ...DEFAULT_PRINTOUT, mmPerSec: 50 });

  const pxPerSecond = (s: typeof slow) => s.pxPerMm * s.mmPerSec;
  // Not exactly equal: the label gutter and margins are a fixed millimetre cost
  // that does not scale with the trace, so the plot keeps slightly more of the
  // width at the higher speed.
  expect(pxPerSecond(fast) / pxPerSecond(slow)).toBeGreaterThan(1.0);
  expect(pxPerSecond(fast) / pxPerSecond(slow)).toBeLessThan(1.1);

  // The conversion stays correct at both speeds, which is what actually matters.
  for (const s of [slow, fast]) {
    const pxFor200ms = 0.2 * s.mmPerSec * s.pxPerMm;
    expect((pxFor200ms / s.pxPerMm / s.mmPerSec) * 1000).toBeCloseTo(200, 6);
  }
});

test("the time axis agrees with the panel geometry it is drawn on", () => {
  // The invariant tying the scale to the layout: a 3x4 printout shows four
  // columns of 2.5 s, so the plotted width must be exactly ten seconds of
  // `pxPerMm * mmPerSec`. If these two ever disagree, the grid and the trace
  // are drawn to different clocks.
  const s = drawPrintout(stubCanvas(1000), [study()], DEFAULT_PRINTOUT);
  const pxPerSecond = s.pxPerMm * s.mmPerSec;

  const lead = [...s.panels].sort((a, b) => a.w - b.w)[0]!;
  expect(lead.w / pxPerSecond).toBeCloseTo(DEFAULT_PRINTOUT.columnSeconds, 3);
});

test("the scale tiles the canvas exactly, which is the only absolute check here", () => {
  // Everything above is stated in terms of `pxPerMm` on both sides, so it holds
  // under a wrong `pxPerMm` too — a 5% scale error passes every conversion test
  // in this file. This is the one assertion that pins the absolute value: the
  // drawing is laid out in millimetres and then fitted to the canvas, so the
  // full plot plus its fixed gutters must come to the canvas width and no more.
  const cssW = 1000;
  const s = drawPrintout(stubCanvas(cssW), [study()], DEFAULT_PRINTOUT);

  const right = Math.max(...s.panels.map((p) => p.x + p.w));
  const left = Math.min(...s.panels.map((p) => p.x));
  const marginMm = 4;
  const labelMm = 7;

  // Left gutter is the margin plus the lead-label column.
  expect(left).toBeCloseTo((marginMm + labelMm) * s.pxPerMm, 1);
  // Right edge is the canvas less one margin.
  expect(right).toBeCloseTo(cssW - marginMm * s.pxPerMm, 1);
});

test("the panels are inside the canvas and do not overlap each other", () => {
  const cssW = 1000;
  const s = drawPrintout(stubCanvas(cssW), [study()], DEFAULT_PRINTOUT);
  expect(s.panels.length).toBeGreaterThan(0);

  for (const p of s.panels) {
    expect(p.w).toBeGreaterThan(0);
    expect(p.h).toBeGreaterThan(0);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x + p.w).toBeLessThanOrEqual(cssW + 1);
  }

  // Panels are where signal is; the gaps between them are paper. Two panels
  // that overlap would let a caliper sit in two leads at once.
  const sorted = [...s.panels].sort((a, b) => a.y - b.y || a.x - b.x);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    const disjoint = b.y >= a.y + a.h - 0.5 || b.x >= a.x + a.w - 0.5 || a.x >= b.x + b.w - 0.5;
    expect(disjoint, `panels ${i - 1} and ${i} overlap`).toBe(true);
  }
});

test("12x1 is twelve full-width strips; 3x4 is twelve quarter-width panels", () => {
  const wide = drawPrintout(stubCanvas(1000), [study()], {
    ...DEFAULT_PRINTOUT,
    layout: "12x1",
  });
  const grid = drawPrintout(stubCanvas(1000), [study()], DEFAULT_PRINTOUT);

  // Every 12x1 row is the whole record, so all twelve are the same width.
  expect(wide.panels.length).toBe(12);
  const wideWidths = new Set(wide.panels.map((p) => Math.round(p.w)));
  expect(wideWidths.size, "12x1 strips are not all the same width").toBe(1);

  // 3x4 carries the twelve lead panels plus a full-width strip per rhythm lead,
  // so it has more panels than leads — and its lead panels are a quarter the
  // width of a strip, since a column is 2.5 s of a 10 s record.
  expect(grid.panels.length).toBe(12 + DEFAULT_PRINTOUT.rhythmLeads.length);
  const narrowest = Math.min(...grid.panels.map((p) => p.w));
  const widestGrid = Math.max(...grid.panels.map((p) => p.w));
  expect(widestGrid / narrowest).toBeCloseTo(4, 1);
});

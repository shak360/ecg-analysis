/**
 * What a panel is allowed to show when a comparison was never registered.
 *
 * `AlignFlag::AlignImplausible` fires when the cross-study search wants a shift
 * larger than `XSTUDY_CLAMP_MS`; the shift is then zeroed and the two ensembles
 * are subtracted where they happen to sit. The resulting difference trace is a
 * perfectly ordinary-looking curve. Nothing in its shape distinguishes it from a
 * real one, which is why this needs a test rather than an eye: the failure is
 * invisible by construction, and it survived from the engine to the screen for
 * as long as it did precisely because it looks like a result.
 */
import { expect, test } from "vitest";

import { type OverlayLead, panelAnnotations } from "../web/src/ui/overlay.ts";

const trace = () => ({ label: "a", colour: "#000", samples: new Float32Array(4), beatsUsed: 3 });

function lead(
  diffs: { implausible?: boolean }[],
  extra: Partial<OverlayLead> = {},
): OverlayLead {
  return {
    lead: "V2",
    traces: [trace(), ...diffs.map(trace)],
    differences: diffs.map((d, i) => ({
      samples: new Float32Array(4),
      traceIndex: i + 1,
      rmsMv: 0.12,
      implausible: d.implausible,
    })),
    rmsDifferenceMv: 0.12,
    ...extra,
  };
}

test("a registered comparison is drawn and its Δrms quoted", () => {
  const a = panelAnnotations(lead([{}]));
  expect(a.drawable).toHaveLength(1);
  expect(a.rmsMv).toBe(0.12);
  expect(a.warnings).toEqual([]);
});

test("a clamped comparison is not drawn", () => {
  const a = panelAnnotations(lead([{ implausible: true }]));
  expect(a.drawable).toEqual([]);
});

test("a clamped comparison's Δrms is withheld, not shown as zero", () => {
  // The engine leaves `rmsDifferenceMv` at 0 when every comparison was clamped.
  // Printing "Δrms 0.000 mV" would be the strongest claim the panel can make —
  // no change at all — asserted from the one case where nothing was comparable.
  const a = panelAnnotations(lead([{ implausible: true }], { rmsDifferenceMv: 0 }));
  expect(a.rmsMv).toBeNull();
});

test("the panel says why the lane is empty", () => {
  const a = panelAnnotations(lead([{ implausible: true }]));
  expect(a.warnings).toEqual(["alignment clamped — no difference shown"]);
});

test("in a series, only the clamped comparison is suppressed", () => {
  // The reason the flag rides on the difference and not the lead: suppressing a
  // good comparison because a different study failed would hide a real result to
  // report a broken one.
  const a = panelAnnotations(lead([{}, { implausible: true }, {}]));
  expect(a.drawable).toHaveLength(2);
  expect(a.rmsMv).toBe(0.12);
  expect(a.warnings).toEqual(["alignment clamped on 1 of 3 — not shown"]);
});

test("a clamped alignment and a morphology change are both reported", () => {
  // They are different statements — one says the comparison is invalid, the
  // other that it is valid but the beats do not have the same shape — so
  // neither may quietly replace the other in the single footer slot.
  const a = panelAnnotations(lead([{ implausible: true }], { morphologyChanged: true }));
  expect(a.warnings).toEqual([
    "alignment clamped — no difference shown",
    "morphology differs",
  ]);
});

test("a lead with no comparisons quotes no Δrms and raises nothing", () => {
  const a = panelAnnotations({ lead: "V2", traces: [trace()] });
  expect(a).toEqual({ drawable: [], rmsMv: null, warnings: [] });
});

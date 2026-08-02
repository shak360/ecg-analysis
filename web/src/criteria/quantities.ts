/**
 * Evaluating a criterion's quantity against what this tool measured.
 *
 * Every function here returns `null` rather than a number it cannot justify, and
 * null propagates: a sum with one missing term is not a smaller sum, it is not a
 * sum. That rule is the whole point of the module. The engine already learned it
 * the hard way — `measure.rs` once reported σ = 0 for a lead whose QRS
 * boundaries were never found, which is perfect certainty about a lead nobody
 * looked at — and a criterion that quietly treats a missing S wave as 0 mV
 * commits the same error with a guideline's name attached to it.
 */

import type { LeadMeasure, Measures, QuantityExpr } from "./types.ts";

/**
 * The smallest Q wave this tool will treat as a Q wave, in millivolts.
 *
 * **This floor is ours, not a guideline's, and the panel must say so.**
 * `crates/ecg-core/src/measure.rs:150` counts any run of negative samples before
 * the R peak as a Q wave, with no amplitude condition at all, so a −0.02 mV
 * wander lasting 40 ms is reported as a 40 ms Q wave. Feeding that to the
 * pathological-Q criteria — which are duration-and-depth rules — would turn
 * baseline noise into evidence of infarction, at scale, across a teaching
 * corpus. The criteria document specifies 0.10 mV as the measurement floor;
 * until the engine applies it, this layer does.
 */
export const Q_FLOOR_MV = 0.1;

function leadOf(m: Measures, lead: string): LeadMeasure | undefined {
  return m.leads.find((l) => l.lead === lead);
}

/** A finite number, or null. Guards against NaN reaching a comparison. */
function finite(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Evaluate an expression, or return null.
 *
 * The `switch` is exhaustive over `QuantityExpr` on purpose: adding a leaf
 * without handling it here is a compile error, not a silent `undefined`.
 */
export function evaluateQuantity(expr: QuantityExpr, m: Measures): number | null {
  switch (expr.k) {
    case "qrsMs":
      return finite(m.qrs);
    case "qtMs":
      return finite(m.qt);
    case "qtcFMs":
      return finite(m.qtcF);
    case "hrBpm":
      return finite(m.hr);
    case "axisDeg":
      return finite(m.axis);

    case "rMv":
      return finite(leadOf(m, expr.lead)?.r);

    // Depths. The engine reports S and Q signed negative; every published
    // criterion states them as a magnitude, so the sign is removed once, here,
    // and never at a call site where forgetting it would flip a comparison.
    case "sMv": {
      const v = finite(leadOf(m, expr.lead)?.s);
      return v === null ? null : Math.abs(v);
    }
    case "qMv": {
      const v = finite(leadOf(m, expr.lead)?.q);
      if (v === null) return null;
      const depth = Math.abs(v);
      // Below the floor this is not a Q wave, and reporting 0.04 mV would let a
      // caller compare noise against a threshold. Absent, not small.
      return depth >= Q_FLOOR_MV ? depth : null;
    }

    case "tMv":
      return finite(leadOf(m, expr.lead)?.t);
    case "stJmv":
      return finite(leadOf(m, expr.lead)?.stJ);
    case "stJ60mv":
      return finite(leadOf(m, expr.lead)?.stJ60);

    case "constant":
      return expr.value;

    case "sum": {
      let total = 0;
      for (const t of expr.terms) {
        const v = evaluateQuantity(t, m);
        if (v === null) return null; // no partial sums
        total += v;
      }
      return total;
    }

    case "max": {
      let best: number | null = null;
      for (const t of expr.terms) {
        const v = evaluateQuantity(t, m);
        // A max over a partly-measured set is legitimate — "the taller of RV5
        // and RV6" is answerable when only one was measured — but it must be
        // stated, because it is the one place a null is tolerated.
        if (v !== null && (best === null || v > best)) best = v;
      }
      return best;
    }

    case "product": {
      let total = 1;
      for (const t of expr.terms) {
        const v = evaluateQuantity(t, m);
        if (v === null) return null;
        total *= v;
      }
      return total;
    }
  }
}

/** Every lead an expression reads, for marking the tracing. */
export function leadsOf(expr: QuantityExpr): string[] {
  switch (expr.k) {
    case "rMv":
    case "sMv":
    case "qMv":
    case "tMv":
    case "stJmv":
    case "stJ60mv":
      return [expr.lead];
    case "sum":
    case "max":
    case "product":
      return [...new Set(expr.terms.flatMap(leadsOf))];
    default:
      return [];
  }
}

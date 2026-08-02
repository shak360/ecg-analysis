/**
 * The full-ECG view: the recording drawn as a cart would print it.
 *
 * Three rows of four 2.5 s columns, then two full-width rhythm strips. Each row
 * is one **continuous** stroke across all four columns — that is how a printout
 * looks, because the pen never lifts; it simply switches which lead it is
 * drawing at each column boundary. Breaking the rows into four separate
 * segments would put gaps where a real page has none and make the eye read the
 * boundaries as pen-lifts rather than lead changes.
 *
 * What is drawn here is the **conditioned continuous signal**, not an ensemble
 * beat: this is the view for reading rhythm and for seeing the tracing as it
 * actually ran. The beat view is where morphology is compared.
 *
 * Two or more studies are superimposed in their own colours, exactly as in the
 * beat view — the same recording drawn twice, a year apart, on one page.
 */

/** One study's signals for the printout. */
export interface PrintoutStudy {
  label: string;
  colour: string;
  /** Conditioned panel per lead, millivolts at `fsHz`. */
  leads: Map<string, Float32Array>;
  /** Conditioned rhythm strip, millivolts at `fsHz`. */
  rhythm: Float32Array | null;
}

export interface PrintoutOptions {
  fsHz: number;
  mmPerSec: number;
  mmPerMv: number;
  /** Seconds each column covers. */
  columnSeconds: number;
  /** Leads to place in the rhythm strips, top to bottom. */
  rhythmLeads: string[];
  /**
   * Leads to wash with the accent colour — "the criterion is about these".
   *
   * Drawn under the grid, never over the trace, and never in a colour that
   * carries a judgement: this says *where to look*, not what is there. It is the
   * whole product for a criterion this tool cannot evaluate, which is most of
   * them.
   */
  emphasiseLeads?: string[];
}

export const DEFAULT_PRINTOUT: PrintoutOptions = {
  fsHz: 500,
  mmPerSec: 25,
  mmPerMv: 10,
  columnSeconds: 2.5,
  rhythmLeads: ["II", "V1"],
};

/** Column-major, exactly as a printout is laid out. */
const COLUMNS: readonly (readonly string[])[] = [
  ["I", "II", "III"],
  ["aVR", "aVL", "aVF"],
  ["V1", "V2", "V3"],
  ["V4", "V5", "V6"],
];

interface Theme {
  bg: string;
  fine: string;
  coarse: string;
  text: string;
  muted: string;
  mark: string;
}

function theme(dark: boolean): Theme {
  return dark
    // `mark` is the accent at low alpha — deliberately not green or red, which
    // on this page would read as "right" and "wrong".
    ? { bg: "#12151a", fine: "#3a2020", coarse: "#5c2e2e", text: "#e8eaee", muted: "#8a929e",
        mark: "rgba(77,163,232,0.13)" }
    : { bg: "#fffafa", fine: "#fadddd", coarse: "#f2b8b8", text: "#16191d", muted: "#6b7280",
        mark: "rgba(11,106,184,0.10)" };
}

/**
 * Draw the printout.
 *
 * Geometry is in true millimetres: 25 mm/s and 10 mm/mV by default, so the
 * familiar "one small square is 40 ms and 0.1 mV" reading holds.
 */
/**
 * What a caliper needs to turn pixels back into milliseconds and millivolts.
 *
 * Returned rather than recomputed by the caller: the scale is derived from the
 * canvas's own width, and a second copy of that derivation is exactly the kind
 * of duplicate that drifts until the grid and the readout disagree.
 */
export interface PrintoutScale {
  pxPerMm: number;
  mmPerSec: number;
  mmPerMv: number;
}

export function drawPrintout(
  canvas: HTMLCanvasElement,
  studies: PrintoutStudy[],
  opts: PrintoutOptions = DEFAULT_PRINTOUT,
): PrintoutScale {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches &&
    document.documentElement.dataset.theme !== "light";
  const th = theme(dark);

  const dpr = globalThis.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 1000;

  const marginMm = 4;
  const labelMm = 7;
  const rowMm = 26;
  const rows = 3 + opts.rhythmLeads.length;

  const plotMm = COLUMNS.length * opts.columnSeconds * opts.mmPerSec;
  const totalMm = labelMm + plotMm + marginMm * 2;
  const heightMm = marginMm * 2 + rows * rowMm;

  const pxPerMm = cssW / totalMm;
  const cssH = heightMm * pxPerMm;

  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = th.bg;
  ctx.fillRect(0, 0, cssW, cssH);

  const x0 = (marginMm + labelMm) * pxPerMm;
  const y0 = marginMm * pxPerMm;
  const plotW = plotMm * pxPerMm;
  const plotH = rows * rowMm * pxPerMm;

  // Grid across the whole plotting area, uninterrupted by row boundaries —
  // a printout has one continuous sheet of paper behind everything.
  const grid = (stepMm: number, colour: string, lw: number) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (let x = x0; x <= x0 + plotW + 0.01; x += stepMm * pxPerMm) {
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + plotH);
    }
    for (let y = y0; y <= y0 + plotH + 0.01; y += stepMm * pxPerMm) {
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + plotW, y);
    }
    ctx.stroke();
  };
  const colW = opts.columnSeconds * opts.mmPerSec * pxPerMm;

  // Before the grid, so the paper still reads as one continuous sheet and the
  // millimetre squares stay legible through the wash.
  const marked = new Set(opts.emphasiseLeads ?? []);
  if (marked.size) {
    ctx.save();
    ctx.fillStyle = th.mark;
    for (let r = 0; r < 3; r++) {
      COLUMNS.forEach((col, c) => {
        if (!marked.has(col[r]!)) return;
        ctx.fillRect(x0 + c * colW, y0 + r * rowMm * pxPerMm, colW, rowMm * pxPerMm);
      });
    }
    opts.rhythmLeads.forEach((lead, k) => {
      if (!marked.has(lead)) return;
      ctx.fillRect(x0, y0 + (3 + k) * rowMm * pxPerMm, plotW, rowMm * pxPerMm);
    });
    ctx.restore();
  }

  grid(1, th.fine, 0.5);
  grid(5, th.coarse, 0.9);

  /**
   * Draw one row as a single unbroken stroke across all four columns.
   *
   * The lead changes at each boundary; the line does not break. Sampling the
   * next lead's panel from its own start is what makes the joins land at the
   * right amplitude instead of stepping to wherever the previous lead happened
   * to end.
   */
  const drawRow = (
    study: PrintoutStudy,
    rowIndex: number,
    leadsInRow: string[],
    baselineY: number,
  ) => {
    ctx.strokeStyle = study.colour;
    ctx.lineWidth = 1.1;
    ctx.lineJoin = "round";
    ctx.beginPath();

    let started = false;
    leadsInRow.forEach((lead, c) => {
      const sig = study.leads.get(lead);
      if (!sig || sig.length === 0) return;
      const n = Math.min(sig.length, Math.round(opts.columnSeconds * opts.fsHz));
      const colX = x0 + c * colW;
      for (let i = 0; i < n; i++) {
        const px = colX + (i / opts.fsHz) * opts.mmPerSec * pxPerMm;
        const py = baselineY - sig[i]! * opts.mmPerMv * pxPerMm;
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
    });
    ctx.stroke();
    void rowIndex;
  };

  // The twelve leads, three rows of four.
  for (let r = 0; r < 3; r++) {
    const baselineY = y0 + (r + 0.5) * rowMm * pxPerMm;
    const leadsInRow = COLUMNS.map((col) => col[r]!);
    for (const study of studies) drawRow(study, r, leadsInRow, baselineY);
  }

  // Rhythm strips, full width.
  opts.rhythmLeads.forEach((lead, k) => {
    const baselineY = y0 + (3 + k + 0.5) * rowMm * pxPerMm;
    for (const study of studies) {
      // Lead II uses the recorded rhythm strip where one exists; any other
      // rhythm lead falls back to its own 2.5 s panel, which is all we have.
      const sig = lead === "II" && study.rhythm?.length
        ? study.rhythm
        : study.leads.get(lead);
      if (!sig || sig.length === 0) continue;

      const maxSamples = Math.round(
        (plotW / pxPerMm / opts.mmPerSec) * opts.fsHz,
      );
      const n = Math.min(sig.length, maxSamples);
      // A strip shorter than the page is not a truncated drawing — it is all the
      // recording contains. Say so, rather than leaving the reader to wonder
      // whether the trace was cut off.
      if (n < maxSamples * 0.9 && studies.indexOf(study) === 0) {
        ctx.fillStyle = th.muted;
        ctx.font = `${Math.max(8, 2.4 * pxPerMm)}px ui-monospace, monospace`;
        ctx.fillText(
          `${(n / opts.fsHz).toFixed(1)} s available — no full-length ${lead} strip in the source`,
          x0 + (n / opts.fsHz) * opts.mmPerSec * pxPerMm + 4,
          baselineY,
        );
      }
      ctx.strokeStyle = study.colour;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const px = x0 + (i / opts.fsHz) * opts.mmPerSec * pxPerMm;
        const py = baselineY - sig[i]! * opts.mmPerMv * pxPerMm;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  });

  // Column boundaries, so a lead change is visible as such rather than being
  // mistaken for a morphology change.
  ctx.strokeStyle = th.muted;
  ctx.globalAlpha = 0.3;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  for (let c = 1; c < COLUMNS.length; c++) {
    const x = x0 + c * colW;
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y0 + 3 * rowMm * pxPerMm);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // Lead labels, at each panel's top-left as a cart prints them.
  ctx.fillStyle = th.text;
  ctx.font = `600 ${Math.max(9, 3 * pxPerMm)}px system-ui, sans-serif`;
  for (let r = 0; r < 3; r++) {
    const top = y0 + r * rowMm * pxPerMm;
    COLUMNS.forEach((col, c) => {
      ctx.fillText(col[r]!, x0 + c * colW + 3, top + 4 * pxPerMm);
    });
  }
  opts.rhythmLeads.forEach((lead, k) => {
    const top = y0 + (3 + k) * rowMm * pxPerMm;
    ctx.fillText(lead, x0 + 3, top + 4 * pxPerMm);
  });

  // Calibration mark and the scale it implies.
  ctx.fillStyle = th.muted;
  ctx.font = `${Math.max(8, 2.6 * pxPerMm)}px ui-monospace, monospace`;
  ctx.fillText(
    `${opts.mmPerSec} mm/s   ${opts.mmPerMv} mm/mV`,
    x0,
    y0 + plotH + 3.2 * pxPerMm,
  );

  return { pxPerMm, mmPerSec: opts.mmPerSec, mmPerMv: opts.mmPerMv };
}

/**
 * The overlay: two or more registered ensemble beats superimposed, per lead.
 *
 * Rendering rules that carry meaning rather than taste:
 *
 * * **A fixed mV/div across every panel.** Per-panel autoscaling would make a
 *   0.05 mV lead and a 2 mV lead look alike, which is the opposite of useful
 *   when the question is whether amplitude changed.
 * * **A true millimetre grid**, so the familiar 1 mm = 0.1 mV reading applies.
 * * **Time order encoded by colour**, oldest to newest along one ramp, so which
 *   trace is the follow-up never depends on reading a legend.
 * * **The difference trace drawn beneath, not on top.** It is derived, and
 *   overlaying it on the beats invites reading it as another lead.
 */

/** One study's contribution to a lead panel. */
export interface OverlayTrace {
  label: string;
  /** Colour this study is drawn in; set by the study list. */
  colour: string;
  /** Ensemble beat, millivolts, on the standard frame. */
  samples: Float32Array;
  /** Per-sample standard deviation, millivolts. Infinite entries are skipped. */
  sigma?: Float32Array;
  /** Beats combined into this ensemble. */
  beatsUsed: number;
}

/** One comparison's difference from the reference, in millivolts. */
export interface OverlayDifference {
  samples: Float32Array;
  /** Index into `traces`, so the difference is drawn in its study's colour. */
  traceIndex: number;
  rmsMv: number;
}

export interface OverlayLead {
  lead: string;
  /** Reference first, then each comparison in time order. */
  traces: OverlayTrace[];
  /** One entry per comparison; empty when only the reference is shown. */
  differences?: OverlayDifference[];
  /** Largest RMS difference across the series, for the panel label. */
  rmsDifferenceMv?: number;
  /** At least one comparison could not be aligned to the reference. */
  morphologyChanged?: boolean;
  /** No usable ensemble for this lead. */
  unavailable?: boolean;
}

export interface OverlayOptions {
  fsHz: number;
  /** Frame index of the alignment anchor (global QRS onset). */
  anchorIndex: number;
  mmPerSec: number;
  mmPerMv: number;
  /** Show the difference trace beneath each panel. */
  showDifference: boolean;
  /** Draw the per-sample spread as a band around each trace. */
  showSigma: boolean;
  columns: number;
  /**
   * `"standard"` lays the leads out as a printout does — I/II/III down the
   * first column, aVR/aVL/aVF down the second, then V1–V3 and V4–V6 — which is
   * how a clinician expects to read them and how the source page is arranged.
   * `"grid"` fills row-major across `columns`, for anything that is not a
   * canonical 12-lead set.
   */
  arrangement: "standard" | "grid";
  /** Ceiling on panel height in CSS pixels; see the note in `drawOverlay`. */
  maxPanelHeightPx?: number;
}

export const DEFAULT_OVERLAY: OverlayOptions = {
  fsHz: 500,
  anchorIndex: 100,
  // 50 mm/s for the beat view. An ensemble beat spans ~0.8 s, which at the
  // 25 mm/s of a full printout is only 20 mm across — too cramped to read
  // morphology from. Median-beat displays conventionally run at double speed.
  mmPerSec: 50,
  mmPerMv: 10,
  showDifference: true,
  showSigma: true,
  columns: 4,
  arrangement: "standard",
};

/**
 * Colour ramp encoding study order, oldest to newest.
 *
 * Ordered by lightness as well as hue, so the sequence survives greyscale
 * printing and the common colour-vision deficiencies — the reader must be able
 * to tell prior from current without relying on red versus green.
 */
const RAMP = ["#1b4a8f", "#2e7fbf", "#3fb0a5", "#d98c1f", "#c2410c"];

export function traceColour(index: number, total: number): string {
  if (total <= 1) return RAMP[0]!;
  const t = index / (total - 1);
  return RAMP[Math.round(t * (RAMP.length - 1))]!;
}

interface Theme {
  bg: string;
  gridFine: string;
  gridCoarse: string;
  text: string;
  muted: string;
  diff: string;
  band: string;
}

function theme(dark: boolean): Theme {
  return dark
    ? {
      bg: "#12151a",
      gridFine: "#3a2020",
      gridCoarse: "#5c2e2e",
      text: "#e8eaee",
      muted: "#8a929e",
      diff: "#b06ad6",
      band: "rgba(140,150,170,0.18)",
    }
    : {
      bg: "#fffafa",
      gridFine: "#fadddd",
      gridCoarse: "#f2b8b8",
      text: "#16191d",
      muted: "#6b7280",
      diff: "#7c3aed",
      band: "rgba(90,100,120,0.14)",
    };
}

/** Layout metrics for one lead panel, in CSS pixels. */
interface PanelBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Vertical centre used as the 0 mV line for the beats. */
  zeroY: number;
  /** Vertical centre of the difference lane, when shown. */
  diffZeroY: number;
}

/**
 * Draw the overlay.
 *
 * Returns the panel boxes so the caller can hit-test for hover and crosshair
 * without recomputing the layout.
 */
export function drawOverlay(
  canvas: HTMLCanvasElement,
  leads: OverlayLead[],
  opts: OverlayOptions = DEFAULT_OVERLAY,
): Map<string, PanelBox> {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches &&
    document.documentElement.dataset.theme !== "light";
  const th = theme(dark);

  const dpr = globalThis.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 900;

  // A standard printout is four columns of three. Anything that is not a
  // twelve-lead set falls back to a plain grid.
  const standard = opts.arrangement === "standard" && leads.length === 12;
  const cols = standard ? 4 : Math.max(1, opts.columns);
  const rows = standard ? 3 : Math.ceil(leads.length / cols);

  const frameLen = leads[0]?.traces[0]?.samples.length ?? 401;
  const seconds = frameLen / opts.fsHz;

  // The grid stays true to size, so millimetres on screen are millimetres. But
  // deriving the scale from width alone means a wide window produces enormous
  // panels, so it is also capped by a height budget; whichever binds, wins.
  const gutter = 8;
  const cellW = (cssW - gutter * (cols + 1)) / cols;
  const beatMm = 30;
  const diffMm = opts.showDifference ? 12 : 0;
  const totalMm = beatMm + diffMm;

  const pxPerMm = Math.min(
    cellW / (seconds * opts.mmPerSec),
    (opts.maxPanelHeightPx ?? 200) / totalMm,
  );
  const panelW = Math.min(cellW, seconds * opts.mmPerSec * pxPerMm);
  const panelH = totalMm * pxPerMm;
  const cssH = rows * (panelH + gutter) + gutter + 18;

  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = th.bg;
  ctx.fillRect(0, 0, cssW, cssH);

  const boxes = new Map<string, PanelBox>();

  leads.forEach((lead, i) => {
    // Column-major for the standard layout, row-major otherwise.
    const c = standard ? Math.floor(i / 3) : i % cols;
    const r = standard ? i % 3 : Math.floor(i / cols);
    // Centre the panel in its cell when the height cap made it narrower.
    const x = gutter + c * (cellW + gutter) + (cellW - panelW) / 2;
    const y = gutter + r * (panelH + gutter);
    const zeroY = y + (beatMm / 2) * pxPerMm;
    const diffZeroY = y + (beatMm + diffMm / 2) * pxPerMm;
    boxes.set(lead.lead, { x, y, w: panelW, h: panelH, zeroY, diffZeroY });

    drawPanel(ctx, lead, { x, y, w: panelW, h: panelH, zeroY, diffZeroY }, pxPerMm, opts, th);
  });

  return boxes;
}

function drawPanel(
  ctx: CanvasRenderingContext2D,
  lead: OverlayLead,
  box: PanelBox,
  pxPerMm: number,
  opts: OverlayOptions,
  th: Theme,
): void {
  const { x, y, w, h, zeroY, diffZeroY } = box;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // Millimetre grid.
  const grid = (stepMm: number, colour: string, lw: number) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (let gx = x; gx <= x + w; gx += stepMm * pxPerMm) {
      ctx.moveTo(gx, y);
      ctx.lineTo(gx, y + h);
    }
    for (let gy = zeroY; gy >= y; gy -= stepMm * pxPerMm) {
      ctx.moveTo(x, gy);
      ctx.lineTo(x + w, gy);
    }
    for (let gy = zeroY; gy <= y + h; gy += stepMm * pxPerMm) {
      ctx.moveTo(x, gy);
      ctx.lineTo(x + w, gy);
    }
    ctx.stroke();
  };
  grid(1, th.gridFine, 0.5);
  grid(5, th.gridCoarse, 0.9);

  const xOf = (i: number) => x + (i / opts.fsHz) * opts.mmPerSec * pxPerMm;
  const yOf = (mv: number) => zeroY - mv * opts.mmPerMv * pxPerMm;

  if (lead.unavailable) {
    ctx.restore();
    ctx.fillStyle = th.muted;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(`${lead.lead} — unavailable`, x + 6, y + 16);
    ctx.strokeStyle = th.gridCoarse;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    return;
  }

  // The alignment anchor, so the reader can see what the traces were put on.
  ctx.strokeStyle = th.muted;
  ctx.globalAlpha = 0.45;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(xOf(opts.anchorIndex), y);
  ctx.lineTo(xOf(opts.anchorIndex), y + (opts.showDifference ? h - 12 * pxPerMm : h));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // Spread bands first, so traces sit on top.
  if (opts.showSigma) {
    lead.traces.forEach((tr) => {
      if (!tr.sigma) return;
      ctx.fillStyle = th.band;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < tr.samples.length; i++) {
        const s = tr.sigma[i];
        if (s === undefined || !Number.isFinite(s)) continue;
        const py = yOf(tr.samples[i]! + s);
        if (!started) {
          ctx.moveTo(xOf(i), py);
          started = true;
        } else ctx.lineTo(xOf(i), py);
      }
      for (let i = tr.samples.length - 1; i >= 0; i--) {
        const s = tr.sigma[i];
        if (s === undefined || !Number.isFinite(s)) continue;
        ctx.lineTo(xOf(i), yOf(tr.samples[i]! - s));
      }
      if (started) {
        ctx.closePath();
        ctx.fill();
      }
    });
  }

  // The beats.
  ctx.lineWidth = 1.4;
  ctx.lineJoin = "round";
  lead.traces.forEach((tr) => {
    ctx.strokeStyle = tr.colour;
    ctx.beginPath();
    for (let i = 0; i < tr.samples.length; i++) {
      const px = xOf(i), py = yOf(tr.samples[i]!);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  });

  // The difference lane, beneath and visually separated.
  if (opts.showDifference && lead.differences?.length) {
    ctx.strokeStyle = th.gridCoarse;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y + 30 * pxPerMm);
    ctx.lineTo(x + w, y + 30 * pxPerMm);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const dY = (mv: number) => diffZeroY - mv * opts.mmPerMv * pxPerMm;
    ctx.lineWidth = 1.2;
    for (const diff of lead.differences) {
      // A single comparison gets the dedicated difference colour; a series is
      // drawn in each study's own colour, so a trace above and its difference
      // below are visibly the same study.
      // A single comparison gets the dedicated difference colour; a series is
      // drawn in each study's own colour, so a trace above and its difference
      // below are visibly the same study.
      ctx.strokeStyle = lead.differences.length === 1
        ? th.diff
        : (lead.traces[diff.traceIndex]?.colour ?? th.diff);
      ctx.beginPath();
      for (let i = 0; i < diff.samples.length; i++) {
        const px = xOf(i), py = dY(diff.samples[i]!);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  ctx.restore();

  // Label and per-lead annotations, outside the clip.
  ctx.fillStyle = th.text;
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.fillText(lead.lead, x + 6, y + 15);

  ctx.font = "11px ui-monospace, monospace";
  ctx.fillStyle = th.muted;
  const bits: string[] = [];
  if (lead.rmsDifferenceMv !== undefined) {
    bits.push(`Δrms ${lead.rmsDifferenceMv.toFixed(3)} mV`);
  }
  const n = lead.traces.map((t) => t.beatsUsed).join("/");
  if (n) bits.push(`n ${n}`);
  if (bits.length) ctx.fillText(bits.join("   "), x + 6, y + h - 5);

  if (lead.morphologyChanged) {
    ctx.fillStyle = "#c2410c";
    ctx.font = "600 10px system-ui, sans-serif";
    ctx.fillText("QRS morphology differs — not aligned", x + 6, y + 28);
  }

  ctx.strokeStyle = th.gridCoarse;
  ctx.globalAlpha = 0.6;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.globalAlpha = 1;
}

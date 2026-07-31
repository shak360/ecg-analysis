/**
 * Minimal vector-PDF writer, plus an ECG printout renderer.
 *
 * Deliberately hand-rolled rather than pulled from a library. We need a fixture
 * whose geometry we know to the point, and whose content stream contains plain
 * `m`/`l`/`S` operators of the kind an ECG cart actually emits — so the vector
 * extractor is exercised against realistic input with exact ground truth.
 *
 * Streams are written uncompressed. That makes the fixture larger but keeps it
 * inspectable with a text editor when the extractor disagrees with expectations.
 */

import { type LeadId, LEAD_IDS, type SyntheticEcg } from "./ecg.ts";

/** PDF points per millimetre. */
export const PT_PER_MM = 72 / 25.4;

// ---------------------------------------------------------------------------
// PDF container
// ---------------------------------------------------------------------------

class PdfBuilder {
  #objects: (string | Uint8Array)[] = [];

  /** Reserve an object number without writing it yet. */
  reserve(): number {
    this.#objects.push("");
    return this.#objects.length;
  }

  set(num: number, body: string | Uint8Array): void {
    this.#objects[num - 1] = body;
  }

  add(body: string | Uint8Array): number {
    const n = this.reserve();
    this.set(n, body);
    return n;
  }

  build(rootNum: number): Uint8Array {
    const enc = new TextEncoder();
    const chunks: Uint8Array[] = [];
    let offset = 0;
    const push = (b: Uint8Array | string) => {
      const bytes = typeof b === "string" ? enc.encode(b) : b;
      chunks.push(bytes);
      offset += bytes.length;
    };

    push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

    const offsets: number[] = [];
    for (let i = 0; i < this.#objects.length; i++) {
      offsets.push(offset);
      push(`${i + 1} 0 obj\n`);
      push(this.#objects[i]!);
      push("\nendobj\n");
    }

    const xrefOffset = offset;
    const count = this.#objects.length + 1;
    let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
    for (const o of offsets) xref += `${String(o).padStart(10, "0")} 00000 n \n`;
    push(xref);
    push(`trailer\n<< /Size ${count} /Root ${rootNum} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

    const total = chunks.reduce((a, c) => a + c.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    for (const c of chunks) {
      out.set(c, p);
      p += c.length;
    }
    return out;
  }
}

/** Accumulates PDF content-stream operators. */
class ContentStream {
  #ops: string[] = [];

  strokeColor(r: number, g: number, b: number): this {
    this.#ops.push(`${f(r)} ${f(g)} ${f(b)} RG`);
    return this;
  }

  lineWidth(mm: number): this {
    this.#ops.push(`${f(mm * PT_PER_MM)} w`);
    return this;
  }

  /** Draw a polyline given millimetre coordinates in a top-left origin frame. */
  polylineMm(pts: ArrayLike<number>, pageHeightMm: number): this {
    if (pts.length < 4) return this;
    for (let i = 0; i < pts.length; i += 2) {
      const x = f(pts[i]! * PT_PER_MM);
      const y = f((pageHeightMm - pts[i + 1]!) * PT_PER_MM);
      this.#ops.push(`${x} ${y} ${i === 0 ? "m" : "l"}`);
    }
    this.#ops.push("S");
    return this;
  }

  text(xMm: number, yMm: number, pageHeightMm: number, size: number, s: string): this {
    const esc = s.replace(/([\\()])/g, "\\$1");
    this.#ops.push(
      `BT /F1 ${f(size)} Tf ${f(xMm * PT_PER_MM)} ${f((pageHeightMm - yMm) * PT_PER_MM)} Td (${esc}) Tj ET`,
    );
    return this;
  }

  fillColor(r: number, g: number, b: number): this {
    this.#ops.push(`${f(r)} ${f(g)} ${f(b)} rg`);
    return this;
  }

  toBytes(): Uint8Array {
    return new TextEncoder().encode(this.#ops.join("\n"));
  }
}

/** Compact number formatting — trims trailing zeros to keep streams small. */
function f(n: number): string {
  return (Math.round(n * 1000) / 1000).toString();
}

// ---------------------------------------------------------------------------
// ECG printout
// ---------------------------------------------------------------------------

export interface PrintoutOptions {
  /** Paper speed. Standard is 25; some carts print 50. */
  mmPerSec?: number;
  /** Gain. Standard is 10; 5 and 20 appear on low/high-voltage tracings. */
  mmPerMv?: number;
  /** Label printed in the header, e.g. the acquisition timestamp. */
  headerText?: string;
  pageWidthMm?: number;
  pageHeightMm?: number;
  /** Draw the background grid. Off produces a gridless fixture. */
  drawGrid?: boolean;
}

/** Where a lead's 2.5 s panel sits on the page, in millimetres. */
export interface PanelGeometry {
  lead: LeadId;
  /** x of the panel's first sample. */
  xMm: number;
  /** y of the panel's isoelectric baseline. */
  baselineYMm: number;
  widthMm: number;
  /** Start of this panel's window within the 10 s record. */
  timeOffsetSec: number;
  durationSec: number;
}

/** Everything a test needs to check extraction against the drawn geometry. */
export interface PrintoutManifest {
  pageWidthMm: number;
  pageHeightMm: number;
  mmPerSec: number;
  mmPerMv: number;
  panels: PanelGeometry[];
  rhythmLead: LeadId;
  calibrationPulse: { xMm: number; widthMm: number; heightMm: number };
  gridPitchMm: number;
}

/** Standard 3x4 column order: each column holds one 2.5 s window. */
const COLUMNS: LeadId[][] = [
  ["I", "II", "III"],
  ["aVR", "aVL", "aVF"],
  ["V1", "V2", "V3"],
  ["V4", "V5", "V6"],
];

/**
 * Render a synthetic ECG as a vector PDF laid out like a clinical printout.
 *
 * Returns the PDF bytes and a manifest describing exactly where every trace was
 * drawn, so a test can assert recovered geometry against intent rather than
 * against a previous run's output.
 */
export function renderPrintoutPdf(
  ecg: SyntheticEcg,
  opts: PrintoutOptions = {},
): { pdf: Uint8Array; manifest: PrintoutManifest } {
  const mmPerSec = opts.mmPerSec ?? 25;
  const mmPerMv = opts.mmPerMv ?? 10;
  const W = opts.pageWidthMm ?? 297; // A4 landscape
  const H = opts.pageHeightMm ?? 210;
  const drawGrid = opts.drawGrid ?? true;

  const marginX = 8;
  const headerH = 16;
  const marginBottom = 8;

  // The physical column width is fixed by the paper layout; how many seconds it
  // holds therefore falls out of the paper speed. This mirrors a real cart — at
  // 50 mm/s the same strip of paper carries half as much time, it does not grow.
  const colW = 62.5;
  const colSec = colW / mmPerSec;
  const gutterW = 14; // holds the calibration pulse
  const plotX = marginX + gutterW;
  const plotW = colW * COLUMNS.length;
  const plotY = headerH;
  const plotH = H - headerH - marginBottom;
  const rowH = plotH / 4; // three lead rows plus one rhythm strip

  const cs = new ContentStream();

  // --- grid ----------------------------------------------------------------
  const gridX0 = marginX, gridX1 = W - marginX;
  const gridY0 = plotY, gridY1 = plotY + plotH;

  if (drawGrid) {
    // Small squares: 1 mm, pale. Drawn first so darker lines land on top.
    cs.strokeColor(0.98, 0.78, 0.78).lineWidth(0.08);
    for (let x = gridX0; x <= gridX1 + 1e-6; x += 1) {
      cs.polylineMm([x, gridY0, x, gridY1], H);
    }
    for (let y = gridY0; y <= gridY1 + 1e-6; y += 1) {
      cs.polylineMm([gridX0, y, gridX1, y], H);
    }
    // Large squares: 5 mm, stronger.
    cs.strokeColor(0.93, 0.55, 0.55).lineWidth(0.18);
    for (let x = gridX0; x <= gridX1 + 1e-6; x += 5) {
      cs.polylineMm([x, gridY0, x, gridY1], H);
    }
    for (let y = gridY0; y <= gridY1 + 1e-6; y += 5) {
      cs.polylineMm([gridX0, y, gridX1, y], H);
    }
  }

  // --- header --------------------------------------------------------------
  cs.fillColor(0, 0, 0);
  cs.text(marginX, 7, H, 9, opts.headerText ?? "SYNTHETIC ECG — NOT A REAL PATIENT");
  cs.text(
    marginX,
    12,
    H,
    7,
    `${mmPerSec} mm/s   ${mmPerMv} mm/mV   ${Math.round(ecg.heartRateBpm)} bpm   0.05-150 Hz`,
  );

  // --- traces --------------------------------------------------------------
  const sr = ecg.sampleRateHz;
  const panels: PanelGeometry[] = [];

  const traceOf = (
    lead: LeadId,
    startSec: number,
    durSec: number,
    xMm: number,
    baseYMm: number,
  ): number[] => {
    const sig = ecg.leads[lead];
    const i0 = Math.round(startSec * sr);
    const i1 = Math.min(sig.length, Math.round((startSec + durSec) * sr));
    const pts: number[] = [];
    for (let i = i0; i < i1; i++) {
      pts.push(
        xMm + ((i - i0) / sr) * mmPerSec,
        baseYMm - sig[i]! * mmPerMv, // y grows downward
      );
    }
    return pts;
  };

  cs.strokeColor(0.05, 0.05, 0.09).lineWidth(0.3);

  for (let c = 0; c < COLUMNS.length; c++) {
    const startSec = c * colSec;
    const xMm = plotX + c * colW;
    for (let r = 0; r < 3; r++) {
      const lead = COLUMNS[c]![r]!;
      const baseYMm = plotY + rowH * (r + 0.5);
      cs.polylineMm(traceOf(lead, startSec, colSec, xMm, baseYMm), H);
      panels.push({
        lead,
        xMm,
        baselineYMm: baseYMm,
        widthMm: colW,
        timeOffsetSec: startSec,
        durationSec: colSec,
      });
    }
  }

  // Rhythm strip: the full record in one lead, the timing authority.
  const rhythmLead: LeadId = "II";
  const rhythmBaseY = plotY + rowH * 3.5;
  const rhythmDur = Math.min(ecg.durationSec, (plotW / mmPerSec));
  cs.polylineMm(traceOf(rhythmLead, 0, rhythmDur, plotX, rhythmBaseY), H);

  // --- calibration pulses ---------------------------------------------------
  // 1 mV step, 10 mm tall at standard gain, 5 mm wide. One per row.
  const calW = 5;
  const calH = mmPerMv;
  const calX = marginX + 3;
  cs.strokeColor(0.05, 0.05, 0.09).lineWidth(0.3);
  for (let r = 0; r < 4; r++) {
    const base = plotY + rowH * (r + 0.5);
    cs.polylineMm([
      calX - 2, base,
      calX, base,
      calX, base - calH,
      calX + calW, base - calH,
      calX + calW, base,
      calX + calW + 2, base,
    ], H);
  }

  // --- lead labels ----------------------------------------------------------
  cs.fillColor(0.05, 0.05, 0.09);
  for (const p of panels) {
    cs.text(p.xMm + 1.5, p.baselineYMm - rowH / 2 + 4, H, 7, p.lead);
  }
  cs.text(plotX + 1.5, rhythmBaseY - rowH / 2 + 4, H, 7, rhythmLead);

  // --- assemble -------------------------------------------------------------
  const pdf = new PdfBuilder();
  const catalog = pdf.reserve();
  const pages = pdf.reserve();
  const page = pdf.reserve();
  const contents = pdf.reserve();
  const font = pdf.reserve();

  const streamBytes = cs.toBytes();
  const head = new TextEncoder().encode(`<< /Length ${streamBytes.length} >>\nstream\n`);
  const tail = new TextEncoder().encode("\nendstream");
  const streamObj = new Uint8Array(head.length + streamBytes.length + tail.length);
  streamObj.set(head, 0);
  streamObj.set(streamBytes, head.length);
  streamObj.set(tail, head.length + streamBytes.length);

  pdf.set(catalog, `<< /Type /Catalog /Pages ${pages} 0 R >>`);
  pdf.set(pages, `<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`);
  pdf.set(
    page,
    `<< /Type /Page /Parent ${pages} 0 R ` +
      `/MediaBox [0 0 ${f(W * PT_PER_MM)} ${f(H * PT_PER_MM)}] ` +
      `/Contents ${contents} 0 R ` +
      `/Resources << /Font << /F1 ${font} 0 R >> >> >>`,
  );
  pdf.set(contents, streamObj);
  pdf.set(font, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  return {
    pdf: pdf.build(catalog),
    manifest: {
      pageWidthMm: W,
      pageHeightMm: H,
      mmPerSec,
      mmPerMv,
      panels,
      rhythmLead,
      calibrationPulse: { xMm: calX, widthMm: calW, heightMm: calH },
      gridPitchMm: 1,
    },
  };
}

export { LEAD_IDS };

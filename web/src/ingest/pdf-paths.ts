/**
 * Recovers stroked path geometry from a PDF page.
 *
 * This is the high-accuracy ingestion path. When an ECG cart emits a vector PDF
 * the tracing is *literally* a polyline in the content stream — so instead of
 * inferring the waveform from pixels we can read the coordinates the cart drew,
 * limited only by how well we determine the millimetre scale. Every raster
 * technique downstream exists to approximate what this path gets for free.
 *
 * Output coordinates are in **device space** (y increasing downward, origin at
 * the page's top-left) at the requested scale, keeping them directly comparable
 * to the raster pipeline's pixel coordinates.
 *
 * All coordinate maths lives in `path-decode.ts`, which imports no pdf.js and is
 * therefore unit-testable outside a browser.
 */
import { getDocument, OPS, Util } from "../pdfjs.js";
import type { PDFOperatorList } from "../pdfjs.d.ts";
import { decodePath, type GState, type Matrix, type Polyline } from "./path-decode.ts";

export type { Polyline } from "./path-decode.ts";

export interface PageGeometry {
  polylines: Polyline[];
  /** Page size in device units at the requested scale. */
  width: number;
  height: number;
  /** Count of image-drawing operators, used to spot rasterized pages. */
  imageOps: number;
  /**
   * True when the page carries enough stroked geometry to digitize directly.
   * A "PDF" that is merely a photograph in a wrapper fails this and must be
   * sent down the raster pipeline instead.
   */
  isVector: boolean;
}

/**
 * A page needs at least this much stroked geometry before we trust the vector
 * path. A cart's 12-lead printout draws hundreds of segments; a scanned page
 * wrapped in a PDF draws essentially none.
 */
const MIN_VECTOR_POLYLINES = 8;

/** Ops that paint a stroke, and therefore produce a visible trace. */
const STROKE_OPS = new Set<number>([
  OPS.stroke,
  OPS.closeStroke,
  OPS.fillStroke,
  OPS.eoFillStroke,
  OPS.closeFillStroke,
  OPS.closeEOFillStroke,
]);

/** Walk an already-fetched operator list. Split out so it can be driven in tests. */
export function walkOperatorList(
  opList: PDFOperatorList,
  baseTransform: Matrix,
): { polylines: Polyline[]; imageOps: number } {
  const polylines: Polyline[] = [];
  const stack: GState[] = [];
  let imageOps = 0;

  let gs: GState = {
    ctm: [...baseTransform] as Matrix,
    lineWidth: 1,
    stroke: "#000000",
  };

  const { fnArray, argsArray } = opList;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i]!;
    const args = argsArray[i];

    switch (fn) {
      case OPS.save:
        stack.push({ ...gs, ctm: [...gs.ctm] as Matrix });
        break;

      case OPS.restore: {
        const prev = stack.pop();
        if (prev) gs = prev;
        break;
      }

      case OPS.transform:
        if (args) gs.ctm = Util.transform(gs.ctm, args as number[]);
        break;

      case OPS.setLineWidth:
        if (args) gs.lineWidth = args[0] as number;
        break;

      case OPS.setStrokeRGBColor:
        // pdf.js hands the canvas a ready-made CSS colour string.
        if (args) gs.stroke = typeof args[0] === "string" ? args[0] : null;
        break;

      case OPS.setStrokeGray: {
        const v = args?.[0];
        if (typeof v === "number") {
          const c = Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
          gs.stroke = `#${c}${c}${c}`;
        } else if (typeof v === "string") {
          gs.stroke = v;
        }
        break;
      }

      case OPS.paintImageXObject:
      case OPS.paintInlineImageXObject:
      case OPS.paintImageXObjectRepeat:
        imageOps++;
        break;

      case OPS.constructPath: {
        // args = [paintOp, [pathData], minMax]
        const paintOp = args?.[0] as number | undefined;
        if (paintOp === undefined || !STROKE_OPS.has(paintOp)) break;
        const flat = (args?.[1] as ArrayLike<number>[] | undefined)?.[0];
        if (flat && typeof flat === "object" && "length" in flat) {
          decodePath(flat, gs, polylines);
        }
        break;
      }
    }
  }

  return { polylines, imageOps };
}

/**
 * Extract stroked geometry from one page of a PDF.
 *
 * `scale` is device units per PDF point. The default of 1 keeps coordinates in
 * points (1/72 inch), which is convenient because the millimetre scale then
 * falls out of the geometry exactly: 1 mm = 72/25.4 ≈ 2.8346 points.
 */
export async function extractPageGeometry(
  data: ArrayBuffer | Uint8Array,
  pageNumber = 1,
  scale = 1,
): Promise<PageGeometry> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  // Teardown lives on the loading task, not the document proxy.
  const task = getDocument({ data: bytes });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const opList = await page.getOperatorList();
    const { polylines, imageOps } = walkOperatorList(opList, viewport.transform);
    page.cleanup();

    return {
      polylines,
      width: viewport.width,
      height: viewport.height,
      imageOps,
      isVector: polylines.length >= MIN_VECTOR_POLYLINES,
    };
  } finally {
    await task.destroy();
  }
}

/** Points per millimetre in PDF user space. */
export const POINTS_PER_MM = 72 / 25.4;

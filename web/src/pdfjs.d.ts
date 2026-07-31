/** Hand-written types for the pdf.js surface we actually use. */

/** A 6-element PDF transformation matrix `[a, b, c, d, e, f]`. */
export type Matrix = [number, number, number, number, number, number];

export interface PDFViewport {
  /** Maps PDF user space to device space, including the y-axis flip. */
  transform: Matrix;
  width: number;
  height: number;
  scale: number;
}

export interface PDFOperatorList {
  fnArray: number[];
  // deno-lint-ignore no-explicit-any
  argsArray: any[][];
}

export interface PDFPageProxy {
  getViewport(params: { scale: number; rotation?: number }): PDFViewport;
  getOperatorList(): Promise<PDFOperatorList>;
  // deno-lint-ignore no-explicit-any
  getTextContent(): Promise<{ items: any[] }>;
  // deno-lint-ignore no-explicit-any
  render(params: any): { promise: Promise<void> };
  cleanup(): void;
}

export interface PDFDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PDFPageProxy>;
}

/** Teardown lives here rather than on the document proxy. */
export interface PDFDocumentLoadingTask {
  promise: Promise<PDFDocumentProxy>;
  destroy(): Promise<void>;
}

export function getDocument(
  src: { data: ArrayBuffer | Uint8Array } | { url: string } | string,
): PDFDocumentLoadingTask;

export const OPS: Record<string, number>;

export const Util: {
  transform(m1: Matrix | number[], m2: Matrix | number[]): Matrix;
  applyTransform(p: number[], m: Matrix | number[]): [number, number];
};

/**
 * Development harness for the vector ingestion path.
 *
 * Renders a fixture PDF with pdf.js on the left and draws the geometry our
 * extractor recovered on the right. If the two pictures differ, extraction is
 * wrong — which is a far faster feedback loop than reading coordinate dumps.
 */
import { assetUrl } from "./app/site.ts";
import { getDocument } from "./pdfjs.js";
import { extractPageGeometry, POINTS_PER_MM } from "./ingest/pdf-paths.ts";
import { classifyPolylines } from "./ingest/classify.ts";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const RENDER_SCALE = 2;

async function renderReference(bytes: Uint8Array, canvas: HTMLCanvasElement): Promise<void> {
  const task = getDocument({ data: bytes });
  const doc = await task.promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  await task.destroy();
}

function drawRecovered(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  groups: { polys: { points: Float64Array }[]; color: string; lineWidth: number }[],
): void {
  canvas.width = width * RENDER_SCALE;
  canvas.height = height * RENDER_SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(RENDER_SCALE, RENDER_SCALE);

  for (const g of groups) {
    ctx.strokeStyle = g.color;
    ctx.lineWidth = g.lineWidth;
    ctx.beginPath();
    for (const p of g.polys) {
      const pts = p.points;
      if (pts.length < 4) continue;
      ctx.moveTo(pts[0]!, pts[1]!);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
    }
    ctx.stroke();
  }
}

async function run(): Promise<void> {
  const name = $<HTMLSelectElement>("fixture").value;
  const report = $("report");
  const timing = $("timing");
  report.textContent = "Loading…";

  try {
    const res = await fetch(assetUrl(`fixtures/synthetic/${name}.pdf`));
    if (!res.ok) throw new Error(`fixture fetch failed: ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());

    const t0 = performance.now();
    // pdf.js transfers the buffer it is handed, so give each consumer its own copy.
    const geom = await extractPageGeometry(bytes.slice(), 1, 1);
    const tExtract = performance.now() - t0;

    const cls = classifyPolylines(geom.polylines);

    await renderReference(bytes.slice(), $<HTMLCanvasElement>("render"));

    drawRecovered($<HTMLCanvasElement>("recovered"), geom.width, geom.height, [
      { polys: cls.grid, color: "#f0b4b4", lineWidth: 0.25 },
      { polys: cls.other, color: "#1b8f3a", lineWidth: 0.7 },
      { polys: cls.traces, color: "#0d1020", lineWidth: 0.45 },
    ]);

    timing.textContent = `extract ${tExtract.toFixed(0)} ms`;

    const pitch = cls.gridPitch;
    const mmX = pitch ? pitch.x / POINTS_PER_MM : NaN;
    const mmY = pitch ? pitch.y / POINTS_PER_MM : NaN;

    const traceSummary = cls.traces
      .slice()
      .sort((a, b) => a.minY - b.minY || a.minX - b.minX)
      .map((t, i) =>
        `  ${String(i).padStart(2)}  x ${t.minX.toFixed(1)}–${t.maxX.toFixed(1)}  ` +
        `y ${t.minY.toFixed(1)}–${t.maxY.toFixed(1)}  ` +
        `pts ${String(t.points.length / 2).padStart(5)}  ` +
        `w ${t.lineWidth.toFixed(2)}  ${t.stroke ?? "?"}`
      )
      .join("\n");

    report.textContent = [
      `page          ${geom.width.toFixed(1)} x ${geom.height.toFixed(1)} pt ` +
      `(${(geom.width / POINTS_PER_MM).toFixed(1)} x ${(geom.height / POINTS_PER_MM).toFixed(1)} mm)`,
      `isVector      ${geom.isVector}   imageOps ${geom.imageOps}`,
      `polylines     ${geom.polylines.length}`,
      `  grid        ${cls.grid.length}  (${cls.gridLineCount.x} vertical, ${cls.gridLineCount.y} horizontal)`,
      `  traces      ${cls.traces.length}`,
      `  other       ${cls.other.length}`,
      "",
      `grid pitch    ${pitch ? `${pitch.x.toFixed(4)} x ${pitch.y.toFixed(4)} pt` : "not detected"}`,
      `              ${pitch ? `= ${mmX.toFixed(4)} x ${mmY.toFixed(4)} mm  (expect 1.0000)` : ""}`,
      `              ${
        pitch
          ? `error ${((mmX - 1) * 1000).toFixed(2)} / ${((mmY - 1) * 1000).toFixed(2)} µm`
          : ""
      }`,
      "",
      "traces (sorted by row, then column):",
      traceSummary || "  none",
    ].join("\n");
  } catch (err) {
    report.textContent = `ERROR\n${err instanceof Error ? (err.stack ?? err.message) : err}`;
  }
}

$("run").addEventListener("click", () => void run());
$<HTMLSelectElement>("fixture").addEventListener("change", () => void run());
void run();

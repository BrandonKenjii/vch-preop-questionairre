// Quick probe: do checkbox marks render in downloaded-asdf.pdf vs the
// cleaned template? Counts dark pixels in a few representative field rects.
import { readFileSync } from "node:fs";
import { createCanvas, Path2D, ImageData, DOMMatrix } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

globalThis.Path2D = Path2D;
globalThis.ImageData = ImageData;
globalThis.DOMMatrix = DOMMatrix;

const SCALE = 2;

async function renderPage(file, pageNum) {
  const bytes = new Uint8Array(readFileSync(new URL(`./${file}`, import.meta.url)));
  const doc = await getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale: SCALE });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return { canvas, ctx, viewport };
}

function countDark(canvas, viewport, rect) {
  const [x1, y1] = viewport.convertToViewportPoint(rect.x, rect.y + rect.h);
  const [x2, y2] = viewport.convertToViewportPoint(rect.x + rect.w, rect.y);
  const ctx = canvas.getContext("2d");
  const pad = 4;
  const img = ctx.getImageData(
    Math.max(0, Math.floor(x1) - pad),
    Math.max(0, Math.floor(y1) - pad),
    Math.ceil(x2 - x1) + pad * 2,
    Math.ceil(y2 - y1) + pad * 2
  );
  let dark = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const lum = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
    if (lum < 200) dark++;
  }
  return dark;
}

// Representative checkboxes: [page, fieldName, x, y, w, h]
const probes = [
  [1, "CB4 patient-radio", 275.8, 624.6, 7.2, 7.2],
  [1, "CB10 anesthesia-NO", 216.7, 333.4, 19.4, 18.7],
  [1, "CB11 anesthesia-YES", 249.8, 333.4, 19.4, 18.7],
  [1, "CB19 functional-some", 335.2, 128.3, 7.2, 7.2],
  [2, "CB33 activity-once", 277.9, 578.2, 7.2, 7.2],
  [7, "CB189 pain-3", 300.6, 603, 10.4, 10.1],
  [9, "CB300 kg", 270, 179.7, 7.2, 7.2],
];

const pages = {};
async function pageFor(file, n) {
  const key = `${file}-${n}`;
  pages[key] ??= await renderPage(file, n);
  return pages[key];
}

console.log("field                         | template | output | delta");
for (const [page, name, x, y, w, h] of probes) {
  const rect = { x, y, w, h };
  const t = await pageFor("cleaned.pdf", page);
  const o = await pageFor("downloaded-asdf.pdf", page);
  const td = countDark(t.canvas, t.viewport, rect);
  const od = countDark(o.canvas, o.viewport, rect);
  const verdict = od - td > 10 ? "MARK" : od - td < -10 ? "REMOVED" : "none";
  console.log(
    `p${page} ${name.padEnd(28)} | ${String(td).padStart(6)}   | ${String(od).padStart(6)} | ${String(od - td).padStart(5)} ${verdict}`
  );
}

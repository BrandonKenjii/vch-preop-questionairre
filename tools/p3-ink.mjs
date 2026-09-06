// Pixel analysis of page 3 region x 270..520, y 125..175 (PDF coords):
// prints dark-ink pixel count per rendered row for both cleaned.pdf (blank)
// and downloaded-asdf.pdf, so label ink and value ink rows can be compared.
import { readFileSync } from "node:fs";
import { createCanvas, Path2D, ImageData, DOMMatrix } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

globalThis.Path2D = Path2D;
globalThis.ImageData = ImageData;
globalThis.DOMMatrix = DOMMatrix;

async function rowInk(pdfPath, pageNum) {
  const bytes = new Uint8Array(readFileSync(new URL(pdfPath, import.meta.url)));
  const doc = await getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 3 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  // PDF region -> viewport pixel rect (PDF y up, viewport y down)
  const [x1, yTop] = viewport.convertToViewportPoint(270, 175);
  const [x2, yBot] = viewport.convertToViewportPoint(520, 125);
  const img = ctx.getImageData(Math.floor(x1), Math.floor(yTop), Math.ceil(x2 - x1), Math.ceil(yBot - yTop));
  const rows = [];
  for (let r = 0; r < img.height; r++) {
    let dark = 0;
    for (let c = 0; c < img.width; c++) {
      const i = (r * img.width + c) * 4;
      if (0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2] < 180) dark++;
    }
    rows.push(dark);
  }
  return rows;
}

const [blank, filled] = await Promise.all([rowInk("./cleaned.pdf", 3), rowInk("./downloaded-asdf.pdf", 3)]);
console.log("row ink profile (per viewport row; PDF y decreases downward):");
console.log("PDFy   viewY  blank filled");
for (let r = 0; r < blank.length; r++) {
  const pdfY = 175 - (r / 3); // approx pdf y at row top (scale 3)
  console.log(`${pdfY.toFixed(1).padStart(6)} ${String(r).padStart(6)} ${String(blank[r]).padStart(5)} ${String(filled[r]).padStart(6)}`);
}

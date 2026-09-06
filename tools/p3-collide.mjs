// 2D collision check on page 3 band PDF y 158.3..160.3 (rows where value ink
// may overlap label ink). For each row, list dark-pixel x-intervals for
// blank (label only) vs filled (label+value) and mark x-ranges where BOTH
// have ink (true collision).
import { readFileSync } from "node:fs";
import { createCanvas, Path2D, ImageData, DOMMatrix } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

globalThis.Path2D = Path2D;
globalThis.ImageData = ImageData;
globalThis.DOMMatrix = DOMMatrix;

async function bandPixels(pdfPath, pageNum, x0, yTop, x1, yBot) {
  const bytes = new Uint8Array(readFileSync(new URL(pdfPath, import.meta.url)));
  const doc = await getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 3 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  const [px1, py1] = viewport.convertToViewportPoint(x0, yTop);
  const [px2, py2] = viewport.convertToViewportPoint(x1, yBot);
  const img = ctx.getImageData(Math.floor(px1), Math.floor(py1), Math.ceil(px2 - px1), Math.ceil(py2 - py1));
  // return array of rows, each row = array of x-indices that are dark
  const rows = [];
  for (let r = 0; r < img.height; r++) {
    const dark = [];
    for (let c = 0; c < img.width; c++) {
      const i = (r * img.width + c) * 4;
      if (0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2] < 180) dark.push(c);
    }
    rows.push(dark);
  }
  return { rows, viewX: px1, viewY: py1 };
}

const X0 = 270, X1 = 520, YTOP = 160.5, YBOT = 157.5; // PDF coords
const [blank, filled] = await Promise.all([
  bandPixels("./cleaned.pdf", 3, X0, YTOP, X1, YBOT),
  bandPixels("./downloaded-asdf.pdf", 3, X0, YTOP, X1, YBOT),
]);

function runs(arr, scaleX) {
  // compress dark indices into runs
  const r = [];
  let s = null, p = -2;
  for (const i of arr) {
    if (s === null) { s = i; p = i; continue; }
    if (i === p + 1) { p = i; continue; }
    r.push([Math.round((s + X0) / scaleX * 10) / 10, Math.round((p + X0) / scaleX * 10) / 10]);
    s = i; p = i;
  }
  if (s !== null) r.push([Math.round((s + X0) / scaleX * 10) / 10, Math.round((p + X0) / scaleX * 10) / 10]);
  return r;
}

console.log("band rows (PDF y from top to bottom of band), dark x-runs in PDF x units:");
for (let r = 0; r < blank.rows.length; r++) {
  const pdfY = (YTOP - r / 3).toFixed(2);
  const b = runs(blank.rows[r], 3);
  const f = runs(filled.rows[r], 3);
  // collision: x indices dark in BOTH
  const bSet = new Set(blank.rows[r]);
  const collide = filled.rows[r].filter((i) => bSet.has(i));
  const c = runs(collide, 3);
  console.log(`PDFy=${pdfY} blank:[${b.map((x) => `${x[0]}-${x[1]}`).join(" ")}] filled:[${f.map((x) => `${x[0]}-${x[1]}`).join(" ")}] BOTH-INK:[${c.map((x) => `${x[0]}-${x[1]}`).join(" ")}]`);
}

// Check the drawn computed values and dates for collisions with static text,
// using the same exact-ink method: [page, str, baseline x, y, approx width].
import { readFileSync } from "node:fs";
import { createCanvas, Path2D, ImageData, DOMMatrix } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

globalThis.Path2D = Path2D;
globalThis.ImageData = ImageData;
globalThis.DOMMatrix = DOMMatrix;

const SCALE = 4;
const THRESH = 200;

async function loadDoc(pdfPath) {
  const bytes = new Uint8Array(readFileSync(new URL(pdfPath, import.meta.url)));
  return getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
}
async function renderPage(doc, pageNum) {
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale: SCALE });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return { viewport, img: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}

const docBlank = await loadDoc("./cleaned.pdf");
const docFilled = await loadDoc("./downloaded-asdf.pdf");

const drawn = [
  { page: 2, str: "6", x: 536, y: 594, w: 6 },
  { page: 6, str: "4", x: 536, y: 47, w: 6 },
  { page: 9, str: "81.3", x: 534, y: 181, w: 16 },
  { page: 1, str: "2026-08-25", x: 99.6, y: 666.5, w: 55 },
  { page: 9, str: "2026-08-25", x: 59.3, y: 55.7, w: 55 },
];

function dark(img, vx, vy, width) {
  if (vx < 0 || vy < 0 || vx >= width) return false;
  const i = (vy * width + vx) * 4;
  return 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2] < THRESH;
}

for (const v of drawn) {
  const { viewport, img: fi } = await renderPage(docFilled, v.page);
  const { img: bi } = await renderPage(docBlank, v.page);
  const [vx0, vy0] = viewport.convertToViewportPoint(v.x - 2, v.y + 10);
  const [vx1, vy1] = viewport.convertToViewportPoint(v.x + v.w + 2, v.y - 4);
  const X0 = Math.max(0, Math.floor(vx0)), Y0 = Math.max(0, Math.floor(vy0));
  const X1 = Math.min(fi.width, Math.ceil(vx1)), Y1 = Math.min(fi.height, Math.ceil(vy1));
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
    if (dark(fi, x, y, fi.width) && !dark(bi, x, y, bi.width)) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) { console.log(`p${v.page} "${v.str}": NO ADDED INK`); continue; }
  let collide = 0, added = 0;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const dF = dark(fi, x, y, fi.width);
    const dB = dark(bi, x, y, bi.width);
    if (dF && !dB) added++;
    else if (dF && dB) collide++;
  }
  console.log(`p${v.page} "${v.str}" at(${v.x},${v.y}): inkBBox x${(minX / SCALE).toFixed(1)}..${(maxX / SCALE).toFixed(1)} y${(v.y + 10 - (maxY - minY + 1) / SCALE).toFixed(1)}..${(v.y + 10).toFixed(1)} collision=${(collide / (SCALE * SCALE)).toFixed(2)}pt^2 valueInk=${added}px`);
}

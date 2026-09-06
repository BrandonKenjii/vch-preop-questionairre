// Exact ink-collision check. For every non-static text item (value) on pages
// 1-9 of downloaded-asdf.pdf:
//   1. render the page region at scale 4 (blank cleaned.pdf and filled
//      downloaded-asdf.pdf)
//   2. value ink = pixels dark in filled but not dark in blank (values are
//      the only added content in these regions)
//   3. collision = pixels dark in blank (static ink) that lie INSIDE the
//      value ink's bounding box -> value text is drawn on top of static text
// Reports collision area in pt^2 per value item (only nonzero ones printed).
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

const cache = new Map();
async function getPage(doc, p) {
  const k = doc === docBlank ? `b${p}` : `f${p}`;
  if (!cache.has(k)) cache.set(k, await renderPage(doc, p));
  return cache.get(k);
}

// value items: page, str, x (baseline), y (baseline), w (advance width)
const values = [];
for (const p of JSON.parse(readFileSync(new URL("./crosscheck.json", import.meta.url), "utf8")).pages) {
  for (const v of p.values) {
    values.push({ page: p.page, str: v.str, x: v.x, y: v.y, w: v.str.length * 5.0 }); // approx width fallback
  }
}
// better widths: re-extract with widths
const docVals = await loadDoc("./downloaded-asdf.pdf");
for (const it of values) {
  const page = await docVals.getPage(it.page);
  const content = await page.getTextContent();
  const match = content.items.find(
    (i) => typeof i.str === "string" && i.str === it.str && Math.abs(i.transform[4] - it.x) < 0.6 && Math.abs(i.transform[5] - it.y) < 0.6
  );
  if (match) it.w = match.width;
}

function dark(img, vx, vy, width) {
  if (vx < 0 || vy < 0 || vx >= width) return false;
  const i = (vy * width + vx) * 4;
  return 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2] < THRESH;
}

let totalCollision = 0;
for (const v of values) {
  const { viewport, img: filledImg } = await getPage(docFilled, v.page);
  const { img: blankImg } = await getPage(docBlank, v.page);
  // search region (PDF coords)
  const rx0 = v.x - 2, rx1 = v.x + v.w + 2;
  const ry0 = v.y - 4, ry1 = v.y + 10;
  const [vx0, vy0] = viewport.convertToViewportPoint(rx0, ry1); // top-left (viewport y down)
  const [vx1, vy1] = viewport.convertToViewportPoint(rx1, ry0);
  const X0 = Math.max(0, Math.floor(vx0)), Y0 = Math.max(0, Math.floor(vy0));
  const X1 = Math.min(filledImg.width, Math.ceil(vx1)), Y1 = Math.min(filledImg.height, Math.ceil(vy1));
  // find value ink bbox (added pixels)
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let y = Y0; y < Y1; y++) {
    for (let x = X0; x < X1; x++) {
      if (dark(filledImg, x, y, filledImg.width) && !dark(blankImg, x, y, blankImg.width)) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    console.log(`p${v.page} "${v.str}" (${v.x},${v.y}): NO ADDED INK FOUND`);
    continue;
  }
  // collision pixels: dark in blank inside value ink bbox
  let collide = 0, added = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dF = dark(filledImg, x, y, filledImg.width);
      const dB = dark(blankImg, x, y, blankImg.width);
      if (dF && !dB) added++;
      else if (dF && dB) collide++;
    }
  }
  const areaPt2 = (collide / (SCALE * SCALE)).toFixed(2);
  if (collide > 0) {
    totalCollision += collide;
    const [bx0, by0] = viewport.convertToViewportPoint(v.x, v.y + 7);
    const [bx1, by1] = viewport.convertToViewportPoint(v.x + v.w, v.y - 2.5);
    console.log(
      `p${v.page} "${v.str}" baseline(${v.x},${v.y}) inkBBoxPt(x${(minX / SCALE).toFixed(1)}..${(maxX / SCALE).toFixed(1)}, y${(v.y + 7 - (maxY - minY + 1) / SCALE + 0).toFixed(1)}..${(v.y + 7).toFixed(1)}): collision=${collide}px=${areaPt2}pt^2, valueInk=${added}px`
    );
  }
}
console.log(`total collision pixels: ${totalCollision}`);

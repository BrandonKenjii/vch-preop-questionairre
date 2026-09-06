// Pixel-level collision verification for every flagged value/static overlap.
// For each pair: render blank (cleaned.pdf) and filled (downloaded-asdf.pdf)
// in the union region at scale 4, count pixels that are dark in BOTH (value
// ink drawn exactly on top of static ink) inside the value's box, and pixels
// dark only in filled (value ink over blank area).
import { readFileSync } from "node:fs";
import { createCanvas, Path2D, ImageData, DOMMatrix } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

globalThis.Path2D = Path2D;
globalThis.ImageData = ImageData;
globalThis.DOMMatrix = DOMMatrix;

const SCALE = 4;
const THRESH = 200;

async function renderDoc(pdfPath) {
  const bytes = new Uint8Array(readFileSync(new URL(pdfPath, import.meta.url)));
  const doc = await getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
  return doc;
}
const docBlank = await renderDoc("./cleaned.pdf");
const docFilled = await renderDoc("./downloaded-asdf.pdf");

async function renderPage(doc, pageNum) {
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale: SCALE });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return { page, viewport, ctx, img: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}

const cache = new Map();
async function getImg(doc, pageNum) {
  const key = doc === docBlank ? `b${pageNum}` : `f${pageNum}`;
  if (!cache.has(key)) cache.set(key, await renderPage(doc, pageNum));
  return cache.get(key);
}

// pairs from the overlap-check run: [page, valueStr, valueBox, staticStr, staticBox]
const pairs = [
  [2, "123", [272.1, 147.6, 287.1, 156.6], "Do you use only at night? Yes", [246.3, 155.5, 378.7, 165.5]],
  [2, "123123", [248.9, 48.4, 278.9, 57.4], "Where and when", [246.3, 56.0, 322.3, 66.0]],
  [3, "asdfasdfasdf", [279.9, 144.2, 331.0, 153.2], "Please describe the nature of your condition", [279.8, 148.6, 475.8, 158.6]],
  [3, "asdfasdf", [279.9, 519.3, 313.9, 528.3], "What brings it on/triggers", [279.8, 526.9, 392.1, 536.9]],
  [3, "asdfasdf", [279.9, 492.1, 313.9, 501.1], "What brings it on/triggers", [279.8, 499.7, 392.1, 509.7]],
  [3, "asdfasdf", [279.9, 437.5, 313.9, 446.5], "What brings it on/triggers", [279.8, 445.1, 392.1, 455.1]],
  [3, "123423", [279.9, 371.8, 309.9, 380.8], "had your operation", [279.8, 378.8, 363.4, 388.8]],
  [3, "123123", [279.9, 345.5, 309.9, 354.5], "Please describe your valve issue", [279.8, 353.2, 425.7, 363.2]],
  [3, "asdfasdf", [279.9, 315.5, 313.9, 324.5], "operations", [279.8, 322.5, 326.8, 332.5]],
  [4, "asdfasdf", [246.5, 625.5, 280.5, 634.5], "When, where", [246.3, 633.9, 305.5, 643.9]],
  [6, "234234", [398.8, 358.6, 428.8, 367.6], "4 or more drinks (if female) or 5 or more", [246.3, 367.0, 423.1, 377.0]],
  [6, "asdf", [246.6, 248.7, 263.6, 257.7], "If yes, where do you experience pain?", [246.3, 257.1, 414.9, 267.1]],
  [7, "asdfasdf", [280.4, 544.6, 314.4, 553.6], "Name, dose, frequency", [279.8, 551.5, 383.4, 561.5]],
  [8, "asdfasdf", [247.3, 202.0, 281.3, 211.0], "Where have you had treatment", [246.3, 208.5, 383.7, 218.5]],
  [9, "asdfasdf", [281.6, 244.4, 315.6, 253.4], "Please specify", [279.8, 251.8, 344.9, 261.8]],
];

for (const [pageNum, vStr, vBox, sStr, sBox] of pairs) {
  const { viewport: vb, img: ib } = await getImg(docBlank, pageNum);
  const { viewport: vf, img: if_ } = await getImg(docFilled, pageNum);
  // union region
  const x0 = Math.min(vBox[0], sBox[0]) - 2, y0 = Math.min(vBox[1], sBox[1]) - 2;
  const x1 = Math.max(vBox[2], sBox[2]) + 2, y1 = Math.max(vBox[3], sBox[3]) + 2;
  const [vx0, vy0] = vb.convertToViewportPoint(x0, y1); // viewport y grows down
  const [vx1, vy1] = vb.convertToViewportPoint(x1, y0);
  const W = Math.ceil(vx1 - vx0), H = Math.ceil(vy1 - vy0);
  // value box in viewport coords (filled doc viewport; same transform)
  const [va0, vab] = vf.convertToViewportPoint(vBox[0], vBox[3]);
  const [va1, vat] = vf.convertToViewportPoint(vBox[2], vBox[1]);
  // per-pixel: dark in blank? dark in filled? — only inside the value box
  let both = 0, onlyFilled = 0, onlyBlank = 0, none = 0;
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const vx = Math.floor(vx0) + c, vy = Math.floor(vy0) + r;
      if (vx < va0 || vx > va1 || vy < vat || vy > vab) continue; // outside value box
      const bi = (vy * ib.width + vx) * 4;
      const fi = (vy * if_.width + vx) * 4;
      const darkB = 0.299 * ib.data[bi] + 0.587 * ib.data[bi + 1] + 0.114 * ib.data[bi + 2] < THRESH;
      const darkF = 0.299 * if_.data[fi] + 0.587 * if_.data[fi + 1] + 0.114 * if_.data[fi + 2] < THRESH;
      if (darkB && darkF) both++;
      else if (darkF) onlyFilled++;
      else if (darkB) onlyBlank++;
      else none++;
    }
  }
  const pt2 = SCALE * SCALE;
  console.log(
    `p${pageNum} "${vStr}" vs "${sStr}": collision=${both}px (${(both / pt2).toFixed(2)}pt^2) valueOnly=${onlyFilled}px blankOnly=${onlyBlank}px`
  );
}

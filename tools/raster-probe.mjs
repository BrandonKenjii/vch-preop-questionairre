// Small reusable probe: renders one page of one PDF at scale 2 and reports
// dark-pixel counts + optional text items for named PDF-space rects.
// Usage: node raster-probe.mjs <file> <page> [--rect name,x,y,w,h ...] [--text]
import { readFileSync } from "node:fs";
import { createCanvas, Path2D, ImageData, DOMMatrix } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

globalThis.Path2D = Path2D;
globalThis.ImageData = ImageData;
globalThis.DOMMatrix = DOMMatrix;

const SCALE = 2;
const [fileArg, pageArg, ...rest] = process.argv.slice(2);
const file = new URL(fileArg, import.meta.url);
const pageNum = Number(pageArg);

const rectArgs = [];
let wantText = false;
for (const a of rest) {
  if (a === "--text") wantText = true;
  else if (a.startsWith("--rect")) {
    const parts = a.slice(6).split(",");
    rectArgs.push({ name: parts[0], x: +parts[1], y: +parts[2], w: +parts[3], h: +parts[4] });
  }
}

const task = getDocument({
  data: new Uint8Array(readFileSync(file)),
  useWorkerFetch: false,
  isEvalSupported: false,
  useSystemFonts: true,
});
const doc = await task.promise;
const page = await doc.getPage(pageNum);
const viewport = page.getViewport({ scale: SCALE });
const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
const ctx = canvas.getContext("2d");
await page.render({ canvasContext: ctx, viewport, canvas }).promise;
console.log(`page ${pageNum} ${viewport.width}x${viewport.height}`);

for (const r of rectArgs) {
  const [x1, y1] = viewport.convertToViewportPoint(r.x, r.y);
  const [x2, y2] = viewport.convertToViewportPoint(r.x + r.w, r.y + r.h);
  const rx = Math.round(Math.min(x1, x2));
  const ry = Math.round(Math.min(y1, y2));
  const rw = Math.max(1, Math.round(Math.abs(x2 - x1)));
  const rh = Math.max(1, Math.round(Math.abs(y2 - y1)));
  const data = ctx.getImageData(rx, ry, rw, rh).data;
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 < 200) dark++;
  }
  // center pixel luminance (ring vs solid box discriminator)
  const cx = data[Math.floor(rw / 2) * 4 * rh + Math.floor(rh / 2) * 4];
  console.log(`${r.name}: dark=${dark}/${rw * rh} ratio=${(dark / (rw * rh)).toFixed(3)} centerLum=${cx}`);
}

if (wantText) {
  const tc = await page.getTextContent();
  const items = tc.items
    .filter((it) => typeof it.str === "string" && it.str.trim() !== "")
    .map((it) => ({ str: it.str, x: Math.round(it.transform[4] * 10) / 10, y: Math.round(it.transform[5] * 10) / 10 }))
    .sort((a, b) => (Math.abs(b.y - a.y) > 1.5 ? b.y - a.y : a.x - b.x));
  const ymin = Math.min(...rectArgs.map((r) => r.y - 5), 0);
  const ymax = Math.max(...rectArgs.map((r) => r.y + r.h + 5), 800);
  for (const it of items) {
    if (it.y >= ymin && it.y <= ymax) console.log(`  text y=${it.y} x=${it.x} | ${it.str}`);
  }
}

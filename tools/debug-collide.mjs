import { readFileSync } from "node:fs";
import { createCanvas, Path2D, ImageData, DOMMatrix } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

globalThis.Path2D = Path2D;
globalThis.ImageData = ImageData;
globalThis.DOMMatrix = DOMMatrix;

const SCALE = 4;
const bytes = new Uint8Array(readFileSync(new URL("./downloaded-asdf.pdf", import.meta.url)));
const doc = await getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
const page = await doc.getPage(2);
const viewport = page.getViewport({ scale: SCALE });
console.log("page2 viewport:", viewport.width, viewport.height);
const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
const ctx = canvas.getContext("2d");
await page.render({ canvasContext: ctx, viewport, canvas }).promise;
const img = ctx.getImageData(0, 0, canvas.width, canvas.height);

// value box for p2 "123": [272.1, 147.6, 287.1, 156.6]
const [va0, vat] = viewport.convertToViewportPoint(272.1, 156.6);
const [va1, vab] = viewport.convertToViewportPoint(287.1, 147.6);
console.log("value box viewport:", va0, vat, "to", va1, vab);
let dark = 0;
for (let vy = Math.floor(vat); vy <= Math.ceil(vab); vy++) {
  for (let vx = Math.floor(va0); vx <= Math.ceil(va1); vx++) {
    const i = (vy * img.width + vx) * 4;
    const lum = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
    if (lum < 200) dark++;
  }
}
console.log("dark px inside value box:", dark);
// sample pixels around where value should be
for (const [sx, sy] of [[1090, 2560], [1100, 2560], [1110, 2560], [1120, 2560], [1130, 2560]]) {
  const i = (sy * img.width + sx) * 4;
  console.log(`px(${sx},${sy}) rgba=`, img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]);
}

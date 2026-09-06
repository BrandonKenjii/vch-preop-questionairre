// Dumps the page /Resources /XObject dict (form XObjects baked by pdf-lib
// flatten) for a given file+page, listing stream sizes and first bytes, so we
// can see whether checkbox appearance XObjects are empty.
// Also probes a PDF-space rect's rendered ink + extractable text.
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName, PDFDict, PDFStream, PDFRawStream } from "pdf-lib";
import { createCanvas, Path2D, ImageData, DOMMatrix } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

globalThis.Path2D = Path2D;
globalThis.ImageData = ImageData;
globalThis.DOMMatrix = DOMMatrix;

const [fileArg, pageArg, ...rest] = process.argv.slice(2);
const file = new URL(fileArg, import.meta.url);
const pageNum = Number(pageArg);

const doc = await PDFDocument.load(readFileSync(file), { ignoreEncryption: true, updateMetadata: false });
const page = doc.getPages()[pageNum - 1];
const res = page.node.Resources();
console.log(`== ${fileArg} page ${pageNum} ==`);
const xo = res?.get(PDFName.of("XObject"));
if (xo) {
  let xoDict = null;
  try { xoDict = doc.context.lookup(xo, PDFDict); } catch { xoDict = null; }
  if (xoDict instanceof PDFDict) {
    const names = xoDict.keys();
    console.log(`XObject entries: ${names.length}`);
    let total = 0;
    for (const k of names) {
      let v;
      try { v = doc.context.lookup(xoDict.get(k)); } catch { v = null; }
      if (v instanceof PDFStream || v instanceof PDFRawStream) {
        const b = v.getContents();
        const head = b.toString("latin1").slice(0, 140).replace(/\n/g, "\\n");
        console.log(`  ${k}: stream(${b.length}b) ${JSON.stringify(head)}`);
        total += b.length;
      } else {
        console.log(`  ${k}: ${typeof v}`);
      }
    }
    console.log(`total XObject bytes: ${total}`);
  } else {
    console.log(`XObject not a dict: ${xo?.toString?.() ?? typeof xo}`);
  }
} else {
  console.log("no /Resources /XObject");
}

// ---- raster probe on same page ----
const task = getDocument({
  data: new Uint8Array(readFileSync(file)),
  useWorkerFetch: false,
  isEvalSupported: false,
  useSystemFonts: true,
});
const pd = await task.promise;
const pp = await pd.getPage(pageNum);
const viewport = pp.getViewport({ scale: 2 });
const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
const ctx = canvas.getContext("2d");
await pp.render({ canvasContext: ctx, viewport, canvas }).promise;

for (const r of rest) {
  const [name, x, y, w, h] = r.split(",");
  const [x1, y1] = viewport.convertToViewportPoint(+x, +y);
  const [x2, y2] = viewport.convertToViewportPoint(+x + +w, +y + +h);
  const rx = Math.round(Math.min(x1, x2));
  const ry = Math.round(Math.min(y1, y2));
  const rw = Math.max(1, Math.round(Math.abs(x2 - x1)));
  const rh = Math.max(1, Math.round(Math.abs(y2 - y1)));
  const data = ctx.getImageData(rx, ry, rw, rh).data;
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 < 200) dark++;
  }
  console.log(`rect ${name}: dark=${dark}/${rw * rh} ratio=${(dark / (rw * rh)).toFixed(3)}`);
}

const tc = await pp.getTextContent();
const items = tc.items
  .filter((it) => typeof it.str === "string" && it.str.trim() !== "")
  .map((it) => ({ str: it.str, x: Math.round(it.transform[4] * 10) / 10, y: Math.round(it.transform[5] * 10) / 10, h: Math.round((it.height ?? 0) * 10) / 10 }))
  .sort((a, b) => (Math.abs(b.y - a.y) > 1.5 ? b.y - a.y : a.x - b.x));
console.log("text items (all):");
for (const it of items) console.log(`  y=${it.y} x=${it.x} h=${it.h} | ${it.str}`);

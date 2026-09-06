// Print page-3 text items in y range 130..200 (output PDF), sorted by y, to
// see the exact layout around the heart_pvd_describe value.
import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas, Path2D, ImageData, DOMMatrix } from "@napi-rs/canvas";

globalThis.Path2D = Path2D;
globalThis.ImageData = ImageData;
globalThis.DOMMatrix = DOMMatrix;

const bytes = new Uint8Array(readFileSync(new URL("./downloaded-asdf.pdf", import.meta.url)));
const doc = await getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
const page = await doc.getPage(3);
const content = await page.getTextContent();
const rows = content.items
  .filter((it) => typeof it.str === "string" && it.str.trim() !== "")
  .map((it) => ({ str: it.str, x: Math.round(it.transform[4] * 10) / 10, y: Math.round(it.transform[5] * 10) / 10 }))
  .filter((it) => it.y >= 130 && it.y <= 200)
  .sort((a, b) => b.y - a.y);
for (const r of rows) console.log(`y=${String(r.y).padStart(6)} x=${String(r.x).padStart(6)} | ${r.str}`);

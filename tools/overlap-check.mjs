// Overlap check: does any non-static (value) text item on pages 1-9 of
// downloaded-asdf.pdf intersect a static form text item's bounding box?
// Flags boxes overlapping by more than a trivial margin, which would
// indicate values drawn on top of labels.
import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas, Path2D, ImageData, DOMMatrix } from "@napi-rs/canvas";

globalThis.Path2D = Path2D;
globalThis.ImageData = ImageData;
globalThis.DOMMatrix = DOMMatrix;

async function items(pdfPath) {
  const bytes = new Uint8Array(readFileSync(new URL(pdfPath, import.meta.url)));
  const doc = await getDocument({
    data: bytes,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;
  const out = [];
  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1);
    const content = await page.getTextContent();
    out.push(
      content.items
        .filter((it) => typeof it.str === "string" && it.str.trim() !== "")
        .map((it) => ({
          str: it.str,
          x: it.transform[4],
          y: it.transform[5],
          w: it.width,
          h: it.height,
          box: [it.transform[4], it.transform[5] - it.height, it.transform[4] + it.width, it.transform[5]], // x0,y0,x1,y1
        }))
    );
  }
  return out;
}

const [base, out] = await Promise.all([items("./cleaned.pdf"), items("./downloaded-asdf.pdf")]);

function overlap(a, b) {
  const ix = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const iy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return ix > 0.5 && iy > 0.5 ? ix * iy : 0;
}

let flags = 0;
for (let p = 0; p < 9; p++) {
  const baseItems = base[p];
  for (const it of out[p]) {
    const isStatic = baseItems.some(
      (b) => b.str === it.str && Math.abs(b.x - it.x) <= 0.7 && Math.abs(b.y - it.y) <= 0.7
    );
    if (isStatic) continue;
    for (const b of baseItems) {
      const ov = overlap(it.box, b.box);
      if (ov > 2) {
        flags++;
        console.log(
          `p${p + 1} OVERLAP value "${it.str}" box[${it.box.map((n) => n.toFixed(1)).join(",")}] vs static "${b.str}" box[${b.box.map((n) => n.toFixed(1)).join(",")}] area=${ov.toFixed(1)}`
        );
      }
    }
  }
}
console.log(flags === 0 ? "no value/static overlaps found" : `${flags} overlaps found`);

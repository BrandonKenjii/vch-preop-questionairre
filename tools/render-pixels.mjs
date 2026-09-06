// Decisive verification:
//  1. Decode the /Yes appearance stream of a checked checkbox in the OUTPUT
//     (it should contain a check mark drawing that is never rendered).
//  2. Render downloaded-asdf.pdf and cleaned.pdf page 1 with pdf.js +
//     @napi-rs/canvas; pixel-count inside every checkbox rect and text rect;
//     report whether flatten added ANY ink at checkbox positions.
//  3. Surface pdf.js warnings (stderr) for the output file.
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName, PDFDict, PDFStream, PDFRef } from "pdf-lib";
import { createCanvas, Path2D, ImageData, DOMMatrix } from "@napi-rs/canvas";
globalThis.Path2D = Path2D;
globalThis.ImageData = ImageData;
globalThis.DOMMatrix = DOMMatrix;
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

// ---- 1. Decode one checkbox /Yes appearance stream from the output ----
const bytes = readFileSync(new URL("./downloaded-asdf.pdf", import.meta.url));
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const ctx = doc.context;
const page = doc.getPages()[0];
const xo = page.node.get(PDFName.of("Resources")).get(PDFName.of("XObject"));
let shown = 0;
for (const k of xo.keys()) {
  const obj = ctx.lookup(xo.get(k));
  if (obj instanceof PDFDict && shown++ < 2) {
    const yes = ctx.lookup(obj.get(PDFName.of("Yes")));
    const content = yes instanceof PDFStream ? (yes.getContentsString() ?? "") : "";
    const d = yes instanceof PDFStream ? yes.dict : null;
    console.log(`[${k}] Yes-appearance stream: BBox=${d ? String(d.get(PDFName.of("BBox"))) : "?"} ownResources=${d ? (d.has(PDFName.of("Resources")) ? "yes" : "NO") : "?"} len=${content.length}`);
    console.log(`   content: ${content.replace(/\s+/g, " ")}`);
  }
}

// ---- 2. Render + pixel counting ----
const fields = JSON.parse(readFileSync(new URL("./fields.json", import.meta.url), "utf8"));

async function renderCounts(file, which) {
  const data = new Uint8Array(readFileSync(new URL(file, import.meta.url)));
  const pdf = await getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const out = await page.render({
    canvasContext: canvas.getContext("2d"),
    viewport,
    renderInteractiveForms: false,
  }).promise;
  const g = canvas.getContext("2d");
  const img = g.getImageData(0, 0, canvas.width, canvas.height);
  const { data: px } = img;
  const darkAt = (x, y) => {
    const i = (y * canvas.width + x) * 4;
    const r = px[i], gg = px[i + 1], b = px[i + 2];
    return r + gg + b < 380 ? 1 : 0; // dark-ish pixel
  };
  const p1fields = fields.pages[0].fields;
  const results = {};
  for (const f of p1fields) {
    const x0 = Math.round(f.x * 2), y0 = Math.round((792 - f.y - f.h) * 2);
    const w = Math.round(f.w * 2), h = Math.round(f.h * 2);
    let dark = 0;
    for (let y = y0; y < y0 + h; y += 2) {
      for (let x = x0; x < x0 + w; x += 2) dark += darkAt(Math.min(x, canvas.width - 1), Math.min(y, canvas.height - 1));
    }
    results[f.name] = dark;
  }
  return { results, pdf };
}

const cleaned = await renderCounts("./cleaned.pdf");
const downloaded = await renderCounts("./downloaded-asdf.pdf");

console.log("\nPage 1 checkbox rects (dark-pixel count @scale2): cleaned vs downloaded");
const cbNames = fields.pages[0].fields.filter((f) => f.type === "checkbox").map((f) => f.name);
for (const n of cbNames) {
  const c = cleaned.results[n] ?? 0, d = downloaded.results[n] ?? 0;
  console.log(`  ${n}: cleaned=${c} downloaded=${d} ${d > c + 5 ? "CHANGED (+ink)" : d === c ? "identical" : `delta=${d - c}`}`);
}
console.log("Page 1 text rects (dark-pixel count):");
for (const n of ["Text Field 6", "Text Field 8", "Text Field 9", "Text Field 10", "Text Field 11"]) {
  const c = cleaned.results[n] ?? 0, d = downloaded.results[n] ?? 0;
  console.log(`  ${n}: cleaned=${c} downloaded=${d} ${d > c + 5 ? "TEXT PRESENT" : "no visible text"}`);
}
console.log("\nDONE");

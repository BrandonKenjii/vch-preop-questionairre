// Renders each page of the reference PDF as a PNG with every form field's
// bounding box overlaid and labeled, so fields can be matched to questions
// visually. Reads tools/fields.json (produced by extract-fields.mjs).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createCanvas, Path2D, ImageData, DOMMatrix } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// pdf.js needs these globals in Node; @napi-rs/canvas provides compatible ones.
globalThis.Path2D = Path2D;
globalThis.ImageData = ImageData;
globalThis.DOMMatrix = DOMMatrix;

const SCALE = 2;

const bytes = readFileSync(new URL("./reference.pdf", import.meta.url));
const fieldsByPage = JSON.parse(readFileSync(new URL("./fields.json", import.meta.url))).pages;

const loadingTask = getDocument({
  data: new Uint8Array(bytes),
  useWorkerFetch: false,
  isEvalSupported: false,
  useSystemFonts: true,
});
const doc = await loadingTask.promise;

mkdirSync(new URL("./overlays", import.meta.url), { recursive: true });

const COLORS = {
  text: "rgba(220, 38, 38, 0.95)",
  checkbox: "rgba(37, 99, 235, 0.95)",
  radio: "rgba(22, 163, 74, 0.95)",
  dropdown: "rgba(202, 138, 4, 0.95)",
};

for (let i = 0; i < doc.numPages; i++) {
  const page = await doc.getPage(i + 1);
  const viewport = page.getViewport({ scale: SCALE });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  const pageFields = fieldsByPage.find((p) => p.index === i)?.fields ?? [];
  for (const f of pageFields) {
    const color = COLORS[f.type] ?? "rgba(0,0,0,0.9)";
    // PDF coords (origin bottom-left) -> canvas pixels via the viewport.
    const [x1, y1] = viewport.convertToViewportPoint(f.x, f.y + f.h);
    const [x2, y2] = viewport.convertToViewportPoint(f.x + f.w, f.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    ctx.fillStyle = color;
    ctx.font = "bold 10px sans-serif";
    const labelY = y1 - 4 < 12 ? y2 + 11 : y1 - 4;
    ctx.fillText(f.name, x1, labelY);
  }

  const png = canvas.toBuffer("image/png");
  writeFileSync(new URL(`./overlays/page-${String(i + 1).padStart(2, "0")}.png`, import.meta.url), png);
  // JPEG copy for easy viewing (no alpha needed; pages are white).
  const jpg = canvas.toBuffer("image/jpeg", 88);
  writeFileSync(new URL(`./overlays/page-${String(i + 1).padStart(2, "0")}.jpg`, import.meta.url), jpg);
  console.log(`page ${i + 1} rendered (${pageFields.length} fields)`);
}

console.log("done -> tools/overlays/");

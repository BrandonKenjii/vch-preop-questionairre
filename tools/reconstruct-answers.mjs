// Reconstructs the user's answers from their (broken-render) downloaded PDF:
//   - checkbox states from pixel-ink deltas vs the blank template
//   - text values from drawn text not present in the template baseline
// Writes tools/reconstructed-answers.json keyed by AcroForm field name.
import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas, Path2D, ImageData, DOMMatrix } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

globalThis.Path2D = Path2D;
globalThis.ImageData = ImageData;
globalThis.DOMMatrix = DOMMatrix;

const fields = JSON.parse(readFileSync(new URL("./fields.json", import.meta.url))).pages;

async function load(file) {
  const doc = await getDocument({
    data: new Uint8Array(readFileSync(new URL(`./${file}`, import.meta.url))),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;
  return doc;
}
const templateDoc = await load("cleaned.pdf");
const userDoc = await load("downloaded-asdf.pdf");

const inkCache = new Map();
async function inkDelta(pageNum, rect) {
  const key = `${pageNum}|${rect.x}|${rect.y}|${rect.w}|${rect.h}`;
  if (inkCache.has(key)) return inkCache.get(key);
  let delta = 0;
  for (const doc of [templateDoc, userDoc]) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const [x1, y1] = viewport.convertToViewportPoint(rect.x, rect.y + rect.h);
    const [x2, y2] = viewport.convertToViewportPoint(rect.x + rect.w, rect.y);
    const pad = 4;
    const img = ctx.getImageData(
      Math.max(0, Math.floor(x1) - pad),
      Math.max(0, Math.floor(y1) - pad),
      Math.ceil(x2 - x1) + pad * 2,
      Math.ceil(y2 - y1) + pad * 2
    );
    let dark = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      if (0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2] < 200) dark++;
    }
    delta = dark - delta;
  }
  inkCache.set(key, delta);
  return delta;
}

// --- text baseline vs user text ---
async function textItems(doc, pageNum) {
  const page = await doc.getPage(pageNum);
  const content = await page.getTextContent();
  return content.items
    .filter((it) => typeof it.str === "string" && it.str.trim() !== "")
    .map((it) => ({
      str: it.str,
      x: Math.round(it.transform[4] * 10) / 10,
      y: Math.round(it.transform[5] * 10) / 10,
      w: Math.round(it.width * 10) / 10,
    }));
}

const templateText = new Map();
for (let p = 1; p <= 10; p++) templateText.set(p, await textItems(templateDoc, p));
const userText = new Map();
for (let p = 1; p <= 10; p++) userText.set(p, await textItems(userDoc, p));

function drawnItems(pageNum) {
  const t = templateText.get(pageNum);
  const u = userText.get(pageNum);
  return u.filter((item) => {
    // exclude items that exist at the same position in the template
    const dup = t.some(
      (base) =>
        base.str === item.str && Math.abs(base.x - item.x) < 2 && Math.abs(base.y - item.y) < 2
    );
    return !dup;
  });
}

function textInRect(pageNum, rect) {
  const pad = 2;
  return drawnItems(pageNum)
    .filter(
      (it) =>
        it.x >= rect.x - pad &&
        it.x + it.w <= rect.x + rect.w + pad &&
        it.y >= rect.y - pad &&
        it.y <= rect.y + rect.h + pad
    )
    .map((it) => it.str)
    .join(" ");
}

const answers = {};
let checkedCount = 0;
let textCount = 0;
for (const page of fields) {
  for (const f of page.fields) {
    const rect = { x: f.x, y: f.y, w: f.w, h: f.h };
    if (f.type === "checkbox") {
      const delta = await inkDelta(page.index + 1, rect);
      if (delta > 8) {
        answers[f.name] = true;
        checkedCount++;
      }
    } else {
      const text = textInRect(page.index + 1, rect).trim();
      if (text) {
        answers[f.name] = text;
        textCount++;
      }
    }
  }
}

writeFileSync(
  new URL("./reconstructed-answers.json", import.meta.url),
  JSON.stringify({ checkedCount, textCount, answers }, null, 2)
);
console.log(`reconstructed: ${checkedCount} checked boxes, ${textCount} text values`);

// tools/render-compare.mjs
// Renders downloaded-asdf.pdf and cleaned.pdf at scale 2 and compares dark
// pixel counts inside form-field rects. Hypothesis: the flattened checkbox
// XObjects are invalid (non-stream dicts), so no check mark (or even border)
// is drawn in the flattened file, while cleaned.pdf still renders the widget
// annotations.
import { readFileSync } from "node:fs";
import { createCanvas, Path2D, ImageData, DOMMatrix } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

globalThis.Path2D = Path2D;
globalThis.ImageData = ImageData;
globalThis.DOMMatrix = DOMMatrix;

const DIR = new URL(".", import.meta.url);
const loadBytes = (f) => new Uint8Array(readFileSync(new URL(f, DIR)));
const SCALE = 2;
const fieldsByPage = JSON.parse(readFileSync(new URL("./fields.json", import.meta.url))).pages;

async function renderPage(file, pageIndex) {
  const doc = await getDocument({
    data: loadBytes(file),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;
  const page = await doc.getPage(pageIndex);
  const viewport = page.getViewport({ scale: SCALE });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function darkCount(img, x0, y0, x1, y1) {
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      // dark = low luminance (ignore alpha)
      if (0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2] < 128) n++;
    }
  }
  return n;
}

const results = [];
for (const [file, label] of [["downloaded-asdf.pdf", "downloaded"], ["cleaned.pdf", "cleaned"]]) {
  // page 5 (index 4): checkboxes; page 1 (index 0): text fields
  for (const pi of [0, 4]) {
    const viewport = (await (await (await getDocument({
      data: loadBytes(file),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    })).promise).getPage(pi + 1)).getViewport({ scale: SCALE });
    const img = await renderPage(file, pi + 1);
    const pageFields = fieldsByPage.find((p) => p.index === pi)?.fields ?? [];
    const sample = pageFields.filter((f) => f.type === "checkbox").slice(0, 8);
    const textSample = pageFields.filter((f) => f.type === "text").slice(0, 4);
    const toPx = (f, dY) => {
      const [x, y] = viewport.convertToViewportPoint(f.x, dY ? f.y + f.h : f.y);
      return [Math.round(x), Math.round(y)];
    };
    for (const f of sample) {
      const [x1, y1] = toPx(f, true);
      const [x2, y2] = toPx(f, false);
      results.push({ label, page: pi + 1, field: f.name, type: "checkbox", dark: darkCount(img, x1, y1, x2, y2) });
    }
    for (const f of textSample) {
      const [x1, y1] = toPx(f, true);
      const [x2, y2] = toPx(f, false);
      results.push({ label, page: pi + 1, field: f.name, type: "text", dark: darkCount(img, x1, y1, x2, y2) });
    }
  }
}

// pair up
const byKey = new Map();
for (const r of results) byKey.set(`${r.label}|${r.page}|${r.field}|${r.type}`, r.dark);
console.log("field | type | downloaded dark-px | cleaned dark-px | delta");
let cbLoss = 0, cbTotal = 0, txDelta = 0, txTotal = 0;
for (const r of results.filter((x) => x.label === "downloaded")) {
  const c = byKey.get(`cleaned|${r.page}|${r.field}|${r.type}`);
  if (c === undefined) continue;
  const delta = r.dark - c;
  console.log(`${r.field} | ${r.type} | ${r.dark} | ${c} | ${delta > 0 ? "+" : ""}${delta}`);
  if (r.type === "checkbox") { cbLoss += Math.max(0, -delta); cbTotal++; }
  else { txDelta += delta; txTotal++; }
}
console.log(`\ncheckbox fields with LOST pixels: ${cbLoss > 0 ? `total ${cbLoss} px lost across ${cbTotal} boxes` : "none"}`);
console.log(`text fields: mean dark-pixel delta ${(txDelta / txTotal).toFixed(0)} px (positive = value drawn)`);

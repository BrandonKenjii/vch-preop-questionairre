// Position cross-check: every non-static text item on pages 1-9 of
// downloaded-asdf.pdf must land inside the field rect it belongs to.
// Static text = items present in cleaned.pdf at the same position.
// Outputs:
//   - items outside ALL field rects (with distance to nearest rect)
//   - items inside checkbox rects (mark glyphs)
//   - text-field rects that received no value item
//   - exact-coordinate checks for the drawn totals/BMI and the two dates
import { readFileSync, writeFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas, Path2D, ImageData, DOMMatrix } from "@napi-rs/canvas";

globalThis.Path2D = Path2D;
globalThis.ImageData = ImageData;
globalThis.DOMMatrix = DOMMatrix;

const TOL = 3; // point-in-rect tolerance

const fields = JSON.parse(readFileSync(new URL("./fields.json", import.meta.url), "utf8"));
const byPage = new Map(fields.pages.map((p) => [p.index + 1, p.fields]));

async function extractItems(pdfPath) {
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
          page: i + 1,
          str: it.str,
          x: Math.round(it.transform[4] * 10) / 10,
          y: Math.round(it.transform[5] * 10) / 10,
        }))
    );
  }
  return out;
}

const [baseline, output] = await Promise.all([
  extractItems("./cleaned.pdf"),
  extractItems("./downloaded-asdf.pdf"),
]);

// Index static baseline: page -> str -> [{x,y}]
const staticIdx = baseline.map((items) => {
  const m = new Map();
  for (const it of items) {
    if (!m.has(it.str)) m.set(it.str, []);
    m.get(it.str).push({ x: it.x, y: it.y });
  }
  return m;
});

const isStatic = (it) => {
  const cands = staticIdx[it.page - 1]?.get(it.str);
  if (!cands) return false;
  return cands.some((c) => Math.abs(c.x - it.x) <= 0.7 && Math.abs(c.y - it.y) <= 0.7);
};

// distance from point to rect (0 if inside, else border distance)
function distToRect(px, py, r) {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}

const summary = { valueItems: 0, staticItems: 0, outside: [], inCheckbox: [], emptyTextFields: [], pages: [] };

for (let p = 1; p <= 9; p++) {
  const rects = byPage.get(p) ?? [];
  const items = output[p - 1];
  const pageReport = { page: p, values: [], outside: [], inCheckbox: [], emptyText: [], minMax: null };
  const textFieldsWithValue = new Set();
  const textFieldNames = new Set(rects.filter((r) => r.type === "text").map((r) => r.name));

  for (const it of items) {
    if (isStatic(it)) { summary.staticItems++; continue; }
    summary.valueItems++;
    // containing rects
    const containing = rects.filter(
      (r) => it.x >= r.x - TOL && it.x <= r.x + r.w + TOL && it.y >= r.y - TOL && it.y <= r.y + r.h + TOL
    );
    const inText = containing.filter((r) => r.type === "text");
    const inCb = containing.filter((r) => r.type === "checkbox");
    if (containing.length === 0) {
      const nearest = rects
        .map((r) => ({ r, d: distToRect(it.x, it.y, r) }))
        .sort((a, b) => a.d - b.d)[0];
      pageReport.outside.push({ ...it, nearestRect: nearest ? `${nearest.r.name}@${nearest.r.type} d=${nearest.d.toFixed(1)}` : "none" });
    } else {
      for (const r of inText) textFieldsWithValue.add(r.name);
      if (inCb.length > 0 && inText.length === 0) {
        pageReport.inCheckbox.push({ ...it, rects: inCb.map((r) => r.name).join(",") });
      }
      pageReport.values.push({ ...it, rects: containing.map((r) => r.name).join(",") });
    }
  }

  const emptyText = [...textFieldNames].filter((n) => !textFieldsWithValue.has(n));
  pageReport.emptyText = emptyText;
  summary.emptyTextFields.push(...emptyText.map((n) => ({ page: p, name: n })));
  summary.outside.push(...pageReport.outside.map((o) => ({ page: p, ...o })));
  summary.inCheckbox.push(...pageReport.inCheckbox.map((o) => ({ page: p, ...o })));
  summary.pages.push(pageReport);

  console.log(`\n===== PAGE ${p} =====`);
  console.log(`value items: ${pageReport.values.length}, outside: ${pageReport.outside.length}, checkbox glyphs: ${pageReport.inCheckbox.length}, empty text fields: ${emptyText.length}`);
  for (const o of pageReport.outside) {
    console.log(`  OUTSIDE y=${String(o.y).padStart(6)} x=${String(o.x).padStart(6)} | "${o.str}"  nearest: ${o.nearestRect}`);
  }
  if (pageReport.inCheckbox.length) {
    for (const o of pageReport.inCheckbox) {
      console.log(`  inCheckbox y=${String(o.y).padStart(6)} x=${String(o.x).padStart(6)} | "${o.str}"  rect: ${o.rects}`);
    }
  }
  if (emptyText.length) console.log(`  EMPTY TEXT FIELDS: ${emptyText.join(", ")}`);
  // x spread of value items (excluding checkbox glyphs) — cluster check
  if (pageReport.values.length) {
    const xs = pageReport.values.map((v) => v.x);
    const ys = pageReport.values.map((v) => v.y);
    pageReport.minMax = { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys) };
    console.log(`  value x range ${pageReport.minMax.xMin}..${pageReport.minMax.xMax}, y range ${pageReport.minMax.yMin}..${pageReport.minMax.yMax}`);
  }
}

writeFileSync(new URL("./crosscheck.json", import.meta.url), JSON.stringify(summary, null, 2));
console.log(`\nTOTAL value items pages 1-9: ${summary.valueItems}, static: ${summary.staticItems}`);
console.log(`outside-all-rects: ${summary.outside.length}, checkbox glyphs: ${summary.inCheckbox.length}, empty text fields: ${summary.emptyTextFields.length}`);
console.log("wrote crosscheck.json");

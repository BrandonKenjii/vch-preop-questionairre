// Raster analysis: renders every page of the downloaded (filled+flattened)
// PDF and the cleaned template at scale 2, then diffs ink inside every field
// rect from tools/fields.json, computes page-level ink ratios, scans for
// solid black rectangles (broken appearance streams), and cross-checks ink
// against extractable text.
import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas, Path2D, ImageData, DOMMatrix } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

globalThis.Path2D = Path2D;
globalThis.ImageData = ImageData;
globalThis.DOMMatrix = DOMMatrix;

const SCALE = 2;
const OUT_FILE = new URL("./downloaded-asdf.pdf", import.meta.url);
const TPL_FILE = new URL("./cleaned.pdf", import.meta.url);
const LUM_THRESHOLD = 200;
const MARK_DELTA = 15; // dark px added => mark present
const SOLID_RATIO = 0.45; // fraction of region filled with dark => black box

const fieldsJson = JSON.parse(readFileSync(new URL("./fields.json", import.meta.url), "utf8"));

async function renderAll(fileUrl) {
  const bytes = readFileSync(fileUrl);
  const task = getDocument({
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const doc = await task.promise;
  const pages = [];
  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1);
    const viewport = page.getViewport({ scale: SCALE });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    let textItems = [];
    try {
      const tc = await page.getTextContent();
      textItems = tc.items.filter((it) => typeof it.str === "string" && it.str.trim() !== "");
    } catch (e) {
      textItems = [];
    }
    pages.push({ page, viewport, canvas, ctx, textItems });
  }
  return { doc, pages };
}

function countDark(ctx, x, y, w, h) {
  w = Math.max(0, Math.min(w, ctx.canvas.width - x));
  h = Math.max(0, Math.min(h, ctx.canvas.height - y));
  if (w <= 0 || h <= 0) return { dark: 0, total: 0 };
  const data = ctx.getImageData(x, y, w, h).data;
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    if (lum < LUM_THRESHOLD) dark++;
  }
  return { dark, total: w * h, ratio: dark / (w * h) };
}

// Flood-fill solid dark blobs on a page render (4-connectivity).
// Reports blobs with count >= MIN_BLOB px that fill >= SOLID_BLOB of their bbox.
function findSolidBlobs(ctx) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const data = ctx.getImageData(0, 0, W, H).data;
  const visited = new Uint8Array(W * H);
  const blobs = [];
  const MIN_BLOB = 800; // ~200 pt^2 at scale 2
  const SOLID_BLOB = 0.55;
  const stack = new Int32Array(1 << 20);
  for (let start = 0; start < W * H; start++) {
    if (visited[start]) continue;
    const i4 = start * 4;
    const lum = data[i4] * 0.299 + data[i4 + 1] * 0.587 + data[i4 + 2] * 0.114;
    if (lum >= LUM_THRESHOLD) continue;
    // flood fill
    let sp = 0;
    stack[sp++] = start;
    visited[start] = 1;
    let count = 0;
    let minX = W, minY = H, maxX = -1, maxY = -1;
    while (sp > 0) {
      const p = stack[--sp];
      count++;
      const px = p % W;
      const py = (p - px) / W;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      // neighbors
      if (px > 0) {
        const q = p - 1;
        if (!visited[q]) {
          const q4 = q * 4;
          if (data[q4] * 0.299 + data[q4 + 1] * 0.587 + data[q4 + 2] * 0.114 < LUM_THRESHOLD) {
            visited[q] = 1; stack[sp++] = q;
          } else visited[q] = 2;
        }
      }
      if (px < W - 1) {
        const q = p + 1;
        if (!visited[q]) {
          const q4 = q * 4;
          if (data[q4] * 0.299 + data[q4 + 1] * 0.587 + data[q4 + 2] * 0.114 < LUM_THRESHOLD) {
            visited[q] = 1; stack[sp++] = q;
          } else visited[q] = 2;
        }
      }
      if (py > 0) {
        const q = p - W;
        if (!visited[q]) {
          const q4 = q * 4;
          if (data[q4] * 0.299 + data[q4 + 1] * 0.587 + data[q4 + 2] * 0.114 < LUM_THRESHOLD) {
            visited[q] = 1; stack[sp++] = q;
          } else visited[q] = 2;
        }
      }
      if (py < H - 1) {
        const q = p + W;
        if (!visited[q]) {
          const q4 = q * 4;
          if (data[q4] * 0.299 + data[q4 + 1] * 0.587 + data[q4 + 2] * 0.114 < LUM_THRESHOLD) {
            visited[q] = 1; stack[sp++] = q;
          } else visited[q] = 2;
        }
      }
    }
    if (count >= MIN_BLOB) {
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      const fill = count / (bw * bh);
      if (fill >= SOLID_BLOB) {
        blobs.push({ count, x: minX, y: minY, w: bw, h: bh, fill });
      }
    }
  }
  return blobs;
}

const out = await renderAll(OUT_FILE);
const tpl = await renderAll(TPL_FILE);
console.log(`rendered: output ${out.doc.numPages} pages, template ${tpl.doc.numPages} pages`);

const fieldsByPage = new Map(fieldsJson.pages.map((p) => [p.index, p.fields]));
const report = { pages: [], fields: [], specials: [], solidBlobs: [], inkTextMismatch: [] };

// ---- page-level stats ----
for (let i = 0; i < out.pages.length; i++) {
  const oc = out.pages[i].ctx;
  const tc = tpl.pages[i]?.ctx;
  const W = oc.canvas.width;
  const H = oc.canvas.height;
  const o = countDark(oc, 0, 0, W, H);
  const t = tc ? countDark(tc, 0, 0, W, H) : { dark: 0 };
  const outRatio = o.dark / (W * H);
  const tplRatio = t.dark / (W * H);
  const status = !tc ? "NO-TEMPLATE" : tplRatio === 0 ? (outRatio > 0 ? "INK-EXPLODED" : "ok") : outRatio < 0.5 * tplRatio ? "INK-COLLAPSED" : outRatio > 2 * tplRatio ? "INK-EXPLODED" : "ok";
  report.pages.push({ page: i + 1, outDark: o.dark, tplDark: t.dark, outRatio: +outRatio.toFixed(5), tplRatio: +tplRatio.toFixed(5), status });
  console.log(`p${i + 1}: out=${(100 * outRatio).toFixed(3)}% tpl=${(100 * tplRatio).toFixed(3)}% ${status}`);
}

// ---- per-field analysis (pages 1-9 per fields.json; include index 9 if present) ----
const classify = (delta, outRatio, o, ctx, rx, ry, rw, rh) => {
  if (delta <= -MARK_DELTA) return "ANOMALY";
  if (outRatio > SOLID_RATIO) {
    // distinguish a solid black box (broken appearance) from a small
    // checkbox outline ring: probe the region center
    const cx = Math.min(ctx.canvas.width - 1, rx + Math.floor(rw / 2));
    const cy = Math.min(ctx.canvas.height - 1, ry + Math.floor(rh / 2));
    const px = ctx.getImageData(cx, cy, 1, 1).data;
    const lum = px[0] * 0.299 + px[1] * 0.587 + px[2] * 0.114;
    if (lum < LUM_THRESHOLD) return "ANOMALY"; // solid fill
    return "NO_CHANGE"; // ring outline (small checkbox), same in template
  }
  if (delta > MARK_DELTA) return "MARK_PRESENT";
  if (delta >= 1) return "TEXT_PRESENT";
  return "NO_CHANGE";
};

let nMark = 0, nTrace = 0, nNone = 0, nAnom = 0;
for (const [pidx, fields] of fieldsByPage) {
  if (!out.pages[pidx] || !tpl.pages[pidx]) continue;
  const ovp = out.pages[pidx].viewport;
  for (const f of fields) {
    const [x1, y1] = ovp.convertToViewportPoint(f.x, f.y);
    const [x2, y2] = ovp.convertToViewportPoint(f.x + f.w, f.y + f.h);
    const rx = Math.round(Math.min(x1, x2));
    const ry = Math.round(Math.min(y1, y2));
    const rw = Math.max(1, Math.round(Math.abs(x2 - x1)));
    const rh = Math.max(1, Math.round(Math.abs(y2 - y1)));
    const o = countDark(out.pages[pidx].ctx, rx, ry, rw, rh);
    const t = countDark(tpl.pages[pidx].ctx, rx, ry, rw, rh);
    const delta = o.dark - t.dark;
    const cls = classify(delta, o.ratio, o, out.pages[pidx].ctx, rx, ry, rw, rh);
    if (cls === "MARK_PRESENT") nMark++;
    else if (cls === "TEXT_PRESENT") nTrace++;
    else if (cls === "NO_CHANGE") nNone++;
    else nAnom++;

    // text cross-check (output): ink added but no extractable text inside rect / vice versa
    const tx1 = f.x, ty1 = f.y, tx2 = f.x + f.w, ty2 = f.y + f.h;
    const hits = out.pages[pidx].textItems.filter((it) => {
      const itx = it.transform[4];
      const ity = it.transform[5];
      const ih = it.height ?? 10;
      return itx < tx2 && itx + (it.width ?? 0) > tx1 && ity - ih < ty2 && ity > ty1;
    });
    if (f.type === "text" && delta > MARK_DELTA && hits.length === 0) {
      report.inkTextMismatch.push({ page: pidx + 1, name: f.name, kind: "INK_NO_TEXT", delta });
    } else if (f.type === "text" && delta <= 1 && hits.length > 0) {
      report.inkTextMismatch.push({ page: pidx + 1, name: f.name, kind: "TEXT_NO_INK", str: hits[0].str.slice(0, 40) });
    }

    report.fields.push({
      page: pidx + 1, name: f.name, type: f.type,
      x: f.x, y: f.y, w: f.w, h: f.h,
      outDark: o.dark, tplDark: t.dark, delta, outRatio: +o.ratio.toFixed(3), cls,
    });
  }
}

// ---- solid blob scan on output pages ----
for (let i = 0; i < out.pages.length; i++) {
  const blobs = findSolidBlobs(out.pages[i].ctx);
  if (blobs.length) {
    const vp = out.pages[i].viewport;
    for (const b of blobs) {
      // convert bbox to PDF units for reporting
      const [px1] = vp.convertToViewportPoint(0, 0); // just to get scale (scale = SCALE)
      report.solidBlobs.push({
        page: i + 1,
        px: b.x, py: b.y, pw: b.w, ph: b.h, count: b.count, fill: +b.fill.toFixed(2),
        pdf: {
          x: +(b.x / SCALE).toFixed(1),
          y: +((out.pages[i].viewport.height - b.y - b.h) / SCALE).toFixed(1),
          w: +(b.w / SCALE).toFixed(1),
          h: +(b.h / SCALE).toFixed(1),
        },
      });
      console.log(`p${i + 1} SOLID BLOB: ${b.count}px bbox(${b.x},${b.y},${b.w}x${b.h}) fill=${b.fill.toFixed(2)} -> pdf(${(b.x / SCALE).toFixed(1)}, ${((out.pages[i].viewport.height - b.y - b.h) / SCALE).toFixed(1)}, ${(b.w / SCALE).toFixed(1)}x${(b.h / SCALE).toFixed(1)})`);
    }
  }
}

// ---- special regions ----
const specialRects = [
  { label: "p2 functional total (drawn 536,594)", page: 1, x: 528, y: 588, w: 40, h: 16 },
  { label: "p6 PCS total (drawn 536,47)", page: 5, x: 528, y: 41, w: 40, h: 16 },
  { label: "p9 BMI (drawn 534,181)", page: 8, x: 526, y: 175, w: 40, h: 16 },
  { label: "p9 phone 1 (214.4,165.1)", page: 8, x: 208, y: 160, w: 60, h: 13 },
  { label: "p9 phone 2 (214.4,150)", page: 8, x: 208, y: 145, w: 60, h: 13 },
  { label: "p9 phone 3 (214.4,134)", page: 8, x: 208, y: 129, w: 60, h: 13 },
  { label: "p9 phone 4 (214.4,119)", page: 8, x: 208, y: 114, w: 60, h: 13 },
  { label: "p9 phone 5 (214.4,104)", page: 8, x: 208, y: 99, w: 60, h: 13 },
];
for (const s of specialRects) {
  const vp = out.pages[s.page].viewport;
  const [x1, y1] = vp.convertToViewportPoint(s.x, s.y);
  const [x2, y2] = vp.convertToViewportPoint(s.x + s.w, s.y + s.h);
  const rx = Math.round(Math.min(x1, x2));
  const ry = Math.round(Math.min(y1, y2));
  const o = countDark(out.pages[s.page].ctx, rx, ry, Math.round(Math.abs(x2 - x1)), Math.round(Math.abs(y2 - y1)));
  const t = countDark(tpl.pages[s.page].ctx, rx, ry, Math.round(Math.abs(x2 - x1)), Math.round(Math.abs(y2 - y1)));
  const delta = o.dark - t.dark;
  report.specials.push({ ...s, outDark: o.dark, tplDark: t.dark, delta });
  console.log(`SPECIAL ${s.label}: outDark=${o.dark} tplDark=${t.dark} delta=${delta}`);
}

// ---- pain-rating checkboxes on page 7 (index 6) ----
const pain = report.fields.filter((f) => f.page === 7 && /^Check Box (18[6-9]|19[0-6])$/.test(f.name));
console.log(`PAIN checkboxes p7 (${pain.length}): ` + pain.map((f) => `${f.name}:${f.cls}(${f.delta})`).join(" "));
report.painCheckboxes = pain;

// ---- signature/date fields on p1 and p10 ----
const dateFields = report.fields.filter((f) => /Text Field (6|1045)/.test(f.name) || f.name === "Text Field 6");
report.dateFields = dateFields;

console.log(`\nSUMMARY: MARK_PRESENT=${nMark} TEXT_PRESENT=${nTrace} NO_CHANGE=${nNone} ANOMALY=${nAnom}`);

// ---- anomalies detail ----
const anomalies = report.fields.filter((f) => f.cls === "ANOMALY");
for (const a of anomalies) {
  console.log(`ANOMALY p${a.page} ${a.name} (${a.type}) delta=${a.delta} outRatio=${a.outRatio} tplDark=${a.tplDark} outDark=${a.outDark}`);
}

writeFileSync(new URL("./raster-report.json", import.meta.url), JSON.stringify(report, null, 1));
console.log("\nwrote tools/raster-report.json");

// H3 adversarial verification: do broken XObject/appearance streams cause
// large black rectangles or garbled regions in the DOWNLOADED pdf?
//
// Decisive checks:
//  A. STRUCTURE (pdf-lib): per page, count Do ops in content streams and
//     resolve each referenced XObject -> is it a stream or a plain dict?
//     ("XObject should be a stream" = dict entries)
//  B. RENDER PATH WARNINGS (pdf.js): warnings raised while building the
//     OPERATOR LIST / rendering (not getTextContent) per page.
//  C. PIXELS: connected-component analysis of near-black pixels per rendered
//     page; report largest components (area, bbox, fill ratio) to catch
//     large solid black rectangles / garbled blobs. Compare against
//     cleaned.pdf (template) and reference.pdf (original).
import { readFileSync } from "node:fs";
import { createCanvas, Path2D, ImageData, DOMMatrix } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, PDFName, PDFDict, PDFStream, PDFRef, PDFArray } from "pdf-lib";

globalThis.Path2D = Path2D;
globalThis.ImageData = ImageData;
globalThis.DOMMatrix = DOMMatrix;

const SCALE = 2;

// ---------- A. structure via pdf-lib ----------
function structureAnalysis(bytes, label) {
  const doc = awaitPdfLibLoad(bytes);
  // (helper below)
}

async function awaitPdfLibLoad(bytes) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const ctx = doc.context;
  const out = [];
  for (let p = 0; p < doc.getPageCount(); p++) {
    const page = doc.getPage(p);
    const res = page.node.get(PDFName.of("Resources"));
    const xoDict = res ? res.get(PDFName.of("XObject")) : undefined;
    const xo = xoDict instanceof PDFDict ? xoDict : undefined;
    // collect name -> resolved object
    const xoMap = new Map();
    if (xo) {
      for (const [name, ref] of xo.entries()) {
        let target;
        try { target = ctx.lookup(ref); } catch { target = "LOOKUP-FAILED"; }
        xoMap.set(name.toString(), target);
      }
    }
    // content streams
    const contents = page.node.get(PDFName.of("Contents"));
    const arr = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    let all = "";
    for (const c of arr) {
      const s = c instanceof PDFRef ? ctx.lookup(c) : c;
      if (s instanceof PDFStream) all += s.getContentsString() ?? "";
    }
    const doOps = [...all.matchAll(/\/FlatWidget-(\d+)\s+Do/g)].map((m) => m[1]);
    let drawnDict = 0, drawnStream = 0, drawnOther = 0;
    for (const id of doOps) {
      const target = xoMap.get(`FlatWidget-${id}`);
      if (target instanceof PDFStream) drawnStream++;
      else if (target instanceof PDFDict) drawnDict++;
      else drawnOther++;
    }
    // count ANY Do ops (non-FlatWidget too)
    const allDo = (all.match(/\bDo\b/g) ?? []).length;
    out.push({ page: p + 1, xoEntries: xoMap.size, doOps: doOps.length, allDo, drawnDict, drawnStream, drawnOther });
  }
  return out;
}

// ---------- render + warnings + pixels via pdf.js ----------
const warnLog = [];
const origWarn = console.warn;
const origError = console.error;
function beginCapture() { warnLog.length = 0; console.warn = (...a) => warnLog.push(a.join(" ")); }
function endCapture() { console.warn = origWarn; return [...warnLog]; }

function componentAnalysis(img, w, h) {
  const data = img.data;
  const black = new Uint8Array(w * h); // 1 = near-black
  let blackCount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // near-black: all channels < 96 (catches antialiased text core + fills)
      if (r < 96 && g < 96 && b < 96) { black[y * w + x] = 1; blackCount++; }
    }
  }
  // connected components (4-neighbour BFS)
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const comps = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!black[idx] || seen[idx]) continue;
      // BFS
      let sp = 0;
      stack[sp++] = idx;
      seen[idx] = 1;
      let area = 0, minX = x, maxX = x, minY = y, maxY = y;
      while (sp > 0) {
        const cur = stack[--sp];
        area++;
        const cx = cur % w, cy = (cur / w) | 0;
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        if (cx > 0) { const n = cur - 1; if (black[n] && !seen[n]) { seen[n] = 1; stack[sp++] = n; } }
        if (cx < w - 1) { const n = cur + 1; if (black[n] && !seen[n]) { seen[n] = 1; stack[sp++] = n; } }
        if (cy > 0) { const n = cur - w; if (black[n] && !seen[n]) { seen[n] = 1; stack[sp++] = n; } }
        if (cy < h - 1) { const n = cur + w; if (black[n] && !seen[n]) { seen[n] = 1; stack[sp++] = n; } }
      }
      comps.push({ area, minX, maxX, minY, maxY });
    }
  }
  comps.sort((a, b) => b.area - a.area);
  return { blackCount, total: w * h, blackFrac: blackCount / (w * h), comps };
}

async function renderAndAnalyze(filePath, label, doTextExtract) {
  const bytes = readFileSync(filePath);
  const struct = await structureAnalysisPdfLib(bytes);
  const renderWarn = [];
  const textWarn = [];
  const pages = [];
  beginCapture();
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  let doc;
  try { doc = await loadingTask.promise; } catch (e) { renderWarn.push("LOAD FAILED: " + e.message); }
  endCapture().forEach((w) => renderWarn.push("[load] " + w));

  for (let p = 0; p < doc.numPages; p++) {
    const page = await doc.getPage(p + 1);
    const viewport = page.getViewport({ scale: SCALE });
    const w = Math.ceil(viewport.width), h = Math.ceil(viewport.height);

    // render-path warnings: operator list build
    beginCapture();
    let opListErr = null;
    let opList;
    try { opList = await page.getOperatorList(); } catch (e) { opListErr = e.message; }
    const rw = endCapture();
    rw.forEach((msg) => renderWarn.push(`p${p + 1} [render] ${msg}`));

    // canvas render
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");
    let renderErr = null;
    beginCapture();
    try {
      await page.render({ canvasContext: ctx, viewport, canvas, operatorList: opList ?? undefined }).promise;
    } catch (e) { renderErr = e.message; }
    endCapture().forEach((msg) => renderWarn.push(`p${p + 1} [render] ${msg}`));

    const img = ctx.getImageData(0, 0, w, h);
    const pix = componentAnalysis(img, w, h);

    // text-extraction warnings (known repro: "XObject should be a stream")
    if (doTextExtract) {
      beginCapture();
      try { await page.getTextContent(); } catch {}
      endCapture().forEach((msg) => textWarn.push(`p${p + 1} [text] ${msg}`));
    }

    // large components: bbox >= 60x60 px (30x30 pt), area >= 900
    const big = pix.comps
      .filter((c) => (c.maxX - c.minX + 1) >= 60 && (c.maxY - c.minY + 1) >= 60 && c.area >= 900)
      .slice(0, 5)
      .map((c) => {
        const bw = c.maxX - c.minX + 1, bh = c.maxY - c.minY + 1;
        return { area: c.area, bbox: [c.minX, c.minY, bw, bh], fill: +(c.area / (bw * bh)).toFixed(3) };
      });

    pages.push({
      page: p + 1, size: [w, h], blackFrac: +pix.blackFrac.toFixed(5),
      opListErr, renderErr, bigComponents: big,
      totalComps: pix.comps.length,
    });
  }
  await loadingTask.destroy();
  return { label, struct, renderWarn, textWarn, pages };
}

async function structureAnalysisPdfLib(bytes) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const ctx = doc.context;
  const out = [];
  for (let p = 0; p < doc.getPageCount(); p++) {
    const page = doc.getPage(p);
    let res = page.node.get(PDFName.of("Resources"));
    if (res instanceof PDFRef) res = ctx.lookup(res);
    const xoDict = res && res instanceof PDFDict ? res.get(PDFName.of("XObject")) : undefined;
    let xo = xoDict;
    if (xo instanceof PDFRef) xo = ctx.lookup(xo);
    const xoMap = new Map();
    if (xo instanceof PDFDict) {
      for (const [name, ref] of xo.entries()) {
        let target;
        try { target = ctx.lookup(ref); } catch { target = "LOOKUP-FAILED"; }
        xoMap.set(name.toString(), target);
      }
    }
    let contents = page.node.get(PDFName.of("Contents"));
    if (contents instanceof PDFRef) contents = ctx.lookup(contents);
    const arr = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    let all = "";
    for (const c of arr) {
      const s = c instanceof PDFRef ? ctx.lookup(c) : c;
      if (s instanceof PDFStream) all += s.getContentsString() ?? "";
    }
    const doOps = [...all.matchAll(/\/FlatWidget-(\d+)\s+Do/g)].map((m) => m[1]);
    const allDo = (all.match(/\bDo\b/g) ?? []).length;
    let drawnDict = 0, drawnStream = 0, drawnOther = 0;
    for (const id of doOps) {
      const target = xoMap.get(`FlatWidget-${id}`);
      if (target instanceof PDFStream) drawnStream++;
      else if (target instanceof PDFDict) drawnDict++;
      else drawnOther++;
    }
    out.push({
      page: p + 1, xoEntries: xoMap.size, doOps: doOps.length, allDo,
      drawnDict, drawnStream, drawnOther,
      xoDictLeaks: [...xoMap.entries()].filter(([, t]) => t instanceof PDFDict).length,
      contentChars: all.length,
      head: all.replace(/\s+/g, " ").slice(0, 120),
    });
  }
  return out;
}

const files = [
  { path: "C:/Users/tangb/Projects/preop-questionnaire/tools/downloaded-asdf.pdf", label: "DOWNLOADED-ASDF" },
  { path: "C:/Users/tangb/Projects/preop-questionnaire/tools/cleaned.pdf", label: "CLEANED-TEMPLATE" },
  { path: "C:/Users/tangb/Downloads/Questionnaire Interactive pdf (1).pdf", label: "REFERENCE-ORIGINAL" },
];

for (const f of files) {
  console.log(`\n===== ${f.label} =====`);
  const r = await renderAndAnalyze(f.path, f.label, true);
  console.log("-- structure (per page): page | xoEntries | doOps | drawnDict | drawnStream | xoDictLeaks");
  for (const s of r.struct) {
    console.log(`  ${s.page} | ${s.xoEntries} | ${s.doOps} | ${s.drawnDict} | ${s.drawnStream} | ${s.xoDictLeaks}`);
  }
  console.log(`-- render-path warnings (${r.renderWarn.length})`);
  const renderMsgs = [...new Set(r.renderWarn.map((m) => m.replace(/p\d+ \[render\] /, "")))];
  for (const m of renderMsgs.slice(0, 12)) console.log("   " + m);
  console.log(`-- text-path warnings (${r.textWarn.length}), unique:`);
  const textMsgs = [...new Set(r.textWarn.map((m) => m.replace(/p\d+ \[text\] /, "")))];
  for (const m of textMsgs.slice(0, 6)) console.log("   " + m);
  console.log("-- pixel analysis: page | blackFrac | large components (area, bboxWxH, fill)");
  for (const p of r.pages) {
    const comps = p.bigComponents.map((c) => `${c.area}@${c.bbox[2]}x${c.bbox[3]} fill=${c.fill}${c.fill > 0.7 ? " <== SOLID" : ""}`).join(" ; ");
    console.log(`  p${p.page} | ${p.blackFrac} | ${p.opListErr ? "OPLIST-ERR:" + p.opListErr : ""}${p.renderErr ? "RENDER-ERR:" + p.renderErr : ""} | ${comps || "(none)"}`);
  }
}
console.log("\nDONE");

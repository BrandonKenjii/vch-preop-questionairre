// verify-h2.mjs — Adversarial verification of H2:
// "Checkbox marks do not visually render (appearance streams missing the
//  on-state after the template /Annots rewrite), so all ~300 checkboxes
//  look empty/blank in viewers"
//
// Decisive checks on the ACTUAL artifact (downloaded-asdf.pdf):
//  A. Structure: what did flatten register as page /Resources /XObject
//     entries — proper Form streams or broken state dicts? Are they
//     referenced by `Do` ops in page content?
//  B. Rendering: render every page with pdf.js + canvas and pixel-count
//     each checkbox rect interior vs. the cleaned.pdf baseline; capture
//     pdf.js warnings (stderr) while rendering.
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PDFDocument, PDFName, PDFRef, PDFDict, PDFStream } from "pdf-lib";
import { createCanvas, Path2D, ImageData, DOMMatrix } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

globalThis.Path2D = Path2D;
globalThis.ImageData = ImageData;
globalThis.DOMMatrix = DOMMatrix;

const DIR = new URL(".", import.meta.url);
const loadBytes = (f) => new Uint8Array(readFileSync(new URL(f, DIR)));
const resolve = (ctx, o) => {
  if (o instanceof PDFRef) {
    try { return ctx.lookup(o); } catch { return undefined; }
  }
  return o;
};
const latin1 = (bytes) => Buffer.from(bytes).toString("latin1");
const contentString = (stream) => {
  try {
    const raw = stream.getContents();
    const f = stream.dict.get(PDFName.of("Filter"));
    if (f && f.toString() === "/FlateDecode") {
      try { return latin1(inflateSync(raw)); } catch { return null; }
    }
    return latin1(raw);
  } catch { return null; }
};

const fieldsJson = JSON.parse(readFileSync(new URL("fields.json", DIR), "utf8"));

// ============ A. STRUCTURE: XObject classification per page ============
console.log("=========== A. XObject structure of downloaded-asdf.pdf ===========");
{
  const doc = await PDFDocument.load(loadBytes("downloaded-asdf.pdf"), { ignoreEncryption: true });
  const ctx = doc.context;
  const pages = doc.getPages();
  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi];
    const res = resolve(ctx, page.node.Resources());
    const xobj = res instanceof PDFDict ? resolve(ctx, res.get(PDFName.of("XObject"))) : undefined;
    if (!(xobj instanceof PDFDict)) { console.log(`page ${pi + 1}: no XObject dict`); continue; }
    let streams = 0, brokenDicts = 0, other = 0;
    const brokenKeys = [];
    let checkGlyphStreams = 0; // streams whose content draws a checkmark glyph
    const sampleBroken = [];
    const sampleStream = [];
    for (const key of xobj.keys()) {
      const v = resolve(ctx, xobj.get(key));
      if (v instanceof PDFDict && typeof v.getContents === "function") {
        streams++;
        const c = contentString(v) ?? "";
        // a checkbox on-state appearance draws a glyph (ZaDb font) or a filled path
        const resF = resolve(ctx, v.dict.get(PDFName.of("Resources")));
        let fonts = "";
        if (resF instanceof PDFDict) {
          const fdict = resolve(ctx, resF.get(PDFName.of("Font")));
          if (fdict instanceof PDFDict) {
            fonts = fdict.keys().map((k) => resolve(ctx, fdict.get(k))?.dict?.get?.(PDFName.of("BaseFont"))?.toString?.() ?? "").join(",");
          }
        }
        const looksCheck = /ZaDb|ZapfDingbats|0\.5\s*[-\d.]*\s*[-\d.]*\s*[-\d.]*\s*re\s+f|\(3\)\s*Tj|3\s*Tf/i.test(c) || /re\s+f|re\s+B|f\s*\*/.test(c);
        if (looksCheck) checkGlyphStreams++;
        if (sampleStream.length < 2) sampleStream.push({ key: key.toString(), len: c.length, head: c.slice(0, 160), fonts });
      } else if (v instanceof PDFDict) {
        brokenDicts++;
        const keys = v.keys().map((k) => k.toString()).join(",");
        brokenKeys.push(key.toString());
        if (sampleBroken.length < 3) {
          sampleBroken.push({ key: key.toString(), keys, hasOff: v.has(PDFName.of("Off")), hasOn: v.has(PDFName.of("Yes")) || v.has(PDFName.of("On")) });
        }
      } else {
        other++;
      }
    }
    console.log(`page ${pi + 1}: XObjects streams=${streams} broken-dicts=${brokenDicts} other=${other} streamLikeCheckmark=${checkGlyphStreams}`);
    for (const s of sampleBroken) console.log(`   BROKEN ${s.key}: keys=[${s.keys}] hasOff=${s.hasOff} hasOnState=${s.hasOn}`);
    for (const s of sampleStream) console.log(`   STREAM ${s.key}: len=${s.len} fonts=[${s.fonts}] head="${s.head}"`);
  }
}

// ============ B. RENDER + PIXEL COUNT vs cleaned baseline ============
console.log("\n=========== B. pdf.js render + checkbox-region pixel count ===========");
async function analyzePdf(file, label, pagesMeta) {
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  let pdfjsDoc;
  try {
    const task = getDocument({ data: loadBytes(file), useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true });
    pdfjsDoc = await task.promise;
  } finally { console.warn = origWarn; }

  const out = { pages: [] };
  for (let p = 1; p <= pdfjsDoc.numPages; p++) {
    const page = await pdfjsDoc.getPage(p);
    const scale = 4;
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    // checkbox rects for this page from fields.json (page index = p-1)
    const meta = pagesMeta.find((m) => m.index === p - 1);
    const cbRects = (meta?.fields ?? []).filter((f) => f.type === "checkbox");
    let withInk = 0;
    const inkSamples = [];
    for (const f of cbRects) {
      const x0 = Math.round(f.x * scale), y0 = Math.round((meta.height - f.y - f.h) * scale);
      const w = Math.round(f.w * scale), h = Math.round(f.h * scale);
      // interior = inset 25% so the static border (if any) is excluded
      const ix0 = x0 + Math.round(w * 0.25), iy0 = y0 + Math.round(h * 0.25);
      const iw = Math.max(1, Math.round(w * 0.5)), ih = Math.max(1, Math.round(h * 0.5));
      let sum = 0, n = 0;
      for (let y = iy0; y < Math.min(y0 + h, canvas.height - 1) && y < iy0 + ih; y++) {
        for (let x = ix0; x < Math.min(x0 + w, canvas.width - 1) && x < ix0 + iw; x++) {
          const i = (y * canvas.width + x) * 4;
          sum += 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
          n++;
        }
      }
      const mean = n ? sum / n : 255;
      if (mean < 200) { withInk++; if (inkSamples.length < 3) inkSamples.push({ name: f.name, mean: mean.toFixed(1) }); }
    }
    out.pages.push({ page: p, checkboxes: cbRects.length, withInk, inkSamples });
  }
  // warning histogram
  const hist = {};
  for (const w of warnings) hist[w] = (hist[w] ?? 0) + 1;
  out.warnings = hist;
  out.warningTotal = warnings.length;
  console.log(`${label}: pages=${pdfjsDoc.numPages}`);
  for (const pg of out.pages) {
    const smp = pg.inkSamples.length ? ` e.g. ${pg.inkSamples.map((s) => `${s.name}@${s.mean}`).join(", ")}` : "";
    console.log(`  p${pg.page}: checkbox-rects=${pg.checkboxes} withInteriorInk=${pg.withInk}${smp}`);
  }
  console.log(`  pdf.js warnings: ${out.warningTotal}`);
  for (const [w, n] of Object.entries(hist)) console.log(`    [${n}x] ${w.slice(0, 120)}`);
  return out;
}

const downloaded = await analyzePdf("downloaded-asdf.pdf", "downloaded-asdf.pdf", fieldsJson.pages);
const cleaned = await analyzePdf("cleaned.pdf", "cleaned.pdf", fieldsJson.pages);

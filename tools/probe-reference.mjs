// Compare the ORIGINAL reference PDF's widget structure:
//  - /Annots widget copies: /AP /N inline dict or indirect ref?
//  - /Fields widget copies: same question
//  - Do page content streams reference non-stream XObjects (pre-existing warnings)?
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName, PDFDict, PDFStream, PDFRef, PDFArray } from "pdf-lib";
import { createCanvas, Path2D, ImageData, DOMMatrix } from "@napi-rs/canvas";
globalThis.Path2D = Path2D;
globalThis.ImageData = ImageData;
globalThis.DOMMatrix = DOMMatrix;
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

const refPath = "C:/Users/tangb/Downloads/Questionnaire Interactive pdf (1).pdf";
const bytes = readFileSync(refPath);
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const ctx = doc.context;
const pages = doc.getPages();

// --- page 1 annots widgets: AP/N structure ---
const p1 = pages[0];
const annots = p1.node.Annots()?.asArray() ?? [];
let checked = 0, checkedText = 0, cbInlineN = 0, cbIndirectN = 0, txStreamN = 0, txInlineN = 0, txIndirectN = 0, nNoAp = 0;
const details = [];
for (const a of annots) {
  const d = ctx.lookup(a, PDFDict);
  if (!d) continue;
  const ft = d.get(PDFName.of("FT"));
  const ap = d.get(PDFName.of("AP"));
  if (!ap) { nNoAp++; continue; }
  const apd = ap instanceof PDFRef ? ctx.lookup(ap) : ap;
  if (!(apd instanceof PDFDict)) continue;
  const n = apd.get(PDFName.of("N"));
  const nObj = n instanceof PDFRef ? ctx.lookup(n) : n;
  if (n instanceof PDFRef) {
    if (nObj instanceof PDFDict) { if (ft?.toString() === "/Btn") cbIndirectN++; else txIndirectN++; }
    else if (nObj instanceof PDFStream) { txStreamN++; }
  } else if (n instanceof PDFDict) {
    if (ft?.toString() === "/Btn") cbInlineN++; else txInlineN++;
  } else if (n instanceof PDFStream) txStreamN++;
  if (details.length < 6) {
    const t = d.get(PDFName.of("T"));
    details.push(`${t instanceof Object && t.decodeText ? t.decodeText() : String(t)}: FT=${String(ft)} AP/N=${n instanceof PDFRef ? "REF->" + (nObj?.constructor?.name ?? "?") : n?.constructor?.name}${nObj instanceof PDFDict ? " keys=" + nObj.keys().map((x) => x.toString()).join(",") : ""}`);
  }
  checked++;
}
console.log(`REFERENCE p1 annots=${annots.length}`);
console.log(`  checkbox AP/N: inline-dict=${cbInlineN} indirect-dict=${cbIndirectN} | text AP/N: stream=${txStreamN} inline-dict=${txInlineN} indirect-dict=${txIndirectN} noAP=${nNoAp}`);
for (const d of details) console.log("  ", d);

// --- Fields array widgets ---
const form = doc.getForm();
const fields = form.getFields();
let fCbInline = 0, fCbIndirect = 0, fTxStream = 0, fTxOther = 0;
for (const f of fields) {
  const w = f.acroField.getWidgets()[0];
  if (!w) continue;
  const d = w.dict;
  const ft = d.get(PDFName.of("FT"));
  const ap = d.get(PDFName.of("AP"));
  const apd = ap instanceof PDFRef ? ctx.lookup(ap) : ap;
  if (!(apd instanceof PDFDict)) continue;
  const n = apd.get(PDFName.of("N"));
  const nObj = n instanceof PDFRef ? ctx.lookup(n) : n;
  if (n instanceof PDFRef) { if (nObj instanceof PDFDict) { ft?.toString() === "/Btn" ? fCbIndirect++ : fTxOther++; } else if (nObj instanceof PDFStream) fTxStream++; }
  else if (n instanceof PDFDict) fCbInline++;
  else if (n instanceof PDFStream) fTxStream++;
}
console.log(`REFERENCE /Fields widgets: checkbox AP/N inline-dict=${fCbInline} indirect-dict=${fCbIndirect} | text AP/N stream=${fTxStream} other=${fTxOther}`);

// --- Do ops + XObject targets in page 1 content ---
const contents = p1.node.get(PDFName.of("Contents"));
const arr = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
let all = "";
for (const c of arr) {
  const s = c instanceof PDFRef ? ctx.lookup(c) : c;
  if (s instanceof PDFStream) all += s.getContentsString() ?? "";
}
const doOps = [...all.matchAll(/\/[A-Za-z0-9_.-]+\s+Do/g)].map((m) => m[0]);
console.log(`REFERENCE p1 content: ${all.length} chars, ${doOps.length} Do ops: ${doOps.slice(0, 20).join(" ")}`);

// --- pdf.js warnings on reference ---
const pdfjs = await getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
const p = await pdfjs.getPage(1);
await p.getTextContent();
console.log("(pdf.js warnings above are from the REFERENCE file)");
console.log("\nDONE");

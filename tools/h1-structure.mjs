// H1 verification, part 1: font resolution structure of downloaded-asdf.pdf.
// For every content stream (page contents + Form XObjects incl. appearance
// streams), find every "name size Tf" font reference and check whether the
// name resolves in the XObject's own /Resources /Font, else the page's
// /Resources /Font. Also describe every font dict in the document.
import fs from "node:fs";
import zlib from "node:zlib";
import { PDFDocument, PDFName } from "pdf-lib";

const FILE = process.argv[2] ?? "downloaded-asdf.pdf";

const doc = await PDFDocument.load(fs.readFileSync(FILE), { ignoreEncryption: true });
const ctx = doc.context;

function decodeStream(obj) {
  if (!obj || typeof obj.getContents !== "function") return null;
  const raw = obj.getContents();
  if (!raw) return null;
  const filter = obj.dict ? obj.dict.get(PDFName.of("Filter")) : undefined;
  const filters = [];
  if (filter) {
    if (filter.constructor.name === "PDFName") filters.push(filter.decodeText());
    else if (filter.asArray) for (const f of filter.asArray()) filters.push(f.decodeText());
  }
  let bytes = new Uint8Array(raw);
  try {
    for (const f of filters) {
      if (f === "FlateDecode" || f === "Fl") bytes = new Uint8Array(zlib.inflateSync(bytes));
    }
    return Buffer.from(bytes).toString("latin1");
  } catch (e) {
    return null;
  }
}

const TF_RE = /\/\s*([A-Za-z0-9_.-]+?)\s+([\d.]+)\s+Tf\s/g;

function fontNamesInStream(text) {
  const names = new Set();
  if (!text) return names;
  let m;
  TF_RE.lastIndex = 0;
  while ((m = TF_RE.exec(text)) !== null) {
    // skip names that are part of other operators like "1 0 0 rg" — Tf lookahead ensures it's a font op
    names.add(m[1]);
  }
  return names;
}

function describeFont(fontObj) {
  if (!fontObj) return "(missing object!)";
  if (typeof fontObj.get !== "function") return "(not a dict)";
  const d = fontObj;
  const get = (n) => {
    const v = d.get(PDFName.of(n));
    if (!v) return null;
    return v.decodeText ? v.decodeText() : String(v);
  };
  const out = { Type: get("Type"), Subtype: get("Subtype"), BaseFont: get("BaseFont") };
  const fdRef = d.get(PDFName.of("FontDescriptor"));
  if (fdRef) {
    const fd = ctx.lookup(fdRef);
    if (fd && typeof fd.get === "function") {
      out.embedded = [0, 1, 2, 3]
        .map((i) => `FontFile${i > 0 ? i : ""}`)
        .filter((n) => fd.get(PDFName.of(n)))
        .join(",");
      out.descriptor = { Flags: fd.get(PDFName.of("Flags"))?.decodeText?.() ?? String(fd.get(PDFName.of("Flags")) ?? "") };
    }
  }
  out.encoding = get("Encoding");
  out.toUnicode = !!d.get(PDFName.of("ToUnicode"));
  return out;
}

function fontTable(resDict) {
  const out = new Map();
  if (!resDict || typeof resDict.get !== "function") return out;
  const f = resDict.get(PDFName.of("Font"));
  if (!f || typeof f.get !== "function") return out;
  for (const [k, v] of f.entries()) {
    const ref = v;
    const obj = ctx.lookup(ref);
    out.set(k.decodeText(), { ref: String(ref), dict: describeFont(obj) });
  }
  return out;
}

console.log(`=== ${FILE} ===`);
console.log(`pages: ${doc.getPageCount()}`);

let unresolvedTotal = 0;
const allFontDicts = new Map();

for (let pi = 0; pi < doc.getPageCount(); pi++) {
  const page = doc.getPages()[pi];
  const pageRes = ctx.lookup(page.node.get(PDFName.of("Resources")));
  const pageFonts = fontTable(pageRes);

  // Page content streams
  const contents = page.node.get(PDFName.of("Contents"));
  const streamObjs = [];
  if (contents) {
    if (contents.constructor.name === "PDFArray") {
      for (const r of contents.asArray()) streamObjs.push(ctx.lookup(r));
    } else {
      streamObjs.push(ctx.lookup(contents));
    }
  }

  const pageUnresolved = new Set();
  const fontUsage = new Map(); // fontName -> sources
  const addUse = (name, src) => {
    if (!fontUsage.has(name)) fontUsage.set(name, new Set());
    fontUsage.get(name).add(src);
  };

  for (const s of streamObjs) {
    const text = decodeStream(s);
    for (const n of fontNamesInStream(text)) {
      addUse(n, "pageContents");
      if (!pageFonts.has(n)) pageUnresolved.add(n);
    }
  }

  // XObjects on the page
  let xobjUnresolved = [];
  const xRes = pageRes?.get(PDFName.of("XObject"));
  if (xRes && typeof xRes.get === "function") {
    for (const [k, v] of xRes.entries()) {
      const obj = ctx.lookup(v);
      if (!obj || typeof obj.get !== "function") continue;
      const subtype = obj.get(PDFName.of("Subtype"))?.decodeText?.();
      if (subtype !== "Form") continue;
      const xResDict = ctx.lookup(obj.get(PDFName.of("Resources")));
      const xFonts = fontTable(xResDict);
      const text = decodeStream(obj);
      const used = fontNamesInStream(text);
      if (used.size) {
        for (const n of used) {
          addUse(n, `xobj:${k.decodeText()}`);
          if (!xFonts.has(n) && !pageFonts.has(n)) {
            xobjUnresolved.push({ xobj: k.decodeText(), font: n });
          }
        }
      }
    }
  }

  // Remaining annotations' appearance streams (widget leftovers)
  const annots = page.node.get(PDFName.of("Annots"));
  let annotAp = [];
  if (annots && annots.constructor.name === "PDFArray") {
    for (const r of annots.asArray()) {
      const a = ctx.lookup(r);
      if (!a || typeof a.get !== "function") continue;
      const apRef = a.get(PDFName.of("AP"));
      if (!apRef) continue;
      const ap = ctx.lookup(apRef);
      if (!ap || typeof ap.get !== "function") continue;
      const n = ap.get(PDFName.of("N"));
      if (!n) continue;
      const nObj = ctx.lookup(n);
      if (!nObj || typeof nObj.get !== "function") continue;
      const xResDict = ctx.lookup(nObj.get(PDFName.of("Resources")));
      const xFonts = fontTable(xResDict);
      const text = decodeStream(nObj);
      const used = fontNamesInStream(text);
      for (const fn of used) {
        addUse(fn, "annotAP");
        if (!xFonts.has(fn) && !pageFonts.has(fn)) annotAp.push(fn);
      }
    }
  }

  if (pageUnresolved.size) {
    unresolvedTotal += pageUnresolved.size;
    console.log(`\nPAGE ${pi + 1}: UNRESOLVED in page contents: ${[...pageUnresolved].join(", ")}`);
  } else {
    console.log(`\nPAGE ${pi + 1}: all page-content font refs resolve`);
  }
  if (xobjUnresolved.length) console.log(`  UNRESOLVED in XObjects: ${JSON.stringify(xobjUnresolved)}`);
  if (annotAp.length) console.log(`  UNRESOLVED in annotation APs: ${[...annotAp].join(", ")}`);

  console.log(`  fonts used: ${[...fontUsage.entries()].map(([n, s]) => `${n}[${[...s].join("|")}]`).join("  ")}`);
  console.log(`  page /Resources /Font: ${[...pageFonts.entries()].map(([n, v]) => `${n}->${JSON.stringify(v.dict)}`).join("\n    ")}`);
  if (xobjUnresolved.length || annotAp.length) unresolvedTotal++;

  // collect all font dicts for the summary
  for (const [n, v] of pageFonts) allFontDicts.set(`${n}@p${pi + 1}`, v.dict);
}

console.log(`\n=== UNRESOLVED COUNT: ${unresolvedTotal} ===`);

// Any /Type /Font objects anywhere in the document?
const fontObjs = [];
for (const obj of ctx.enumerateIndirectObjects()) {
  const [ref, o] = obj;
  if (o && typeof o.get === "function" && o.get(PDFName.of("Type"))?.decodeText?.() === "Font") {
    fontObjs.push({ ref: String(ref), dict: describeFont(o) });
  }
}
console.log(`\nAll font objects in document (${fontObjs.length}):`);
for (const f of fontObjs) console.log(`  ${f.ref} ${JSON.stringify(f.dict)}`);

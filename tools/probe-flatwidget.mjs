// tools/probe-flatwidget.mjs — ground truth for the FlatWidget XObject defect.
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName, PDFRef, PDFDict, PDFArray, PDFString } from "pdf-lib";
import { inflateSync } from "node:zlib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

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

// ---- 1. one non-stream FlatWidget dict: what is it? ----
const doc = await PDFDocument.load(loadBytes("downloaded-asdf.pdf"), { ignoreEncryption: true });
const ctx = doc.context;
const page1 = doc.getPages()[0];
const res = resolve(ctx, page1.node.Resources());
const xobj = resolve(ctx, res.get(PDFName.of("XObject")));
let shown = 0;
for (const key of xobj.keys()) {
  const v = resolve(ctx, xobj.get(key));
  if (v instanceof PDFDict && !(typeof v.getContents === "function")) {
    if (shown++ < 3) {
      console.log(`non-stream XObject /${key.toString().slice(1)} keys=[${v.keys().map((k) => k.toString()).join(", ")}]`);
      for (const k of ["Yes", "Off", "AP", "Subtype", "T", "P", "Rect"]) {
        const e = v.get(PDFName.of(k));
        if (e) {
          const eo = resolve(ctx, e);
          const desc = eo instanceof PDFDict ? `dict keys=[${eo.keys().map((x) => x.toString()).join(",")}]` : eo ? `ref->${eo.constructor?.name}` : "null";
          console.log(`   ${k}: ${e instanceof PDFRef ? `REF ${e.objectNumber} -> ` : ""}${desc}`);
        }
      }
    }
  }
}
console.log(`total non-stream XObject entries on page 1: ${xobj.keys().filter((k) => { const v = resolve(ctx, xobj.get(k)); return v instanceof PDFDict && !(typeof v.getContents === "function"); }).length}`);
console.log("");

// ---- 2. the /Yes (checked) appearance stream content ----
// find the state dict, get its /Yes stream, print content
for (const key of xobj.keys()) {
  const v = resolve(ctx, xobj.get(key));
  if (v instanceof PDFDict && v.has(PDFName.of("Yes"))) {
    const yes = resolve(ctx, v.get(PDFName.of("Yes")));
    console.log(`state dict /${key.toString().slice(1)} /Yes -> ${yes ? yes.constructor.name : "missing"}`);
    if (yes && typeof yes.getContents === "function") {
      const c = contentString(yes);
      console.log(`   /Yes stream content: "${c}"`);
      const resY = resolve(ctx, yes.dict.get(PDFName.of("Resources")));
      if (resY instanceof PDFDict) {
        const fY = resolve(ctx, resY.get(PDFName.of("Font")));
        console.log(`   /Yes resources fonts: ${fY instanceof PDFDict ? fY.keys().map((k) => k.toString()).join(", ") : "none"}`);
        if (fY instanceof PDFDict) {
          for (const fk of fY.keys()) {
            const fd = resolve(ctx, fY.get(fk));
            const bf = resolve(ctx, fd.get(PDFName.of("BaseFont")));
            console.log(`      ${fk.toString()} -> ${bf?.toString()}`);
          }
        }
      }
    }
    break;
  }
}
console.log("");

// ---- 3. does the PDF contain ZaDb / ZapfDingbats anywhere? ----
const raw = loadBytes("downloaded-asdf.pdf");
const s = Buffer.from(raw).toString("latin1");
console.log(`raw occurrences: "ZaDb"=${(s.match(/ZaDb/g) ?? []).length} "ZapfDingbats"=${(s.match(/ZapfDingbats/g) ?? []).length} "Helvetica"=${(s.match(/Helvetica/g) ?? []).length}`);

// ---- 4. reference.pdf + cleaned.pdf: page-1 widget /AP /N shape + AcroForm ----
for (const f of ["reference.pdf", "cleaned.pdf"]) {
  const d = await PDFDocument.load(loadBytes(f), { ignoreEncryption: true });
  const c2 = d.context;
  const form = d.getForm();
  const acro = resolve(c2, d.catalog.get(PDFName.of("AcroForm")));
  const na = resolve(c2, acro.get(PDFName.of("NeedAppearances")));
  const dr = resolve(c2, acro.get(PDFName.of("DR")));
  let drFonts = "none";
  if (dr instanceof PDFDict) {
    const df = resolve(c2, dr.get(PDFName.of("Font")));
    drFonts = df instanceof PDFDict ? df.keys().map((k) => k.toString()).join(", ") : "no /Font";
  }
  // find one checkbox widget and dump /AP /N
  let cbInfo = null;
  try {
    const boxes = form.getCheckBoxes();
    if (boxes.length) {
      const w = boxes[0].acroField.getWidgets()[0];
      const ap = resolve(c2, w.dict.get(PDFName.of("AP")));
      if (ap instanceof PDFDict) {
        const n = ap.get(PDFName.of("N"));
        const no = resolve(c2, n);
        cbInfo = `AP/N: ${n instanceof PDFRef ? `REF ${n.objectNumber} -> ` : ""}${no instanceof PDFDict ? `dict keys=[${no.keys().map((k) => k.toString()).join(",")}]` : no ? no.constructor.name : "missing"}`;
      }
    }
  } catch (e) { cbInfo = `getCheckBoxes threw: ${e.message}`; }
  console.log(`${f}: AcroForm NeedAppearances=${na?.toString()} DR.Font=${drFonts} fields=${form.getFields().length} | first checkbox widget: ${cbInfo}`);
}

// ---- 5. pdf.js warnings on reference.pdf ----
const captured = [];
const origWarn = console.warn;
console.warn = (...args) => captured.push(args.map(String).join(" "));
try {
  const rdoc = await getDocument({ data: loadBytes("reference.pdf"), useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
  for (let i = 1; i <= rdoc.numPages; i++) {
    const p = await rdoc.getPage(i);
    await p.getTextContent();
  }
} finally { console.warn = origWarn; }
const counts = {};
for (const w of captured) counts[w] = (counts[w] ?? 0) + 1;
console.log(`\nreference.pdf pdf.js warnings: total=${captured.length}`);
for (const [w, n] of Object.entries(counts)) console.log(`  [${n}x] ${w}`);

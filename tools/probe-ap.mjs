// Focused follow-up: values inside AP/N dicts (inline stream vs ref) and
// cleaned.pdf widget AP structure.
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName, PDFDict, PDFStream, PDFRef, PDFArray } from "pdf-lib";

const bytes = readFileSync(new URL("./downloaded-asdf.pdf", import.meta.url));
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const ctx = doc.context;
const page = doc.getPages()[0];
const xo = page.node.get(PDFName.of("Resources")).get(PDFName.of("XObject"));

// Inspect the DICT-type XObjects: what are /Yes and /Off values?
for (const k of xo.keys()) {
  const obj = ctx.lookup(xo.get(k));
  if (obj instanceof PDFDict) {
    const yes = obj.get(PDFName.of("Yes"));
    const off = obj.get(PDFName.of("Off"));
    const yesInfo = yes instanceof PDFRef
      ? `REF ${yes} -> ${ctx.lookup(yes)?.constructor?.name}`
      : yes instanceof PDFStream ? `INLINE STREAM len=${yes.getContentsString()?.length}` : `${yes?.constructor?.name}`;
    const offInfo = off instanceof PDFRef
      ? `REF ${off} -> ${ctx.lookup(off)?.constructor?.name}`
      : off instanceof PDFStream ? `INLINE STREAM len=${off.getContentsString()?.length}` : `${off?.constructor?.name}`;
    console.log(`${k}: AP/N dict -> Yes=[${yesInfo}] Off=[${offInfo}]`);
  }
}

// Text field FlatWidget streams: dump one longer content
for (const k of xo.keys()) {
  const obj = ctx.lookup(xo.get(k));
  if (obj instanceof PDFStream && (obj.getContentsString()?.length ?? 0) > 100) {
    console.log(`${k} content:`, obj.getContentsString().replace(/\s+/g, " ").slice(0, 200));
    console.log(`${k} /Resources:`, obj.dict.get(PDFName.of("Resources"))?.constructor?.name);
    const r = obj.dict.get(PDFName.of("Resources"));
    if (r instanceof PDFDict) {
      const f = r.get(PDFName.of("Font"));
      console.log(`  /Font: ${f instanceof PDFDict ? f.keys().map((x) => x.toString()).join(",") : String(f)}`);
      if (f instanceof PDFDict) {
        for (const fk of f.keys()) {
          const fv = f.get(fk);
          const target = fv instanceof PDFRef ? ctx.lookup(fv) : fv;
          console.log(`    ${fk} -> ${fv instanceof PDFRef ? "REF " + fv + " " : "inline "}${target?.constructor?.name}${target instanceof PDFDict ? " BaseFont=" + target.get(PDFName.of("BaseFont")) + " FontFile=" + (target.has(PDFName.of("FontFile")) ? "yes" : "no") + " Encoding=" + target.get(PDFName.of("Encoding")) : ""}`);
        }
      }
    }
    break;
  }
}

// ---- cleaned.pdf widgets ----
const cb = readFileSync(new URL("./cleaned.pdf", import.meta.url));
const doc2 = await PDFDocument.load(cb, { ignoreEncryption: true });
const ctx2 = doc2.context;
const form2 = doc2.getForm();
const dumpWidget = (name) => {
  const f = form2.getFieldMaybe(name);
  if (!f) { console.log(name, "NOT FOUND"); return; }
  const w = f.acroField.getWidgets()[0];
  const d = w.dict;
  const ap = d.get(PDFName.of("AP"));
  const apd = ap instanceof PDFRef ? ctx2.lookup(ap) : ap;
  console.log(`\n--- ${name} (${f.constructor.name}) AP=${apd?.constructor?.name} ---`);
  if (apd instanceof PDFDict) {
    const n = apd.get(PDFName.of("N"));
    const nd = n instanceof PDFRef ? ctx2.lookup(n) : n;
    console.log(`  AP/N: ${nd?.constructor?.name} keys=${nd instanceof PDFDict ? nd.keys().map((x) => x.toString()).join(",") : String(nd)}`);
    if (nd instanceof PDFDict) {
      for (const nk of nd.keys()) {
        const nv = nd.get(nk);
        console.log(`    ${nk}: ${nv instanceof PDFRef ? "REF " + nv.toString() + " -> " + ctx2.lookup(nv)?.constructor?.name + (ctx2.lookup(nv) instanceof PDFStream ? " stream" : "") : nv instanceof PDFStream ? `INLINE stream len=${nv.getContentsString()?.length}` : nv?.constructor?.name}`);
      }
    }
  }
  const as = d.get(PDFName.of("AS"));
  console.log(`  /AS: ${as ? String(as) : "none"}  /FT: ${String(d.get(PDFName.of("FT")))}  /Rect: ${String(d.get(PDFName.of("Rect")))}`);
};
dumpWidget("Check Box 10");
dumpWidget("Check Box 11");
dumpWidget("Check Box 18");
dumpWidget("Text Field 6");
dumpWidget("Text Field 8");
console.log("\nDONE");

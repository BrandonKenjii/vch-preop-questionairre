// Deep probe: what exactly do /Resources /XObject entries point at in
// downloaded-asdf.pdf, and what do checkbox/textfield widget /AP /N look
// like in cleaned.pdf?
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName, PDFDict, PDFStream, PDFRef, PDFArray, PDFString, PDFNumber } from "pdf-lib";

const bytes = readFileSync(new URL("./downloaded-asdf.pdf", import.meta.url));
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const ctx = doc.context;
const page = doc.getPages()[0];

const res = page.node.get(PDFName.of("Resources"));
const xo = res.get(PDFName.of("XObject"));
console.log("XObject dict keys (p1):", xo.keys().map((k) => k.toString()).join(" "));

// Dump first 12 XObject entries in detail
let n = 0;
for (const k of xo.keys()) {
  if (n++ >= 12) break;
  const raw = xo.get(k);
  let obj = raw;
  let refStr = "inline";
  if (obj instanceof PDFRef) { refStr = obj.toString(); try { obj = ctx.lookup(obj); } catch (e) { obj = "LOOKUP-FAILED"; } }
  if (obj instanceof PDFStream) {
    const d = obj.dict;
    console.log(`${k}: REF=${refStr} STREAM Subtype=${d.get(PDFName.of("Subtype"))} BBox=${d.has(PDFName.of("BBox")) ? "yes" : "NO"} Res=${d.has(PDFName.of("Resources")) ? "yes" : "NO"} len=${obj.getContentsString()?.length}`);
  } else if (obj instanceof PDFDict) {
    console.log(`${k}: REF=${refStr} DICT keys=${obj.keys().map((x) => x.toString()).join(",")}`);
  } else {
    console.log(`${k}: REF=${refStr} ${typeof obj === "string" ? obj : obj?.constructor?.name} raw=${String(raw)}`);
  }
}

// Page content stream: show the Do ops
const contents = page.node.get(PDFName.of("Contents"));
const arr = contents instanceof PDFArray ? contents : contents ? [contents] : [];
let all = "";
for (const c of arr) {
  const s = c instanceof PDFRef ? ctx.lookup(c) : c;
  if (s instanceof PDFStream) all += s.getContentsString() ?? "";
}
const doOps = [...all.matchAll(/\/FlatWidget[^\s]*\s+Do/g)].map((m) => m[0]);
console.log(`p1 content: ${all.length} chars, ${doOps.length} FlatWidget Do ops; first: ${doOps.slice(0, 5).join(" | ")}`);
console.log("sample of content head:", all.replace(/\s+/g, " ").slice(0, 400));

// Now cleaned.pdf widget dumps
const cb = readFileSync(new URL("./cleaned.pdf", import.meta.url));
const doc2 = await PDFDocument.load(cb, { ignoreEncryption: true });
const ctx2 = doc2.context;
const form2 = doc2.getForm();
const dumpWidget = (name) => {
  const f = form2.getFieldMaybe(name);
  if (!f) { console.log(name, "NOT FOUND"); return; }
  const w = f.acroField.getWidgets()[0];
  const d = w.dict;
  console.log(`\n--- ${name} (${f.constructor.name}) widget dict ---`);
  for (const key of d.keys()) {
    const v = d.get(key);
    if (key.toString() === "AP") {
      console.log("  AP:", v?.constructor?.name, String(v));
      if (v instanceof PDFDict || (v instanceof PDFRef && (() => { try { return (v = ctx2.lookup(v)) instanceof PDFDict; } catch { return false; } })())) {
        const apd = v instanceof PDFRef ? ctx2.lookup(v) : v;
        for (const ak of apd.keys()) {
          const av = apd.get(ak);
          console.log(`    AP/${ak}: ${av?.constructor?.name} ${String(av)}`);
          if (av instanceof PDFDict) {
            console.log(`      N keys: ${av.keys().map((x) => x.toString()).join(",")}`);
            for (const nk of av.keys()) {
              const nv = av.get(nk);
              if (nv instanceof PDFRef) {
                const target = ctx2.lookup(nv);
                console.log(`        ${nk} -> ${nv} is ${target?.constructor?.name}${target instanceof PDFStream ? " stream len=" + target.getContentsString()?.length : target instanceof PDFDict ? " dict keys=" + target.keys().map((x) => x.toString()).join(",") : ""}`);
              } else if (nv instanceof PDFStream) {
                console.log(`        ${nk} -> inline stream len=${nv.getContentsString()?.length}`);
              } else {
                console.log(`        ${nk} -> ${nv?.constructor?.name} ${String(nv)}`);
              }
            }
          }
        }
      }
    } else {
      console.log(`  ${key}: ${v?.constructor?.name} ${String(v).slice(0, 120)}`);
    }
  }
};
dumpWidget("Check Box 10");
dumpWidget("Check Box 11");
dumpWidget("Text Field 6");
console.log("\nDONE");

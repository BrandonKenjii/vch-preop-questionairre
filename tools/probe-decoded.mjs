// Decode checkbox on-state appearance stream; check /MK /R on widgets.
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PDFDocument, PDFName, PDFDict, PDFStream, PDFRef } from "pdf-lib";

const bytes = readFileSync(new URL("./downloaded-asdf.pdf", import.meta.url));
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const ctx = doc.context;
const page = doc.getPages()[0];
const xo = page.node.get(PDFName.of("Resources")).get(PDFName.of("XObject"));
let n = 0;
for (const k of xo.keys()) {
  const obj = ctx.lookup(xo.get(k));
  if (obj instanceof PDFDict && n++ < 1) {
    const yes = ctx.lookup(obj.get(PDFName.of("Yes")));
    if (yes instanceof PDFStream) {
      const raw = Buffer.from(yes.getContents() ?? new Uint8Array(0));
      let dec = "";
      try { dec = inflateSync(raw).toString("latin1"); } catch { dec = raw.toString("latin1"); }
      console.log(`Decoded /Yes appearance (${k}):`);
      console.log(dec);
    }
  }
}

// /MK /R on cleaned.pdf widgets
const cb = readFileSync(new URL("./cleaned.pdf", import.meta.url));
const doc2 = await PDFDocument.load(cb, { ignoreEncryption: true });
const ctx2 = doc2.context;
const form2 = doc2.getForm();
let rCount = new Map();
let sample = [];
for (const f of form2.getFields()) {
  const w = f.acroField.getWidgets()[0];
  const mk = w?.dict.get(PDFName.of("MK"));
  if (mk instanceof PDFDict) {
    const r = mk.get(PDFName.of("R"));
    const key = r ? String(r) : "(none)";
    rCount.set(key, (rCount.get(key) ?? 0) + 1);
    if (sample.length < 5) sample.push({ name: f.getName(), MK: mk.keys().map((x) => x.toString()).join(","), R: key, BC: String(mk.get(PDFName.of("BC"))), BG: String(mk.get(PDFName.of("BG"))) });
  }
}
console.log("\n/MK /R distribution in cleaned.pdf:", [...rCount.entries()].map(([k, v]) => `${k}:${v}`).join(" "));
for (const s of sample) console.log(" ", JSON.stringify(s));
console.log("\nDONE");

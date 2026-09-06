// Controlled experiment: check CB11 in cleaned.pdf, inspect field/widget
// state before and after flatten, and decompress the baked FlatWidget stream.
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PDFDocument, PDFName, PDFDict, PDFStream, PDFRawStream, PDFRef } from "pdf-lib";

const dec = (b) => {
  try { return inflateSync(b).toString("latin1"); } catch { return b.toString("latin1"); }
};

const src = readFileSync(new URL("./cleaned.pdf", import.meta.url));
const doc = await PDFDocument.load(src, { ignoreEncryption: true, updateMetadata: false });
const ctx = doc.context;
const form = doc.getForm();

const cb = form.getCheckBox("Check Box 11");
console.log("before check: /V =", cb.acroField.getValue()?.toString?.(), "isChecked =", cb.isChecked());

cb.check();
console.log("after check: /V =", cb.acroField.getValue()?.toString?.(), "isChecked =", cb.isChecked());

const w = cb.acroField.getWidgets()[0];
console.log("widget /AS =", w.dict.get(PDFName.of("AS"))?.toString?.());
const ap = ctx.lookup(w.dict.get(PDFName.of("AP")), PDFDict);
const n = ap ? ctx.lookup(ap.get(PDFName.of("N")), PDFDict) : null;
if (n instanceof PDFDict) {
  for (const k of n.keys()) {
    const v = n.get(k);
    if (v instanceof PDFRef) {
      const o = ctx.lookup(v);
      if (o instanceof PDFStream || o instanceof PDFRawStream) {
        console.log(`  /AP /N ${k}: REF stream raw=${o.getContents().length}b decoded=${JSON.stringify(dec(o.getContents()))}`);
      } else {
        console.log(`  /AP /N ${k}: REF -> ${typeof o}`);
      }
    } else {
      console.log(`  /AP /N ${k}: direct ${typeof v}`);
    }
  }
} else {
  console.log("  /AP /N not a dict:", n?.toString?.());
}

// now flatten and inspect the FlatWidget at CB11 rect
form.flatten();
const page = doc.getPages()[0];
const ops = dec(page.node.Contents().getContents());
const xoRes = ctx.lookup(page.node.Resources()?.get(PDFName.of("XObject")));
const lines = ops.split(/\n|\r/);
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) cm$/);
  if (m && Math.abs(+m[5] - 249.76) < 1 && Math.abs(+m[6] - 333.379) < 1) {
    const name = lines[i + 1]?.match(/\/(FlatWidget-\d+)/)?.[1];
    console.log(`flattened CB11 at line ${i}: ${lines[i]} / ${lines[i + 1]}`);
    if (name && xoRes instanceof PDFDict) {
      const o = ctx.lookup(xoRes.get(PDFName.of(name)));
      if (o instanceof PDFStream || o instanceof PDFRawStream) {
        console.log(`  ${name}: raw=${o.getContents().length}b decoded=${JSON.stringify(dec(o.getContents()))}`);
      } else console.log(`  ${name}: ${typeof o}`);
    }
  }
}

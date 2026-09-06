// dump one PDFDict FlatWidget + the widget's own dict (AP etc) on page 9
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName } from "pdf-lib";
const bytes = readFileSync(new URL("./downloaded-asdf.pdf", import.meta.url));
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const ctx = doc.context;
const page = doc.getPages()[8];
const xo = page.node.Resources()?.get?.(PDFName.of("XObject"));
let n = 0;
for (const [k, v] of xo.entries()) {
  const key = typeof k === "string" ? k : k.encodedName ?? String(k);
  if (!key.startsWith("/FlatWidget")) continue;
  const obj = ctx.lookup(v);
  if (obj.constructor?.name === "PDFDict" && n++ === 0) {
    console.log(`===== ${key} is a PDFDict with keys:`);
    for (const [dk, dv] of obj.entries()) {
      const dkey = typeof dk === "string" ? dk : dk.encodedName ?? String(dk);
      console.log(`   ${dkey} => ${dv.constructor?.name}`);
    }
    break;
  }
}

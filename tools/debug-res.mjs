import { readFileSync } from "node:fs";
import { PDFDocument, PDFName } from "pdf-lib";
const bytes = readFileSync(new URL("./downloaded-asdf.pdf", import.meta.url));
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const ctx = doc.context;
const page = doc.getPages()[0];
const res = page.node.Resources();
console.log("Resources type:", res?.constructor?.name ?? null);
const xo = res?.get?.(PDFName.of("XObject"));
console.log("XObject type:", xo?.constructor?.name ?? null);
let count = 0;
if (xo && xo.entries) {
  for (const [k, v] of xo.entries()) {
    const key = typeof k === "string" ? k : k.encodedName ?? String(k);
    if (key.startsWith("FlatWidget")) {
      count++;
      const obj = v instanceof Object && v.constructor?.name === "PDFRef" ? ctx.lookup(v) : v;
      if (count <= 5) console.log("  XObject:", key, "=>", obj?.constructor?.name);
    }
  }
}
console.log("total FlatWidget on p1:", count);

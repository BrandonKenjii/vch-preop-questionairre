// dump the /AP /N of a checkbox widget in cleaned.pdf
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName } from "pdf-lib";
const bytes = readFileSync(new URL("./cleaned.pdf", import.meta.url));
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const ctx = doc.context;
const form = doc.getForm();
for (const name of ["Check Box 11", "Check Box 10", "Text Field 6", "Text Field 8"]) {
  const f = form.getFieldMaybe(name);
  if (!f) {
    console.log(`${name}: NOT FOUND`);
    continue;
  }
  const w = f.acroField.getWidgets()[0];
  let ap = w.dict.get(PDFName.of("AP"));
  if (ap?.constructor?.name === "PDFRef") ap = ctx.lookup(ap);
  const n = ap?.get?.(PDFName.of("N"));
  console.log(`${name}: AP=${ap?.constructor?.name}  N=${n?.constructor?.name}${n?.encodedName ? " " + n.encodedName : ""}`);
  if (n && n.constructor?.name === "PDFRef") {
    const target = ctx.lookup(n);
    console.log(`   N resolves to: ${target?.constructor?.name} keys=${target?.entries ? [...target.entries()].map(([k]) => (k.encodedName ?? String(k))).join(",") : "?"}`);
  }
}

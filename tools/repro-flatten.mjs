// repro-flatten.mjs — reproduce the app's fill+flatten on cleaned.pdf and
// inspect whether checkbox FlatWidget XObject entries are streams or dicts.
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument, PDFName } from "pdf-lib";

const src = readFileSync(new URL("./cleaned.pdf", import.meta.url));
const doc = await PDFDocument.load(src, { ignoreEncryption: true });
const form = doc.getForm();

// mimic the generator's per-field DA set + setText/check
for (const f of form.getFields()) {
  const name = f.getName();
  if (name === "Text Field 6") {
    f.acroField.getWidgets()[0].dict.set(PDFName.of("DA"), "(/Helv 9 Tf 0 g)");
    f.setText("2026-08-25");
  } else if (name === "Check Box 11") {
    f.check();
  } else if (name === "Check Box 10") {
    f.uncheck();
  }
}
form.flatten();
const bytes = await doc.save();
writeFileSync(new URL("./repro-filled.pdf", import.meta.url), bytes);
console.log("saved repro-filled.pdf", bytes.length);

// inspect
const doc2 = await PDFDocument.load(bytes, { ignoreEncryption: true });
const ctx = doc2.context;
const page = doc2.getPages()[0];
const xo = page.node.Resources()?.get?.(PDFName.of("XObject"));
for (const [k, v] of xo.entries()) {
  const key = typeof k === "string" ? k : k.encodedName ?? String(k);
  if (!key.startsWith("/FlatWidget")) continue;
  const obj = ctx.lookup(v);
  console.log(`${key}: ${obj.constructor?.name}`);
}

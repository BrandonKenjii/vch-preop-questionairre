// One-time preprocessing: the reference PDF contains two parallel copies of
// every form widget — one set in each page's /Annots array (what viewers
// render) and a duplicate set in the AcroForm /Fields array (what pdf-lib
// edits). The /Fields copies carry no /P entry and are not in any page's
// /Annots, which makes pdf-lib's flatten() throw and would leave stale blank
// widgets displayed on top of filled values.
//
// This script deduplicates: it rewrites every page's /Annots array to
// reference the /Fields widget objects (matched by field name + rect), so
// each field has exactly one widget, which lives on its page.
// Output: src/data/template.pdf (bundled by the app) + tools/cleaned.pdf.
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument, PDFName, PDFString, PDFDict } from "pdf-lib";

const bytes = readFileSync(new URL("./reference.pdf", import.meta.url));
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
const form = doc.getForm();
const ctx = doc.context;
const pages = doc.getPages();

const fieldsRefs = form.acroForm.dict.get(PDFName.of("Fields")).asArray();
const fields = form.getFields();

const round = (n) => Math.round(n * 10) / 10;
const keyOf = (name, r) => `${name}|${round(r.x)}|${round(r.y)}|${round(r.width)}|${round(r.height)}`;

// Index /Fields widgets by (name + rect) -> ref.
const fieldsByKey = new Map();
fields.forEach((field, i) => {
  for (const w of field.acroField.getWidgets()) {
    const rect = w.getRectangle();
    fieldsByKey.set(keyOf(field.getName(), rect), fieldsRefs[i]);
  }
});

// Rewrite each page's /Annots to point at the /Fields widget refs.
let replaced = 0;
let kept = 0;
for (const page of pages) {
  const annotRefs = page.node.Annots()?.asArray() ?? [];
  const newAnnots = annotRefs.map((oldRef) => {
    const d = ctx.lookup(oldRef, PDFDict);
    if (!d) return oldRef;
    const t = d.get(PDFName.of("T"));
    const rect = d.get(PDFName.of("Rect"));
    if (!(t instanceof PDFString) || !rect) return oldRef;
    const arr = rect.asArray().map((n) => n.asNumber());
    const key = keyOf(t.decodeText(), {
      x: Math.min(arr[0], arr[2]),
      y: Math.min(arr[1], arr[3]),
      width: Math.abs(arr[2] - arr[0]),
      height: Math.abs(arr[3] - arr[1]),
    });
    const newRef = fieldsByKey.get(key);
    if (newRef) {
      replaced++;
      return newRef;
    }
    kept++;
    return oldRef;
  });
  page.node.set(PDFName.of("Annots"), ctx.obj(newAnnots));
}

console.log(`annot entries replaced with /Fields widgets: ${replaced} (kept as-is: ${kept})`);
console.log(`total form fields: ${fields.length}`);

const outBytes = await doc.save();
writeFileSync(new URL("./cleaned.pdf", import.meta.url), outBytes);
writeFileSync(new URL("../src/data/template.pdf", import.meta.url), outBytes);
console.log("wrote tools/cleaned.pdf and src/data/template.pdf");

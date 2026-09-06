// Replicates the FIXED generator pipeline (post-11:51 source):
// fill fields with /DA set, check/uncheck boxes, inline /AP /N dicts
// (normalizeCheckboxAppearances), then flatten({updateFieldAppearances:false}).
// Output is audited for leaked dict XObjects by audit-xobjects.mjs.
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument, PDFName, PDFString, PDFRef, PDFDict } from "pdf-lib";

const src = readFileSync(new URL("./cleaned.pdf", import.meta.url));
const doc = await PDFDocument.load(src, { ignoreEncryption: true });
const form = doc.getForm();
const font = await doc.embedFont(await import("pdf-lib").then(m => m.StandardFonts.Helvetica));

function setTextAtSize(field, text, size) {
  field.defaultUpdateAppearances(font);
  field.acroField.getWidgets()[0].dict.set(PDFName.of("DA"), PDFString.of(`/Helv ${size} Tf 0 g`));
  field.setText(text);
}

setTextAtSize(form.getTextField("Text Field 6"), "2026-08-25", 9);
setTextAtSize(form.getTextField("Text Field 15"), "TEST PROCEDURE ABC", 9);
setTextAtSize(form.getTextField("Text Field 8"), "asdf", 9);
form.getCheckBox("Check Box 11").check();
form.getCheckBox("Check Box 10").uncheck();

// normalizeCheckboxAppearances (as in fixed source)
for (const field of doc.getForm().getFields()) {
  if (!(field instanceof (await import("pdf-lib")).PDFCheckBox)) continue;
  const widget = field.acroField.getWidgets()[0];
  const apRef = widget.dict.get(PDFName.of("AP"));
  const ap = apRef ? doc.context.lookup(apRef) : undefined;
  if (!(ap instanceof PDFDict)) continue;
  const n = ap.get(PDFName.of("N"));
  if (n instanceof PDFRef) {
    const nDict = doc.context.lookup(n);
    if (nDict instanceof PDFDict) ap.set(PDFName.of("N"), nDict);
  }
}

form.flatten({ updateFieldAppearances: false });
const bytes = await doc.save();
writeFileSync(new URL("./fixed-pipeline.pdf", import.meta.url), bytes);
console.log("saved fixed-pipeline.pdf", bytes.byteLength, "bytes");

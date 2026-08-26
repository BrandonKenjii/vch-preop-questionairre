// Empirical test of the duplicate-widget structure: does a pdf-lib fill +
// flatten produce a PDF that displays the values? Checks programmatically:
//   1. After fill+flatten+save, does pdf.js text extraction show the values
//      as page content?
//   2. What happens to the /Annots widgets and /Fields after flatten?
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument, PDFName, PDFDict } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const src = readFileSync(new URL("./cleaned.pdf", import.meta.url));

// --- 1. Fill + flatten with pdf-lib ---
const doc = await PDFDocument.load(src, { ignoreEncryption: true });
const form = doc.getForm();
form.getTextField("Text Field 6").setText("2026-08-25");
form.getTextField("Text Field 15").setText("TEST PROCEDURE ABC");
form.getCheckBox("Check Box 11").check();
form.getCheckBox("Check Box 10").uncheck();
form.flatten();
const bytes = await doc.save();
writeFileSync(new URL("./test-filled.pdf", import.meta.url), bytes);
console.log("saved test-filled.pdf");

// --- 2. Inspect the saved PDF structure with pdf-lib ---
const doc2 = await PDFDocument.load(bytes, { ignoreEncryption: true });
const ctx = doc2.context;
const form2 = doc2.getForm();
console.log("fields after flatten:", form2.getFields().length);
const page = doc2.getPages()[0];
const annots = page.node.Annots()?.asArray() ?? [];
console.log("page 1 annots after flatten:", annots.length);
for (const a of annots) {
  const d = ctx.lookup(a, PDFDict);
  if (!d) continue;
  const t = d.get(PDFName.of("T"));
  const sub = d.get(PDFName.of("Subtype"));
  console.log("  annot:", sub?.toString(), "T:", t?.toString?.());
}

// --- 3. Does the rendered page actually show the values? (pdf.js text) ---
const loadingTask = getDocument({
  data: new Uint8Array(bytes),
  useWorkerFetch: false,
  isEvalSupported: false,
  useSystemFonts: true,
});
const pdfjsDoc = await loadingTask.promise;
const p1 = await pdfjsDoc.getPage(1);
const content = await p1.getTextContent();
const strings = content.items.map((it) => it.str).join(" | ");
console.log("page 1 rendered text contains '2026-08-25':", strings.includes("2026-08-25"));
console.log("page 1 rendered text contains 'TEST PROCEDURE ABC':", strings.includes("TEST PROCEDURE ABC"));

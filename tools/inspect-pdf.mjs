// Inspect a generated questionnaire PDF: pages, remaining form fields,
// XObject validity (the checkbox-rendering tell), pdf.js warnings, and
// which filled values actually appear in rendered page text.
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName, PDFDict, PDFStream } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node inspect-pdf.mjs <path-to-pdf>");
  process.exit(1);
}
const bytes = readFileSync(file);

const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const ctx = doc.context;
console.log("pages:", doc.getPageCount());
console.log("form fields remaining (0 = flattened):", doc.getForm().getFields().length);

let streams = 0;
let broken = 0;
const brokenByPage = new Map();
for (const page of doc.getPages()) {
  const xobj = page.node.Resources()?.lookup(PDFName.of("XObject"), PDFDict);
  if (!xobj) continue;
  for (const [, v] of xobj.entries()) {
    const o = ctx.lookup(v);
    if (o instanceof PDFStream) streams++;
    else {
      broken++;
      brokenByPage.set(brokenByPage.size + 1, o?.constructor?.name ?? "?");
    }
  }
}
console.log(`widget XObjects: ${streams} valid streams, ${broken} BROKEN (not streams)`);

const pdfjs = await getDocument({
  data: new Uint8Array(bytes),
  useWorkerFetch: false,
  isEvalSupported: false,
  useSystemFonts: true,
}).promise;

let warnings = 0;
const origWarn = console.warn;
console.warn = () => {
  warnings++;
};

const needles = [
  "Jane Doe",
  "9123456789",
  "Knee arthroscopy",
  "Malignant hyperthermia",
  "Sleep Clinic",
  "Atrial fibrillation",
  "Pradaxa",
  "Eliquis",
  "Penicillin",
  "Peanuts",
  "7.2%",
  "Atorvastatin",
  "Metformin",
  "604-555-1234",
  "Squamish",
];
for (let i = 1; i <= pdfjs.numPages; i++) {
  const page = await pdfjs.getPage(i);
  const content = await page.getTextContent();
  const text = content.items.map((it) => it.str).join(" ");
  const found = needles.filter((n) => text.includes(n));
  console.log(`page ${i}: text items=${content.items.length}, expected values found: ${found.join(", ") || "(none)"}`);
  await page.getOperatorList().catch(() => {});
}
console.warn = origWarn;
console.log(`pdf.js warnings: ${warnings} (broken checkbox XObjects log "XObject should be a stream")`);

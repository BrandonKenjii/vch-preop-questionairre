// count pdf.js "ignoring XObject" warnings while extracting one PDF
import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
const file = process.argv[2] ?? "cleaned.pdf";
let warnings = 0;
const origWarn = console.warn;
console.warn = (...args) => {
  if (args[0]?.toString?.().includes("ignoring XObject")) warnings++;
  origWarn(...args);
};
const bytes = new Uint8Array(readFileSync(new URL(file, import.meta.url)));
const doc = await getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
for (let i = 0; i < doc.numPages; i++) {
  await (await doc.getPage(i + 1)).getTextContent();
}
console.log(`${file}: ${warnings} XObject warnings`);

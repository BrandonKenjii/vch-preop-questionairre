// Extracts every text run from each page with its position, in visual
// reading order (top-to-bottom, left-to-right). Used to correlate form
// fields with the questions printed on the page.
import { readFileSync, writeFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const bytes = readFileSync(new URL("./reference.pdf", import.meta.url));

const loadingTask = getDocument({
  data: new Uint8Array(bytes),
  useWorkerFetch: false,
  isEvalSupported: false,
  useSystemFonts: true,
});
const doc = await loadingTask.promise;

let out = `Text extraction from reference PDF (reading order per page)\n`;
for (let i = 0; i < doc.numPages; i++) {
  const page = await doc.getPage(i + 1);
  const content = await page.getTextContent();
  const items = content.items
    .filter((it) => typeof it.str === "string" && it.str.trim() !== "")
    .map((it) => {
      const x = it.transform[4];
      const y = it.transform[5];
      return { str: it.str, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, h: Math.round(it.height * 10) / 10 };
    })
    .sort((a, b) => (Math.abs(b.y - a.y) > 1.5 ? b.y - a.y : a.x - b.x));

  out += `\n===== PAGE ${i + 1} =====\n`;
  let line = "";
  let lineY = null;
  for (const it of items) {
    if (lineY !== null && Math.abs(it.y - lineY) > 2) {
      out += `  y=${String(lineY).padStart(6)} | ${line}\n`;
      line = "";
      lineY = null;
    }
    line += it.str + " ";
    lineY = it.y;
  }
  if (line) out += `  y=${String(lineY).padStart(6)} | ${line}\n`;
}

writeFileSync(new URL("./text.txt", import.meta.url), out);
console.log(out);
console.log("\nWrote text.txt");

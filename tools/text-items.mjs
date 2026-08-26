// Dumps every text item with full x/y/w/h into text-items.json, and
// optionally prints items for a given page within a y-range (for
// disambiguating which field goes with which label).
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

const all = [];
for (let i = 0; i < doc.numPages; i++) {
  const page = await doc.getPage(i + 1);
  const content = await page.getTextContent();
  const items = content.items
    .filter((it) => typeof it.str === "string" && it.str.trim() !== "")
    .map((it) => ({
      page: i,
      str: it.str,
      x: Math.round(it.transform[4] * 10) / 10,
      y: Math.round(it.transform[5] * 10) / 10,
      w: Math.round(it.width * 10) / 10,
      h: Math.round(it.height * 10) / 10,
    }));
  all.push(...items);
}
writeFileSync(new URL("./text-items.json", import.meta.url), JSON.stringify(all));

// Query support: node text-items.mjs [page] [yMin] [yMax]
const [qPage, qYMin, qYMax] = process.argv.slice(2).map(Number);
if (qPage !== undefined) {
  const rows = all
    .filter((it) => it.page === qPage - 1)
    .filter((it) => (qYMin === undefined || it.y >= qYMin) && (qYMax === undefined || it.y <= qYMax))
    .sort((a, b) => (Math.abs(b.y - a.y) > 1.5 ? b.y - a.y : a.x - b.x));
  for (const r of rows) {
    console.log(`p${r.page + 1} y=${String(r.y).padStart(6)} x=${String(r.x).padStart(6)} w=${String(r.w).padStart(6)} | ${r.str}`);
  }
} else {
  console.log(`wrote text-items.json (${all.length} items)`);
}

// check-content.mjs — decompress every page content stream of a PDF and list
// the literal text-run strings (Tj / TJ elements), so we can compare what is
// ACTUALLY in the file against what pdf.js extracted (detects pdf.js
// extraction loss vs genuine truncation at write time).
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName, PDFArray } from "pdf-lib";
import { inflateSync } from "node:zlib";

const file = process.argv[2] ?? "downloaded-asdf.pdf";
const pat = process.argv[3] ?? "asdf";

const bytes = readFileSync(new URL(file, import.meta.url));
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const pages = doc.getPages();

for (let i = 0; i < pages.length; i++) {
  const content = pages[i].node.Contents();
  const streams = content instanceof PDFArray ? content.asArray() : [content];
  let raw = "";
  for (const ref of streams) {
    const obj = doc.context.lookup(ref);
    if (!obj) continue;
    const dict = obj.dict ?? obj;
    let data = dict.get(PDFName.of("Filter")) ? inflateSync(obj.contents) : obj.contents;
    raw += Buffer.isBuffer(data) ? data.toString("latin1") : String(data);
  }
  // extract strings ( ( ... ) ) and hex strings
  const strings = [...raw.matchAll(/\(((?:[^()\\]|\\.)*)\)/g)].map((m) => m[1]);
  const hits = strings.filter((s) => s.toLowerCase().includes(pat.toLowerCase()));
  if (hits.length) {
    console.log(`page ${i + 1}: ${hits.length} string(s) matching /${pat}/`);
    for (const h of hits) console.log(`   [${h.length}] "${h}"`);
  } else {
    console.log(`page ${i + 1}: no strings matching /${pat}/`);
  }
}

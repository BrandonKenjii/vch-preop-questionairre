// check-content3.mjs — extract text-run strings from the /FlatWidget-* Form
// XObjects that pdf-lib's flatten() planted on each page, plus the page's own
// content-stream text. This is the GROUND TRUTH for what is actually drawn.
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName } from "pdf-lib";
import { inflateSync } from "node:zlib";

const file = process.argv[2] ?? "downloaded-asdf.pdf";
const pat = process.argv[3] ?? "asdf";

const bytes = readFileSync(new URL(file, import.meta.url));
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const pages = doc.getPages();

function scan(content, label) {
  const strings = [...content.matchAll(/\(((?:[^()\\]|\\.)*)\)/g)].map((m) => m[1]);
  const hits = strings.filter((s) => s.toLowerCase().includes(pat.toLowerCase()));
  if (hits.length) {
    console.log(`  ${label}: ${hits.length} string(s) matching /${pat}/`);
    for (const h of hits) console.log(`     [${h.length}] "${h}"`);
  }
}

for (let i = 0; i < pages.length; i++) {
  const page = pages[i];
  const pageXObjects = page.node.Resources()?.get(PDFName.of("XObject"));
  const flatWidgets = [];
  if (pageXObjects instanceof Map) {
    for (const [name, ref] of pageXObjects) {
      if (name.startsWith("FlatWidget")) flatWidgets.push(ref);
    }
  } else if (pageXObjects && pageXObjects.entries) {
    // PDFDict
    const dict = pageXObjects;
    for (const [name, ref] of dict.entries()) {
      const key = typeof name === "string" ? name : name.encodedName ?? String(name);
      if (key.startsWith("FlatWidget") || key.startsWith("/FlatWidget")) flatWidgets.push(ref);
    }
  }
  console.log(`page ${i + 1}: ${flatWidgets.length} FlatWidget XObjects`);
  let any = false;
  for (const ref of flatWidgets) {
    const obj = doc.context.lookup(ref);
    if (!obj) continue;
    let data;
    try {
      data = obj.contents ? inflateSync(obj.contents) : obj.contents;
    } catch {
      data = obj.contents;
    }
    if (!data) continue;
    const txt = Buffer.isBuffer(data) ? data.toString("latin1") : String(data);
    scan(txt, `FlatWidget ${ref.objectNumber} (len=${txt.length})`);
    if (/asdf/i.test(txt)) any = true;
  }
  if (!any) console.log(`  (no FlatWidget content matches /${pat}/)`);
}

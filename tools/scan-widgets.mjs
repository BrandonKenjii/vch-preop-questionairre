// scan-widgets.mjs — classify every /FlatWidget-* XObject in the PDF:
// valid stream with text / valid stream without text / "undefined" content /
// not-a-stream / missing. The "undefined" content would be a pdf-lib bug.
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName } from "pdf-lib";
import { inflateSync } from "node:zlib";

const file = process.argv[2] ?? "downloaded-asdf.pdf";
const bytes = readFileSync(new URL(file, import.meta.url));
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const ctx = doc.context;
const pages = doc.getPages();

let total = 0, undef = 0, validText = 0, validNoText = 0, notStream = 0, empty = 0;
for (let i = 0; i < pages.length; i++) {
  const xo = pages[i].node.Resources()?.get?.(PDFName.of("XObject"));
  if (!xo || !xo.entries) continue;
  for (const [k, v] of xo.entries()) {
    const key = typeof k === "string" ? k : k.encodedName ?? String(k);
    if (!key.startsWith("/FlatWidget")) continue;
    total++;
    let obj;
    try {
      obj = ctx.lookup(v);
    } catch {
      notStream++;
      continue;
    }
    if (!obj) { notStream++; continue; }
    const isStream = obj.contents !== undefined || obj.constructor?.name === "PDFStream" || obj.constructor?.name === "PDFRawStream";
    if (!isStream) {
      notStream++;
      console.log(`p${i + 1} ${key}: NOT A STREAM (${obj.constructor?.name})`);
      continue;
    }
    let data;
    try {
      data = inflateSync(obj.contents);
    } catch {
      data = obj.contents;
    }
    const txt = Buffer.isBuffer(data) ? data.toString("latin1") : String(data);
    if (txt === "undefined") {
      undef++;
      console.log(`p${i + 1} ${key}: CONTENT IS LITERALLY "undefined"`);
      continue;
    }
    if (txt.trim() === "") { empty++; continue; }
    if (txt.includes("Tj") || txt.includes("TJ")) validText++;
    else validNoText++;
  }
}
console.log(`\nTOTAL FlatWidgets: ${total}`);
console.log(`content = "undefined": ${undef}`);
console.log(`valid stream WITH text ops: ${validText}`);
console.log(`valid stream without text ops (vector/empty): ${validNoText}`);
console.log(`empty content: ${empty}`);
console.log(`not a stream: ${notStream}`);

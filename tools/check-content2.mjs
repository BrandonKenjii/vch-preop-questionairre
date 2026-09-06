// debug: dump raw (decompressed) page content stream headers to see structure
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName, PDFArray } from "pdf-lib";
import { inflateSync } from "node:zlib";

const bytes = readFileSync(new URL("./downloaded-asdf.pdf", import.meta.url));
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const pages = doc.getPages();

for (let i = 0; i < pages.length; i++) {
  const content = pages[i].node.Contents();
  const streams = content instanceof PDFArray ? content.asArray() : [content];
  console.log(`page ${i + 1}: ${streams.length} content stream(s)`);
  let idx = 0;
  for (const ref of streams) {
    const obj = doc.context.lookup(ref);
    if (!obj) {
      console.log(`  stream ${idx}: lookup FAILED`);
      idx++;
      continue;
    }
    const dict = obj.dict ?? obj;
    const filter = dict.get(PDFName.of("Filter"));
    let data;
    try {
      data = filter ? inflateSync(obj.contents) : obj.contents;
    } catch (e) {
      console.log(`  stream ${idx}: inflate FAILED: ${e.message}`);
      idx++;
      continue;
    }
    const txt = Buffer.isBuffer(data) ? data.toString("latin1") : String(data);
    console.log(`  stream ${idx}: len=${txt.length} head=${JSON.stringify(txt.slice(0, 160))}`);
    idx++;
  }
}

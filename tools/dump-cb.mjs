// dump-cb.mjs — dump one checkbox FlatWidget (first on page 9) to see whether
// the check mark is drawn as text (ZapfDingbats) or vector path
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName } from "pdf-lib";
import { inflateSync } from "node:zlib";

const bytes = readFileSync(new URL("./downloaded-asdf.pdf", import.meta.url));
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const ctx = doc.context;
const page = doc.getPages()[8];
const xo = page.node.Resources()?.get?.(PDFName.of("XObject"));
let n = 0;
for (const [k, v] of xo.entries()) {
  const key = typeof k === "string" ? k : k.encodedName ?? String(k);
  if (!key.startsWith("/FlatWidget")) continue;
  if (n++ > 0) break;
  const obj = ctx.lookup(v);
  let data;
  try {
    data = inflateSync(obj.contents);
  } catch {
    data = obj.contents;
  }
  const txt = Buffer.isBuffer(data) ? data.toString("latin1") : String(data);
  console.log(`===== ${key} (len ${txt.length}) =====`);
  console.log(txt);
  console.log("===== Resources:", JSON.stringify(obj.dict?.get(PDFName.of("Resources"))?.constructor?.name));
}

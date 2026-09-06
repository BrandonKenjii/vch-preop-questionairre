// dump-widget.mjs — print full contents of the first N FlatWidget XObjects on page P
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName } from "pdf-lib";
import { inflateSync } from "node:zlib";

const pageIdx = Number(process.argv[2] ?? "0");
const maxN = Number(process.argv[3] ?? "3");
const bytes = readFileSync(new URL("./downloaded-asdf.pdf", import.meta.url));
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const ctx = doc.context;
const page = doc.getPages()[pageIdx];
const xo = page.node.Resources()?.get?.(PDFName.of("XObject"));
let shown = 0;
for (const [k, v] of xo.entries()) {
  const key = typeof k === "string" ? k : k.encodedName ?? String(k);
  if (!key.startsWith("/FlatWidget")) continue;
  if (shown++ >= maxN) break;
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
}

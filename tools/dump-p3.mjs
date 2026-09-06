// dump-p3.mjs — print FlatWidget XObjects on page 3 that contain text runs,
// with their positioning operators (Tm/TL/TD/Tj) so we can see line layout.
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName } from "pdf-lib";
import { inflateSync } from "node:zlib";

const bytes = readFileSync(new URL("./downloaded-asdf.pdf", import.meta.url));
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const ctx = doc.context;
const page = doc.getPages()[2];
const xo = page.node.Resources()?.get?.(PDFName.of("XObject"));
for (const [k, v] of xo.entries()) {
  const key = typeof k === "string" ? k : k.encodedName ?? String(k);
  if (!key.startsWith("/FlatWidget")) continue;
  const obj = ctx.lookup(v);
  let data;
  try {
    data = inflateSync(obj.contents);
  } catch {
    data = obj.contents;
  }
  const txt = Buffer.isBuffer(data) ? data.toString("latin1") : String(data);
  // keep only the BT..ET block
  const bt = txt.match(/BT[\s\S]*?ET/);
  if (!bt) continue;
  console.log(`${key}: ${bt[0].replace(/\s+/g, " ")}`);
}

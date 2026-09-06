// follow /Yes and /Off refs of a checkbox FlatWidget dict on page 9
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName } from "pdf-lib";
import { inflateSync } from "node:zlib";
const bytes = readFileSync(new URL("./downloaded-asdf.pdf", import.meta.url));
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const ctx = doc.context;
const page = doc.getPages()[8];
const xo = page.node.Resources()?.get?.(PDFName.of("XObject"));
for (const [k, v] of xo.entries()) {
  const key = typeof k === "string" ? k : k.encodedName ?? String(k);
  if (!key.startsWith("/FlatWidget")) continue;
  const obj = ctx.lookup(v);
  if (obj.constructor?.name !== "PDFDict") continue;
  for (const [sk, sv] of obj.entries()) {
    const skey = typeof sk === "string" ? sk : sk.encodedName ?? String(sk);
    const target = ctx.lookup(sv);
    let content = "";
    if (target && target.contents !== undefined) {
      try {
        content = inflateSync(target.contents).toString("latin1");
      } catch {
        content = Buffer.isBuffer(target.contents) ? target.contents.toString("latin1") : String(target.contents);
      }
    }
    console.log(`${key} ${skey} -> ${target?.constructor?.name} len=${content.length}`);
    console.log(content.slice(0, 400));
    console.log("---");
  }
  break;
}

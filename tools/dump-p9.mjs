// dump-p9.mjs — print every FlatWidget XObject on page 9 with its hex text
// strings decoded, plus the clip rect / font size. Ground truth for the
// phone/weight/BMI rows.
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName } from "pdf-lib";
import { inflateSync } from "node:zlib";

const bytes = readFileSync(new URL("./downloaded-asdf.pdf", import.meta.url));
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const ctx = doc.context;
const page = doc.getPages()[8];
const xo = page.node.Resources()?.get?.(PDFName.of("XObject"));

const hexRe = /<([0-9a-fA-F]+)>/g;
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
  const strings = [...txt.matchAll(hexRe)].map((m) => {
    const hex = m[1];
    let s = "";
    for (let i = 0; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    return s;
  });
  if (strings.length === 0) continue;
  const fontSize = /(\d+(?:\.\d+)?) Tf/.exec(txt)?.[1] ?? "?";
  const clip = /^([\d.]+) ([\d.]+) m\s+[\d.]+ ([\d.]+) l/.exec(txt) ? "clip-present" : "no-clip";
  console.log(`${key}  size=${fontSize} ${clip}  text=${JSON.stringify(strings)}`);
}

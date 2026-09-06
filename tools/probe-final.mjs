// Definitive: after check+flatten of cleaned.pdf, parse the flattened page
// content ops, list every (translate, Do) pair, and decode each FlatWidget.
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PDFDocument, PDFName, PDFDict, PDFStream, PDFRawStream, PDFArray, PDFRef } from "pdf-lib";

const dec = (b) => {
  try { return inflateSync(b).toString("latin1"); } catch { return b.toString("latin1"); }
};

const doc = await PDFDocument.load(readFileSync(new URL("./cleaned.pdf", import.meta.url)), { ignoreEncryption: true, updateMetadata: false });
const ctx = doc.context;
const form = doc.getForm();
form.getCheckBox("Check Box 11").check();
form.getCheckBox("Check Box 10").uncheck();
form.getTextField("Text Field 6").setText("2026-08-25");
form.flatten();
const bytes = await doc.save();
const doc2 = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
const ctx2 = doc2.context;
const page = doc2.getPages()[0];

// collect content ops (may be array of streams)
const contents = page.node.Contents();
let ops = "";
const gather = (v) => {
  if (v instanceof PDFStream || v instanceof PDFRawStream) ops += dec(v.getContents());
  else if (v instanceof PDFArray) for (let i = 0; i < v.size(); i++) gather(ctx2.lookup(v.get(i)));
};
if (contents) {
  if (contents instanceof PDFArray) { for (let i = 0; i < contents.size(); i++) gather(ctx2.lookup(contents.get(i))); }
  else gather(contents);
}

// tokenize ops: sequences of tokens + operator
const toks = ops.match(/[^\s<>\[\]()]+(?:\s+[^\s<>\[\]()]+)*\s+\/[A-Za-z0-9-]+(?=\s|$)|[^\s]+\s+[a-zA-Z*'"]+/g) || [];
// simpler: line-based (each op on its own line as pdf-lib writes them)
const lines = ops.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);

const res = ctx2.lookup(page.node.Resources()?.get(PDFName.of("XObject")), PDFDict);
const streamOf = (name) => {
  const v = res.get(PDFName.of(name));
  let o = null;
  try { o = ctx2.lookup(v); } catch { o = v; }
  return o;
};

let prev = null;
for (const line of lines) {
  if (prev && line.startsWith("/FlatWidget-") && line.endsWith("Do")) {
    const m = prev.match(/^([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) cm$/);
    const name = line.slice(1, line.length - 3);
    const o = streamOf(name);
    if (o instanceof PDFStream || o instanceof PDFRawStream) {
      console.log(`${name} at cm(${m ? m[5] + "," + m[6] : "?"}) raw=${o.getContents().length}b decoded=${JSON.stringify(dec(o.getContents()).slice(0, 90))}`);
    } else {
      console.log(`${name} at cm(${m ? m[5] + "," + m[6] : "?"}) TYPE=${o?.constructor?.name} raw=${o?.toString?.()?.slice(0, 60) ?? typeof o}`);
    }
  }
  prev = line;
}

// Decompresses appearance streams from the reference (Yes/Off of CB11) and
// finds which FlatWidget XObject is drawn at Check Box 11's rect in the
// flattened files, decompressing its content.
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PDFDocument, PDFName, PDFDict, PDFStream, PDFRawStream } from "pdf-lib";

const dec = (b) => {
  try { return inflateSync(b).toString("latin1"); } catch { return b.toString("latin1"); }
};

const FILES = ["reference.pdf", "test-filled.pdf", "downloaded-asdf.pdf"];
const CB11_RECT = { x: 249.76, y: 333.379, w: 19.44, h: 18.701 };

for (const file of FILES) {
  console.log(`\n########## ${file} ##########`);
  const doc = await PDFDocument.load(readFileSync(new URL(`./${file}`, import.meta.url)), { ignoreEncryption: true, updateMetadata: false });
  const ctx = doc.context;

  // --- reference: dump CB11 /Yes and /Off content ---
  if (file === "reference.pdf") {
    const form = doc.getForm();
    const field = form.getCheckBox("Check Box 11");
    const w = field.acroField.getWidgets()[0].dict;
    const ap = ctx.lookup(w.get(PDFName.of("AP")), PDFDict);
    const n = ctx.lookup(ap.get(PDFName.of("N")), PDFDict);
    for (const key of n.keys()) {
      const v = ctx.lookup(n.get(key));
      if (v instanceof PDFStream || v instanceof PDFRawStream) {
        console.log(`CB11 ${key}: raw=${v.getContents().length}b decoded=${JSON.stringify(dec(v.getContents()))}`);
      }
    }
  }

  // --- flattened: page 1 content ops + which XObject at CB11 rect ---
  const page = doc.getPages()[0];
  const content = page.node.Contents();
  let ops = "";
  if (content instanceof PDFStream) ops = dec(content.getContents());
  else if (content) {
    try { ops = dec(content.getContents()); } catch { ops = ""; }
  }
  console.log(`page1 content decoded: ${ops.length}b`);
  // find the FlatWidget invocation whose translate matches CB11 rect
  const lines = ops.split(/\n|\r/);
  const xoRes = ctx.lookup(page.node.Resources()?.get(PDFName.of("XObject")));
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) cm$/);
    if (m && Math.abs(+m[5] - CB11_RECT.x) < 1 && Math.abs(+m[6] - CB11_RECT.y) < 1) {
      const doLine = lines[i + 1];
      console.log(`CB11 rect cm found at line ${i}: ${lines[i]} -> ${doLine}`);
      const name = doLine?.match(/\/(FlatWidget-\d+)/)?.[1];
      if (name && xoRes instanceof PDFDict) {
        const v = ctx.lookup(xoRes.get(PDFName.of(name)));
        if (v instanceof PDFStream || v instanceof PDFRawStream) {
          const raw = v.getContents();
          console.log(`  ${name}: raw=${raw.length}b decoded=${JSON.stringify(dec(raw))}`);
        } else console.log(`  ${name}: ${typeof v}`);
      }
    }
  }
  // count total cm/Do pairs and unique FlatWidget names
  const names = [...ops.matchAll(/\/FlatWidget-(\d+)/g)].map((m) => m[1]);
  console.log(`  FlatWidget Do count: ${names.length}`);
}

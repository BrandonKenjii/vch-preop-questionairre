// Dump the FlatWidget XObjects for the name field (cm 130.68 643.96) and
// date field (cm 98.64 663.98) on page 1 of downloaded-asdf.pdf.
import fs from "node:fs";
import zlib from "node:zlib";
import { PDFDocument, PDFName } from "pdf-lib";

const doc = await PDFDocument.load(fs.readFileSync("downloaded-asdf.pdf"), { ignoreEncryption: true });
const ctx = doc.context;

function decodeStream(obj) {
  if (!obj || typeof obj.getContents !== "function") return { ok: false, err: "not a stream" };
  const raw = obj.getContents();
  const filter = obj.dict ? obj.dict.get(PDFName.of("Filter")) : undefined;
  let filters = [];
  if (filter) {
    if (filter.constructor.name === "PDFName") filters.push(filter.decodeText());
    else if (filter.asArray) for (const f of filter.asArray()) filters.push(f.decodeText());
  }
  let bytes = new Uint8Array(raw);
  try {
    for (const f of filters) {
      if (f === "FlateDecode" || f === "Fl") bytes = new Uint8Array(zlib.inflateSync(bytes));
    }
    return { ok: true, text: Buffer.from(bytes).toString("latin1"), filters };
  } catch (e) {
    return { ok: false, err: String(e), filters };
  }
}

const page = doc.getPages()[0];
const res = ctx.lookup(page.node.get(PDFName.of("Resources")));
const xRes = res.get(PDFName.of("XObject"));

const targets = new Map([
  ["FlatWidget-9742682568", "NAME FIELD (asdf)"],
  ["FlatWidget-7098480789", "DATE FIELD"],
]);

for (const [name, label] of targets) {
  const v = xRes.get(PDFName.of(name));
  console.log(`\n===== ${name} (${label}) -> ${String(v)} =====`);
  const obj = ctx.lookup(v);
  if (!obj || typeof obj.get !== "function") {
    console.log("  lookup failed:", String(obj));
    continue;
  }
  console.log("  Type:", obj.get(PDFName.of("Type"))?.decodeText?.(), "Subtype:", obj.get(PDFName.of("Subtype"))?.decodeText?.());
  const xresRaw = obj.get(PDFName.of("Resources"));
  const xres = ctx.lookup(xresRaw);
  if (xres && typeof xres.get === "function") {
    const f = xres.get(PDFName.of("Font"));
    if (f && typeof f.get === "function") {
      for (const [fn, fr] of f.entries()) {
        const fd = ctx.lookup(fr);
        console.log(`  /Resources /Font ${fn.decodeText()} -> ${String(fr)}`, fd && typeof fd.get === "function"
          ? JSON.stringify({ Type: fd.get(PDFName.of("Type"))?.decodeText?.(), Subtype: fd.get(PDFName.of("Subtype"))?.decodeText?.(), BaseFont: fd.get(PDFName.of("BaseFont"))?.decodeText?.() })
          : String(fd));
      }
    } else {
      console.log("  /Resources /Font: (none)");
    }
  } else {
    console.log("  /Resources: MISSING or direct-null:", String(xresRaw));
  }
  const d = decodeStream(obj);
  console.log(`  stream ok=${d.ok} filters=${JSON.stringify(d.filters)} len=${d.text?.length ?? d.err}`);
  if (d.ok) console.log("  stream text:\n" + d.text.slice(0, 1500));
}

// Debug: dump page 1 content stream and XObjects of downloaded-asdf.pdf
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
    return { ok: false, err: String(e), filters, rawLen: raw?.length };
  }
}

for (let pi = 0; pi < 2; pi++) {
  const page = doc.getPages()[pi];
  console.log(`\n===== PAGE ${pi + 1} =====`);
  const contents = page.node.get(PDFName.of("Contents"));
  console.log("Contents obj type:", contents?.constructor?.name, "->", String(contents ?? "MISSING"));
  const streamObjs = [];
  if (contents) {
    if (contents.constructor.name === "PDFArray") for (const r of contents.asArray()) streamObjs.push(ctx.lookup(r));
    else streamObjs.push(ctx.lookup(contents));
  }
  for (const s of streamObjs) {
    const d = decodeStream(s);
    console.log(`content stream ${String(s?.ref ?? "?")}: ok=${d.ok} len=${d.text?.length ?? d.err} filters=${JSON.stringify(d.filters)}`);
    console.log(`  text: ${JSON.stringify((d.text ?? "").slice(0, 400))}`);
  }
  const res = ctx.lookup(page.node.get(PDFName.of("Resources")));
  const xRes = res?.get(PDFName.of("XObject"));
  console.log("XObject dict:", xRes ? [...xRes.entries()].map(([k, v]) => `${k.decodeText()}->${String(v)}`).join(" ") : "(none)");
  if (xRes) {
    for (const [k, v] of xRes.entries()) {
      const obj = ctx.lookup(v);
      const d = decodeStream(obj);
      const xres = ctx.lookup(obj?.get(PDFName.of("Resources")));
      let fontNames = [];
      if (xres && typeof xres.get === "function") {
        const f = xres.get(PDFName.of("Font"));
        if (f && typeof f.get === "function") fontNames = [...f.entries()].map(([n]) => n.decodeText());
      }
      console.log(`  XObj ${k.decodeText()}: subtype=${obj?.get(PDFName.of("Subtype"))?.decodeText()} ok=${d.ok} len=${d.text?.length ?? d.err} fonts=${JSON.stringify(fontNames)}`);
      console.log(`    stream: ${JSON.stringify((d.text ?? "").slice(0, 300))}`);
    }
  }
}

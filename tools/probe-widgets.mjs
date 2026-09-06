// Inspects checkbox/text widget structure (AP, AS, MK, Rect, P) in the
// reference, cleaned, and flattened test-filled PDFs, plus the flattened
// page content stream ops.
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName, PDFDict, PDFStream, PDFRawStream, PDFArray } from "pdf-lib";

const FILES = ["reference.pdf", "cleaned.pdf", "test-filled.pdf", "downloaded-asdf.pdf"];

const safeLookup = (ctx, v, type) => {
  try { return ctx.lookup(v, type); } catch { return undefined; }
};

const describe = (ctx, v, depth = 0) => {
  if (v === undefined || v === null) return "none";
  if (v instanceof PDFStream || v instanceof PDFRawStream) return `stream(${v.getContents().length}b)`;
  const o = safeLookup(ctx, v);
  if (o === undefined) return `unresolvable(${typeof v})`;
  if (o instanceof PDFDict) {
    if (depth > 0) return `dict(${o.size()})`;
    return `dict{${o.keys().map((k) => k.toString()).join(",")}}`;
  }
  if (o instanceof PDFStream || o instanceof PDFRawStream) return `stream(${o.getContents().length}b)`;
  if (o instanceof PDFArray) return `array[${o.size()}]`;
  return typeof o;
};

// dump stream content (first 300 chars) if it looks like content ops
const dumpStream = (ctx, v, label) => {
  const o = safeLookup(ctx, v);
  if (o instanceof PDFStream || o instanceof PDFRawStream) {
    const s = o.getContents().toString("latin1").slice(0, 300);
    console.log(`    ${label} content: ${JSON.stringify(s)}`);
  }
};

for (const file of FILES) {
  console.log(`\n########## ${file} ##########`);
  const doc = await PDFDocument.load(readFileSync(new URL(`./${file}`, import.meta.url)), { ignoreEncryption: true, updateMetadata: false });
  const ctx = doc.context;
  const form = doc.getForm();

  const summarizeWidget = (label, d) => {
    const t = d.get(PDFName.of("T"))?.toString?.();
    const rect = d.get(PDFName.of("Rect"))?.toString?.();
    const ap = d.get(PDFName.of("AP"));
    const as = d.get(PDFName.of("AS"))?.toString?.();
    const p = d.get(PDFName.of("P")) ? "yes" : "NO";
    console.log(`  ${label} T=${t} Rect=${rect} AS=${as} P=${p}`);
    if (!ap) { console.log(`    AP: none`); return; }
    const apDict = safeLookup(ctx, ap, PDFDict);
    if (!(apDict instanceof PDFDict)) {
      console.log(`    AP: NOT A DICT (${describe(ctx, ap)})`);
      dumpStream(ctx, ap, "AP-as-stream");
      return;
    }
    const n = apDict.get(PDFName.of("N"));
    const dn = apDict.get(PDFName.of("D"));
    console.log(`    AP N=${describe(ctx, n)} D=${describe(ctx, dn)}`);
    const nDict = safeLookup(ctx, n, PDFDict);
    if (nDict instanceof PDFDict) {
      const off = nDict.get(PDFName.of("Off"));
      const on = nDict.get(PDFName.of("On"));
      console.log(`    N-dict keys: ${nDict.keys().map((k) => k.toString()).join(",")}`);
      dumpStream(ctx, off, "Off");
      dumpStream(ctx, on, "On");
    } else {
      dumpStream(ctx, n, "N-as-stream");
    }
  };

  // /Fields widgets
  for (const name of ["Check Box 11", "Check Box 10", "Text Field 6"]) {
    let field = null;
    try { field = form.getFieldMaybe(name); } catch { field = null; }
    if (!field) { console.log(`  /Fields ${name}: NOT FOUND`); continue; }
    const widgets = field.acroField.getWidgets();
    if (!widgets.length) { console.log(`  /Fields ${name}: no widgets`); continue; }
    widgets.forEach((w, i) => summarizeWidget(`/Fields ${name}[${i}]`, w.dict));
  }

  // page 1 /Annots widgets named CB10/CB11/TF6
  const page = doc.getPages()[0];
  const annots = page.node.Annots()?.asArray() ?? [];
  console.log(`  page1 annots: ${annots.length}`);
  let withAp = 0, withoutAp = 0;
  for (const ref of annots) {
    const d = safeLookup(ctx, ref, PDFDict);
    if (!(d instanceof PDFDict)) continue;
    if (d.get(PDFName.of("AP"))) withAp++; else withoutAp++;
    const t = d.get(PDFName.of("T"))?.toString?.();
    if (t === "(Check Box 10)" || t === "(Check Box 11)" || t === "(Text Field 6)") {
      summarizeWidget(`page1-annot ${t}`, d);
    }
  }
  console.log(`  page1 annots with AP: ${withAp}, without AP: ${withoutAp}`);

  // page 1 content tail + /Resources /XObject names
  const content = page.node.Contents();
  if (content instanceof PDFStream) {
    const s = content.getContents().toString("latin1");
    console.log(`  page1 content length: ${s.length}b`);
    const tail = s.slice(-2200);
    console.log("  content tail:");
    for (const line of tail.split(/\n|\r/)) {
      if (line.trim()) console.log(`    |${line.trim().slice(0, 160)}`);
    }
  }
  const res = page.node.Resources();
  if (res instanceof PDFDict) {
    const xo = res.get(PDFName.of("XObject"));
    console.log(`  page1 /Resources /XObject: ${describe(ctx, xo)}`);
  }
}

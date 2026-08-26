// Extracts every AcroForm field from the reference PDF:
// name, type, widget rects, and the page each widget lives on.
// Outputs tools/fields.json (machine-readable) and tools/fields.txt (human-readable).
//
// Note on this PDF's structure: it contains TWO parallel copies of every
// widget — one set referenced from each page's /Annots array (the ones
// viewers render), and a duplicate set referenced from the AcroForm /Fields
// array (the ones pdf-lib edits). Neither copy carries a /P entry, so pages
// are determined by matching /Fields widgets to /Annots widgets by /T name
// and /Rect position.
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument, PDFName, PDFString, PDFRef, PDFDict } from "pdf-lib";

const bytes = readFileSync(new URL("./reference.pdf", import.meta.url));

const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const form = doc.getForm();
const fields = form.getFields();

const ctx = doc.context;
const lookup = (objNum) => ctx.lookup(PDFRef.of(objNum), PDFDict);

// --- per-page annotation widgets: { T, rect } ---
const pages = doc.getPages();
const pageInfo = pages.map((page, index) => {
  const annotRefs = page.node.Annots()?.asArray() ?? [];
  const annots = annotRefs
    .map((ref) => {
      const d = lookup(ref.objectNumber);
      if (!d) return null;
      const t = d.get(PDFName.of("T"));
      const rect = d.get(PDFName.of("Rect"));
      const [x1, y1, x2, y2] = rect.asArray().map((n) => n.asNumber());
      return {
        t: t instanceof PDFString ? t.decodeText() : null,
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: Math.abs(x2 - x1),
        h: Math.abs(y2 - y1),
      };
    })
    .filter(Boolean);
  return { index, size: page.getSize(), annots };
});

const TYPE_LABEL = {
  PDFTextField: "text",
  PDFCheckBox: "checkbox",
  PDFRadioGroup: "radio",
  PDFDropdown: "dropdown",
};

const out = [];
let unmatched = 0;
for (const field of fields) {
  const name = field.getName();
  const type = TYPE_LABEL[field.constructor.name] ?? "other";
  const widgets = field.acroField.getWidgets();
  for (const widget of widgets) {
    const rect = widget.getRectangle();
    // Find the page whose /Annots contains a widget with the same name
    // and (approximately) the same rectangle.
    const pageIndex = pageInfo.findIndex((pg) =>
      pg.annots.some(
        (a) =>
          a.t === name &&
          Math.abs(a.x - rect.x) < 0.5 &&
          Math.abs(a.y - rect.y) < 0.5 &&
          Math.abs(a.w - rect.width) < 0.5 &&
          Math.abs(a.h - rect.height) < 0.5
      )
    );
    if (pageIndex === -1) unmatched++;
    out.push({
      name,
      type,
      page: pageIndex,
      x: round(rect.x),
      y: round(rect.y),
      w: round(rect.width),
      h: round(rect.height),
    });
  }
}

// Sort per page top-to-bottom, then left-to-right (PDF y grows upward).
for (const page of pageInfo) {
  const pageFields = out.filter((f) => f.page === page.index);
  pageFields.sort((a, b) => (Math.abs(b.y - a.y) > 1 ? b.y - a.y : a.x - b.x));
  page.fields = pageFields;
}

const json = {
  pageCount: pages.length,
  fieldCount: out.length,
  unmatched,
  byType: out.reduce((acc, f) => ((acc[f.type] = (acc[f.type] ?? 0) + 1), acc), {}),
  pages: pageInfo.map(({ index, size, fields: fs }) => ({
    index,
    width: size.width,
    height: size.height,
    fields: fs,
  })),
};

writeFileSync(new URL("./fields.json", import.meta.url), JSON.stringify(json, null, 2));

let txt = `Reference PDF: 10-page VCH pre-op questionnaire\n`;
txt += `Total form fields: ${out.length} (unmatched to any page: ${unmatched})\n`;
txt += `By type: ${JSON.stringify(json.byType)}\n\n`;
for (const p of json.pages) {
  txt += `===== PAGE ${p.index + 1} (${p.width}x${p.height}pt, ${p.fields.length} fields) =====\n`;
  for (const f of p.fields) {
    txt += `  ${f.name.padEnd(18)} ${f.type.padEnd(9)} x=${String(f.x).padStart(6)} y=${String(
      f.y
    ).padStart(6)} w=${String(f.w).padStart(5)} h=${String(f.h).padStart(5)}\n`;
  }
  txt += `\n`;
}
writeFileSync(new URL("./fields.txt", import.meta.url), txt);

console.log(txt);
console.log("Wrote fields.json and fields.txt");

function round(n) {
  return Math.round(n * 10) / 10;
}

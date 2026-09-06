// Reproduces the checkbox-flatten failure in isolation and tests fixes.
// 1. Print CB11's /V and /AS before/after check().
// 2. Full pipeline repro: check + text + flatten -> render -> ink count.
// 3. Fix A: set /V alongside /AS -> flatten -> ink count.
import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas, Path2D, ImageData, DOMMatrix } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, PDFName, PDFString, StandardFonts } from "pdf-lib";

globalThis.Path2D = Path2D;
globalThis.ImageData = ImageData;
globalThis.DOMMatrix = DOMMatrix;

async function inkAt(file, pageNum, rect) {
  const doc = await getDocument({
    data: new Uint8Array(readFileSync(new URL(`./${file}`, import.meta.url))),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  const [x1, y1] = viewport.convertToViewportPoint(rect.x, rect.y + rect.h);
  const [x2, y2] = viewport.convertToViewportPoint(rect.x + rect.w, rect.y);
  const pad = 5;
  const img = ctx.getImageData(
    Math.max(0, Math.floor(x1) - pad),
    Math.max(0, Math.floor(y1) - pad),
    Math.ceil(x2 - x1) + pad * 2,
    Math.ceil(y2 - y1) + pad * 2
  );
  let dark = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    if (0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2] < 200) dark++;
  }
  return dark;
}

const CB11 = { x: 249.8, y: 333.4, w: 19.4, h: 18.7 }; // anesthesia YES
const base = await inkAt("cleaned.pdf", 1, CB11);
console.log("baseline template ink:", base);

// --- 1. V/AS values around check() ---
{
  const doc = await PDFDocument.load(readFileSync(new URL("./cleaned.pdf", import.meta.url)));
  const cb = doc.getForm().getCheckBox("Check Box 11");
  const widget = cb.acroField.getWidgets()[0];
  console.log("before check(): /V =", widget.dict.get(PDFName.of("V"))?.toString(), "/AS =", widget.dict.get(PDFName.of("AS"))?.toString());
  cb.check();
  console.log("after  check(): /V =", widget.dict.get(PDFName.of("V"))?.toString(), "/AS =", widget.dict.get(PDFName.of("AS"))?.toString());
}

// --- 2. Full pipeline repro ---
{
  const doc = await PDFDocument.load(readFileSync(new URL("./cleaned.pdf", import.meta.url)));
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const cb = form.getCheckBox("Check Box 11");
  cb.check();
  const tf = form.getTextField("Text Field 15");
  tf.defaultUpdateAppearances(font);
  tf.acroField.getWidgets()[0].dict.set(PDFName.of("DA"), PDFString.of("/Helv 9 Tf 0 g"));
  tf.setText("REPRO TEST");
  form.flatten();
  const out = await doc.save();
  writeFileSync(new URL("./repro-a.pdf", import.meta.url), out);
  const ink = await inkAt("repro-a.pdf", 1, CB11);
  console.log("repro (check+flatten) ink:", ink, "-> delta", ink - base);
}

// --- 3. Fix A: also set /V = on-value before flatten ---
{
  const doc = await PDFDocument.load(readFileSync(new URL("./cleaned.pdf", import.meta.url)));
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const cb = form.getCheckBox("Check Box 11");
  const onValue = cb.acroField.getOnValue();
  cb.check();
  // FIX: set /V so flatten's findWidgetAppearanceRef picks the on-stream
  cb.acroField.getWidgets()[0].dict.set(PDFName.of("V"), onValue);
  form.flatten();
  const out = await doc.save();
  writeFileSync(new URL("./repro-b.pdf", import.meta.url), out);
  const ink = await inkAt("repro-b.pdf", 1, CB11);
  console.log("fix-A (set /V) ink:", ink, "-> delta", ink - base);
}

// --- 4. Fix B: flatten with updateFieldAppearances: false (keep original APs) ---
{
  const doc = await PDFDocument.load(readFileSync(new URL("./cleaned.pdf", import.meta.url)));
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const cb = form.getCheckBox("Check Box 11");
  cb.check();
  form.flatten({ updateFieldAppearances: false });
  const out = await doc.save();
  writeFileSync(new URL("./repro-c.pdf", import.meta.url), out);
  const ink = await inkAt("repro-c.pdf", 1, CB11);
  console.log("fix-B (no AP regen) ink:", ink, "-> delta", ink - base);
}

// --- 5. Fix C: inline the /N dict before flattening (the real fix) ---
{
  const { PDFDict } = await import("pdf-lib");
  const doc = await PDFDocument.load(readFileSync(new URL("./cleaned.pdf", import.meta.url)));
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const cb = form.getCheckBox("Check Box 11");
  cb.check();
  // Inline every checkbox widget's /AP /N dict (mirrors normalizeCheckboxAppearances)
  for (const field of form.getFields()) {
    if (field.constructor.name !== "PDFCheckBox") continue;
    const widget = field.acroField.getWidgets()[0];
    const apRef = widget.dict.get(PDFName.of("AP"));
    const ap = apRef ? doc.context.lookup(apRef) : undefined;
    if (!(ap instanceof PDFDict)) continue;
    const n = ap.get(PDFName.of("N"));
    if (n?.constructor?.name === "PDFRef") {
      const nDict = doc.context.lookup(n);
      if (nDict instanceof PDFDict) ap.set(PDFName.of("N"), nDict);
    }
  }
  form.flatten({ updateFieldAppearances: false });
  const out = await doc.save();
  writeFileSync(new URL("./repro-d.pdf", import.meta.url), out);
  const ink = await inkAt("repro-d.pdf", 1, CB11);
  console.log("fix-C (inline /N dict) ink:", ink, "-> delta", ink - base);
}

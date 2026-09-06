// Final combination test: normalize checkbox /N dicts + default flatten
// (updateFieldAppearances: true). Verifies BOTH a checked box mark AND a
// text value render.
import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas, Path2D, ImageData, DOMMatrix } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, PDFName, PDFDict, PDFRef, PDFString, StandardFonts } from "pdf-lib";

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

const CB11 = { x: 249.8, y: 333.4, w: 19.4, h: 18.7 };
const TF8 = { x: 130.7, y: 644, w: 168.7, h: 11.5 };

const baseCb = await inkAt("cleaned.pdf", 1, CB11);
const baseTf = await inkAt("cleaned.pdf", 1, TF8);
console.log("baseline ink — CB11:", baseCb, "TF8:", baseTf);

// normalize + flatten(true)
{
  const doc = await PDFDocument.load(readFileSync(new URL("./cleaned.pdf", import.meta.url)));
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  form.getCheckBox("Check Box 11").check();
  const tf = form.getTextField("Text Field 8");
  tf.defaultUpdateAppearances(font);
  tf.acroField.getWidgets()[0].dict.set(PDFName.of("DA"), PDFString.of("/Helv 9 Tf 0 g"));
  tf.setText("Jane Doe");

  // normalize: inline checkbox /N dicts
  for (const field of form.getFields()) {
    if (field.constructor.name !== "PDFCheckBox") continue;
    const widget = field.acroField.getWidgets()[0];
    const apRef = widget.dict.get(PDFName.of("AP"));
    const ap = apRef ? doc.context.lookup(apRef) : undefined;
    if (!(ap instanceof PDFDict)) continue;
    const n = ap.get(PDFName.of("N"));
    if (n instanceof PDFRef) {
      const nDict = doc.context.lookup(n);
      if (nDict instanceof PDFDict) ap.set(PDFName.of("N"), nDict);
    }
  }
  form.flatten(); // default: updateFieldAppearances = true
  const out = await doc.save();
  writeFileSync(new URL("./combined.pdf", import.meta.url), out);
  const cbInk = await inkAt("combined.pdf", 1, CB11);
  const tfInk = await inkAt("combined.pdf", 1, TF8);
  console.log("normalize + flatten(true): CB11 delta", cbInk - baseCb, "| TF8 delta", tfInk - baseTf);
}

// also: normalize AFTER check but WITHOUT updateFieldAppearances? (already known broken for text)

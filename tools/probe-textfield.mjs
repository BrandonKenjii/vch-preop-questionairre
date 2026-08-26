// Probe how pdf-lib renders text into this form's fields:
//   - default font size parsed from /DA
//   - whether setting /DA size controls the appearance font size
//   - whether multiline \n text renders as multiple lines
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument, PDFName, PDFString, StandardFonts } from "pdf-lib";

const bytes = readFileSync(new URL("./cleaned.pdf", import.meta.url));
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const form = doc.getForm();

const tf15 = form.getTextField("Text Field 15");
console.log("TF15 rect:", tf15.acroField.getWidgets()[0].getRectangle());
console.log("TF15 DA raw:", tf15.acroField.dict.get(PDFName.of("DA"))?.toString());

const helv = await doc.embedFont(StandardFonts.Helvetica);
tf15.defaultUpdateAppearances(helv);

// Force a DA size of 9 and set multiline text
const widget = tf15.acroField.getWidgets()[0];
widget.dict.set(PDFName.of("DA"), PDFString.of("/Helv 9 Tf 0 g"));
tf15.setText("Line one of a long procedure name\nSecond line here");
console.log(
  "after set DA:",
  tf15.acroField.dict.get(PDFName.of("DA"))?.toString()
);

const out = await doc.save();
writeFileSync(new URL("./probe-out.pdf", import.meta.url), out);

// Extract the appearance stream operators to see the actual Tf size used.
const doc2 = await PDFDocument.load(out, { ignoreEncryption: true });
const form2 = doc2.getForm();
const tf = form2.getTextField("Text Field 15");
const ap = tf.acroField.getWidgets()[0].getAppearances();
console.log("AP normal stream available:", !!ap?.normal);
if (ap?.normal) {
  const stream = doc2.context.lookup(ap.normal);
  const content = stream.getContentsString();
  console.log("--- appearance stream ---");
  console.log(content.slice(0, 1500));
}

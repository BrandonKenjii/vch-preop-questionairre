// One-off: verify specific checkbox states render in a flattened PDF by
// matching the widget rectangle to the drawn FlatWidget XObject and
// comparing its content with the template's /Yes vs /Off streams.
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PDFDocument, PDFName, PDFDict, PDFRef } from "pdf-lib";

const [, , pdfPath, templatePath] = process.argv;
const bytes = readFileSync(pdfPath);
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const ctx = doc.context;

const template = await PDFDocument.load(readFileSync(templatePath), { ignoreEncryption: true });
const tform = template.getForm();

function tplState(fieldName, state) {
  const w = tform.getFieldMaybe(fieldName).acroField.getWidgets()[0];
  const N = w.getNormalAppearance();
  const dict = N instanceof PDFRef ? template.context.lookup(N, PDFDict) : N;
  return Buffer.from(template.context.lookup(dict.get(PDFName.of(state))).getContents()).toString("latin1");
}

function rectOf(fieldName) {
  return tform.getFieldMaybe(fieldName).acroField.getWidgets()[0].getRectangle();
}

const checks = [
  ["Check Box 11", "Yes"], // anesthesia general procedure = true
  ["Check Box 12", "Yes"], // personal problem = false -> No box checked
  ["Check Box 13", "Off"], // ...and the Yes box stays clear
  ["Check Box 26", "Yes"], // functional transfer = 2
  ["Check Box 300", "Yes"], // BMI kg
  ["Check Box 306", "Yes"], // Pradaxa
  ["Check Box 289", "Yes"], // allergies: Antibiotics
  ["Check Box 286", "Off"], // allergies: Latex (not selected)
];

let failures = 0;
for (const [fieldName, expectedState] of checks) {
  const rect = rectOf(fieldName);
  // find page containing the draw at this rect
  let verdict = "MISSING";
  for (const page of doc.getPages()) {
    const xobj = page.node.Resources()?.lookup(PDFName.of("XObject"), PDFDict);
    if (!xobj) continue;
    let content = "";
    for (const r of page.node.Contents().asArray()) {
      content += inflateSync(Buffer.from(ctx.lookup(r).getContents())).toString("latin1");
    }
    const m = [...content.matchAll(/q\n1 0 0 1 ([-+\d.]+) ([-+\d.]+) cm\n(?:1 0 0 1 0 0 cm\n)*\/(FlatWidget-\d+) Do\nQ/g)]
      .find((mm) => Math.abs(Number(mm[1]) - rect.x) < 0.01 && Math.abs(Number(mm[2]) - rect.y) < 0.01);
    if (!m) continue;
    const target = ctx.lookup(xobj.get(PDFName.of(m[3])));
    const actual = Buffer.from(target.getContents()).toString("latin1");
    const expected = tplState(fieldName, expectedState);
    verdict = actual === expected ? "CORRECT" : "WRONG STATE";
    break;
  }
  const ok = verdict === "CORRECT";
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${fieldName} should be ${expectedState}: ${verdict}`);
}
process.exitCode = failures ? 1 : 0;

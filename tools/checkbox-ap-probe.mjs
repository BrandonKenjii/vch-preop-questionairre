// Decisive probe: why does flatten draw no checkbox marks?
// 1. Inspect the /AP structure of checkbox widgets in cleaned.pdf.
// 2. Check a box + flatten, then inspect what page content was added.
// 3. Control: do the same with a pdf-lib-created checkbox document.
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument, PDFName, PDFDict, PDFStream, PDFRawStream } from "pdf-lib";

const bytes = readFileSync(new URL("./cleaned.pdf", import.meta.url));
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const form = doc.getForm();
const ctx = doc.context;

// --- 1. AP structure of CB11 (anesthesia YES) and CB43 (hearing aids) ---
for (const name of ["Check Box 11", "Check Box 43"]) {
  const cb = form.getCheckBox(name);
  const widget = cb.acroField.getWidgets()[0];
  const apRef = widget.dict.get(PDFName.of("AP"));
  const ap = apRef ? ctx.lookup(apRef) : null;
  console.log(`--- ${name} AP ---`);
  console.log("  AP type:", ap?.constructor?.name);
  if (ap instanceof PDFDict) {
    const n = ap.get(PDFName.of("N"));
    console.log("  /N type:", n?.constructor?.name, "ref:", n?.toString?.());
    const nObj = n ? ctx.lookup(n) : null;
    console.log("  /N looked up:", nObj?.constructor?.name);
    if (nObj instanceof PDFDict) {
      for (const [k, v] of nObj.entries()) {
        const target = ctx.lookup(v);
        console.log(
          `    /${k}: ref=${v?.toString()} type=${target?.constructor?.name} size=${target?.getContents?.()?.length ?? "?"}`
        );
        if (target instanceof PDFStream || target instanceof PDFRawStream) {
          try {
            const contents = target.getContentsString();
            console.log("      stream head:", JSON.stringify(contents.slice(0, 200)));
          } catch (e) {
            console.log("      stream decode error:", e.message);
          }
        }
      }
    } else if (nObj instanceof PDFStream || nObj instanceof PDFRawStream) {
      try {
        console.log("  /N stream head:", JSON.stringify(nObj.getContentsString().slice(0, 200)));
      } catch (e) {
        console.log("  /N stream decode error:", e.message);
      }
    }
  }
  // Current appearance state
  console.log("  /AS:", widget.dict.get(PDFName.of("AS"))?.toString());
}

// --- 2. Check CB11, flatten, inspect what page 1 gained ---
const before = doc.getPages()[0].node.Contents()?.size?.() ?? 0;
const cb11 = form.getCheckBox("Check Box 11");
cb11.check();
console.log("\nCB11 /AS after check():", cb11.acroField.getWidgets()[0].dict.get(PDFName.of("AS"))?.toString());
form.flatten();
const after = doc.getPages()[0].node.Contents()?.size?.() ?? 0;
console.log("page 1 content streams before/after flatten:", before, "->", after);
writeFileSync(new URL("./cb11-flattened.pdf", import.meta.url), await doc.save());

// Inspect the NEWEST content stream on page 1 for what was drawn
const page1 = doc.getPages()[0];
const contents = page1.node.Contents();
const arr = contents.asArray();
const last = ctx.lookup(arr.get(arr.size() - 1));
let head = "";
if (last instanceof PDFStream || last instanceof PDFRawStream) {
  head = last.getContentsString();
}
console.log("\nnewest content stream head:", JSON.stringify(head.slice(0, 400)));

// --- 3. Control: pdf-lib-created checkbox ---
console.log("\n--- CONTROL: fresh pdf-lib checkbox ---");
const ctrl = await PDFDocument.create();
const ctrlPage = ctrl.addPage([300, 300]);
const ctrlForm = ctrl.createForm(customForm);
const ctrlCb = ctrlForm.createCheckBox("cb.test");
ctrlCb.addToPage(ctrlPage, { x: 50, y: 50, width: 15, height: 15 });
ctrlCb.check();
ctrlForm.flatten();
const ctrlPageContents = ctrlPage.node.Contents();
const ctrlArr = ctrlPageContents.asArray();
const ctrlLast = ctrl.context.lookup(ctrlArr.get(ctrlArr.size() - 1));
console.log(
  "control page-1 newest stream:",
  JSON.stringify(ctrlLast.getContentsString().slice(0, 300))
);

function customForm(doc) {
  return doc.getForm();
}

// Audit: does any page in a given PDF reference a DICT (not a stream) in
// Resources /XObject? pdf-lib's flatten leaks checkbox /AP /N dicts there
// when /N is an indirect dict — viewers then render nothing for the marks.
import { readFileSync } from "node:fs";
import { PDFDocument, PDFDict, PDFName, PDFRawStream, PDFStream } from "pdf-lib";

const file = process.argv[2];
const bytes = readFileSync(file);
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });

let pagesWithLeaks = 0;
let leakCount = 0;
for (let p = 0; p < doc.getPageCount(); p++) {
  const page = doc.getPage(p);
  const resources = page.node.Resources();
  if (!resources) continue;
  const xobjRef = resources.get(PDFName.of("XObject"));
  if (!xobjRef) continue;
  const xobj = doc.context.lookup(xobjRef);
  if (!(xobj instanceof PDFDict)) continue;
  const pageLeaks = [];
  for (const [name, ref] of xobj.entries()) {
    const target = doc.context.lookup(ref);
    if (target instanceof PDFDict && !(target instanceof PDFStream)) {
      pageLeaks.push(`${name} -> dict (keys: ${Object.keys(target.entries()).slice(0, 6).join(",")})`);
      leakCount++;
    } else if (target instanceof PDFStream || target instanceof PDFRawStream) {
      // ok
    } else {
      pageLeaks.push(`${name} -> unresolved/other: ${target?.constructor?.name ?? typeof target}`);
    }
  }
  if (pageLeaks.length) {
    pagesWithLeaks++;
    console.log(`page ${p + 1}: ${pageLeaks.join(" | ")}`);
  }
}
console.log(`SUMMARY: ${file} pages with XObject dict leaks: ${pagesWithLeaks}/${doc.getPageCount()}, total leaked entries: ${leakCount}`);

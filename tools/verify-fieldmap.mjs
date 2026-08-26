// Cross-checks src/data/fieldMap.ts against the cleaned template:
//   1. every field name referenced by the map exists in the form;
//   2. every form field (except the two page-10 extra-space fields) is
//      referenced exactly once.
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";

const mapSrc = readFileSync(new URL("../src/data/fieldMap.ts", import.meta.url), "utf8");
const templateBytes = readFileSync(new URL("./cleaned.pdf", import.meta.url));

// Collect every quoted field name in the map ("Check Box N" / "Text Field N").
const referenced = [...mapSrc.matchAll(/"((?:Check Box|Text Field) \d+)"/g)].map((m) => m[1]);
const refCounts = new Map();
for (const name of referenced) refCounts.set(name, (refCounts.get(name) ?? 0) + 1);
console.log(`map references ${referenced.length} field names (${refCounts.size} unique)`);

const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
const form = doc.getForm();
const actual = new Set(form.getFields().map((f) => f.getName()));
console.log(`template has ${actual.size} form fields`);

const EXTRA_SPACE = new Set(["Text Field 1046", "Text Field 1047"]);

const missing = [...refCounts.keys()].filter((n) => !actual.has(n));
const dupes = [...refCounts.entries()].filter(([, c]) => c > 1);
const unmapped = [...actual].filter((n) => !refCounts.has(n) && !EXTRA_SPACE.has(n));

console.log("\n--- referenced but not in template:", missing.length);
for (const n of missing) console.log("  ", n);
console.log("--- referenced more than once:", dupes.length);
for (const [n, c] of dupes) console.log("  ", n, "x" + c);
console.log("--- template fields not referenced (excluding extra-space):", unmapped.length);
for (const n of unmapped) console.log("  ", n);

const ok = missing.length === 0 && dupes.length === 0 && unmapped.length === 0;
console.log(ok ? "\nFIELD MAP OK" : "\nFIELD MAP HAS PROBLEMS");
process.exitCode = ok ? 0 : 1;

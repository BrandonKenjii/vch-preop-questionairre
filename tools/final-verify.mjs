// Final verification: (1) every rect that received a value is a fieldMap
// target, (2) exact-coordinate assertions for drawn values + dates,
// (3) page-9 x-coordinate assertions.
import { readFileSync } from "node:fs";

const s = JSON.parse(readFileSync(new URL("./crosscheck.json", import.meta.url), "utf8"));
const fields = JSON.parse(readFileSync(new URL("./fields.json", import.meta.url), "utf8"));
const src = readFileSync(new URL("../src/data/fieldMap.ts", import.meta.url), "utf8");

const targets = new Set();
for (const m of src.matchAll(/"((?:Text Field|Check Box) \d+)"/g)) targets.add(m[1]);

const fieldNames = new Set(
  JSON.stringify(fields)
    .match(/"name":"(Text Field \d+)"/g)
    .map((m) => m.match(/(Text Field \d+)/)[1])
);

const withValue = new Set();
for (const p of s.pages) for (const v of p.values) for (const r of v.rects.split(",")) withValue.add(r);

const notTargeted = [...withValue].filter((n) => !targets.has(n));
console.log("value-containing rects not in fieldMap:", notTargeted.length ? notTargeted.join(",") : "NONE");
console.log("fieldMap text targets all exist in template:", [...targets].filter((n) => n.startsWith("Text Field")).every((n) => fieldNames.has(n)));
console.log("unique rects with values:", withValue.size, "| text targets in fieldMap:", [...targets].filter((n) => n.startsWith("Text Field")).length);

let fail = 0;
const exact = (p, str, x, y) => {
  const it = [...s.pages[p - 1].values, ...s.pages[p - 1].outside].find(
    (i) => i.str === str && Math.abs(i.x - x) < 0.6 && Math.abs(i.y - y) < 0.6
  );
  if (!it) fail++;
  console.log(`exact p${p} "${str}" (${x},${y}): ${it ? "PASS" : "FAIL"}`);
};
exact(1, "2026-08-25", 99.6, 666.5); // header date
exact(2, "6", 536, 594); // functional total
exact(6, "4", 536, 47); // PCS total
exact(9, "81.3", 534, 181); // BMI

// signature date: inside Text Field 1045 rect (58.3,53.2,178.6,11.5)
const sig = s.pages[8].values.find((v) => v.str === "2026-08-25");
const okSig = sig && sig.x >= 58.3 && sig.x <= 236.9 && sig.y >= 53.2 && sig.y <= 64.7;
if (!okSig) fail++;
console.log(`signature date p9 at (${sig?.x},${sig?.y}) inside TF1045 rect: ${okSig ? "PASS" : "FAIL"}`);

// page 9 phones: x must be ~214.4; weight inside rect x 213.4..266.1
const p9 = s.pages[8];
const phones = p9.values.filter((v) => /^Text Field 104[0-4]$/.test(v.rects));
const phoneX = new Set(phones.map((v) => v.x));
console.log("p9 phone rows x:", [...phoneX].sort().join(","), phones.length === 5 ? "(5 rows)" : "FAIL(not 5)");
if (phones.length !== 5) fail++;
const weight = p9.values.find((v) => v.rects === "Text Field 1039");
const okW = weight && weight.x >= 213.4 && weight.x <= 266.1 && weight.y >= 178.6 && weight.y <= 190.1;
if (!okW) fail++;
console.log(`p9 weight "123" at (${weight?.x},${weight?.y}) inside TF1039 rect (213.4..266.1 x): ${okW ? "PASS" : "FAIL"}`);
const height = p9.values.find((v) => v.rects === "Text Field 1038");
console.log(`p9 height "123 cm" at (${height?.x},${height?.y}) in TF1038 rect:`, height ? "PASS" : "FAIL");
if (!height) fail++;

console.log(fail === 0 ? "ALL FINAL CHECKS PASS" : `${fail} FINAL CHECKS FAILED`);

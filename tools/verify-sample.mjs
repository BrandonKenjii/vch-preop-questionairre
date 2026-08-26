// Programmatic verification of tools/sample-filled.pdf:
//   - key answers appear on the right pages (as rendered text)
//   - the computed totals (functional, PCS) and BMI are drawn at the
//     correct positions next to their printed labels
import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const bytes = new Uint8Array(readFileSync(new URL("./sample-filled.pdf", import.meta.url)));
const doc = await getDocument({
  data: bytes,
  useWorkerFetch: false,
  isEvalSupported: false,
  useSystemFonts: true,
}).promise;

const pages = [];
for (let i = 0; i < doc.numPages; i++) {
  const page = await doc.getPage(i + 1);
  const content = await page.getTextContent();
  pages.push(
    content.items
      .filter((it) => typeof it.str === "string" && it.str.trim() !== "")
      .map((it) => ({ str: it.str, x: Math.round(it.transform[4] * 10) / 10, y: Math.round(it.transform[5] * 10) / 10 }))
  );
}

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
};

const has = (pageIdx, needle) =>
  pages[pageIdx].some((it) => it.str.toLowerCase().includes(needle.toLowerCase()));
const at = (pageIdx, needle, y, x) =>
  pages[pageIdx].some((it) => it.str === needle && Math.abs(it.y - y) < 2 && Math.abs(it.x - x) < 3);

// Page 1 (index 0): patient header + anesthesia details
check("patient name on page 1", has(0, "Jane Doe"));
check("anesthesia details on page 1", has(0, "Knee arthroscopy"));
check("family problem details on page 1", has(0, "Malignant hyperthermia"));
check("header date on page 1", has(0, "20")); // 2026-xx-xx present

// Page 2 (index 1): functional total drawn next to "Total Score" label
check("functional total 5 drawn on page 2", at(1, "5", 594, 536));

// Page 5 (index 4): blood thinner types
check("Eliquis on page 5", has(4, "Eliquis"));

// Page 6 (index 5): PCS total next to "Total Score" label
check("PCS total 6 drawn on page 6", at(5, "6", 47, 536));

// Page 7 (index 6): diabetes
check("HbA1C on page 7", has(6, "7.2%"));

// Page 8 (index 7): infections
check("chest infection on page 8", has(7, "Chest infection"));

// Page 9 (index 8): BMI drawn next to the BMI label, medications list
check("BMI 24.9 drawn on page 9", at(8, "24.9", 181, 534));
check("medication list on page 9", has(8, "Atorvastatin"));
check("signature date on page 9", has(8, "2026"));

console.log(failures === 0 ? "\nSAMPLE VERIFIED" : `\n${failures} CHECKS FAILED`);
process.exitCode = failures === 0 ? 0 : 1;

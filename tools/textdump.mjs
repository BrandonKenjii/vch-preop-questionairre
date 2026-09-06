// textdump.mjs — full text inventory + truncation/overlap analysis
// Extracts ALL text items (str, x, y, w, h, font, size) for all 10 pages of the
// given PDF (default: downloaded-asdf.pdf), then:
//   1. TRUNCATION: maps items to fields.json rects; flags items ending at the
//      rect's right edge (tight_right), extending past it (overflow_right),
//      baseline at/below rect bottom (bottom_tight), and any "asdf" string
//      shorter than 8 chars (user typed 8 everywhere -> shorter suggests clip).
//   2. OVERLAP: pairs of items whose bboxes intersect (excluding synthetic
//      double-draw pairs from fake-bold: same str, <0.3pt offset).
//   3. EMPTY CHECK: text-type fields with NO mapped text item (blank vs
//      invisible cannot be separated without ink data; flagged for review).
//   4. INVENTORY: per-page counts + notable items + baseline diff against
//      cleaned.pdf (added items = answers/totals drawn).
//   5. Known-position verification for the previously located answer coords.
// Writes textdump.json (machine-readable) and prints a compact report.
import { readFileSync, writeFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const TARGET = process.argv[2] ?? "downloaded-asdf.pdf";
const BASELINE = "cleaned.pdf";

const fieldsJson = JSON.parse(readFileSync(new URL("./fields.json", import.meta.url), "utf8"));
const pageFields = fieldsJson.pages.map((p) => p.fields);
const r1 = (n) => Math.round(n * 10) / 10;

async function extract(file) {
  const bytes = new Uint8Array(readFileSync(new URL(file, import.meta.url)));
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
    const items = [];
    for (const it of content.items) {
      if (typeof it.str !== "string" || it.str.trim() === "") continue;
      const t = it.transform;
      const fs = t[0];
      const x0 = t[4];
      const y0 = t[5];
      const w = it.width;
      const h = it.height && it.height > 0 ? it.height : fs;
      items.push({
        str: it.str,
        x: r1(x0),
        y: r1(y0),
        x1: r1(x0 + w),
        y1: r1(y0 + h),
        w: r1(w),
        h: r1(h),
        font: it.fontName ?? "",
        size: r1(fs),
      });
    }
    pages.push(items);
  }
  return pages;
}

const target = await extract(TARGET);
const baseline = await extract(BASELINE);

// ---------- baseline diff (added items per page) ----------
const baselineKeys = baseline.map((pg) => new Set(pg.map((it) => `${it.str}|${it.x}|${it.y}`)));
const addedPerPage = target.map((pg, i) =>
  pg.filter((it) => !baselineKeys[i].has(`${it.str}|${it.x}|${it.y}`))
);

// ---------- field mapping + truncation ----------
function mappedItems(pageIdx, f) {
  const win = 2.0; // horizontal slop for baseline-x vs rect
  return target[pageIdx].filter(
    (it) => it.x >= f.x - win && it.x <= f.x + f.w + win && it.y >= f.y - 3.5 && it.y <= f.y + f.h + 4.5
  );
}

const perPageReport = [];
for (let p = 0; p < 10; p++) {
  const items = target[p];
  const fields = pageFields[p];
  const trunc = [];
  const emptyTextFields = [];
  const emptyCheckboxes = [];
  const fieldText = [];

  for (const f of fields) {
    const hits = mappedItems(p, f);
    if (hits.length === 0) {
      if (f.type === "text") emptyTextFields.push(f);
      else emptyCheckboxes.push(f);
      continue;
    }
    // Only flag ADDED items (answer ink drawn by the app); static labels
    // ("kg or lbs", "PHN", checkbox "□" glyphs) are baseline content and are
    // excluded so they cannot produce false positives.
    const addedKeys = new Set(addedPerPage[p].map((a) => `${a.str}|${a.x}|${a.y}`));
    for (const it of hits) {
      if (!addedKeys.has(`${it.str}|${it.x}|${it.y}`)) continue;
      const rightEdge = f.x + f.w;
      const flag = {
        name: f.name,
        str: it.str,
        x: it.x,
        y: it.y,
        x1: it.x1,
        rightEdge,
      };
      if (it.x1 > rightEdge + 0.5) flag.kind = "overflow_right";
      else if (it.x1 >= rightEdge - 2) flag.kind = "tight_right";
      else if (it.y < f.y + 1.5) flag.kind = "bottom_tight";
      else continue;
      trunc.push(flag);
    }
    fieldText.push({ name: f.name, items: hits.map((h) => h.str), rect: f });
  }

  // short-asdf global scan (whole page, not just inside fields)
  const shortAsdf = items.filter(
    (it) => /^asdf/i.test(it.str) && it.str.replace(/asdf/gi, "").length < 4 && it.str.trim().length < 8
  );

  perPageReport.push({ p, trunc, emptyTextFields, emptyCheckboxes, fieldText, shortAsdf, added: addedPerPage[p] });
}

// ---------- overlap detection ----------
const overlaps = [];
for (let p = 0; p < 10; p++) {
  const items = target[p];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      const inter = Math.min(a.x1, b.x1) - Math.max(a.x, b.x);
      const interY = Math.min(a.y1, b.y1) - Math.max(a.y, b.y);
      if (inter <= 0.5 || interY <= 0.5) continue;
      // synthetic fake-bold double-draw: same string, nearly same position
      if (a.str === b.str && Math.abs(a.x - b.x) < 0.3 && Math.abs(a.y - b.y) < 0.3) continue;
      overlaps.push({
        page: p,
        a: `${a.str}@(${a.x},${a.y})[${a.size}pt]`,
        b: `${b.str}@(${b.x},${b.y})[${b.size}pt]`,
        interW: r1(inter),
        interH: r1(interY),
        area: r1(inter * interY),
      });
    }
  }
}
overlaps.sort((x, y) => y.area - x.area);

// ---------- known-position verification ----------
const at = (p, str, y, x) =>
  target[p].some((it) => it.str === str && Math.abs(it.y - y) < 2 && Math.abs(it.x - x) < 3);
const knownChecks = [
  ["p1 patient name 'asdf' at (131.7,646.5)", () => at(0, "asdf", 646.5, 131.7)],
  ["p1 date '2026-08-25' at (99.6,666.5)", () => at(0, "2026-08-25", 666.5, 99.6)],
  ["p2 functional total '6' at (536,594)", () => at(1, "6", 594, 536)],
  ["p6 PCS total '4' at (536,47)", () => at(5, "4", 47, 536)],
  ["p9 BMI '81.3' at (534,181)", () => at(8, "81.3", 181, 534)],
  ["p9 phone1 at (214.4,165.1)", () => at(8, "asdfasdf", 165.1, 214.4)],
  ["p9 phone2 at (214.4,150)", () => at(8, "asdfasdf", 150, 214.4)],
  ["p9 phone3 at (214.4,134)", () => at(8, "asdfasdf", 134, 214.4)],
  ["p9 phone4 at (214.4,119)", () => at(8, "asdfasdf", 119, 214.4)],
  ["p9 phone5 at (214.4,104)", () => at(8, "asdfasdf", 104, 214.4)],
  ["p9 weight value inside box 213.4..266.1", () =>
    target[8].some((it) => it.x >= 213.4 && it.x1 <= 266.1 + 0.5 && Math.abs(it.y - 181) < 6)],
];

// ---------- report ----------
let out = "";
out += `TARGET: ${TARGET}\n`;
out += `fields.json: ${fieldsJson.fieldCount} fields across ${fieldsJson.pageCount} pages\n\n`;

out += `===== PER-PAGE INVENTORY =====\n`;
out += `${"pg".padEnd(4)}${"items".padEnd(7)}${"added".padEnd(7)}${"base".padEnd(7)}${"tfld".padEnd(6)}${"tf+txt".padEnd(7)}${"emptyTF".padEnd(8)}${"chk".padEnd(6)}${"chk+txt".padEnd(7)}${"trunc".padEnd(7)}${"ovlp".padEnd(6)}${"shrtA".padEnd(6)}\n`;
for (let p = 0; p < 10; p++) {
  const rep = perPageReport[p];
  const tf = pageFields[p].filter((f) => f.type === "text");
  const ck = pageFields[p].filter((f) => f.type === "checkbox");
  const tfWithText = tf.filter((f) => rep.fieldText.some((x) => x.name === f.name));
  const ckWithText = ck.filter((f) => rep.fieldText.some((x) => x.name === f.name));
  out += `${String(p + 1).padEnd(4)}${String(target[p].length).padEnd(7)}${String(rep.added.length).padEnd(7)}${String(
    baseline[p].length
  ).padEnd(7)}${String(tf.length).padEnd(6)}${String(tfWithText.length).padEnd(7)}${String(
    rep.emptyTextFields.length
  ).padEnd(8)}${String(ck.length).padEnd(6)}${String(ckWithText.length).padEnd(7)}${String(rep.trunc.length).padEnd(7)}${String(
    overlaps.filter((o) => o.page === p).length
  ).padEnd(6)}${String(rep.shortAsdf.length).padEnd(6)}\n`;
}
out += `\n`;

for (let p = 0; p < 10; p++) {
  const rep = perPageReport[p];
  out += `----- PAGE ${p + 1}: ${target[p].length} items (baseline ${baseline[p].length}, +${rep.added.length} added) -----\n`;
  if (rep.added.length) {
    const addedTxt = rep.added.map((a) => `${a.str}@(${a.x},${a.y})`).join("  ");
    out += `  added items: ${addedTxt}\n`;
  }
  if (rep.emptyTextFields.length) {
    out += `  TEXT FIELDS WITH NO TEXT (${rep.emptyTextFields.length}): ${rep.emptyTextFields
      .map((f) => `${f.name}@(${f.x},${f.y},${f.w}x${f.h})`)
      .join("  ")}\n`;
  }
  if (rep.trunc.length) {
    out += `  TRUNCATION suspects:\n`;
    for (const t of rep.trunc) {
      out += `    [${t.kind}] ${t.name} "${t.str}" x1=${t.x1} vs rightEdge=${t.rightEdge}\n`;
    }
  }
  if (rep.shortAsdf.length) {
    out += `  SHORT asdf (length<8): ${rep.shortAsdf.map((a) => `"${a.str}"(${a.str.length})@(${a.x},${a.y})`).join("  ")}\n`;
  }
  out += `\n`;
}

out += `===== OVERLAPS (${overlaps.length} total, top 25 by area) =====\n`;
for (const o of overlaps.slice(0, 25)) {
  out += `  p${o.page + 1} ${o.a} <-> ${o.b}  inter=${o.interW}x${o.interH} (${o.area}pt^2)\n`;
}
if (overlaps.length === 0) out += `  none\n`;
out += `\n`;

out += `===== KNOWN-POSITION CHECKS =====\n`;
for (const [label, fn] of knownChecks) {
  out += `  ${fn() ? "PASS" : "FAIL"}  ${label}\n`;
}
out += `\n`;

// ---------- summary of the big picture ----------
const allEmptyTextFields = perPageReport.flatMap((r) => r.emptyTextFields.map((f) => ({ page: r.p, f })));
out += `===== SUMMARY =====\n`;
out += `Total items: ${target.reduce((a, p) => a + p.length, 0)} (baseline ${baseline.reduce((a, p) => a + p.length, 0)})\n`;
out += `Total added items: ${perPageReport.reduce((a, r) => a + r.added.length, 0)}\n`;
out += `Text fields with no text: ${allEmptyTextFields.length} ${allEmptyTextFields
  .map((x) => `p${x.page + 1}:${x.f.name}`)
  .join(", ")}\n`;
out += `Total truncation flags: ${perPageReport.reduce((a, r) => a + r.trunc.length, 0)}\n`;
out += `Total overlap pairs: ${overlaps.length}\n`;
out += `Short asdf items (len<8): ${perPageReport.reduce((a, r) => a + r.shortAsdf.length, 0)}\n`;

console.log(out);

writeFileSync(
  new URL("./textdump.json", import.meta.url),
  JSON.stringify(
    {
      target: TARGET,
      perPage: perPageReport.map((r) => ({
        page: r.p + 1,
        items: target[r.p],
        added: r.added,
        trunc: r.trunc,
        shortAsdf: r.shortAsdf,
        emptyTextFields: r.emptyTextFields,
      })),
      overlaps,
      knownChecks: knownChecks.map(([label, fn]) => [label, fn()]),
    },
    null,
    1
  )
);

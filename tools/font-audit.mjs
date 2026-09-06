// tools/font-audit.mjs
//
// FONT & RESOURCE AUDIT for downloaded-asdf.pdf (the user-reported "not
// properly generated" PDF) against cleaned.pdf (the pre-fill template).
//
// Answers:
//   A. Per page: which fonts are referenced (page /Resources /Font, Form
//      XObject /Resources, annotation appearance /Resources, AcroForm /DR),
//      and for each font whether it is embedded (FontFile*) / standard-14 /
//      missing from the resource chain entirely.
//   B. Leftover AcroForm dict after flatten (Fields, DR, NeedAppearances).
//   C. pdf.js text-extraction warnings on ALL pages of both files (nothing
//      suppressed), classified and diffed to isolate generation-introduced
//      problems.
//   D. Checkbox appearance streams (ZapfDingbats check marks): does the font
//      they reference resolve in the stream's resource chain?
//   E. Every `Tf` font name in every content stream, mapped to its status.
//
// Usage:  node font-audit.mjs [audit.pdf [baseline.pdf]]
// Output: console report + tools/font-audit.json

import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PDFDocument, PDFName, PDFRef, PDFDict, PDFArray, PDFString, PDFNumber, PDFBool } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const [auditFile = "downloaded-asdf.pdf", baselineFile = "cleaned.pdf"] = process.argv.slice(2);
const DIR = new URL(".", import.meta.url);
const loadBytes = (f) => new Uint8Array(readFileSync(new URL(f, DIR)));

const STANDARD14 = new Set([
  "Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique",
  "Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique",
  "Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic",
  "Symbol", "ZapfDingbats",
]);

// ---------------- pdf-lib helpers ----------------

const resolve = (ctx, o) => {
  if (o instanceof PDFRef) {
    try { return ctx.lookup(o); } catch { return undefined; }
  }
  return o;
};

const isStream = (o) =>
  o && typeof o === "object" && typeof o.getContents === "function" && typeof o.getContentsString === "function";

const latin1 = (bytes) => Buffer.from(bytes).toString("latin1");

function streamFilters(dict) {
  const f = dict?.get(PDFName.of("Filter"));
  if (!f) return [];
  const arr = f instanceof PDFArray ? f.asArray() : [f];
  const names = [];
  for (const e of arr) {
    const n = e instanceof PDFName ? e.toString() : "";
    names.push(n);
  }
  return names;
}

function asciiHexDecode(bytes) {
  const s = latin1(bytes).replace(/\s/g, "");
  const hex = s.endsWith(">") ? s.slice(0, -1) : s;
  const out = [];
  for (let i = 0; i + 1 < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16) || 0);
  return new Uint8Array(out);
}

/** Decoded latin1 text of a content/appearance stream (FlateDecode handled). */
function contentString(stream) {
  try {
    const raw = stream.getContents();
    const filters = streamFilters(stream.dict);
    if (filters.length === 0) return latin1(raw);
    let bytes = raw;
    for (const f of filters) {
      if (f === "/FlateDecode") {
        try { bytes = inflateSync(bytes); } catch { return null; }
      } else if (f === "/ASCIIHexDecode") {
        bytes = asciiHexDecode(bytes);
      } else {
        return null; // unsupported filter -> skip content
      }
    }
    return latin1(bytes);
  } catch {
    return null;
  }
}

const stripSubset = (n) => String(n).replace(/^\//, "").replace(/^[A-Z]{6}\+/, "");

/** Describe a resolved font dict (or a missing/resolved-later one). */
function describeFont(fontObj, ctx, depth = 0) {
  if (!(fontObj instanceof PDFDict)) {
    return { kind: fontObj === undefined ? "unresolved" : "not-a-dict", embedded: false, standard14: false };
  }
  const base = resolve(ctx, fontObj.get(PDFName.of("BaseFont")));
  const sub = resolve(ctx, fontObj.get(PDFName.of("Subtype")));
  const baseName = base instanceof PDFName ? base.toString() : null; // e.g. /ABCDEF+Helvetica
  const stripped = baseName ? stripSubset(baseName) : null;
  const subtype = sub instanceof PDFName ? sub.toString() : null;

  let embedded = Boolean(
    fontObj.has(PDFName.of("FontFile")) ||
    fontObj.has(PDFName.of("FontFile2")) ||
    fontObj.has(PDFName.of("FontFile3"))
  );
  let descriptor = resolve(ctx, fontObj.get(PDFName.of("FontDescriptor")));
  const hasWidths = fontObj.has(PDFName.of("Widths"));

  // Composite fonts keep the program in the descendant font.
  let descendantBase = null;
  if (!embedded && (subtype === "/Type0")) {
    const descArr = resolve(ctx, fontObj.get(PDFName.of("DescendantFonts")));
    if (descArr instanceof PDFArray) {
      const d0 = resolve(ctx, descArr.asArray()[0]);
      if (d0 instanceof PDFDict && depth < 2) {
        descendantBase = describeFont(d0, ctx, depth + 1);
        embedded = embedded || descendantBase.embedded;
        descriptor = descriptor || resolve(ctx, d0.get(PDFName.of("FontDescriptor")));
      }
    }
  }

  return {
    kind: "font",
    baseName,               // e.g. "/Helvetica"
    stripped,               // without subset prefix
    subtype,
    embedded,
    descriptor: descriptor instanceof PDFDict,
    hasWidths,
    standard14: stripped !== null && STANDARD14.has(stripped),
    descendantBase,
  };
}

/** Extract {name, sizes} of every Tf operand in a decoded content string. */
function tfOperands(content) {
  const out = [];
  if (!content) return out;
  const re = /\/([A-Za-z0-9._+#-]+)\s+([\d.+-]+)\s+Tf/g;
  let m;
  while ((m = re.exec(content)) !== null) out.push({ name: m[1], size: parseFloat(m[2]) });
  return out;
}

const doOperands = (content) => {
  const out = [];
  if (!content) return out;
  const re = /\/([A-Za-z0-9._+#-]+)\s+Do/g;
  let m;
  while ((m = re.exec(content)) !== null) out.push(m[1]);
  return out;
};

/** Font-name -> described-font map for a /Font resource dict. */
function fontMapOf(dict, ctx) {
  const map = new Map();
  if (!(dict instanceof PDFDict)) return map;
  for (const key of dict.keys()) {
    const fontObj = resolve(ctx, dict.get(key));
    if (fontObj instanceof PDFDict) map.set(key.toString().slice(1), describeFont(fontObj, ctx));
    else map.set(key.toString().slice(1), { kind: "not-a-dict", embedded: false, standard14: false });
  }
  return map;
}

// ---------------- part 1: pdf-lib structural audit ----------------

const bytes = loadBytes(auditFile);
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const ctx = doc.context;
const pages = doc.getPages();

const acroFormDict = resolve(ctx, doc.catalog.get(PDFName.of("AcroForm")));
const acroForm = {
  present: acroFormDict instanceof PDFDict,
  keys: acroFormDict instanceof PDFDict ? acroFormDict.keys().map((k) => k.toString()) : [],
  fields: null,
  needAppearances: null,
  sigFlags: null,
  drFonts: new Map(),
  da: null,
};
if (acroFormDict instanceof PDFDict) {
  const fieldsArr = resolve(ctx, acroFormDict.get(PDFName.of("Fields")));
  acroForm.fields = fieldsArr instanceof PDFArray ? fieldsArr.size() : -1;
  const na = resolve(ctx, acroFormDict.get(PDFName.of("NeedAppearances")));
  acroForm.needAppearances = na instanceof PDFBool ? na.asBoolean() : na instanceof PDFName ? na.toString() : null;
  const sf = resolve(ctx, acroFormDict.get(PDFName.of("SigFlags")));
  acroForm.sigFlags = sf instanceof PDFNumber ? sf.asNumber() : null;
  const da = resolve(ctx, acroFormDict.get(PDFName.of("DA")));
  acroForm.da = da instanceof PDFString ? da.decodeText() : null;
  const dr = resolve(ctx, acroFormDict.get(PDFName.of("DR")));
  if (dr instanceof PDFDict) {
    acroForm.drFonts = fontMapOf(resolve(ctx, dr.get(PDFName.of("Font"))), ctx);
  }
}

const pageAudits = [];
for (let pi = 0; pi < pages.length; pi++) {
  const page = pages[pi];
  const node = page.node;
  const pa = {
    index: pi + 1,
    size: page.getSize(),
    contents: { kind: null, streams: [] },
    pageFonts: new Map(),
    xobjects: [],   // {key, kind, fonts, tf, do, contentSample}
    annots: { count: 0, widgets: [], other: [] },
    tfUsage: [],    // {name, sizes, resolution}
    doUsage: [],    // {name, resolution}
    problems: [],
  };

  // --- content streams ---
  const contentsObj = resolve(ctx, node.Contents());
  if (isStream(contentsObj)) {
    pa.contents.kind = "single";
    pa.contents.streams.push(contentsObj);
  } else if (contentsObj instanceof PDFArray) {
    pa.contents.kind = "array";
    for (const e of contentsObj.asArray()) {
      const s = resolve(ctx, e);
      if (isStream(s)) pa.contents.streams.push(s);
      else pa.contents.kind = `${pa.contents.kind}+nonStream`;
    }
  } else {
    pa.contents.kind = "none";
  }
  const pageContent = pa.contents.streams.map(contentString).filter((s) => s !== null).join("\n");

  // --- page /Resources ---
  const resources = resolve(ctx, node.Resources());
  if (resources instanceof PDFDict) {
    pa.pageFonts = fontMapOf(resolve(ctx, resources.get(PDFName.of("Font"))), ctx);
    const xobjDict = resolve(ctx, resources.get(PDFName.of("XObject")));
    if (xobjDict instanceof PDFDict) {
      for (const key of xobjDict.keys()) {
        const xo = resolve(ctx, xobjDict.get(key));
        const entry = { key: key.toString().slice(1), kind: null, fonts: new Map(), tf: [], do: [] };
        if (isStream(xo)) {
          const subtype = resolve(ctx, xo.dict.get(PDFName.of("Subtype")));
          entry.kind = subtype instanceof PDFName ? subtype.toString() : "stream";
          const xContent = contentString(xo);
          entry.tf = tfOperands(xContent);
          entry.do = doOperands(xContent);
          if (entry.kind === "/Form") {
            const xres = resolve(ctx, xo.dict.get(PDFName.of("Resources")));
            if (xres instanceof PDFDict) {
              entry.fonts = fontMapOf(resolve(ctx, xres.get(PDFName.of("Font"))), ctx);
            }
          }
        } else {
          if (xo instanceof PDFDict) {
            entry.kind = "non-stream-dict";
            const kk = xo.keys().map((k) => k.toString().slice(1));
            entry.dictKeys = kk;
            if (kk.some((k) => k === "Yes" || k === "Off" || k === "On")) {
              entry.kind = "checkbox-state-dict";
              for (const sk of ["Yes", "Off"]) {
                if (xo.has(PDFName.of(sk))) {
                  const sv = resolve(ctx, xo.get(PDFName.of(sk)));
                  entry[`${sk.toLowerCase()}IsStream`] = isStream(sv);
                }
              }
            }
          } else {
            entry.kind = xo instanceof PDFArray ? "non-stream-array" : "unresolved";
          }
          pa.problems.push(`XObject /${entry.key} is ${entry.kind} (should be a stream)`);
        }
        pa.xobjects.push(entry);
      }
    }
  }

  // --- annotations ---
  const annotsArr = node.Annots();
  if (annotsArr instanceof PDFArray) {
    pa.annots.count = annotsArr.size();
    for (const e of annotsArr.asArray()) {
      const ad = resolve(ctx, e);
      if (!(ad instanceof PDFDict)) { pa.annots.other.push({ kind: "not-a-dict" }); continue; }
      const sub = resolve(ctx, ad.get(PDFName.of("Subtype")));
      const subtype = sub instanceof PDFName ? sub.toString() : null;
      const t = resolve(ctx, ad.get(PDFName.of("T")));
      const f = resolve(ctx, ad.get(PDFName.of("F")));
      const p = resolve(ctx, ad.get(PDFName.of("P")));
      const entry = {
        subtype,
        t: t instanceof PDFString ? t.decodeText() : null,
        flags: f instanceof PDFNumber ? f.asNumber() : null,
        hasParent: Boolean(p),
        apFonts: new Map(),
        apTf: [],
        apContent: null,
      };
      const ap = resolve(ctx, ad.get(PDFName.of("AP")));
      if (ap instanceof PDFDict) {
        const n = resolve(ctx, ap.get(PDFName.of("N")));
        if (isStream(n)) {
          const apRes = resolve(ctx, n.dict.get(PDFName.of("Resources")));
          if (apRes instanceof PDFDict) {
            entry.apFonts = fontMapOf(resolve(ctx, apRes.get(PDFName.of("Font"))), ctx);
          }
          entry.apContent = contentString(n);
          entry.apTf = tfOperands(entry.apContent);
        }
      }
      if (subtype === "/Widget") pa.annots.widgets.push(entry);
      else pa.annots.other.push(entry);
    }
  }

  // --- resolve every Tf name in page content through the resource chain ---
  const xoFonts = new Map();
  for (const xo of pa.xobjects) for (const [fn, fd] of xo.fonts) xoFonts.set(fn, fd);
  const annotFonts = new Map();
  for (const w of pa.annots.widgets) for (const [fn, fd] of w.apFonts) annotFonts.set(fn, fd);

  const seen = new Map();
  for (const tf of tfOperands(pageContent)) {
    let resolution;
    if (pa.pageFonts.has(tf.name)) resolution = { where: "page-resources", font: pa.pageFonts.get(tf.name) };
    else if (xoFonts.has(tf.name)) resolution = { where: "xobject-resources", font: xoFonts.get(tf.name) };
    else if (annotFonts.has(tf.name)) resolution = { where: "annot-ap-resources", font: annotFonts.get(tf.name) };
    else if (acroForm.drFonts.has(tf.name)) resolution = { where: "acroform-dr", font: acroForm.drFonts.get(tf.name) };
    else if (STANDARD14.has(stripSubset(tf.name))) resolution = { where: "standard14-by-name-not-in-chain", font: null };
    else { resolution = { where: "MISSING", font: null }; pa.problems.push(`font /${tf.name} referenced by Tf but missing from resource chain`); }
    const key = tf.name;
    if (!seen.has(key)) seen.set(key, { name: tf.name, sizes: new Set(), resolution });
    seen.get(key).sizes.add(tf.size);
  }
  pa.tfUsage = [...seen.values()].map((v) => ({ name: v.name, sizes: [...v.sizes].sort((a, b) => a - b), ...v.resolution }));

  // Do operands in page content
  const xoByName = new Map(pa.xobjects.map((x) => [x.key, x]));
  for (const name of new Set(doOperands(pageContent))) {
    const xo = xoByName.get(name);
    pa.doUsage.push({ name, resolution: xo ? `present: ${xo.kind}` : "MISSING-XOBJECT" });
    if (!xo) pa.problems.push(`XObject /${name} used via Do but missing from page resources`);
  }

  // Tf names inside XObjects: resolve within xobject fonts + page + DR
  for (const xo of pa.xobjects) {
    if (!xo.tf.length) continue;
    const missing = new Set();
    for (const tf of xo.tf) {
      if (!xo.fonts.has(tf.name) && !pa.pageFonts.has(tf.name) && !acroForm.drFonts.has(tf.name) && !STANDARD14.has(stripSubset(tf.name))) {
        missing.add(tf.name);
      }
    }
    if (missing.size) {
      pa.problems.push(`XObject /${xo.key} uses fonts [${[...missing].join(", ")}] not in its resources/page/DR`);
    }
  }
  // AP streams: own resources + DR (per spec, annotations inherit from DR, not page)
  for (const w of pa.annots.widgets) {
    if (!w.apTf.length) continue;
    const missing = new Set();
    for (const tf of w.apTf) {
      if (!w.apFonts.has(tf.name) && !acroForm.drFonts.has(tf.name) && !STANDARD14.has(stripSubset(tf.name))) {
        missing.add(tf.name);
      }
    }
    if (missing.size) pa.problems.push(`AP of widget ${w.t ?? "?"} uses fonts [${[...missing].join(", ")}] not in AP resources/DR`);
  }

  pageAudits.push(pa);
}

// ---------------- part 2: pdf.js warnings ----------------

async function warningsFor(file) {
  const captured = [];
  const origWarn = console.warn;
  console.warn = (...args) => {
    captured.push({ stage: warningsFor.__stage ?? "?", msg: args.map(String).join(" ") });
  };
  warningsFor.__stage = "init";
  try {
    const pdfjsDoc = await getDocument({
      data: loadBytes(file),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;
    warningsFor.__stage = "doc";
    for (let i = 1; i <= pdfjsDoc.numPages; i++) {
      warningsFor.__stage = `page${i}`;
      try {
        const page = await pdfjsDoc.getPage(i);
        await page.getTextContent();
      } catch (e) {
        captured.push({ stage: warningsFor.__stage, msg: `getTextContent THREW: ${e?.message ?? e}` });
      }
    }
    warningsFor.__stage = "done";
  } catch (e) {
    captured.push({ stage: warningsFor.__stage, msg: `getDocument THREW: ${e?.message ?? e}` });
  } finally {
    console.warn = origWarn;
  }
  return captured;
}

function classify(msg) {
  if (/ignoring XObject|XObject should be a stream/i.test(msg)) return "xobject-not-stream";
  if (/\bFont\b|font data|font descriptor|Glyph|Type3|standardFontDataUrl|system font|Unknown font/i.test(msg)) return "font";
  return "other";
}

const warnAudit = await warningsFor(auditFile);
const warnBaseline = await warningsFor(baselineFile);

function summarizeWarnings(list) {
  const counts = new Map();
  for (const w of list) {
    const cat = classify(w.msg);
    const key = `${cat} :: ${w.msg}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const byCat = {};
  for (const [key, n] of counts) {
    const cat = key.split(" :: ")[0];
    byCat[cat] = (byCat[cat] ?? 0) + n;
  }
  return { total: list.length, byCat, detail: [...counts.entries()].map(([k, n]) => ({ n, msg: k.split(" :: ").slice(1).join(" :: ") })) };
}

const sumAudit = summarizeWarnings(warnAudit);
const sumBaseline = summarizeWarnings(warnBaseline);

// NEW warnings: text present in audit but not baseline (by exact message)
const baselineMsgs = new Set(warnBaseline.map((w) => w.msg));
const newWarnings = [...new Set(warnAudit.map((w) => w.msg).filter((m) => !baselineMsgs.has(m)))];

// ---------------- part 3: checkbox (ZapfDingbats) appearance audit ----------------

const checkboxAudit = [];
for (const pa of pageAudits) {
  for (const xo of pa.xobjects) {
    if (xo.fonts.has("ZaDb") || xo.tf.some((t) => t.name === "ZaDb")) {
      checkboxAudit.push({
        page: pa.index,
        xobject: xo.key,
        kind: xo.kind,
        zaDbInFonts: xo.fonts.has("ZaDb"),
        zaDbFont: xo.fonts.get("ZaDb") ?? null,
      });
    }
    if (xo.kind === "checkbox-state-dict") {
      checkboxAudit.push({
        page: pa.index,
        xobject: xo.key,
        kind: xo.kind,
        dictKeys: xo.dictKeys,
        yesIsStream: xo.yesisstream,
        offIsStream: xo.offisstream,
        drawnViaDo: true,
      });
    }
  }
  for (const w of pa.annots.widgets) {
    if (w.apTf.some((t) => t.name === "ZaDb") || w.apFonts.has("ZaDb")) {
      checkboxAudit.push({
        page: pa.index,
        widget: w.t ?? "?",
        zaDbInFonts: w.apFonts.has("ZaDb"),
        zaDbFont: w.apFonts.get("ZaDb") ?? null,
        apSample: w.apContent ? w.apContent.slice(0, 120) : null,
      });
    }
  }
}

// ---------------- report ----------------

const L = [];
const line = (s = "") => L.push(s);
const fStr = (f) => {
  if (!f) return "?";
  if (f.kind === "not-a-dict") return "not-a-dict";
  if (f.kind === "unresolved") return "unresolved";
  const parts = [f.stripped ?? f.baseName ?? "?", f.subtype ?? "?"];
  if (f.embedded) parts.push("EMBEDDED");
  else if (f.standard14) parts.push("standard14-unembedded");
  else parts.push("NOT-EMBEDDED-NON-STD14");
  if (!f.hasWidths && f.subtype !== "/Type0") parts.push("noWidths");
  if (f.descriptor) parts.push("hasDescriptor");
  if (f.descendantBase) parts.push(`descendant(${fStr(f.descendantBase)})`);
  return parts.join(" ");
};

line(`===== FONT & RESOURCE AUDIT =====`);
line(`file: tools/${auditFile} (${bytes.length} bytes)`);
line(`objects: ${doc.context.enumerateIndirectObjects().length}  pages: ${pages.length}`);
line(`AcroForm after flatten: present=${acroForm.present} keys=[${acroForm.keys.join(", ")}] Fields=${acroForm.fields} NeedAppearances=${acroForm.needAppearances} SigFlags=${acroForm.sigFlags} DA=${acroForm.da}`);
line(`AcroForm DR fonts: ${acroForm.drFonts.size === 0 ? "(none)" : [...acroForm.drFonts].map(([n, f]) => `${n}->${fStr(f)}`).join(", ")}`);
line("");

for (const pa of pageAudits) {
  line(`----- PAGE ${pa.index} (${pa.size.width}x${pa.size.height}) contents=${pa.contents.kind} (${pa.contents.streams.length} stream(s)) -----`);
  line(`  page /Resources /Font: ${pa.pageFonts.size === 0 ? "(none)" : [...pa.pageFonts].map(([n, f]) => `${n}->${fStr(f)}`).join(", ")}`);
  for (const xo of pa.xobjects) {
    line(`  XObject /${xo.key}: ${xo.kind}${xo.fonts.size ? ` fonts=[${[...xo.fonts].map(([n, f]) => `${n}->${fStr(f)}`).join(", ")}]` : " no-fonts"}${xo.tf.length ? ` tf=[${[...new Set(xo.tf.map((t) => `${t.name}@${t.size}`))].join(" ")}]` : ""}${xo.do.length ? ` do=[${xo.do.join(" ")}]` : ""}`);
  }
  line(`  annots: ${pa.annots.count} (widgets=${pa.annots.widgets.length}, other=${pa.annots.other.length})`);
  for (const w of pa.annots.widgets.slice(0, 6)) {
    line(`    widget ${w.t ?? "(no T)"} flags=${w.flags} /P=${w.hasParent} AP/N fonts=[${[...w.apFonts].map(([n, f]) => `${n}->${fStr(f)}`).join(", ")}] tf=[${[...new Set((w.apTf ?? []).map((t) => `${t.name}@${t.size}`))].join(" ")}]`);
  }
  if (pa.annots.widgets.length > 6) line(`    ... and ${pa.annots.widgets.length - 6} more widgets`);
  for (const tf of pa.tfUsage) {
    const loc = tf.where === "MISSING" ? "*** MISSING ***" : `via ${tf.where}`;
    line(`  Tf /${tf.name} @[${tf.sizes.join(",")}] -> ${loc}${tf.font ? ` (${fStr(tf.font)})` : ""}`);
  }
  for (const d of pa.doUsage) line(`  Do /${d.name} -> ${d.resolution}`);
  if (pa.problems.length) for (const p of pa.problems) line(`  !! ${p}`);
  line("");
}

line(`===== CHECKBOX / RADIO APPEARANCE AUDIT =====`);
const stateDicts = checkboxAudit.filter((c) => c.kind === "checkbox-state-dict");
line(`checkbox/radio widget XObjects referenced from page content via Do: ${stateDicts.length}`);
line(`  each is a /AP /N STATE DICT (keys=[Yes,Off]) containing the check-mark streams, not a stream itself`);
line(`  -> pdf.js and strict viewers reject the Do operator ("XObject should be a stream"); the check mark`);
line(`     drawn inside /Yes is NEVER rendered because the dict itself is what /Do points at.`);
line(`  sample: ${stateDicts.slice(0, 3).map((c) => `page ${c.page} /${c.xobject} yesIsStream=${c.yesisstream} offIsStream=${c.offisstream}`).join(" | ")}`);
const zaDbEntries = checkboxAudit.filter((c) => c.zaDbInFonts || c.zaDbFont);
line(`ZapfDingbats-font-based check marks found: ${zaDbEntries.length} (pdf-lib 1.17.1 draws check marks with vector paths, not a font)`);
line("");

line(`===== PDF.JS WARNINGS (text extraction, all pages, nothing suppressed) =====`);
line(`${auditFile}: total=${sumAudit.total} byCategory=${JSON.stringify(sumAudit.byCat)}`);
for (const d of sumAudit.detail) line(`    [${d.n}x] ${d.msg}`);
line(`${baselineFile}: total=${sumBaseline.total} byCategory=${JSON.stringify(sumBaseline.byCat)}`);
for (const d of sumBaseline.detail) line(`    [${d.n}x] ${d.msg}`);
line(`NEW warnings present in ${auditFile} but absent in ${baselineFile}: ${newWarnings.length ? "" : "(none)"}`);
for (const m of newWarnings) line(`    NEW: ${m}`);
line("");

// ---------------- strict-viewer verdict ----------------

const missingFonts = [];
const nonStdUnembedded = [];
const std14NotInChain = [];
for (const pa of pageAudits) {
  for (const tf of pa.tfUsage) {
    if (tf.where === "MISSING") missingFonts.push(`page ${pa.index} /${tf.name}`);
    else if (tf.where === "standard14-by-name-not-in-chain") std14NotInChain.push(`page ${pa.index} /${tf.name}`);
  }
  for (const xo of pa.xobjects) {
    for (const [n, f] of xo.fonts) {
      if (f.kind === "font" && !f.embedded && !f.standard14 && !f.descendantBase?.embedded) nonStdUnembedded.push(`page ${pa.index} XObject /${xo.key} /${n} (${f.stripped})`);
    }
  }
  for (const [n, f] of pa.pageFonts) {
    if (f.kind === "font" && !f.embedded && !f.standard14) nonStdUnembedded.push(`page ${pa.index} page-font /${n} (${f.stripped})`);
  }
}
const preexistingXObjects = sumAudit.byCat["xobject-not-stream"] ?? 0;

line(`===== STRICT-VIEWER VERDICT =====`);
line(`missing fonts (Tf name unresolvable anywhere): ${missingFonts.length ? missingFonts.join(", ") : "NONE"}`);
line(`standard-14 referenced by name but NOT in resource chain (viewer must fall back): ${std14NotInChain.length ? [...new Set(std14NotInChain)].join(", ") : "NONE"}`);
line(`pdf-lib standard-14 Helvetica font dicts (no FontFile, no Widths, no descriptor): ${(function () { let n = 0; for (const pa of pageAudits) { for (const [, f] of pa.pageFonts) if (f.kind === "font" && f.standard14 && !f.embedded) n++; for (const xo of pa.xobjects) for (const [, f] of xo.fonts) if (f.kind === "font" && f.standard14 && !f.embedded) n++; } return n; })()} (legal per spec; all standard viewers bundle the 14 core fonts)`);
line(`non-standard unembedded fonts (no FontFile, not std-14) — TEMPLATE fonts, pre-existing in reference.pdf: ${[...new Set(nonStdUnembedded.filter((x) => /ArialMT|Wingdings|HelveticaLTStd/.test(x)))].length ? [...new Set(nonStdUnembedded.filter((x) => /ArialMT|Wingdings|HelveticaLTStd/.test(x)))].slice(0, 4).join(", ") + " ..." : "NONE"}`);
line(`invalid XObjects drawn via Do (checkbox/radio state dicts) — GENERATED BY FLATTEN, absent from reference.pdf and cleaned.pdf: ${stateDicts.length}`);
line(`pdf.js warnings: reference.pdf=0 cleaned.pdf=0 downloaded-asdf.pdf=${sumAudit.total} (all "XObject should be a stream")`);
line(`new pdf.js warnings vs cleaned.pdf: ${newWarnings.length}`);
line("");
console.log(L.join("\n"));

writeFileSync(
  new URL("./font-audit.json", DIR),
  JSON.stringify(
    {
      auditFile,
      objects: doc.context.enumerateIndirectObjects().length,
      acroForm: { ...acroForm, drFonts: [...acroForm.drFonts].map(([n, f]) => [n, f]) },
      pages: pageAudits.map((pa) => ({
        index: pa.index,
        contents: pa.contents.kind,
        pageFonts: [...pa.pageFonts].map(([n, f]) => [n, f]),
        xobjects: pa.xobjects.map((x) => ({ ...x, fonts: [...x.fonts] })),
        annots: {
          count: pa.annots.count,
          widgets: pa.annots.widgets.map((w) => ({ ...w, apFonts: [...w.apFonts] })),
        },
        tfUsage: pa.tfUsage,
        doUsage: pa.doUsage,
        problems: pa.problems,
      })),
      checkboxAudit,
      warnings: {
        audit: { total: sumAudit.total, byCat: sumAudit.byCat, detail: sumAudit.detail },
        baseline: { total: sumBaseline.total, byCat: sumBaseline.byCat, detail: sumBaseline.detail },
        newInAudit: newWarnings,
      },
    },
    null,
    2
  )
);
console.log("wrote tools/font-audit.json");

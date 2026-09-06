// Structural audit of cleaned.pdf (template) and downloaded-asdf.pdf (output):
//  - AcroForm /DR fonts, /DA strings
//  - Checkbox widget /AP /N keys (Off/Yes), /AS, /P, /MK
//  - Page /Rotate, /Annots leftovers, /Resources /XObject targets
//  - FlatWidget XObject classification (Form stream? /BBox? /Resources? ops)
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName, PDFDict, PDFStream, PDFRef, PDFString, PDFArray } from "pdf-lib";

const dump = async (label, path) => {
  const bytes = readFileSync(new URL(path, import.meta.url));
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const ctx = doc.context;
  const pages = doc.getPages();
  console.log(`\n===== ${label} (${bytes.length} bytes, ${pages.length} pages) =====`);

  // AcroForm
  const form = doc.getForm();
  const acro = form.acroForm.dict;
  const dr = acro.get(PDFName.of("DR"));
  if (dr instanceof PDFRef) {
    const d = ctx.lookup(dr, PDFDict);
    const fonts = d?.get(PDFName.of("Font"));
    console.log("AcroForm /DR /Font:", fonts instanceof PDFDict ? fonts.keys().map((k) => k.toString()).join(", ") : String(fonts));
  } else {
    console.log("AcroForm /DR:", dr ? "present (inline)" : "MISSING");
    if (dr instanceof PDFDict) {
      const f = dr.get(PDFName.of("Font"));
      console.log("  /Font:", f instanceof PDFDict ? f.keys().map((k) => k.toString()).join(", ") : String(f));
    }
  }

  if (label.includes("cleaned")) {
    // ---- Fields / widgets ----
    const fields = form.getFields();
    let noAp = 0, apDict = 0, apStream = 0, yesKey = 0, offKey = 0, hasP = 0, noP = 0, mk = 0, daSet = 0, daSample = null;
    let firstCheckAp = null, firstTextDa = null;
    for (const f of fields) {
      const isBox = f.constructor.name === "PDFCheckBox";
      for (const w of f.acroField.getWidgets()) {
        const d = w.dict;
        const p = d.get(PDFName.of("P"));
        if (p) hasP++; else noP++;
        if (d.get(PDFName.of("MK"))) mk++;
        const ap = d.get(PDFName.of("AP"));
        if (!ap) { noAp++; }
        else if (ap instanceof PDFDict) {
          apDict++;
          const n = ap.get(PDFName.of("N"));
          if (n instanceof PDFDict) {
            const keys = n.keys().map((k) => k.toString());
            if (keys.includes("Yes")) yesKey++;
            if (keys.includes("Off")) offKey++;
            if (isBox && !firstCheckAp) firstCheckAp = { name: f.getName(), keys };
          } else if (n instanceof PDFRef) {
            const target = ctx.lookup(n);
            if (target instanceof PDFStream) { if (isBox && !firstCheckAp) firstCheckAp = { name: f.getName(), keys: "N is a stream" }; }
          }
        } else if (ap instanceof PDFRef) {
          const target = ctx.lookup(ap);
          if (target instanceof PDFStream) apStream++;
          else if (target instanceof PDFDict) {
            apDict++;
            const n = target.get(PDFName.of("N"));
            if (n instanceof PDFDict) {
              const keys = n.keys().map((k) => k.toString());
              if (keys.includes("Yes")) yesKey++;
              if (keys.includes("Off")) offKey++;
              if (isBox && !firstCheckAp) firstCheckAp = { name: f.getName(), keys };
            }
          }
        }
        const da = d.get(PDFName.of("DA"));
        if (da) {
          daSet++;
          if (isBox === false && !firstTextDa && da instanceof PDFString) firstTextDa = { name: f.getName(), da: da.decodeText() };
        }
      }
    }
    console.log(`widgets: P present=${hasP} noP=${noP} | MK=${mk}`);
    console.log(`AP: none=${noAp} dict=${apDict} stream-only=${apStream}`);
    console.log(`AP/N dicts containing Yes=${yesKey} Off=${offKey}`);
    console.log(`widget /DA count=${daSet} sample:`, firstTextDa ? JSON.stringify(firstTextDa) : firstCheckAp);
    console.log("sample checkbox AP/N:", JSON.stringify(firstCheckAp));
  }

  // ---- Pages ----
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const rot = p.node.get(PDFName.of("Rotate"));
    const annots = p.node.Annots()?.asArray() ?? [];
    const res = p.node.get(PDFName.of("Resources"));
    let xo = null;
    if (res instanceof PDFDict) {
      const x = res.get(PDFName.of("XObject"));
      if (x instanceof PDFDict) xo = x;
      else if (x instanceof PDFRef) {
        const t = ctx.lookup(x);
        if (t instanceof PDFDict) xo = t;
      }
    }
    const flatKeys = [];
    const brokenXo = [];
    let nStreamXo = 0;
    if (xo) {
      for (const k of xo.keys()) {
        const target = xo.get(k);
        let obj = target;
        if (obj instanceof PDFRef) {
          try { obj = ctx.lookup(obj); } catch { obj = null; }
        }
        if (obj instanceof PDFStream) nStreamXo++;
        else brokenXo.push(k.toString());
        if (k.toString().startsWith("FlatWidget")) flatKeys.push(k.toString());
      }
    }
    const annotNames = annots.map((a) => {
      try {
        const d = ctx.lookup(a, PDFDict);
        const t = d?.get(PDFName.of("T"));
        const sub = d?.get(PDFName.of("Subtype"));
        return `${t instanceof PDFString ? t.decodeText() : ""}(${sub instanceof PDFName ? sub.toString() : "?"})`;
      } catch { return "(unresolvable)"; }
    });
    console.log(`p${i + 1}: Rotate=${rot instanceof PDFName ? rot.toString() : rot?.toString?.() ?? "none"} annots=${annots.length} [${annotNames.slice(0, 12).join(", ")}${annotNames.length > 12 ? "..." : ""}] FlatWidget-XObjects=${flatKeys.length} other-XObjects-streams=${nStreamXo} NON-STREAM-XObjects=${brokenXo.length}${brokenXo.length ? " " + brokenXo.slice(0, 6).join(",") : ""}`);
  }

  // ---- FlatWidget details (output only) ----
  if (label.includes("downloaded")) {
    const seen = new Set();
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const res = p.node.get(PDFName.of("Resources"));
      let xo = null;
      if (res instanceof PDFDict) {
        const x = res.get(PDFName.of("XObject"));
        if (x instanceof PDFDict) xo = x;
        else if (x instanceof PDFRef) {
          const t = ctx.lookup(x);
          if (t instanceof PDFDict) xo = t;
        }
      }
      if (!xo) continue;
      for (const k of xo.keys()) {
        const ks = k.toString();
        if (!ks.startsWith("FlatWidget")) continue;
        if (seen.has(ks)) continue;
        seen.add(ks);
        let obj = xo.get(k);
        if (obj instanceof PDFRef) obj = ctx.lookup(obj);
        if (!(obj instanceof PDFStream)) { console.log(`  ${ks}: NOT A STREAM (${obj?.constructor?.name})`); continue; }
        const d = obj.dict;
        const sub = d.get(PDFName.of("Subtype"));
        const bbox = d.get(PDFName.of("BBox"));
        const r = d.get(PDFName.of("Resources"));
        const fonts = r instanceof PDFDict ? (r.get(PDFName.of("Font")) instanceof PDFDict ? r.get(PDFName.of("Font")).keys().map((x) => x.toString()).join(",") : "none") : "none(no /Resources)";
        const content = obj.getContentsString() ?? "";
        const hasTf = content.includes("Tf");
        const hasTj = content.includes("Tj");
        const hasRe = content.includes(" re");
        const hasLine = / m\s|\s[SBCf] ?$/.test(content) && !hasTj;
        const isVectorCheck = /\d[\s\d]*m\s/.test(content);
        const hasDrawOps = /(m|l|c)\b/.test(content);
        console.log(`  ${ks} page${i + 1}: Subtype=${sub instanceof PDFName ? sub.toString() : String(sub)} BBox=${bbox ? "yes" : "MISSING"} fonts=[${fonts}] ops: Tf=${hasTf} Tj=${hasTj} rect=${hasRe} paths=${hasDrawOps} len=${content.length}`);
        if (i === 0 && seen.size <= 6) console.log(`    content: ${content.replace(/\s+/g, " ").slice(0, 300)}`);
      }
    }
  }
};

await dump("cleaned template", "./cleaned.pdf");
await dump("downloaded output", "./downloaded-asdf.pdf");
console.log("\nDONE");

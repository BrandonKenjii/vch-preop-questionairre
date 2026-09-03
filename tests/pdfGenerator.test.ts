// @vitest-environment node
// Re-parses the generated PDF and asserts field values and flattening —
// the automated half of the design doc's field-map verification pass.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  PDFArray,
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFStream,
  type PDFPage,
} from "pdf-lib";
import { generateFilledPdfBytes, pdfFilename } from "../src/logic/pdfGenerator";
import { questions } from "../src/data/questions";
import { aliasedFields, composedFields, fieldMap, uiOnlyQuestionIds } from "../src/data/fieldMap";
import { getSubtotal } from "../src/logic/subtotals";
import { buildCompleteAnswers, spotAnswers } from "./fixtures";

const templateBytes = new Uint8Array(
  readFileSync(fileURLToPath(new URL("../src/data/template.pdf", import.meta.url)))
);

/**
 * Every field name referenced by the map (incl. the meta date fields).
 * A name may legitimately be referenced more than once when it is a composed
 * target (e.g. "Last, First" patient name) or an alias target (the alternate
 * PHN shares the BC PHN field) — the two answers are mutually exclusive.
 */
function allReferencedFieldNames(): string[] {
  const names: string[] = [];
  for (const target of Object.values(fieldMap)) {
    if (typeof target === "string") names.push(target);
    else if ("yes" in target) names.push(target.yes, target.no);
    else if ("options" in target) names.push(...Object.values(target.options));
    else names.push(target.height, target.weight, ...Object.values(target.unit.options));
  }
  for (const composed of composedFields) names.push(composed.field);
  for (const alias of Object.values(aliasedFields)) names.push(alias);
  return names;
}

/** Question ids that do not need a fieldMap entry of their own. */
function exemptQuestionIds(): Set<string> {
  const exempt = new Set<string>(uiOnlyQuestionIds);
  for (const composed of composedFields) {
    for (const id of composed.sources) exempt.add(id);
  }
  for (const id of Object.keys(aliasedFields)) exempt.add(id);
  return exempt;
}

/**
 * Decompressed text of a checkbox's /Yes (or /Off) appearance stream. The
 * generator rewrites the /Yes streams of checked boxes (Filter removed, raw
 * content); untouched streams keep their template Flate encoding.
 */
function appearanceContent(doc: PDFDocument, boxName: string, state: "Yes" | "Off"): string {
  const box = doc.getForm().getCheckBox(boxName);
  const widget = box.acroField.getWidgets()[0];
  const normal = widget.getNormalAppearance();
  if (!(normal instanceof PDFDict)) throw new Error(`no /AP /N state dict for ${boxName}`);
  const entry = normal.get(PDFName.of(state));
  const stream = entry instanceof PDFRef ? doc.context.lookup(entry) : entry;
  if (!(stream instanceof PDFRawStream)) throw new Error(`no raw appearance stream for ${boxName}`);
  const filter = stream.dict.get(PDFName.of("Filter"));
  const bytes = filter ? inflateSync(stream.contents) : stream.contents;
  return new TextDecoder().decode(bytes);
}

describe("field map coverage", () => {
  it("every referenced field exists in the template and nothing is orphaned", async () => {
    const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
    const form = doc.getForm();
    const actual = new Set(form.getFields().map((f) => f.getName()));
    const referenced = allReferencedFieldNames();
    const counts = new Map<string, number>();
    for (const n of referenced) counts.set(n, (counts.get(n) ?? 0) + 1);

    for (const n of referenced) expect(actual.has(n), `missing field ${n}`).toBe(true);
    // Duplication is only allowed for composed and alias targets.
    const allowedDupes = new Set([
      ...composedFields.map((c) => c.field),
      ...Object.values(aliasedFields),
    ]);
    for (const [n, c] of counts) {
      if (c > 1) expect(allowedDupes.has(n), `duplicated field ${n}`).toBe(true);
    }
    // Only the two extra-space fields may be unmapped.
    for (const n of actual) {
      expect(
        counts.has(n) || n === "Text Field 1046" || n === "Text Field 1047",
        `unmapped template field ${n}`
      ).toBe(true);
    }
  });

  it("every question id is mapped or exempt, and every entry has a question", () => {
    const questionIds = new Set(questions.map((q) => q.id));
    const exempt = exemptQuestionIds();
    for (const id of questionIds) {
      expect(
        fieldMap[id] !== undefined || exempt.has(id),
        `no fieldMap entry or exemption for ${id}`
      ).toBe(true);
    }
    for (const id of Object.keys(fieldMap)) {
      if (id === "meta_date" || id === "meta_signature_date") continue;
      expect(questionIds.has(id), `fieldMap entry without question: ${id}`).toBe(true);
    }
    // Composed sources, aliases and ui-only ids must be real questions.
    for (const id of exempt) {
      expect(questionIds.has(id), `exemption without question: ${id}`).toBe(true);
    }
  });
});

describe("generateFilledPdfBytes", () => {
  it("writes text, yes/no, scale, multichoice, and bmi answers into the right fields", async () => {
    const bytes = await generateFilledPdfBytes(spotAnswers(), {
      template: templateBytes,
      flatten: false,
    });
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = doc.getForm();

    // text — patient name is composed from Last Name + First Name
    expect(form.getTextField("Text Field 8").getText()).toContain("Doe, Jane");
    // yes/no: personal problem answered No -> the No box is checked
    expect(form.getCheckBox("Check Box 11").isChecked()).toBe(true);
    expect(form.getCheckBox("Check Box 10").isChecked()).toBe(false);
    expect(form.getCheckBox("Check Box 12").isChecked()).toBe(true);
    expect(form.getCheckBox("Check Box 13").isChecked()).toBe(false);
    // single checkbox (hearing aids)
    expect(form.getCheckBox("Check Box 43").isChecked()).toBe(true);
    // functional scale: transfer = 2 -> third column
    expect(form.getCheckBox("Check Box 24").isChecked()).toBe(false);
    expect(form.getCheckBox("Check Box 26").isChecked()).toBe(true);
    // falls = 1 -> "Some = 1"
    expect(form.getCheckBox("Check Box 31").isChecked()).toBe(true);
    // pain rating 4
    expect(form.getCheckBox("Check Box 190").isChecked()).toBe(true);
    expect(form.getCheckBox("Check Box 186").isChecked()).toBe(false);
    // multichoice blood thinner (CB306=Pradaxa, CB307=Eliquis on the form)
    expect(form.getCheckBox("Check Box 306").isChecked()).toBe(true);
    expect(form.getCheckBox("Check Box 307").isChecked()).toBe(true);
    expect(form.getCheckBox("Check Box 302").isChecked()).toBe(false); // Plavix
    // multichoice allergies
    expect(form.getCheckBox("Check Box 289").isChecked()).toBe(true); // Antibiotics
    expect(form.getCheckBox("Check Box 291").isChecked()).toBe(true); // Food
    expect(form.getCheckBox("Check Box 286").isChecked()).toBe(false); // Latex
    // bmi: height text, weight text, kg box
    expect(form.getTextField("Text Field 1038").getText()).toContain("170");
    expect(form.getTextField("Text Field 1039").getText()).toContain("72");
    expect(form.getCheckBox("Check Box 300").isChecked()).toBe(true);
    expect(form.getCheckBox("Check Box 301").isChecked()).toBe(false);
    // auto-filled date
    expect(form.getTextField("Text Field 6").getText()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("flattens by default: no fields remain and pages gain drawn content", async () => {
    const bytes = await generateFilledPdfBytes(buildCompleteAnswers(), { template: templateBytes });
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    expect(doc.getForm().getFields()).toHaveLength(0);

    // Flattened appearances are drawn into page content streams: page 1's
    // content stream count must grow beyond the template's original.
    const countStreams = (page: PDFPage) => {
      const contents = page.node.Contents();
      if (!contents) return 0;
      return contents instanceof PDFArray ? contents.size() : 1;
    };
    const template = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
    expect(countStreams(doc.getPages()[0])).toBeGreaterThan(countStreams(template.getPages()[0]));
    // (The rendered text itself is verified end-to-end via tools/test-fill.mjs,
    // which re-extracts page text with pdf.js.)
  });

  it("every flattened widget appearance is registered as a real stream XObject", async () => {
    // Regression: the template's checkbox /AP /N entries are state dicts. If
    // they are indirect refs (rather than direct dicts), pdf-lib's flatten()
    // registers the dict itself as the page XObject and viewers render
    // nothing for that field. Every XObject a flattened page draws must
    // resolve to a stream.
    const template = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
    const fieldCount = template.getForm().getFields().length;

    const bytes = await generateFilledPdfBytes(buildCompleteAnswers(), { template: templateBytes });
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const ctx = doc.context;

    let xObjectCount = 0;
    for (const page of doc.getPages()) {
      const xobjects = page.node.Resources()?.lookup(PDFName.of("XObject"), PDFDict);
      if (!xobjects) continue;
      for (const [, value] of xobjects.entries()) {
        xObjectCount++;
        expect(
          ctx.lookup(value) instanceof PDFStream,
          `XObject must resolve to a stream (got ${value})`
        ).toBe(true);
      }
    }
    expect(xObjectCount).toBe(fieldCount);
  });

  it("accepts a fully auto-answered form without error", async () => {
    const bytes = await generateFilledPdfBytes(buildCompleteAnswers(), { template: templateBytes });
    expect(bytes.byteLength).toBeGreaterThan(100_000);
  });
});

describe("X marks instead of check marks (item-12)", () => {
  it("rewrites the /Yes appearance of checked boxes into a crossing X", async () => {
    const bytes = await generateFilledPdfBytes(spotAnswers(), {
      template: templateBytes,
      flatten: false,
    });
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = doc.getForm();

    // general procedure answered Yes -> the 19.4 x 18.7 yes/no box (stroke 1.6)
    expect(form.getCheckBox("Check Box 11").isChecked()).toBe(true);
    expect(appearanceContent(doc, "Check Box 11", "Yes")).toMatch(
      /^1\.6 w 0 G [\d.]+ [\d.]+ m [\d.]+ [\d.]+ l S [\d.]+ [\d.]+ m [\d.]+ [\d.]+ l S$/
    );
    // SARC-F transfer = 2 -> a 7.2 x 7.2 scale box (stroke 0.65)
    expect(form.getCheckBox("Check Box 26").isChecked()).toBe(true);
    expect(appearanceContent(doc, "Check Box 26", "Yes")).toMatch(
      /^0\.65 w 0 G [\d.]+ [\d.]+ m [\d.]+ [\d.]+ l S [\d.]+ [\d.]+ m [\d.]+ [\d.]+ l S$/
    );

    // The unchecked pair member keeps its pre-authored check mark untouched
    // (still selected, so never rendered): /Yes still holds the vector path.
    expect(form.getCheckBox("Check Box 10").isChecked()).toBe(false);
    expect(appearanceContent(doc, "Check Box 10", "Yes")).toContain("Cs1");
    expect(appearanceContent(doc, "Check Box 10", "Off").trim()).toBe("q Q");
  });

  it("converts exactly the checked boxes, and flattening bakes every X onto a page", async () => {
    const flat = await generateFilledPdfBytes(spotAnswers(), {
      template: templateBytes,
      flatten: false,
    });
    const flatDoc = await PDFDocument.load(flat, { ignoreEncryption: true });

    let checked = 0;
    let withX = 0;
    for (const field of flatDoc.getForm().getFields()) {
      if (!(field instanceof PDFCheckBox) || !field.isChecked()) continue;
      checked++;
      if (appearanceContent(flatDoc, field.getName(), "Yes").includes(" l S")) withX++;
    }
    expect(checked).toBeGreaterThan(60); // sanity: the fixture really ticks boxes
    expect(withX).toBe(checked);

    // Same answer set flattened: the page XObjects must carry one X per
    // checked box (the /Yes streams are registered by flatten verbatim).
    const baked = await generateFilledPdfBytes(spotAnswers(), { template: templateBytes });
    const bakedDoc = await PDFDocument.load(baked, { ignoreEncryption: true });
    const ctx = bakedDoc.context;
    let bakedX = 0;
    for (const page of bakedDoc.getPages()) {
      const xobjects = page.node.Resources()?.lookup(PDFName.of("XObject"), PDFDict);
      if (!xobjects) continue;
      for (const [, ref] of xobjects.entries()) {
        const obj = ctx.lookup(ref);
        if (!(obj instanceof PDFRawStream)) continue;
        const filter = obj.dict.get(PDFName.of("Filter"));
        const text = new TextDecoder().decode(filter ? inflateSync(obj.contents) : obj.contents);
        if (text.includes(" l S")) bakedX++;
      }
    }
    expect(bakedX).toBe(checked);
  });
});

describe("overflow routing (item-03)", () => {
  const MED_LABEL = questions.find((x) => x.id === "medications_list")!.label;

  /** ~40 lines of ~55 chars: far beyond any field's size-6 budget. */
  function oversizedText(tag: string): string {
    const lines: string[] = [];
    for (let i = 0; i < 40; i++) lines.push(`${tag}-${i} ${"z".repeat(40)}`);
    return lines.join("\n");
  }

  it("routes an oversized medication list to the EXTRA MEDICATION box, referenced from the field", async () => {
    const answers = buildCompleteAnswers();
    answers.medications_taken = true; // medication list only applies once Yes
    answers.medications_list = oversizedText("medication");
    const bytes = await generateFilledPdfBytes(answers, {
      template: templateBytes,
      flatten: false,
    });
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = doc.getForm();

    // The original box is emptied and points at page 10.
    expect(form.getTextField("Text Field 113").getText()).toBe("(see page 10)");
    // The medication box receives the full text, prefixed with the question
    // label, with the last line intact after reflow.
    const extra = form.getTextField("Text Field 1047").getText() ?? "";
    expect(extra).toContain(`${MED_LABEL}:`);
    expect(extra).toContain("medication-39");
    // General overflow space is untouched by medication overflow.
    expect(form.getTextField("Text Field 1046").getText() ?? "").toBe("");
  });

  it("routes other oversized answers to the general extra space, never the medication box", async () => {
    const answers = buildCompleteAnswers();
    answers.medical_infections = true; // activates the infection follow-ups
    answers.medical_infections_treatment = oversizedText("infected");
    const bytes = await generateFilledPdfBytes(answers, {
      template: templateBytes,
      flatten: false,
    });
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = doc.getForm();

    const general = form.getTextField("Text Field 1046").getText() ?? "";
    expect(general).toContain("Treatment:");
    expect(general).toContain("infected-39");
    expect(form.getTextField("Text Field 1047").getText() ?? "").toBe("");
  });

  it("leaves both page-10 boxes empty when every answer fits", async () => {
    const answers = buildCompleteAnswers();
    answers.medications_taken = true; // reveal the medication list...
    answers.medications_list = "Test answer"; // ...and give it a short value
    const bytes = await generateFilledPdfBytes(answers, {
      template: templateBytes,
      flatten: false,
    });
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = doc.getForm();
    expect(form.getTextField("Text Field 113").getText()).toBe("Test answer");
    expect(form.getTextField("Text Field 1046").getText() ?? "").toBe("");
    expect(form.getTextField("Text Field 1047").getText() ?? "").toBe("");
  });
});

describe("functional-status total on page 2 (item-04)", () => {
  /**
   * Inflated text of every content stream on a page. Ref drawing happens in
   * the page's stream sequence: widget flattening first (one stream per push
   * batch), then drawComputedValues' drawText — the last stream.
   */
  function inflatedPageContent(doc: PDFDocument, pageIndex: number): string[] {
    const page = doc.getPages()[pageIndex];
    const contents = page.node.Contents();
    if (!contents) return [];
    const entries: unknown[] =
      contents instanceof PDFArray
        ? Array.from({ length: contents.size() }, (_, i) => contents.get(i))
        : [contents];
    const out: string[] = [];
    for (const entry of entries) {
      const stream = entry instanceof PDFRef ? doc.context.lookup(entry) : entry;
      if (!(stream instanceof PDFRawStream)) continue;
      const filter = stream.dict.get(PDFName.of("Filter"));
      out.push(new TextDecoder().decode(filter ? inflateSync(stream.contents) : stream.contents));
    }
    return out;
  }

  it("draws the SARC-F subtotal digit next to the printed Total Score label", async () => {
    const answers = buildCompleteAnswers();
    answers.functional_lift = 2;
    answers.functional_walk = 2;
    answers.functional_transfer = 2;
    answers.functional_stairs = 2;
    answers.functional_falls = 1;
    const expected = String(getSubtotal("functional", answers)); // 9
    // pdf-lib draws StandardFont text as a hex string operator: "9" -> <39>.
    const hex = Buffer.from(expected, "utf8").toString("hex").toUpperCase();

    const bytes = await generateFilledPdfBytes(answers, { template: templateBytes });
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const streams = inflatedPageContent(doc, 1);
    expect(streams.length).toBeGreaterThan(0);
    // The flattened widget draws and drawComputedValues all land in the
    // page's last content stream, with the totals appended after the widgets.
    const hits = streams.filter((s) => s.includes(`<${hex}> Tj`));
    expect(hits).toHaveLength(1);
    expect(streams[streams.length - 1]).toContain(`<${hex}> Tj`);
  });
});

describe("pdfFilename", () => {
  it("slugs the patient name and falls back gracefully", () => {
    expect(
      pdfFilename({ patient_first_name: "Jane", patient_last_name: "Doe" })
    ).toBe("pre-operative-questionnaire-jane-doe.pdf");
    expect(pdfFilename({})).toBe("pre-operative-questionnaire.pdf");
  });
});

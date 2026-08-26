// @vitest-environment node
// Re-parses the generated PDF and asserts field values and flattening —
// the automated half of the design doc's field-map verification pass.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFStream, type PDFPage } from "pdf-lib";
import { generateFilledPdfBytes, pdfFilename } from "../src/logic/pdfGenerator";
import { questions } from "../src/data/questions";
import { fieldMap } from "../src/data/fieldMap";
import { buildCompleteAnswers, spotAnswers } from "./fixtures";

const templateBytes = new Uint8Array(
  readFileSync(fileURLToPath(new URL("../src/data/template.pdf", import.meta.url)))
);

/** Every field name referenced by the map (incl. the meta date fields). */
function allReferencedFieldNames(): string[] {
  const names: string[] = [];
  for (const target of Object.values(fieldMap)) {
    if (typeof target === "string") names.push(target);
    else if ("yes" in target) names.push(target.yes, target.no);
    else if ("options" in target) names.push(...Object.values(target.options));
    else names.push(target.height, target.weight, ...Object.values(target.unit.options));
  }
  return names;
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
    for (const [n, c] of counts) expect(c, `duplicated field ${n}`).toBe(1);
    // Only the two extra-space fields may be unmapped.
    for (const n of actual) {
      expect(
        counts.has(n) || n === "Text Field 1046" || n === "Text Field 1047",
        `unmapped template field ${n}`
      ).toBe(true);
    }
  });

  it("every question id has a fieldMap entry and every entry has a question", () => {
    const questionIds = new Set(questions.map((q) => q.id));
    for (const id of questionIds) expect(fieldMap[id], `no fieldMap entry for ${id}`).toBeTruthy();
    for (const id of Object.keys(fieldMap)) {
      if (id === "meta_date" || id === "meta_signature_date") continue;
      expect(questionIds.has(id), `fieldMap entry without question: ${id}`).toBe(true);
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

    // text
    expect(form.getTextField("Text Field 8").getText()).toContain("Jane Doe");
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

describe("pdfFilename", () => {
  it("slugs the patient name and falls back gracefully", () => {
    expect(pdfFilename({ patient_name: "Jane Doe" })).toBe(
      "pre-operative-questionnaire-jane-doe.pdf"
    );
    expect(pdfFilename({})).toBe("pre-operative-questionnaire.pdf");
  });
});

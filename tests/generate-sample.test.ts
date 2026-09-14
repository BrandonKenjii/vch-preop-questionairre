// @vitest-environment node
// Generates tools/sample-filled.pdf from a realistic answer set — the
// artifact used for the manual visual QA pass against the paper form, and a
// regression test that the generator handles a rich, branched answer set.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateFilledPdfBytes } from "../src/logic/pdfGenerator";
import type { Answers } from "../src/data/questions";
import { spotAnswers } from "./fixtures";

const templateBytes = new Uint8Array(
  readFileSync(fileURLToPath(new URL("../src/data/template.pdf", import.meta.url)))
);

const sample: Answers = {
  ...spotAnswers(),
  // extra Yes-branches to exercise details, overflow-adjacent text, and totals
  anesthesia_family_problem: true,
  anesthesia_family_problem_details: "Mother had malignant hyperthermia",
  functional_falls: 2,
  heart_chest_pain: true,
  heart_chest_pain_triggers: "When climbing stairs",
  heart_valve: true,
  heart_valve_describe: "Mild mitral regurgitation",
  heart_valve_operations: "None",
  neuro_stroke: true,
  neuro_stroke_when: "2016",
  neuro_stroke_deficits: "Mild left arm weakness",
  neuro_stroke_effects: "Occasional numbness",
  // "Other" must stay checked in the types list for the conditional
  // "Other blood thinner" text to remain active (it is written to the PDF
  // only when displayed).
  blood_thinner_types: ["Pradaxa (dabigatran)", "Eliquis (apixaban)", "Other"],
  blood_thinner_other: "Apixaban (as above)",
  medical_diabetes: true,
  medical_diabetes_control: ["Diet", "Insulin"],
  medical_diabetes_hba1c: "7.2%",
  medical_diabetes_complications: false,
  medical_infections: true,
  medical_infections_treatment: "Antibiotics as directed",
  medical_infection_types: ["Recent or current cold, chest infection, or fever", "UTI"],
  medical_infection_respiratory_which: "Chest infection",
  medical_infection_chest_when: "Two weeks ago",
  medical_infection_current_symptoms: "Mild cough",
  medical_infection_complications: false,
  medical_resistant_bacteria: false,
  medical_infection_covid: "Tested negative in March",
  other_living_type: ["Home", "Live Alone"],
  other_indigenous: true,
  other_indigenous_community: "Squamish Nation",
  other_homecare: true,
  other_homecare_type: "Public",
  other_homecare_authority: "Vancouver Coastal Health",
  other_email: "jane.doe@example.com",
  other_next_of_kin_phone: "604-555-9876",
  medications_list:
    "Atorvastatin 20 mg once daily\nAmlodipine 5 mg once daily\nApixaban 5 mg twice daily\nMetformin 500 mg twice daily\nInsulin glargine 10 units at bedtime",
};

describe("sample PDF generation", () => {
  it("produces a valid flattened PDF for the manual QA pass", async () => {
    const bytes = await generateFilledPdfBytes(sample, { template: templateBytes });
    expect(bytes.byteLength).toBeGreaterThan(100_000);

    // Must re-parse cleanly and contain no remaining form fields.
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    expect(doc.getForm().getFields()).toHaveLength(0);
    expect(doc.getPageCount()).toBe(10);

    // Persist for visual QA (tools/sample-filled.pdf).
    const out = fileURLToPath(new URL("../tools/sample-filled.pdf", import.meta.url));
    writeFileSync(out, bytes);
  });
});

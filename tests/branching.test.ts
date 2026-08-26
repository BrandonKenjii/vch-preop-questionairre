import { describe, expect, it } from "vitest";
import { questions } from "../src/data/questions";
import { getVisibleQuestions, isVisible } from "../src/logic/branching";

const q = (id: string) => questions.find((x) => x.id === id)!;

describe("isVisible", () => {
  it("shows questions without showIf", () => {
    expect(isVisible(q("patient_name"), {})).toBe(true);
  });

  it("hides until a yesno parent equals true", () => {
    const detail = q("anesthesia_general_procedure_details");
    expect(isVisible(detail, {})).toBe(false);
    expect(isVisible(detail, { anesthesia_general_procedure: false })).toBe(false);
    expect(isVisible(detail, { anesthesia_general_procedure: true })).toBe(true);
  });

  it("supports notEquals (falls cause shown for any fall count above 0)", () => {
    const cause = q("functional_falls_cause");
    expect(isVisible(cause, {})).toBe(false); // parent unanswered -> hidden
    expect(isVisible(cause, { functional_falls: 0 })).toBe(false);
    expect(isVisible(cause, { functional_falls: 1 })).toBe(true);
    expect(isVisible(cause, { functional_falls: 2 })).toBe(true);
  });

  it("supports equals with an array as membership test on multichoice answers", () => {
    const which = q("medical_infection_respiratory_which");
    const cold = "Recent or current cold, chest infection, or fever";
    expect(isVisible(which, { medical_infection_types: ["UTI"] })).toBe(false);
    expect(isVisible(which, { medical_infection_types: ["UTI", cold] })).toBe(true);
    expect(isVisible(which, {})).toBe(false);
  });

  it("chains nested branching (grandchild hidden until parent answered correctly)", () => {
    const given = q("blood_thinner_instructions_given");
    // child visible only when parent yes, grandchild only when child yes
    expect(isVisible(given, { blood_thinner: true })).toBe(false);
    expect(
      isVisible(given, { blood_thinner: true, blood_thinner_instructions: false })
    ).toBe(false);
    expect(
      isVisible(given, { blood_thinner: true, blood_thinner_instructions: true })
    ).toBe(true);
  });

  it("hides questions whose showIf references an unanswered choice value", () => {
    const lang = q("other_language");
    expect(isVisible(lang, {})).toBe(false); // parent unanswered -> hidden
    expect(isVisible(lang, { other_english: true })).toBe(false);
    expect(isVisible(lang, { other_english: false })).toBe(true);
  });
});

describe("getVisibleQuestions", () => {
  it("returns only questions of the requested section satisfying showIf", () => {
    const visible = getVisibleQuestions("anesthesia", {
      anesthesia_general_procedure: true,
    });
    expect(visible.map((x) => x.id)).toContain("anesthesia_general_procedure_details");
    expect(visible.map((x) => x.id)).not.toContain("anesthesia_personal_problem_details");
    expect(visible.every((x) => x.section === "anesthesia")).toBe(true);
  });
});

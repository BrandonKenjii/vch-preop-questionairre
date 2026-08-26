import { describe, expect, it } from "vitest";
import { sections, type Answers, getQuestion } from "../src/data/questions";
import {
  firstIncompleteSection,
  isAnswered,
  isFormComplete,
  isSectionComplete,
} from "../src/logic/validation";
import { buildCompleteAnswers } from "./fixtures";

const q = (id: string) => getQuestion(id)!;

describe("isAnswered", () => {
  it("treats false, 0, and empty arrays correctly", () => {
    expect(isAnswered(q("anesthesia_personal_problem"), { anesthesia_personal_problem: false })).toBe(true);
    expect(isAnswered(q("functional_lift"), { functional_lift: 0 })).toBe(true);
    expect(isAnswered(q("allergies_types"), { allergies_types: [] })).toBe(false);
    expect(isAnswered(q("patient_name"), {})).toBe(false);
    expect(isAnswered(q("patient_name"), { patient_name: "   " })).toBe(false);
  });

  it("requires height and weight for bmi questions", () => {
    expect(
      isAnswered(q("other_bmi"), { other_bmi: { height: "170", heightUnit: "cm", weight: "", weightUnit: "kg" } })
    ).toBe(false);
    expect(
      isAnswered(q("other_bmi"), { other_bmi: { height: "170", heightUnit: "cm", weight: "72", weightUnit: "kg" } })
    ).toBe(true);
    expect(
      isAnswered(q("other_bmi"), { other_bmi: { height: "", heightUnit: "ftin", feet: "5", inches: "7", weight: "160", weightUnit: "lbs" } })
    ).toBe(true);
  });
});

describe("isSectionComplete", () => {
  it("ignores hidden questions and optional questions", () => {
    // patient section: all four inputs required, explanation only when not the patient
    const answers: Answers = {
      patient_name: "Jane Doe",
      patient_dob: "1980-05-12",
      patient_phn: "9123456789",
      completed_by: "Patient",
    };
    expect(isSectionComplete("patient", answers)).toBe(true);

    const other: Answers = { ...answers, completed_by: "Healthcare provider" };
    expect(isSectionComplete("patient", other)).toBe(false); // explanation now required
  });

  it("blocks when a visible required question is unanswered", () => {
    expect(isSectionComplete("anesthesia", {})).toBe(false);
    const done: Answers = {
      anesthesia_general_procedure: false,
      anesthesia_personal_problem: false,
      anesthesia_family_problem: false,
      anesthesia_hospital_ed_year: false,
    };
    expect(isSectionComplete("anesthesia", done)).toBe(true);
  });
});

describe("form-level gates", () => {
  it("isFormComplete accepts a fully answered form and rejects a partial one", () => {
    expect(isFormComplete({})).toBe(false);
    expect(isFormComplete(buildCompleteAnswers())).toBe(true);
  });

  it("firstIncompleteSection returns the first blocking section", () => {
    expect(firstIncompleteSection({})).toBe(0); // patient
    const answers = buildCompleteAnswers();
    const first = Object.keys(answers)[0];
    delete answers[first];
    expect(firstIncompleteSection(answers)).toBe(0);
    expect(sections.map((s) => s.id)).toHaveLength(14);
  });
});

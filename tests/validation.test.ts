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
    expect(isAnswered(q("patient_last_name"), {})).toBe(false);
    expect(isAnswered(q("patient_last_name"), { patient_last_name: "   " })).toBe(false);
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
    // patient section: last/first name, DOB, the residency question, the PHN
    // (BC resident branch) and completed_by; explanation only when not the patient
    const answers: Answers = {
      patient_last_name: "Doe",
      patient_first_name: "Jane",
      patient_dob: "1980-05-12",
      patient_phn_non_bc: true,
      patient_phn: "9123456789",
      completed_by: "Patient",
    };
    expect(isSectionComplete("patient", answers)).toBe(true);

    const other: Answers = { ...answers, completed_by: "Healthcare provider" };
    expect(isSectionComplete("patient", other)).toBe(false); // explanation now required
  });

  it("requires exactly one identifier: alternate when non-BC, PHN when BC", () => {
    const base: Answers = {
      patient_last_name: "Doe",
      patient_first_name: "Jane",
      patient_dob: "1980-05-12",
      patient_phn_non_bc: false,
      completed_by: "Patient",
    };
    expect(isSectionComplete("patient", base)).toBe(false); // alternate missing
    const done: Answers = {
      ...base,
      patient_phn_alternate: "AB12 34-56",
    };
    expect(isSectionComplete("patient", done)).toBe(true);
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

  it("disabled gray-out follow-ups never block completion", () => {
    const answers = buildCompleteAnswers();
    answers.blood_thinner = false;
    delete answers.blood_thinner_reason;
    delete answers.blood_thinner_types;
    delete answers.blood_thinner_other;
    delete answers.blood_thinner_instructions;
    delete answers.blood_thinner_instructions_given;
    expect(isSectionComplete("blood", answers)).toBe(true);

    const medical = buildCompleteAnswers();
    medical.medical_infections = false;
    for (const id of [
      "medical_infections_treatment",
      "medical_infection_types",
      "medical_infection_other",
      "medical_infection_respiratory_which",
      "medical_infection_chest_when",
      "medical_infection_current_symptoms",
      "medical_infection_complications",
      "medical_resistant_bacteria",
      "medical_infection_covid",
    ]) {
      delete medical[id];
    }
    expect(isSectionComplete("medical", medical)).toBe(true);
  });

  it("visible-but-soft gray-out rows do not block before the anchor is answered", () => {
    const answers = buildCompleteAnswers();
    delete answers.blood_thinner; // unanswered anchor -> soft follow-ups
    delete answers.blood_thinner_reason;
    expect(isSectionComplete("blood", answers)).toBe(false); // anchor itself required
  });

  it("active follow-ups still block until answered", () => {
    const answers = buildCompleteAnswers();
    answers.blood_thinner = true;
    delete answers.blood_thinner_types;
    expect(isSectionComplete("blood", answers)).toBe(false);
    // The whole Yes-chain must be answered before the section completes.
    answers.blood_thinner_reason = "Atrial fibrillation";
    answers.blood_thinner_types = ["Pradaxa (dabigatran)"];
    expect(isSectionComplete("blood", answers)).toBe(false);
    answers.blood_thinner_instructions = true;
    answers.blood_thinner_instructions_given = "Stop 2 days before surgery";
    expect(isSectionComplete("blood", answers)).toBe(true);
  });
});

describe("email confirmation rule", () => {
  it("optional emails are free until typed; a typed email needs a matching confirm", () => {
    const answers = buildCompleteAnswers();
    expect(isSectionComplete("other", answers)).toBe(true);

    answers.other_email = "jane@example.com";
    expect(isSectionComplete("other", answers)).toBe(false); // confirm missing

    answers.other_email_confirm = "jane@example.org";
    expect(isSectionComplete("other", answers)).toBe(false); // mismatch

    answers.other_email_confirm = "jane@example.com";
    expect(isSectionComplete("other", answers)).toBe(true);

    delete answers.other_email;
    expect(isSectionComplete("other", answers)).toBe(true); // cleared -> optional again
  });

  it("also applies to the alternate email", () => {
    const answers = buildCompleteAnswers();
    answers.other_email_alt = "alt@example.com";
    expect(isSectionComplete("other", answers)).toBe(false);
    answers.other_email_alt_confirm = "alt@example.com";
    expect(isSectionComplete("other", answers)).toBe(true);
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

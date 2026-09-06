import { describe, expect, it } from "vitest";
import { questions } from "../src/data/questions";
import {
  displayState,
  getActiveQuestions,
  getVisibleQuestions,
  isVisible,
} from "../src/logic/branching";

const q = (id: string) => questions.find((x) => x.id === id)!;

describe("isVisible", () => {
  it("shows questions without showIf", () => {
    expect(isVisible(q("patient_last_name"), {})).toBe(true);
    expect(isVisible(q("patient_first_name"), {})).toBe(true);
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
    // The respiratory details only apply once the infection anchor is Yes.
    expect(isVisible(which, { medical_infections: true })).toBe(false);
    expect(isVisible(which, { medical_infections: true, medical_infection_types: ["UTI"] })).toBe(
      false
    );
    expect(
      isVisible(which, { medical_infections: true, medical_infection_types: ["UTI", cold] })
    ).toBe(true);
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

  it("gates the PHN inputs behind the non-BC residency radio", () => {
    // Neither identifier shows until the radio is answered.
    expect(isVisible(q("patient_phn"), {})).toBe(false);
    expect(isVisible(q("patient_phn_alternate"), {})).toBe(false);
    // BC resident -> digits-only PHN; non-BC -> unrestricted alternate.
    expect(isVisible(q("patient_phn"), { patient_phn_non_bc: false })).toBe(true);
    expect(isVisible(q("patient_phn_alternate"), { patient_phn_non_bc: false })).toBe(false);
    expect(isVisible(q("patient_phn"), { patient_phn_non_bc: true })).toBe(false);
    expect(isVisible(q("patient_phn_alternate"), { patient_phn_non_bc: true })).toBe(true);
  });
});

describe("displayState (grayed-out follow-ups)", () => {
  it("shows gray-out rows softly (enabled, not required) while the anchor is unanswered", () => {
    expect(displayState(q("blood_thinner_reason"), {})).toBe("soft");
    expect(displayState(q("medical_infections_treatment"), {})).toBe("soft");
  });

  it("activates gray-out rows when the topmost condition is Yes", () => {
    expect(displayState(q("blood_thinner_reason"), { blood_thinner: true })).toBe("active");
    expect(displayState(q("medical_infections_treatment"), { medical_infections: true })).toBe(
      "active"
    );
  });

  it("disables gray-out rows when the topmost condition is No", () => {
    expect(displayState(q("blood_thinner_reason"), { blood_thinner: false })).toBe("disabled");
    expect(displayState(q("medical_infections_treatment"), { medical_infections: false })).toBe(
      "disabled"
    );
  });

  it("a stale subchain cannot resurrect a disabled row", () => {
    const given = q("blood_thinner_instructions_given");
    expect(
      displayState(given, {
        blood_thinner: false,
        blood_thinner_instructions: true,
        blood_thinner_instructions_given: "X",
      })
    ).toBe("disabled");
  });

  it("keeps progressive reveal inside a Yes-anchored gray-out chain", () => {
    const given = q("blood_thinner_instructions_given");
    expect(displayState(given, { blood_thinner: true, blood_thinner_instructions: false })).toBe(
      "hidden"
    );
    expect(displayState(given, { blood_thinner: true, blood_thinner_instructions: true })).toBe(
      "active"
    );
  });

  it("hides grandchildren of a hidden row even when their own condition is stale (allergies)", () => {
    const details = q("allergies_antibiotics_details");
    // Flipping the top-level answer to No must cascade: the detail rows stay
    // hidden even though the stored allergies_types answer still satisfies
    // their membership condition.
    expect(
      displayState(details, {
        allergies_any: false,
        allergies_types: ["Antibiotics"],
        allergies_antibiotics_details: "X",
      })
    ).toBe("hidden");
    expect(
      displayState(q("allergies_types"), { allergies_any: false, allergies_types: ["Antibiotics"] })
    ).toBe("hidden");
    // The consistent case stays active.
    expect(
      displayState(details, {
        allergies_any: true,
        allergies_types: ["Antibiotics"],
        allergies_antibiotics_details: "X",
      })
    ).toBe("active");
  });
});

describe("getVisibleQuestions / getActiveQuestions", () => {
  it("returns only questions of the requested section satisfying showIf", () => {
    const visible = getVisibleQuestions("anesthesia", {
      anesthesia_general_procedure: true,
    });
    expect(visible.map((x) => x.id)).toContain("anesthesia_general_procedure_details");
    expect(visible.map((x) => x.id)).not.toContain("anesthesia_personal_problem_details");
    expect(visible.every((x) => x.section === "anesthesia")).toBe(true);
  });

  it("includes soft and disabled rows as visible but excludes them from active", () => {
    // No answers: the blood-thinner follow-ups are visible-but-optional.
    const visible = getVisibleQuestions("blood", {});
    expect(visible.map((x) => x.id)).toContain("blood_thinner_reason");
    expect(getActiveQuestions("blood", {}).map((x) => x.id)).not.toContain("blood_thinner_reason");

    // Anchor No: still visible (grayed out), still not active.
    const visibleNo = getVisibleQuestions("blood", { blood_thinner: false });
    expect(visibleNo.map((x) => x.id)).toContain("blood_thinner_reason");
    expect(getActiveQuestions("blood", { blood_thinner: false }).map((x) => x.id)).not.toContain(
      "blood_thinner_reason"
    );

    // Anchor Yes: active.
    const active = getActiveQuestions("blood", { blood_thinner: true });
    expect(active.map((x) => x.id)).toContain("blood_thinner_reason");
    expect(active.map((x) => x.id)).not.toContain("blood_thinner_instructions_given"); // grandchild chain broken
  });
});

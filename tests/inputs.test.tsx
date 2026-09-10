// Input restriction tests: questions must render the right input affordance
// (date picker, phone, email, digits-only, numeric bounds) instead of plain
// text boxes.
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { SectionScreen } from "../src/components/SectionScreen";
import { sections, type Answer, type Answers } from "../src/data/questions";

const sectionById = (id: string) => sections.find((s) => s.id === id)!;

function renderSection(id: string, answers: Answers = {}) {
  const onAnswer = vi.fn();
  render(<SectionScreen section={sectionById(id)} answers={answers} onAnswer={onAnswer} />);
  return { onAnswer };
}

/** The <li> question card containing the given label (labels end with "*"). */
function questionCard(label: string): HTMLElement {
  return screen.getByText((content) => content.includes(label)).closest("li") as HTMLElement;
}

/** Stateful harness: answers persist across onAnswer calls, like the Wizard. */
function StatefulSection({ id, initial }: { id: string; initial: Answers }) {
  const [answers, setAnswers] = useState<Answers>(initial);
  const onAnswer = (questionId: string, value: Answer | undefined) =>
    setAnswers((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[questionId];
      else next[questionId] = value;
      return next;
    });
  return <SectionScreen section={sectionById(id)} answers={answers} onAnswer={onAnswer} />;
}

describe("restricted inputs", () => {
  it("renders date of birth as a date picker", () => {
    renderSection("patient");
    expect(screen.getByLabelText("Date of birth (D.O.B)")).toHaveAttribute("type", "date");
  });

  it("restricts the PHN to 10 digits and strips non-digits (BC resident branch)", () => {
    const { onAnswer } = renderSection("patient", { patient_phn_non_bc: true });
    const phn = screen.getByLabelText("Personal Health Number (PHN)");
    expect(phn).toHaveAttribute("inputmode", "numeric");
    expect(phn).toHaveAttribute("maxlength", "10");
    expect(phn).toHaveAttribute("placeholder", "No spaces");

    fireEvent.change(phn, { target: { value: "abc 91-23x" } });
    expect(onAnswer).toHaveBeenCalledWith("patient_phn", "9123");
  });

  it("hides both identifier fields until the residency question is answered", () => {
    renderSection("patient");
    expect(screen.queryByLabelText("Personal Health Number (PHN)")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Alternate health number (non-BC / other format)")
    ).not.toBeInTheDocument();
  });

  it("keeps the alternate health number unrestricted (non-BC branch)", () => {
    const { onAnswer } = renderSection("patient", { patient_phn_non_bc: false });
    const alternate = screen.getByLabelText("Alternate health number (non-BC / other format)");
    expect(alternate).not.toHaveAttribute("inputmode");
    expect(alternate).not.toHaveAttribute("maxlength");

    fireEvent.change(alternate, { target: { value: "AB12 34-56 (QC)" } });
    expect(onAnswer).toHaveBeenCalledWith("patient_phn_alternate", "AB12 34-56 (QC)");
  });

  it("renders phone fields as tel inputs", () => {
    renderSection("other");
    expect(screen.getByLabelText("Daytime telephone number")).toHaveAttribute("type", "tel");
    expect(
      screen.getByLabelText("Who is picking you up from hospital when you are ready to go home? — Phone number")
    ).toHaveAttribute("type", "tel");
    expect(screen.getByLabelText("Cellphone")).toHaveAttribute("type", "tel");
    expect(screen.getByLabelText("Next of Kin telephone number")).toHaveAttribute("type", "tel");
  });

  it("renders email fields as email inputs", () => {
    renderSection("other");
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Alternate Email")).toHaveAttribute("type", "email");
  });

  it("renders drinks per week as a free text box (item 09)", () => {
    const { onAnswer } = renderSection("substance", { substance_alcohol: true });
    const input = screen.getByLabelText("Number of drinks per week");
    expect(input).toHaveAttribute("type", "text");

    // Patients describe their drinking in words — free text must be stored.
    fireEvent.change(input, { target: { value: "only one or two drinks in a year" } });
    expect(onAnswer).toHaveBeenCalledWith(
      "substance_alcohol_drinks",
      "only one or two drinks in a year"
    );
  });

  it("bounds years smoked and keeps year stopped as free text (item 05)", () => {
    renderSection("substance", { substance_nicotine: false, substance_past_smoker: true });
    const years = screen.getByLabelText("How many years did you smoke for?");
    expect(years).toHaveAttribute("type", "number");
    expect(years).toHaveAttribute("min", "0");
    const stopped = screen.getByLabelText("In what year did you stop smoking?");
    expect(stopped).toHaveAttribute("type", "text");
    expect(stopped).not.toHaveAttribute("min");
    expect(stopped).not.toHaveAttribute("max");
  });

  it("renders oxygen litres per minute as a number input", () => {
    renderSection("breathing", { breathing_home_oxygen: true });
    const input = screen.getByLabelText("L/min");
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveAttribute("min", "0");
  });

  it("keeps date pickers for clinical dates but frees the seizure date (item 04C)", () => {
    renderSection("neurological", { neuro_epilepsy: true });
    expect(screen.getByLabelText("Date of last seizure")).toHaveAttribute("type", "text");

    const { onAnswer } = renderSection("medical", {
      medical_cancer: true,
      medical_cancer_chemo: true,
      medical_cancer_radiation: false,
    });
    const dates = screen.getAllByLabelText("Date of last treatment");
    expect(dates).toHaveLength(1);
    expect(dates[0]).toHaveAttribute("type", "date");
    fireEvent.change(dates[0], { target: { value: "2025-03-10" } });
    expect(onAnswer).toHaveBeenCalledWith("medical_cancer_chemo_date", "2025-03-10");
  });

  it("renders the iteration-1.4 neurological rework (item 04)", () => {
    renderSection("neurological", { neuro_dementia: true, neuro_spinal: true });

    // MMSE/MOCA: instruction label, optional (no red asterisk).
    const mmse = screen.getByLabelText(
      "If you have a known MMSE or MOCA Score, type it below; otherwise leave the box blank"
    );
    expect(mmse).toHaveAttribute("type", "text");
    expect(screen.getByText((c) => c.includes("MMSE or MOCA Score"))).not.toHaveTextContent("*");

    // Spine surgery: year(s) as free text instead of a date picker.
    const spine = screen.getByLabelText(
      "If you had Spine Surgery, what year(s) was (were) the surgery(ies) done?"
    );
    expect(spine).toHaveAttribute("type", "text");

    const other = screen.getByLabelText(
      "Any other type of Neurological condition if not mentioned above"
    );
    expect(other).toHaveAttribute("type", "text");
  });
});

describe("grayed-out follow-ups", () => {
  it("renders follow-ups before the anchor is answered: visible, enabled, optional", () => {
    const { onAnswer } = renderSection("blood");
    // Soft rows are usable immediately...
    const reason = screen.getByLabelText("Reason for medication");
    expect(reason).toBeEnabled();
    const pradaxa = screen.getByRole("checkbox", { name: "Pradaxa (dabigatran)" });
    expect(pradaxa).toBeEnabled();
    fireEvent.click(pradaxa);
    expect(onAnswer).toHaveBeenCalledWith("blood_thinner_types", ["Pradaxa (dabigatran)"]);
    // ...but carry no required mark until the anchor is answered.
    expect(within(questionCard("Reason for medication")).queryByText("*")).not.toBeInTheDocument();
    expect(
      within(questionCard("Which blood thinner(s) do you take?")).queryByText("*")
    ).not.toBeInTheDocument();
  });

  it("disables the whole follow-up group once the anchor answers No", () => {
    renderSection("blood", { blood_thinner: false });
    expect(screen.getByLabelText("Reason for medication")).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Eliquis (apixaban)" })).toBeDisabled();
    const instructions = questionCard(
      "Do you have instructions on managing this medication at the time of surgery?"
    );
    expect(within(instructions).getByRole("radio", { name: "Yes" })).toBeDisabled();
    expect(within(instructions).getByRole("radio", { name: "No" })).toBeDisabled();
    // Nothing was entered before the No flip, so nothing needs disclosing.
    expect(screen.queryByText(/Not recorded/)).not.toBeInTheDocument();
  });

  it("discloses that earlier answers in a No-greyed row will not be recorded", () => {
    renderSection("blood", {
      blood_thinner: false,
      blood_thinner_reason: "Atrial fibrillation",
      blood_thinner_types: ["Pradaxa (dabigatran)"],
    });
    // Rows that still hold the patient's earlier entries say the value will
    // not reach the PDF; rows that were never answered say nothing.
    expect(
      within(questionCard("Reason for medication")).getByText(/Not recorded/)
    ).toBeInTheDocument();
    expect(
      within(questionCard("Which blood thinner(s) do you take?")).getByText(/Not recorded/)
    ).toBeInTheDocument();
    expect(
      within(
        questionCard("Do you have instructions on managing this medication at the time of surgery?")
      ).queryByText(/Not recorded/)
    ).not.toBeInTheDocument();
  });

  it("keeps sub-branches hidden until their parent option is picked (infection details)", () => {
    renderSection("medical", {
      medical_infections: true,
      medical_infection_types: ["UTI"],
    });
    expect(screen.queryByLabelText("If yes, which one?")).not.toBeInTheDocument();

    const cold = "Recent or current cold, chest infection, or fever";
    renderSection("medical", {
      medical_infections: true,
      medical_infection_types: [cold],
    });
    expect(screen.getByLabelText("If yes, which one?")).toBeInTheDocument();
  });

  it("grays out the whole infection follow-up group once Infections answers No", () => {
    renderSection("medical", { medical_infections: false });
    // The follow-up list stays on screen (paper form prints it in full) but
    // every control is disabled and no row carries the required mark.
    expect(screen.getByLabelText("Treatment")).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "HIV" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "UTI" })).toBeDisabled();
    const complications = questionCard("Did you have complications from disease or treatment?");
    expect(within(complications).getByRole("radio", { name: "No" })).toBeDisabled();
    expect(within(questionCard("Which infection(s)?")).queryByText("*")).not.toBeInTheDocument();
    expect(
      within(questionCard("Which infection(s)?")).getByText("Which infection(s)?")
    ).toBeInTheDocument();
  });
});

describe("merged living situation", () => {
  it("renders all five options as one question (no separate 'live alone' row)", () => {
    const { onAnswer } = renderSection("other", { other_living_type: ["Live Alone"] });
    const card = questionCard("What is your living situation?");
    const options = within(card).getAllByRole("checkbox");
    expect(options).toHaveLength(5);
    const names = ["Home", "Care Facility", "Homeless", "Live Alone", "Assisted Living"];
    options.forEach((o, i) => expect(o).toHaveAccessibleName(names[i]));
    expect(options[3]).toBeChecked();

    // Toggling another option reports the merged id with the full selection.
    fireEvent.click(options[0]);
    expect(onAnswer).toHaveBeenCalledWith("other_living_type", ["Live Alone", "Home"]);

    // The old split question is gone from the schema.
    expect(
      screen.queryByText((content) =>
        content.includes("Do you live alone or in assisted living?")
      )
    ).not.toBeInTheDocument();
  });
});

describe("yes/no button order", () => {
  it("renders No before Yes to match the paper form's NO/YES columns", () => {
    const { onAnswer } = renderSection("anesthesia");
    const card = questionCard("Have you had any surgical procedure");
    const radios = within(card).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["No", "Yes"]);

    // Selection is untouched by the order swap (name-based helpers stay green).
    fireEvent.click(radios[0]);
    expect(onAnswer).toHaveBeenCalledWith("anesthesia_general_procedure", false);
    fireEvent.click(radios[1]);
    expect(onAnswer).toHaveBeenCalledWith("anesthesia_general_procedure", true);
  });
});

describe("group headings and indented follow-ups (items 06, 10, 14)", () => {
  it("renders bold standalone headings outside the question cards", () => {
    renderSection("heart", {});
    const heading = screen.getByText("Any heart related symptoms at rest or with physical activity:");
    expect(heading).toHaveClass("question-group-label");
    expect(heading.closest("li")).toHaveClass("question-group");
    expect(heading.closest("li")).not.toHaveClass("question-card");

    expect(
      screen.getByText("Any known heart related problems:")
    ).toHaveClass("question-group-label");
    expect(
      screen.getByText("Any one of the following tests in the past 5 years:")
    ).toHaveClass("question-group-label");
    renderSection("pain", {});
    expect(
      screen.getByText("In thinking about your pain, how much do you agree with the following statements?")
    ).toHaveClass("question-group-label");
  });

  it("indents follow-ups revealed by a parent answer but not top-level questions", () => {
    renderSection("anesthesia", { anesthesia_general_procedure: true });
    expect(questionCard("Have you had any surgical procedure")).not.toHaveClass(
      "question-card-indented"
    );
    expect(questionCard("List ALL prior procedures name, where and when.")).toHaveClass(
      "question-card-indented"
    );

    // Gray-out rows print in full on the paper form, so they stay flush.
    renderSection("blood", {});
    expect(questionCard("Which blood thinner(s) do you take?")).not.toHaveClass(
      "question-card-indented"
    );
  });

  it("renders the procedures detail as a multiline box (Return key works, item 03)", () => {
    renderSection("anesthesia", { anesthesia_general_procedure: true });
    const box = screen.getByLabelText("List ALL prior procedures name, where and when.");
    expect(box.tagName).toBe("TEXTAREA");
  });
});

describe("bmi unit label", () => {
  it("shows the active weight unit next to the input and follows the toggle", () => {
    render(
      <StatefulSection
        id="other"
        initial={{
          other_bmi: { height: "170", heightUnit: "cm", weight: "72", weightUnit: "kg" },
        }}
      />
    );
    const unit = () => document.querySelector(".bmi-unit") as HTMLElement;
    expect(unit()).toHaveTextContent("kg");
    expect(screen.getByLabelText("Weight")).toHaveValue("72");

    fireEvent.click(screen.getByRole("radio", { name: "lbs" }));
    expect(unit()).toHaveTextContent("lbs");
    expect(screen.getByLabelText("Weight")).toHaveValue("158.7");

    fireEvent.click(screen.getByRole("radio", { name: "kg" }));
    expect(unit()).toHaveTextContent("kg");
  });
});

describe("email confirmation", () => {
  it("reveals a confirm box once an email is typed (both email fields)", () => {
    render(<StatefulSection id="other" initial={{}} />);
    expect(screen.queryByLabelText("Confirm Email")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Confirm Alternate Email")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "jane@example.com" },
    });
    const confirm = screen.getByLabelText("Confirm Email");
    expect(confirm).toHaveAttribute("type", "email");
    expect(confirm).toHaveValue("");
    // The empty confirm is flagged inline (not as a live alert) so the
    // section gate never fails silently on it.
    expect(
      screen.getByText("Please re-enter your email to confirm.")
    ).toBeInTheDocument();
    expect(confirm).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Alternate Email"), {
      target: { value: "alt@example.com" },
    });
    expect(screen.getByLabelText("Confirm Alternate Email")).toBeInTheDocument();
  });

  it("flags mismatching emails and clears the confirm box with the base email", () => {
    render(<StatefulSection id="other" initial={{ other_email: "jane@example.com" }} />);

    const confirm = screen.getByLabelText("Confirm Email");
    fireEvent.change(confirm, { target: { value: "jane@example.org" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Email addresses do not match.");
    expect(confirm).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(confirm, { target: { value: "jane@example.com" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(confirm).not.toHaveAttribute("aria-invalid");
    expect(
      screen.queryByText("Please re-enter your email to confirm.")
    ).not.toBeInTheDocument();

    // Clearing the base email removes the confirm box entirely.
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "" } });
    expect(screen.queryByLabelText("Confirm Email")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("allergies cascade", () => {
  it("removes every follow-up when No and restores stored answers on Yes", () => {
    render(
      <StatefulSection
        id="allergies"
        initial={{
          allergies_any: true,
          allergies_types: ["Antibiotics"],
          allergies_antibiotics_details: "Penicillin",
        }}
      />
    );
    expect(screen.getByLabelText("Which antibiotic(s) are you allergic to?")).toHaveValue(
      "Penicillin"
    );

    // Top-level No must remove the types card AND the stale grandchild rows.
    const anchor = questionCard("Do you have any allergies?");
    fireEvent.click(within(anchor).getByRole("radio", { name: "No" }));
    expect(
      screen.queryByText((content) => content.includes("What allergies do you have?"))
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Which antibiotic(s) are you allergic to?")).not.toBeInTheDocument();

    // Answers are preserved, so flipping back to Yes restores the whole chain.
    fireEvent.click(within(anchor).getByRole("radio", { name: "Yes" }));
    expect(
      screen.getByText((content) => content.includes("What allergies do you have?"))
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Antibiotics" })).toBeChecked();
    expect(screen.getByLabelText("Which antibiotic(s) are you allergic to?")).toHaveValue(
      "Penicillin"
    );
  });
});

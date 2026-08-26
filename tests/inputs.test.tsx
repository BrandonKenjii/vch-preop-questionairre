// Input restriction tests: questions must render the right input affordance
// (date picker, phone, email, digits-only, numeric bounds) instead of plain
// text boxes.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SectionScreen } from "../src/components/SectionScreen";
import { sections, type Answers } from "../src/data/questions";

const sectionById = (id: string) => sections.find((s) => s.id === id)!;

function renderSection(id: string, answers: Answers = {}) {
  const onAnswer = vi.fn();
  render(<SectionScreen section={sectionById(id)} answers={answers} onAnswer={onAnswer} />);
  return { onAnswer };
}

describe("restricted inputs", () => {
  it("renders date of birth as a date picker", () => {
    renderSection("patient");
    expect(screen.getByLabelText("Date of birth (D.O.B)")).toHaveAttribute("type", "date");
  });

  it("restricts the PHN to 10 digits and strips non-digits", () => {
    const { onAnswer } = renderSection("patient");
    const phn = screen.getByLabelText("Personal Health Number (PHN)");
    expect(phn).toHaveAttribute("inputmode", "numeric");
    expect(phn).toHaveAttribute("maxlength", "10");

    fireEvent.change(phn, { target: { value: "abc 91-23x" } });
    expect(onAnswer).toHaveBeenCalledWith("patient_phn", "9123");
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

  it("renders drinks per week as a number input with a floor of 0", () => {
    const { onAnswer } = renderSection("substance", { substance_alcohol: true });
    const input = screen.getByLabelText("Number of drinks per week");
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveAttribute("min", "0");

    fireEvent.change(input, { target: { value: "-5" } });
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "2.5" } });
    expect(onAnswer).toHaveBeenCalledWith("substance_alcohol_drinks", 2.5);
  });

  it("bounds smoking history fields (years smoked, year stopped)", () => {
    renderSection("substance", { substance_nicotine: false, substance_past_smoker: true });
    const years = screen.getByLabelText("How many years did you smoke for?");
    expect(years).toHaveAttribute("type", "number");
    expect(years).toHaveAttribute("min", "0");
    const stopped = screen.getByLabelText("In what year did you stop smoking?");
    expect(stopped).toHaveAttribute("type", "number");
    expect(stopped).toHaveAttribute("min", "1900");
    expect(stopped).toHaveAttribute("max", String(new Date().getFullYear()));
  });

  it("renders oxygen litres per minute as a number input", () => {
    renderSection("breathing", { breathing_home_oxygen: true });
    const input = screen.getByLabelText("L/min");
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveAttribute("min", "0");
  });

  it("renders clinical dates as date pickers", () => {
    renderSection("neurological", { neuro_epilepsy: true });
    expect(screen.getByLabelText("Date of last seizure")).toHaveAttribute("type", "date");

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
});

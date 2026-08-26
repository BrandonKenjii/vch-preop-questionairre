// Component tests for the wizard flow: per-screen gating, navigation, and
// the final completion gate.
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Wizard } from "../src/components/Wizard";

function fillPatientDetails() {
  fireEvent.change(screen.getByLabelText("Patient Name"), { target: { value: "Jane Doe" } });
  fireEvent.change(screen.getByLabelText("Date of birth (D.O.B)"), {
    target: { value: "1980-05-12" },
  });
  fireEvent.change(screen.getByLabelText("Personal Health Number (PHN)"), {
    target: { value: "9123456789" },
  });
  fireEvent.click(screen.getByRole("radio", { name: "Patient" }));
}

/** The <li> question card containing the given label (labels end with "*"). */
function questionCard(label: string): HTMLElement {
  return screen.getByText((content) => content.includes(label)).closest("li") as HTMLElement;
}

function clickYes(label: string) {
  fireEvent.click(within(questionCard(label)).getByRole("radio", { name: "Yes" }));
}

function clickNo(label: string) {
  fireEvent.click(within(questionCard(label)).getByRole("radio", { name: "No" }));
}

describe("Wizard", () => {
  it("starts on Patient Details with Next disabled until required answers exist", () => {
    render(<Wizard />);
    expect(screen.getByRole("heading", { name: "Patient Details" })).toBeInTheDocument();
    const next = screen.getByRole("button", { name: "Next →" });
    expect(next).toBeDisabled();

    fillPatientDetails();
    expect(next).toBeEnabled();
  });

  it("reveals the explanation question when completed_by is not Patient", () => {
    render(<Wizard />);
    fillPatientDetails();
    fireEvent.click(screen.getByRole("radio", { name: "Healthcare provider" }));
    expect(
      screen.getByText((content) =>
        content.includes("Please explain why this was not completed by the patient")
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next →" })).toBeDisabled();
  });

  it("advances to the next section and Back keeps answers", () => {
    render(<Wizard />);
    fillPatientDetails();
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(screen.getByRole("heading", { name: "1. Anesthesia" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "← Back" }));
    expect(screen.getByRole("heading", { name: "Patient Details" })).toBeInTheDocument();
    expect(screen.getByLabelText("Patient Name")).toHaveValue("Jane Doe");
  });

  it("Complete Survey jumps to the first incomplete section with a hint", () => {
    render(<Wizard />);
    // Jump straight to the last section via its progress chip.
    fireEvent.click(screen.getByTitle("13. Other Information"));
    expect(screen.getByRole("heading", { name: "13. Other Information" })).toBeInTheDocument();

    // Answer the required questions of the last section.
    clickYes("Do you have a support person/healthcare representative?");
    fireEvent.change(screen.getByLabelText(/Name of support person/), {
      target: { value: "John Doe" },
    });
    fireEvent.click(within(questionCard("What is your living situation?")).getByRole("checkbox", { name: "Home" }));
    fireEvent.change(screen.getByLabelText(/picking you up from hospital.*Name/), {
      target: { value: "John Doe" },
    });
    clickNo("Do you have a Living Will / Advance Directive?");
    clickNo("Are you using homecare assistance?");
    clickNo("Indigenous Community/Nation (if you wish to self identify)");
    clickYes("Do you speak conversational English?");
    fireEvent.change(screen.getByLabelText("Height in centimetres"), {
      target: { value: "170" },
    });
    fireEvent.change(screen.getByLabelText("Weight"), { target: { value: "72" } });
    fireEvent.change(screen.getByLabelText("Daytime telephone number"), {
      target: { value: "604-555-1234" },
    });

    // Complete Survey -> the final gate should bounce back to Patient Details.
    fireEvent.click(screen.getByRole("button", { name: "Complete Survey" }));
    expect(screen.getByRole("heading", { name: "Patient Details" })).toBeInTheDocument();
    expect(
      screen.getByText("Please complete the highlighted section below before finishing.")
    ).toBeInTheDocument();
  });
});

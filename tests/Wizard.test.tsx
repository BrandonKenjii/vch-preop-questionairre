// Component tests for the wizard flow: per-screen gating, navigation, and
// the final completion gate.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Wizard } from "../src/components/Wizard";
import { generateFilledPdf, triggerDownload } from "../src/logic/pdfGenerator";

vi.mock("../src/logic/pdfGenerator", () => ({
  generateFilledPdf: vi.fn(async () => new Blob(["%PDF"], { type: "application/pdf" })),
  triggerDownload: vi.fn(),
  pdfFilename: vi.fn(() => "pre-operative-questionnaire-dev.pdf"),
}));

function beginSurvey() {
  fireEvent.click(screen.getByRole("button", { name: "Begin Questionnaire" }));
}

function fillPatientDetails() {
  fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Doe" } });
  fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Jane" } });
  fireEvent.change(screen.getByLabelText("Date of birth (D.O.B)"), {
    target: { value: "1980-05-12" },
  });
  // BC resident -> reveals the digits-only PHN field.
  clickYes("Are you a BC Resident with a BC Personal Health Number (PHN)?");
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
  it("shows the Dear Patient preface first, then begins on Patient Details", () => {
    render(<Wizard />);
    expect(screen.getByRole("heading", { name: "Dear Patient," })).toBeInTheDocument();
    expect(screen.getByText(/one sitting/)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Patient Details" })
    ).not.toBeInTheDocument();

    beginSurvey();
    expect(screen.getByRole("heading", { name: "Patient Details" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dear Patient," })).not.toBeInTheDocument();
  });

  it("keeps Next enabled and bounces to the first missing answer", () => {
    render(<Wizard />);
    beginSurvey();
    expect(screen.getByRole("heading", { name: "Patient Details" })).toBeInTheDocument();
    const next = screen.getByRole("button", { name: "Next →" });
    expect(next).toBeEnabled();

    // Clicking Next with required answers missing stays on the screen and
    // frames the first unanswered question in red with a hint.
    fireEvent.click(next);
    expect(screen.getByRole("heading", { name: "Patient Details" })).toBeInTheDocument();
    expect(
      screen.getByText("Please answer the question highlighted in red below before continuing.")
    ).toBeInTheDocument();
    expect(questionCard("Last Name")).toHaveClass("question-card-highlight");

    // Answering the flagged question clears the frame, and a complete screen
    // lets Next advance.
    fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Doe" } });
    expect(questionCard("Last Name")).not.toHaveClass("question-card-highlight");
    fillPatientDetails();
    fireEvent.click(next);
    expect(screen.getByRole("heading", { name: "1. Anesthesia" })).toBeInTheDocument();
  });

  it("reveals the explanation question when completed_by is not Patient", () => {
    render(<Wizard />);
    beginSurvey();
    fillPatientDetails();
    fireEvent.click(screen.getByRole("radio", { name: "Healthcare provider" }));
    expect(
      screen.getByText((content) =>
        content.includes("Please explain why this was not completed by the patient")
      )
    ).toBeInTheDocument();

    // Next stays enabled; with the explanation unanswered it frames that
    // question in red instead of advancing.
    const next = screen.getByRole("button", { name: "Next →" });
    expect(next).toBeEnabled();
    fireEvent.click(next);
    expect(screen.getByRole("heading", { name: "Patient Details" })).toBeInTheDocument();
    expect(
      questionCard("Please explain why this was not completed by the patient")
    ).toHaveClass("question-card-highlight");
  });

  it("advances to the next section and Back keeps answers", () => {
    render(<Wizard />);
    beginSurvey();
    fillPatientDetails();
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(screen.getByRole("heading", { name: "1. Anesthesia" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "← Back" }));
    expect(screen.getByRole("heading", { name: "Patient Details" })).toBeInTheDocument();
    expect(screen.getByLabelText("Last Name")).toHaveValue("Doe");
    expect(screen.getByLabelText("First Name")).toHaveValue("Jane");
  });

  it("Complete Survey jumps to the first incomplete section with a hint", () => {
    render(<Wizard />);
    beginSurvey();
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

    // Complete Survey -> the final gate should bounce back to Patient Details
    // with the first unanswered required question framed in red.
    fireEvent.click(screen.getByRole("button", { name: "Complete Survey" }));
    expect(screen.getByRole("heading", { name: "Patient Details" })).toBeInTheDocument();
    expect(
      screen.getByText("Please answer the question highlighted in red below before finishing.")
    ).toBeInTheDocument();
    expect(questionCard("Last Name")).toHaveClass("question-card-highlight");

    // Answering the flagged question clears the red frame.
    fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Doe" } });
    expect(questionCard("Last Name")).not.toHaveClass("question-card-highlight");
  });
});

describe("dev toolbar", () => {
  // The pdfGenerator module is mocked once at file level; reset call counts
  // between tests so "called exactly once" assertions stay independent.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("auto-fills the form so every section is complete", () => {
    render(<Wizard />);
    beginSurvey();
    fireEvent.click(screen.getByRole("button", { name: "Auto-fill form" }));

    expect(screen.getByLabelText("Last Name")).toHaveValue("Doe");
    expect(screen.getByLabelText("First Name")).toHaveValue("Jane");
    expect(screen.getByRole("button", { name: "Next →" })).toBeEnabled();

    // The last section must be complete too (auto-fill covers all sections).
    fireEvent.click(screen.getByTitle("13. Other Information"));
    expect(screen.getByRole("heading", { name: "13. Other Information" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete Survey" })).toBeEnabled();
  });

  it("blocks PDF generation until emails match (review page confirms)", async () => {
    render(<Wizard />);
    beginSurvey();
    fireEvent.click(screen.getByRole("button", { name: "Auto-fill form" }));
    fireEvent.click(screen.getByTitle("13. Other Information"));

    // A cleared email is optional again; typing one demands a confirm copy.
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "" } });
    expect(screen.queryByLabelText("Confirm Email")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "jane.doe@example.com" },
    });
    expect(screen.getByLabelText("Confirm Email")).toBeInTheDocument();

    // Mismatched confirm: inline alert + Complete Survey bounces with the
    // incompleteness hint (the button itself is always enabled on the last
    // section; the gate fires on click).
    fireEvent.change(screen.getByLabelText("Confirm Email"), {
      target: { value: "jane@example.com" },
    });
    expect(screen.getByText("Email addresses do not match.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Complete Survey" }));
    expect(
      screen.getByText("Please answer the question highlighted in red below before finishing.")
    ).toBeInTheDocument();
    // The bounce frames the email question (whose confirm copy mismatches).
    const emailCard = document.querySelector('[data-question-id="other_email"]');
    expect(emailCard).not.toBeNull();
    expect(emailCard).toHaveClass("question-card-highlight");

    // Matching confirm clears the gate: Complete Survey now lands on the
    // review page, and the PDF is generated from its confirm button.
    fireEvent.change(screen.getByLabelText("Confirm Email"), {
      target: { value: "jane.doe@example.com" },
    });
    expect(
      screen.queryByText("Email addresses do not match.")
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Complete Survey" }));
    expect(
      screen.getByRole("heading", { name: "Review Page and Confirm" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Generate PDF" }));
    await waitFor(() =>
      expect(screen.getByText("Your questionnaire is ready")).toBeInTheDocument()
    );
    expect(generateFilledPdf).toHaveBeenCalledTimes(1);
  });

  it("auto-fills and generates the PDF in one click", async () => {
    render(<Wizard />);
    beginSurvey();
    fireEvent.click(screen.getByRole("button", { name: "Auto-fill & generate PDF" }));

    await waitFor(() =>
      expect(screen.getByText("Your questionnaire is ready")).toBeInTheDocument()
    );
    expect(generateFilledPdf).toHaveBeenCalledTimes(1);
    expect(triggerDownload).toHaveBeenCalledTimes(1);
  });
});

describe("review page", () => {
  // The pdfGenerator module is mocked once at file level; reset call counts
  // so "called exactly once" assertions stay independent.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Auto-fill every section, jump to the last one, click Complete Survey. */
  function completeSurveyToReview() {
    fireEvent.click(screen.getByRole("button", { name: "Auto-fill form" }));
    fireEvent.click(screen.getByTitle("13. Other Information"));
    fireEvent.click(screen.getByRole("button", { name: "Complete Survey" }));
    expect(
      screen.getByRole("heading", { name: "Review Page and Confirm" })
    ).toBeInTheDocument();
  }

  it("opens the review page scrolled to the top, not mid-page (item 06)", () => {
    render(<Wizard />);
    beginSurvey();
    fireEvent.click(screen.getByRole("button", { name: "Auto-fill form" }));
    fireEvent.click(screen.getByTitle("13. Other Information"));

    const scrollSpy = vi.mocked(window.scrollTo);
    const callsBefore = scrollSpy.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Complete Survey" }));
    expect(
      screen.getByRole("heading", { name: "Review Page and Confirm" })
    ).toBeInTheDocument();

    // Entering the review page must issue its own scroll-to-top.
    expect(scrollSpy.mock.calls.length).toBeGreaterThan(callsBefore);
    const last = scrollSpy.mock.calls[scrollSpy.mock.calls.length - 1];
    expect(last).toEqual([{ top: 0, behavior: "auto" }]);
  });

  it("lists answers grouped by section, including the split name", () => {
    render(<Wizard />);
    beginSurvey();
    completeSurveyToReview();

    expect(
      screen.getByRole("button", { name: "Confirm & Generate PDF" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to survey" })).toBeInTheDocument();

    // Every section is present as a block under its own heading.
    expect(
      screen.getByRole("heading", { name: "13. Other Information" }).closest(".review-section")
    ).not.toBeNull();

    // The item-01 split name renders as its own rows: 'Doe' / 'Jane'.
    const patient = screen
      .getByRole("heading", { name: "Patient Details" })
      .closest(".review-section") as HTMLElement;
    expect(within(patient).getByText("Last Name")).toBeInTheDocument();
    expect(within(patient).getByText("Doe")).toBeInTheDocument();
    expect(within(patient).getByText("First Name")).toBeInTheDocument();
    expect(within(patient).getByText("Jane")).toBeInTheDocument();
    expect(within(patient).getByText("Personal Health Number (PHN)")).toBeInTheDocument();

    // ui-only steering answers (BC residency question) are never printed,
    // so the review page mirrors the PDF writer and leaves them out.
    expect(
      within(patient).queryByText("Are you a BC Resident with a BC Personal Health Number (PHN)?")
    ).not.toBeInTheDocument();

    // Hidden follow-ups (completed_by == Patient) are not listed.
    expect(
      screen.queryByText("Please explain why this was not completed by the patient")
    ).not.toBeInTheDocument();
  });

  it("keeps Yes/No answer labels on one line (nowrap class)", () => {
    render(<Wizard />);
    beginSurvey();
    completeSurveyToReview();

    const yesNo = screen
      .getAllByText(/^(Yes|No)$/)
      .filter((el) => el.classList.contains("review-answer"));
    expect(yesNo.length).toBeGreaterThan(0);
    for (const el of yesNo) expect(el).toHaveClass("review-answer-nowrap");

    // Long free-text answers must keep wrapping normally.
    const meds = screen.getByText(/Atorvastatin 20 mg once daily/);
    expect(meds).toHaveClass("review-answer");
    expect(meds).not.toHaveClass("review-answer-nowrap");
  });

  it("generates the PDF only after Confirm on the review page", async () => {
    render(<Wizard />);
    beginSurvey();
    completeSurveyToReview();

    expect(generateFilledPdf).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Generate PDF" }));
    await waitFor(() =>
      expect(screen.getByText("Your questionnaire is ready")).toBeInTheDocument()
    );
    expect(generateFilledPdf).toHaveBeenCalledTimes(1);
    expect(triggerDownload).toHaveBeenCalledTimes(1);
  });

  it("Back to survey returns to the last section with answers intact", () => {
    render(<Wizard />);
    beginSurvey();
    completeSurveyToReview();

    fireEvent.click(screen.getByRole("button", { name: "Back to survey" }));
    expect(
      screen.getByRole("heading", { name: "13. Other Information" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Review Page and Confirm" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete Survey" })).toBeEnabled();
  });

  it("Edit jumps back to the chosen section with answers retained", () => {
    render(<Wizard />);
    beginSurvey();
    completeSurveyToReview();

    fireEvent.click(screen.getByRole("button", { name: "Edit Patient Details" }));
    expect(screen.getByRole("heading", { name: "Patient Details" })).toBeInTheDocument();
    expect(screen.getByLabelText("Last Name")).toHaveValue("Doe");
    expect(screen.getByLabelText("First Name")).toHaveValue("Jane");
    expect(screen.getByLabelText("Personal Health Number (PHN)")).toHaveValue("9123456789");
    expect(screen.getByRole("button", { name: "Next →" })).toBeEnabled();
  });

  it("offers Return to Review at the bottom of a section reached via Edit (item 12)", () => {
    render(<Wizard />);
    beginSurvey();
    completeSurveyToReview();

    // Not shown during ordinary navigation.
    fireEvent.click(screen.getByRole("button", { name: "Back to survey" }));
    expect(screen.queryByRole("button", { name: "Return to Review" })).not.toBeInTheDocument();

    // Edit opens the section with a one-click way back to the review page.
    fireEvent.click(screen.getByRole("button", { name: "Complete Survey" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Patient Details" }));
    expect(screen.getByRole("button", { name: "Return to Review" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Return to Review" }));
    expect(
      screen.getByRole("heading", { name: "Review Page and Confirm" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Return to Review" })).not.toBeInTheDocument();
  });

  it("ticking a blood thinner auto-selects Prescription of blood thinner? = Yes", () => {
    render(<Wizard />);
    beginSurvey();
    fireEvent.click(screen.getByTitle("6. Blood Problems / Hematological"));

    const anchor = questionCard("Prescription of blood thinner?");
    const yes = within(anchor).getByRole("radio", { name: "Yes" });
    expect(yes).toHaveAttribute("aria-checked", "false");

    fireEvent.click(
      within(questionCard("Which blood thinner(s) do you take?")).getByRole("checkbox", {
        name: "Pradaxa (dabigatran)",
      })
    );

    expect(within(questionCard("Prescription of blood thinner?")).getByRole("radio", { name: "Yes" })).toHaveAttribute("aria-checked", "true");
  });

  it("ticking an infection auto-selects Infections? = Yes", () => {
    render(<Wizard />);
    beginSurvey();
    fireEvent.click(screen.getByTitle("10. Other Medical Problems"));

    const anchor = questionCard("Infections? (tick the box of any that apply)");
    const yes = within(anchor).getByRole("radio", { name: "Yes" });
    expect(yes).toHaveAttribute("aria-checked", "false");

    fireEvent.click(
      within(questionCard("Which infection(s)?")).getByRole("checkbox", { name: "UTI" })
    );

    expect(
      within(questionCard("Infections? (tick the box of any that apply)")).getByRole("radio", {
        name: "Yes",
      })
    ).toHaveAttribute("aria-checked", "true");
  });

  it("switching blood thinner to No clears the follow-ups entered under Yes (item 08A)", () => {
    render(<Wizard />);
    beginSurvey();
    fireEvent.click(screen.getByTitle("6. Blood Problems / Hematological"));

    fireEvent.click(within(questionCard("Prescription of blood thinner?")).getByRole("radio", { name: "Yes" }));
    fireEvent.change(screen.getByLabelText("Reason for medication"), {
      target: { value: "Atrial fibrillation" },
    });
    fireEvent.click(
      within(questionCard("Which blood thinner(s) do you take?")).getByRole("checkbox", {
        name: "Pradaxa (dabigatran)",
      })
    );
    expect(screen.getByLabelText("Reason for medication")).toHaveValue("Atrial fibrillation");

    // Flipping the anchor back to No must blank everything below it.
    fireEvent.click(within(questionCard("Prescription of blood thinner?")).getByRole("radio", { name: "No" }));
    expect(screen.getByLabelText("Reason for medication")).toHaveValue("");
    expect(
      within(questionCard("Which blood thinner(s) do you take?")).getByRole("checkbox", {
        name: "Pradaxa (dabigatran)",
      })
    ).not.toBeChecked();
    expect(screen.queryByText(/Not recorded/)).not.toBeInTheDocument();
  });

  it("switching Infections to No clears the follow-ups entered under Yes (item 11C)", () => {
    render(<Wizard />);
    beginSurvey();
    fireEvent.click(screen.getByTitle("10. Other Medical Problems"));

    fireEvent.click(within(questionCard("Infections? (tick the box of any that apply)")).getByRole("radio", { name: "Yes" }));
    fireEvent.change(screen.getByLabelText("Treatment"), {
      target: { value: "Antibiotics" },
    });
    fireEvent.click(
      within(questionCard("Which infection(s)?")).getByRole("checkbox", { name: "UTI" })
    );
    expect(screen.getByLabelText("Treatment")).toHaveValue("Antibiotics");

    fireEvent.click(within(questionCard("Infections? (tick the box of any that apply)")).getByRole("radio", { name: "No" }));
    expect(screen.getByLabelText("Treatment")).toHaveValue("");
    expect(
      within(questionCard("Which infection(s)?")).getByRole("checkbox", { name: "UTI" })
    ).not.toBeChecked();
    expect(screen.queryByText(/Not recorded/)).not.toBeInTheDocument();
  });
});

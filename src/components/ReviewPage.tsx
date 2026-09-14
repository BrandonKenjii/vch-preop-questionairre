// Review-and-confirm page shown after the last section of the survey: it
// lists every active, answered question grouped by section (schema order,
// mirroring the paper form) so the patient can check the whole questionnaire
// before the PDF is generated. The wizard only opens this page when the form
// is complete; a required answer that is somehow missing is flagged here
// rather than silently dropped. Hidden/grayed-out follow-ups are excluded
// (same displayState rules the PDF writer and validation use), and ui-only
// steering questions (e.g. the non-BC residency radio) are skipped because
// they are never printed — so the review can never contradict the document.
import type { Answer, Answers, BmiAnswer, Question } from "../data/questions";
import { getSectionQuestions, sections } from "../data/questions";
import { uiOnlyQuestionIds } from "../data/fieldMap";
import { displayState } from "../logic/branching";
import { isAnswered } from "../logic/validation";
import { formatHeight } from "../logic/bmi";

interface Props {
  answers: Answers;
  /** Return to the survey (lands on the section the form was completed from). */
  onBack: () => void;
  /** Generate the PDF from the answers as reviewed. */
  onConfirm: () => void;
  /** Jump back to a section (index within `sections`). */
  onEdit: (index: number) => void;
}

/** Human-readable rendering of a stored answer for the review list. */
function formatAnswer(question: Question, value: Answer): string {
  switch (question.type) {
    case "yesno":
      return value === true ? "Yes" : value === false ? "No" : "";
    case "choice":
    case "multichoice": {
      // Stored values are optionValues[i] when present, else the label
      // itself; map back to the label for display.
      const labels = question.options ?? [];
      const storedValues = question.optionValues ?? labels;
      const toLabel = (v: string | number) => {
        const i = storedValues.indexOf(v);
        return i !== -1 && labels[i] !== undefined ? labels[i] : String(v);
      };
      if (Array.isArray(value)) return value.map(toLabel).join(", ");
      if (typeof value === "string" || typeof value === "number") return toLabel(value);
      return "";
    }
    case "bmi": {
      if (!value || typeof value !== "object" || Array.isArray(value)) return "";
      const bmi = value as BmiAnswer;
      return `${formatHeight(bmi)} / ${bmi.weight.trim()} ${bmi.weightUnit}`;
    }
    default:
      if (typeof value === "string" || typeof value === "number") return String(value);
      return "";
  }
}

export function ReviewPage({ answers, onBack, onConfirm, onEdit }: Props) {
  // Defensive: unreachable via the wizard gate (form is complete before this
  // renders), but flag rather than drop an unanswered required question.
  const hasMissing = sections.some((section) =>
    getSectionQuestions(section.id).some(
      (q) => displayState(q, answers) === "active" && q.required && !isAnswered(q, answers)
    )
  );

  return (
    <section className="review" aria-label="Review Page and Confirm">
      <header className="review-header">
        <h2>Review Page and Confirm</h2>
        <p>
          Below is every answer that will be printed into your questionnaire PDF. Use
          Edit to return to a section and change an answer.
        </p>
      </header>

      {hasMissing && (
        <p className="banner banner-warn" role="alert">
          Some required questions are not answered. Use Edit to complete them before
          confirming.
        </p>
      )}

      {sections.map((section, i) => {
        const rows = getSectionQuestions(section.id).filter((q) => {
          // Steering-only questions are never written to the PDF, so listing
          // them here would contradict the header's "printed" claim.
          if (uiOnlyQuestionIds.includes(q.id)) return false;
          if (displayState(q, answers) !== "active") return false;
          // Answered optional questions are listed too; unanswered required
          // questions are listed (and flagged) as a safety net.
          return isAnswered(q, answers) || q.required;
        });
        return (
          <section className="review-section" key={section.id}>
            <header className="review-section-header">
              <h3>{section.title}</h3>
              <button
                type="button"
                className="button button-secondary button-small"
                aria-label={`Edit ${section.title}`}
                onClick={() => onEdit(i)}
              >
                Edit
              </button>
            </header>
            {rows.length === 0 ? (
              <p className="review-empty">No answers in this section.</p>
            ) : (
              <ul className="review-list">
                {rows.map((q) => {
                  const value = answers[q.id];
                  const missing = q.required && !isAnswered(q, answers);
                  // Yes/No labels must never break across lines ("N" over "o").
                  const nowrap = q.type === "yesno" && !missing;
                  return (
                    <li
                      key={q.id}
                      className={`review-item${missing ? " review-item-missing" : ""}`}
                    >
                      <span className="review-question">{q.label}</span>
                      <span className={`review-answer${nowrap ? " review-answer-nowrap" : ""}`}>
                        {missing
                          ? "Not answered"
                          : value === undefined
                            ? ""
                            : formatAnswer(q, value)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      <div className="review-actions">
        <button type="button" className="button button-secondary" onClick={onBack}>
          Back to survey
        </button>
        <button type="button" className="button button-primary" onClick={onConfirm}>
          Confirm &amp; Generate PDF
        </button>
      </div>
    </section>
  );
}

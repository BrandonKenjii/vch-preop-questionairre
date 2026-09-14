// Renders one section's questions and its live subtotals.
//
// Every question card is drawn from its display state (branching.ts): hidden
// rows are skipped, gray-out rows that answered No render grayed out with
// disabled controls, and gray-out rows whose condition is unanswered render
// normally but without the required mark ("soft"). Earlier values kept in a
// No-greyed row are disclosed as not recorded — they never reach the PDF.
import { useEffect, useRef } from "react";
import type { Answer, Answers, Question, Section } from "../data/questions";
import { getSectionQuestions } from "../data/questions";
import { displayState, getVisibleQuestions } from "../logic/branching";
import { getSubtotal } from "../logic/subtotals";
import { isAnswered } from "../logic/validation";
import { BmiCalculator } from "./BmiCalculator";
import { ChoiceQuestion } from "./ChoiceQuestion";
import { NumberQuestion } from "./NumberQuestion";
import { TextQuestion } from "./TextQuestion";
import { YesNoQuestion } from "./YesNoQuestion";

// Matches the reference PDF, which repeats this instruction above every
// numbered section.
const REPEATED_HEADER = "Do you have, or have you ever had, any of the following?";

const GROUP_LABELS: Record<string, string> = {
  functional: "Total Score",
  pcs: "Pain Score",
};

// Printed between the group label and its number, e.g. "Total Score: SARC-F: 5".
const GROUP_VALUE_PREFIX: Record<string, string> = {
  functional: "SARC-F: ",
};

interface Props {
  section: Section;
  answers: Answers;
  onAnswer: (id: string, value: Answer | undefined) => void;
  /** Question id to frame in red after a submit bounce (cleared on answer). */
  highlightId?: string | null;
}

export function SectionScreen({ section, answers, onAnswer, highlightId }: Props) {
  const visible = getVisibleQuestions(section.id, answers);
  const groups = [...new Set(visible.map((q) => q.numberGroup).filter((g): g is string => !!g))];
  const sectionRef = useRef<HTMLElement>(null);

  // Bring the flagged question into view once it is rendered (jsdom has no
  // scrollIntoView, so the call is optional).
  useEffect(() => {
    if (!highlightId) return;
    const el = sectionRef.current?.querySelector(`[data-question-id="${highlightId}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }
  }, [highlightId, section.id]);

  return (
    <section className="section" aria-label={section.title} ref={sectionRef}>
      <header className="section-header">
        <h2>{section.title}</h2>
        {section.id !== "patient" && <p className="section-subtitle">{REPEATED_HEADER}</p>}
      </header>

      <ol className="question-list">
        {getSectionQuestions(section.id).map((q) => {
          const state = displayState(q, answers);
          if (state === "hidden") return null;
          if (q.type === "group") {
            return (
              <li key={q.id} className="question-group">
                <p className="question-group-label">{q.label}</p>
              </li>
            );
          }
          const disabled = state === "disabled";
          const isEmail = q.type === "text" && q.input === "email";
          // Follow-ups revealed by a parent answer are indented so they read
          // as contingent; gray-out rows are always printed in full, so they
          // keep the left margin.
          const indented = q.showIf !== undefined && !q.grayOut;
          return (
            <li
              key={q.id}
              data-question-id={q.id}
              className={`question-card${disabled ? " question-card-disabled" : ""}${
                q.id === highlightId ? " question-card-highlight" : ""
              }${indented ? " question-card-indented" : ""}`}
            >
              <p className="question-label">
                {q.label}
                {state === "active" && q.required && (
                  <span className="required-mark" aria-hidden="true">
                    {" "}
                    *
                  </span>
                )}
              </p>
              {q.hint && <p className="question-hint">{q.hint}</p>}
              <QuestionInput
                type={q.type}
                multiline={q.multiline}
                input={q.input}
                placeholder={q.placeholder}
                min={q.min}
                max={q.max}
                step={q.step}
                value={answers[q.id]}
                onChange={(v) => {
                  onAnswer(q.id, v);
                  // Clearing a typed email also drops its confirm copy
                  // (stored under a derived key, never a schema question).
                  if (isEmail && v === undefined) {
                    onAnswer(`${q.id}_confirm`, undefined);
                  }
                }}
                question={q}
                disabled={disabled}
              />
              {isEmail && (
                <EmailConfirmQuestion
                  question={q}
                  answers={answers}
                  onAnswer={onAnswer}
                  disabled={disabled}
                />
              )}
              {disabled && isAnswered(q, answers) && (
                <p className="row-not-recorded">
                  Not recorded — you answered No, so this answer will not be included in your
                  PDF.
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {groups.map((group) => (
        <div key={group} className="subtotal" aria-live="polite">
          {GROUP_LABELS[group] ?? group}:{" "}
          <strong>
            {GROUP_VALUE_PREFIX[group] ?? ""}
            {getSubtotal(group, answers)}
          </strong>
        </div>
      ))}
    </section>
  );
}

function QuestionInput({
  type,
  multiline,
  input,
  placeholder,
  min,
  max,
  step,
  value,
  onChange,
  question,
  disabled,
}: {
  type: string;
  multiline?: boolean;
  input?: Question["input"];
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  value: Answer | undefined;
  onChange: (value: Answer | undefined) => void;
  question: Question;
  disabled?: boolean;
}) {
  switch (type) {
    case "yesno":
      return (
        <YesNoQuestion
          value={typeof value === "boolean" ? value : undefined}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "number":
      return (
        <NumberQuestion
          label={question.label}
          min={min}
          max={max}
          step={step}
          value={typeof value === "number" ? value : undefined}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "text":
      return (
        <TextQuestion
          label={question.label}
          multiline={multiline}
          input={input}
          placeholder={placeholder}
          value={typeof value === "string" ? value : undefined}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "bmi":
      return <BmiCalculator value={value} onChange={onChange} disabled={disabled} />;
    case "choice":
    case "multichoice":
      return <ChoiceQuestion question={question} value={value} onChange={onChange} disabled={disabled} />;
    default:
      return null;
  }
}

/**
 * Second email box rendered under a typed email: both must match before the
 * section completes (rule in validation.ts). The confirm value lives only
 * under the derived key "<questionId>_confirm" in the Answers map — it is
 * never a schema question, so field mapping, the PDF writer and the
 * auto-fill loops never see it.
 */
function EmailConfirmQuestion({
  question,
  answers,
  onAnswer,
  disabled,
}: {
  question: Question;
  answers: Answers;
  onAnswer: (id: string, value: Answer | undefined) => void;
  disabled: boolean;
}) {
  const base = answers[question.id];
  const baseText = typeof base === "string" ? base : "";
  const confirmId = `${question.id}_confirm`;
  const confirm = answers[confirmId];
  const confirmText = typeof confirm === "string" ? confirm : "";
  // No confirm box until an email is actually typed.
  if (baseText.trim() === "") return null;
  // A typed email requires a matching confirm (validation.ts); an empty
  // confirm is flagged inline instead of silently blocking the section gate.
  const needsConfirm = confirmText.trim() === "";
  const mismatch =
    confirmText.trim() !== "" && confirmText.trim() !== baseText.trim();
  return (
    <div className="email-confirm">
      <TextQuestion
        label={`Confirm ${question.label}`}
        input="email"
        invalid={needsConfirm || mismatch}
        value={confirmText}
        onChange={(v) => onAnswer(confirmId, v)}
        disabled={disabled}
      />
      {needsConfirm && (
        <p className="field-error">Please re-enter your email to confirm.</p>
      )}
      {mismatch && (
        <p role="alert" className="field-error">
          Email addresses do not match.
        </p>
      )}
    </div>
  );
}

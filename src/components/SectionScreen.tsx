// Renders one section's visible questions and its live subtotals.
import type { Answer, Answers, Section } from "../data/questions";
import { getVisibleQuestions } from "../logic/branching";
import { getSubtotal } from "../logic/subtotals";
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

interface Props {
  section: Section;
  answers: Answers;
  onAnswer: (id: string, value: Answer | undefined) => void;
}

export function SectionScreen({ section, answers, onAnswer }: Props) {
  const visible = getVisibleQuestions(section.id, answers);
  const groups = [...new Set(visible.map((q) => q.numberGroup).filter((g): g is string => !!g))];

  return (
    <section className="section" aria-label={section.title}>
      <header className="section-header">
        <h2>{section.title}</h2>
        {section.id !== "patient" && <p className="section-subtitle">{REPEATED_HEADER}</p>}
      </header>

      <ol className="question-list">
        {visible.map((q) => (
          <li key={q.id} className="question-card">
            <p className="question-label">
              {q.label}
              {q.required && <span className="required-mark" aria-hidden="true"> *</span>}
            </p>
            {q.hint && <p className="question-hint">{q.hint}</p>}
            <QuestionInput type={q.type} multiline={q.multiline} value={answers[q.id]} onChange={(v) => onAnswer(q.id, v)} question={q} />
          </li>
        ))}
      </ol>

      {groups.map((group) => (
        <div key={group} className="subtotal" aria-live="polite">
          {GROUP_LABELS[group] ?? group}: <strong>{getSubtotal(group, answers)}</strong>
        </div>
      ))}
    </section>
  );
}

function QuestionInput({
  type,
  multiline,
  value,
  onChange,
  question,
}: {
  type: string;
  multiline?: boolean;
  value: Answer | undefined;
  onChange: (value: Answer | undefined) => void;
  question: Parameters<typeof ChoiceQuestion>[0]["question"];
}) {
  switch (type) {
    case "yesno":
      return <YesNoQuestion value={typeof value === "boolean" ? value : undefined} onChange={onChange} />;
    case "number":
      return <NumberQuestion label={question.label} value={typeof value === "number" ? value : undefined} onChange={onChange} />;
    case "text":
      return <TextQuestion label={question.label} multiline={multiline} value={typeof value === "string" ? value : undefined} onChange={onChange} />;
    case "bmi":
      return <BmiCalculator value={value} onChange={onChange} />;
    case "choice":
    case "multichoice":
      return <ChoiceQuestion question={question} value={value} onChange={onChange} />;
    default:
      return null;
  }
}

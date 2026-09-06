// Single-choice, multi-choice, and numeric scale questions.
// Numeric scales (0/1/2 difficulty, 0-4 agreement, 0-10 pain rating) render
// as a compact row of buttons, matching the PDF's circle-a-number layout.
import type { Answer, Question } from "../data/questions";

interface Props {
  question: Question;
  value: Answer | undefined;
  onChange: (value: Answer | undefined) => void;
  disabled?: boolean;
}

export function ChoiceQuestion({ question, value, onChange, disabled }: Props) {
  const options = question.options ?? [];
  const storedValues = question.optionValues ?? options;
  const isScale = question.type === "choice" && storedValues.every((v) => typeof v === "number");
  const multi = question.type === "multichoice";

  const storedValue = (label: string): string | number => {
    const idx = options.indexOf(label);
    return storedValues[idx] ?? label;
  };

  const isSelected = (label: string): boolean => {
    if (multi) return Array.isArray(value) && value.some((x) => String(x) === label);
    return value === storedValue(label);
  };

  const handleSingle = (label: string) => {
    if (disabled) return;
    const v = storedValue(label);
    onChange(isSelected(label) ? undefined : v);
  };

  const handleMulti = (label: string) => {
    if (disabled) return;
    const current = Array.isArray(value) ? value : [];
    const next = current.includes(label)
      ? current.filter((l) => l !== label)
      : [...current, label];
    onChange(next.length > 0 ? next : undefined);
  };

  if (isScale) {
    return (
      <div className={`scale-row ${options.length > 5 ? "scale-wide" : ""}`} role="radiogroup">
        {options.map((label) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={isSelected(label)}
            className={`scale-button ${isSelected(label) ? "scale-selected" : ""}`}
            onClick={() => handleSingle(label)}
            disabled={disabled}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="choice-list" role={multi ? "group" : "radiogroup"}>
      {options.map((label) => (
        <label key={label} className={`choice-option ${isSelected(label) ? "choice-selected" : ""}`}>
          <input
            type={multi ? "checkbox" : "radio"}
            name={question.id}
            checked={isSelected(label)}
            onChange={() => (multi ? handleMulti(label) : handleSingle(label))}
            disabled={disabled}
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

// Section progress: numbered chips, completed sections checked, current
// highlighted. Chips are clickable — jumping around never loses answers.
import { sections } from "../data/questions";

interface Props {
  currentIndex: number;
  completed: boolean[];
  onJump: (index: number) => void;
}

export function ProgressBar({ currentIndex, completed, onJump }: Props) {
  return (
    <nav className="progress" aria-label="Questionnaire sections">
      {sections.map((section, i) => (
        <button
          key={section.id}
          type="button"
          className={[
            "progress-chip",
            i === currentIndex ? "current" : "",
            completed[i] ? "done" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          title={section.title}
          aria-label={`${section.title}${completed[i] ? " (completed)" : ""}`}
          aria-current={i === currentIndex ? "step" : undefined}
          onClick={() => onJump(i)}
        >
          {completed[i] ? "✓" : i}
        </button>
      ))}
    </nav>
  );
}

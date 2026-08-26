// Yes/No selector. Radio behaviour: picking one answer replaces the other.
interface Props {
  value: boolean | undefined;
  onChange: (value: boolean) => void;
}

export function YesNoQuestion({ value, onChange }: Props) {
  return (
    <div className="yesno" role="radiogroup" aria-label="Yes or No">
      <button
        type="button"
        role="radio"
        aria-checked={value === true}
        className={`yesno-button ${value === true ? "selected-yes" : ""}`}
        onClick={() => onChange(true)}
      >
        Yes
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === false}
        className={`yesno-button ${value === false ? "selected-no" : ""}`}
        onClick={() => onChange(false)}
      >
        No
      </button>
    </div>
  );
}

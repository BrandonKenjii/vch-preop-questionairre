// Yes/No selector. Radio behaviour: picking one answer replaces the other.
interface Props {
  value: boolean | undefined;
  onChange: (value: boolean) => void;
  /** Renders both buttons disabled (grayed-out follow-up rows). */
  disabled?: boolean;
}

export function YesNoQuestion({ value, onChange, disabled }: Props) {
  const pick = (v: boolean) => {
    if (disabled) return;
    onChange(v);
  };
  // No renders before Yes in the DOM (visual, tab and screen-reader order)
  // to mirror the paper form's NO/YES column layout.
  return (
    <div className="yesno" role="radiogroup" aria-label="Yes or No" aria-disabled={disabled}>
      <button
        type="button"
        role="radio"
        aria-checked={value === false}
        className={`yesno-button ${value === false ? "selected-no" : ""}`}
        onClick={() => pick(false)}
        disabled={disabled}
      >
        No
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === true}
        className={`yesno-button ${value === true ? "selected-yes" : ""}`}
        onClick={() => pick(true)}
        disabled={disabled}
      >
        Yes
      </button>
    </div>
  );
}

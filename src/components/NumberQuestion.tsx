// Numeric input with optional bounds; an empty field clears the answer.
interface Props {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
}

export function NumberQuestion({ value, onChange, label, min, max, step }: Props) {
  return (
    <input
      className="number-input"
      type="number"
      inputMode="decimal"
      step={step ?? "any"}
      min={min}
      max={max}
      aria-label={label}
      value={value ?? ""}
      placeholder="0"
      onChange={(e) => {
        const text = e.target.value.trim();
        if (text === "") {
          onChange(undefined);
          return;
        }
        const parsed = parseFloat(text);
        if (!Number.isFinite(parsed)) return;
        if (min !== undefined && parsed < min) return;
        if (max !== undefined && parsed > max) return;
        onChange(parsed);
      }}
    />
  );
}

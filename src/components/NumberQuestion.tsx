// Free numeric input; an empty field clears the answer.
interface Props {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  label: string;
}

export function NumberQuestion({ value, onChange, label }: Props) {
  return (
    <input
      className="number-input"
      type="number"
      inputMode="decimal"
      step="any"
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
        onChange(Number.isFinite(parsed) ? parsed : undefined);
      }}
    />
  );
}

// Free text input; multiline questions render as a textarea.
interface Props {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  label: string;
  multiline?: boolean;
}

export function TextQuestion({ value, onChange, label, multiline }: Props) {
  const commit = (text: string) => onChange(text.trim() === "" ? undefined : text);
  if (multiline) {
    return (
      <textarea
        className="text-input"
        rows={4}
        aria-label={label}
        value={value ?? ""}
        placeholder="Type your answer"
        onChange={(e) => commit(e.target.value)}
      />
    );
  }
  return (
    <input
      className="text-input"
      type="text"
      aria-label={label}
      value={value ?? ""}
      placeholder="Type your answer"
      onChange={(e) => commit(e.target.value)}
    />
  );
}

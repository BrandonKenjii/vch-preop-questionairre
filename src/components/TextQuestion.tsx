// Free text input; multiline questions render as a textarea. Specialized
// kinds render as date pickers, phone, email, or digits-only inputs.
import type { TextInputKind } from "../data/questions";

interface Props {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  label: string;
  multiline?: boolean;
  input?: TextInputKind;
  placeholder?: string;
  disabled?: boolean;
  /** Marks the input as failing validation (email confirm mismatch). */
  invalid?: boolean;
}

export function TextQuestion({
  value,
  onChange,
  label,
  multiline,
  input,
  placeholder,
  disabled,
  invalid,
}: Props) {
  const commit = (text: string) => onChange(text.trim() === "" ? undefined : text);

  if (multiline) {
    return (
      <textarea
        className="text-input"
        rows={4}
        aria-label={label}
        value={value ?? ""}
        placeholder={placeholder ?? "Type your answer"}
        onChange={(e) => commit(e.target.value)}
        disabled={disabled}
      />
    );
  }

  switch (input) {
    case "date":
      return (
        <input
          className="text-input date-input"
          type="date"
          aria-label={label}
          value={value ?? ""}
          onChange={(e) => commit(e.target.value)}
          disabled={disabled}
        />
      );
    case "tel":
      return (
        <input
          className="text-input"
          type="tel"
          inputMode="tel"
          aria-label={label}
          value={value ?? ""}
          placeholder="e.g. 604-555-1234"
          onChange={(e) => commit(e.target.value)}
          disabled={disabled}
        />
      );
    case "email":
      return (
        <input
          className="text-input"
          type="email"
          inputMode="email"
          aria-label={label}
          aria-invalid={invalid ? true : undefined}
          value={value ?? ""}
          placeholder="name@example.com"
          onChange={(e) => commit(e.target.value)}
          disabled={disabled}
        />
      );
    case "digits":
      return (
        <input
          className="text-input digits-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          aria-label={label}
          value={value ?? ""}
          placeholder={placeholder ?? "Numbers only"}
          onChange={(e) => commit(e.target.value.replace(/\D/g, ""))}
          disabled={disabled}
        />
      );
    default:
      return (
        <input
          className="text-input"
          type="text"
          aria-label={label}
          value={value ?? ""}
          placeholder={placeholder ?? "Type your answer"}
          onChange={(e) => commit(e.target.value)}
          disabled={disabled}
        />
      );
  }
}

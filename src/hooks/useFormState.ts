// Central answers state with update/reset. No persistence by design — the
// questionnaire is completed in one sitting and nothing lingers after reset.
import { useCallback, useState } from "react";
import type { Answer, Answers } from "../data/questions";

/**
 * Selecting any option in these follow-up lists implies the anchor question
 * is Yes (the paper form prints the lists in full, so the anchor can still
 * be unanswered when a row is ticked).
 */
const AUTOFILL_YES: Record<string, string> = {
  blood_thinner_types: "blood_thinner",
  medical_infection_types: "medical_infections",
};

export function useFormState() {
  const [answers, setAnswers] = useState<Answers>({});

  const updateAnswer = useCallback((id: string, value: Answer | undefined) => {
    setAnswers((prev) => {
      let next: Answers;
      if (value === undefined) {
        if (!(id in prev)) return prev;
        next = { ...prev };
        delete next[id];
      } else {
        if (prev[id] === value) return prev;
        next = { ...prev, [id]: value };
      }
      const anchorId = AUTOFILL_YES[id];
      if (anchorId && Array.isArray(value) && value.length > 0 && next[anchorId] !== true) {
        next = { ...next, [anchorId]: true };
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => setAnswers({}), []);

  /** Merge a bulk set of answers in (dev auto-fill). */
  const fill = useCallback((values: Answers) => {
    setAnswers((prev) => ({ ...prev, ...values }));
  }, []);

  return { answers, updateAnswer, fill, reset };
}

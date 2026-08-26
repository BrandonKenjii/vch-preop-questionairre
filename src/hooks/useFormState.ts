// Central answers state with update/reset. No persistence by design — the
// questionnaire is completed in one sitting and nothing lingers after reset.
import { useCallback, useState } from "react";
import type { Answer, Answers } from "../data/questions";

export function useFormState() {
  const [answers, setAnswers] = useState<Answers>({});

  const updateAnswer = useCallback((id: string, value: Answer | undefined) => {
    setAnswers((prev) => {
      if (value === undefined) {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      if (prev[id] === value) return prev;
      return { ...prev, [id]: value };
    });
  }, []);

  const reset = useCallback(() => setAnswers({}), []);

  return { answers, updateAnswer, reset };
}

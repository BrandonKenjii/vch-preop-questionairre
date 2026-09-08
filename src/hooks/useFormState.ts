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

/**
 * Answering No to these anchors clears everything entered below them, so the
 * follow-ups can never linger half-filled and confuse the patient (items 8A
 * and 11C).
 */
const RESET_ON_NO: Record<string, string[]> = {
  blood_thinner: [
    "blood_thinner_types",
    "blood_thinner_reason",
    "blood_thinner_other",
    "blood_thinner_instructions",
    "blood_thinner_instructions_given",
  ],
  medical_infections: [
    "medical_infection_types",
    "medical_infections_treatment",
    "medical_infection_other",
    "medical_infection_respiratory_which",
    "medical_infection_chest_when",
    "medical_infection_current_symptoms",
    "medical_infection_complications",
    "medical_resistant_bacteria",
    "medical_infection_covid",
  ],
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
      if (value === false) {
        for (const childId of RESET_ON_NO[id] ?? []) {
          if (childId in next) {
            next = { ...next };
            delete next[childId];
          }
        }
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

// Obligate fill-in validation: per-screen gate and final form gate.
import {
  sections,
  type Answers,
  type BmiAnswer,
  type Question,
} from "../data/questions";
import { getVisibleQuestions } from "./branching";

/** Whether a single question has a usable answer (regardless of required). */
export function isAnswered(question: Question, answers: Answers): boolean {
  const value = answers[question.id];
  if (value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (question.type === "bmi") return isBmiComplete(value);
  return true; // boolean (including false), number (including 0)
}

/** A bmi question is complete when height (in the active unit) and weight are entered. */
export function isBmiComplete(value: unknown): value is BmiAnswer {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const a = value as BmiAnswer;
  const heightOk =
    a.heightUnit === "cm"
      ? a.height.trim() !== ""
      : (a.feet ?? "").trim() !== "" && (a.inches ?? "").trim() !== "";
  return heightOk && a.weight.trim() !== "";
}

/**
 * Per-screen gate: every VISIBLE required question must be answered.
 * Hidden questions (showIf unsatisfied) never block.
 */
export function isSectionComplete(section: string, answers: Answers): boolean {
  return getVisibleQuestions(section, answers)
    .filter((q) => q.required)
    .every((q) => isAnswered(q, answers));
}

/** Final gate: all sections complete (covers edits made via Back navigation). */
export function isFormComplete(answers: Answers): boolean {
  return sections.every((s) => isSectionComplete(s.id, answers));
}

/** Index of the first incomplete section, or -1 when the form is complete. */
export function firstIncompleteSection(answers: Answers): number {
  return sections.findIndex((s) => !isSectionComplete(s.id, answers));
}

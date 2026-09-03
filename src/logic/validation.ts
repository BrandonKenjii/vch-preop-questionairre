// Obligate fill-in validation: per-screen gate and final form gate.
import {
  sections,
  type Answers,
  type BmiAnswer,
  type Question,
} from "../data/questions";
import { getActiveQuestions } from "./branching";

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
 * Per-screen gate: every ACTIVE required question must be answered.
 * Hidden questions (showIf unsatisfied) and soft/disabled gray-out rows
 * (visible by default but only required once their condition applies) never
 * block. Emails additionally require a matching confirm copy (UI-derived
 * "<id>_confirm" key) once an email has actually been typed — optional
 * emails are free until one is entered.
 */
export function isSectionComplete(section: string, answers: Answers): boolean {
  const active = getActiveQuestions(section, answers);
  const requiredOk = active
    .filter((q) => q.required)
    .every((q) => isAnswered(q, answers));
  if (!requiredOk) return false;
  return active
    .filter((q) => q.input === "email")
    .every((q) => {
      const base = answers[q.id];
      if (typeof base !== "string" || base.trim() === "") return true;
      const confirm = answers[`${q.id}_confirm`];
      return typeof confirm === "string" && confirm.trim() === base.trim();
    });
}

/** Final gate: all sections complete (covers edits made via Back navigation). */
export function isFormComplete(answers: Answers): boolean {
  return sections.every((s) => isSectionComplete(s.id, answers));
}

/** Index of the first incomplete section, or -1 when the form is complete. */
export function firstIncompleteSection(answers: Answers): number {
  return sections.findIndex((s) => !isSectionComplete(s.id, answers));
}

/**
 * Id of the first unanswered required question in a section, or null when
 * every required question is answered. A typed email whose confirm copy is
 * missing or mismatched counts as unanswered (returns the base email id, so
 * the highlight lands on the card that holds the confirm input).
 */
export function firstIncompleteQuestion(section: string, answers: Answers): string | null {
  const active = getActiveQuestions(section, answers);
  const required = active.find((q) => q.required && !isAnswered(q, answers));
  if (required) return required.id;
  const email = active.find((q) => {
    if (q.input !== "email") return false;
    const base = answers[q.id];
    if (typeof base !== "string" || base.trim() === "") return false;
    const confirm = answers[`${q.id}_confirm`];
    return !(typeof confirm === "string" && confirm.trim() === base.trim());
  });
  return email ? email.id : null;
}

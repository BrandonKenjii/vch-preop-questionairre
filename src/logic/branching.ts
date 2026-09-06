// Display-state branching: how each question should be treated (shown,
// required, written to the PDF) given the answers so far.
//
// Four states:
//   active   — question is fully applicable: shown, required (if marked), written
//   soft     — shown but NOT required: its grayOut anchor is unanswered
//              (the paper form prints these follow-up lists in full, so they
//              are visible by default and only grayed out once the parent
//              answers No)
//   disabled — shown grayed out and not required: its grayOut anchor answered No
//   hidden   — not rendered at all (progressive reveal, plus the ancestor
//              cascade: once a question is hidden/disabled, everything under
//              it is hidden even if its own condition is still satisfied —
//              this is what removes stale grandchildren, e.g. allergy detail
//              inputs after the top-level answer flips to No)
import { getQuestion, questions, type Answers, type Question } from "../data/questions";

export type DisplayState = "active" | "soft" | "disabled" | "hidden";

/** Depth cap for showIf ancestor walks (defensive; real chains are <= 3). */
const ANCESTOR_DEPTH_CAP = 8;

/**
 * Whether an expected condition matches the actual stored answer.
 * Arrays mean "any of these" — used both for membership tests on
 * multichoice answers (expected: string[]) and for explicit value lists.
 */
function matches(expected: unknown, actual: unknown): boolean {
  if (Array.isArray(expected)) {
    if (Array.isArray(actual)) return expected.some((e) => actual.includes(e));
    return expected.includes(actual);
  }
  if (Array.isArray(actual)) return actual.includes(expected);
  return actual === expected;
}

/** Topmost question of a question's showIf chain (depth-capped). */
function topmostAncestor(question: Question): Question {
  let current: Question = question;
  for (let depth = 0; depth < ANCESTOR_DEPTH_CAP; depth++) {
    const parentId = current.showIf?.questionId;
    if (!parentId) return current;
    const parent = getQuestion(parentId);
    if (!parent) return current;
    current = parent;
  }
  return current;
}

/**
 * Full display state of a question. `isVisible` and validation derive from
 * this so the UI, the completion gates and the PDF writer can never disagree.
 */
export function displayState(question: Question, answers: Answers): DisplayState {
  if (!question.showIf) return "active";

  // Gray-out subtrees: the topmost condition in the chain governs. Unanswered
  // anchor -> visible-but-optional ("soft"); anchor No -> grayed out.
  if (question.grayOut) {
    const anchorAnswer = answers[topmostAncestor(question).id];
    if (anchorAnswer === undefined) return "soft";
    if (anchorAnswer === false) return "disabled";
  }

  // Ancestor cascade: children of hidden/disabled rows are themselves hidden,
  // even when their own condition is still satisfied by a stale stored answer.
  const parentId = question.showIf.questionId;
  const parent = getQuestion(parentId);
  if (parent) {
    const parentState = displayState(parent, answers);
    if (parentState === "hidden" || parentState === "disabled") return "hidden";
  }

  // Own condition (semantics identical to the pre-cascade isVisible body).
  const actual = answers[parentId];
  if (actual === undefined) return "hidden";
  if (question.showIf.notEquals !== undefined) {
    return matches(question.showIf.notEquals, actual) ? "hidden" : "active";
  }
  if (question.showIf.equals !== undefined) {
    return matches(question.showIf.equals, actual) ? "active" : "hidden";
  }
  // Malformed condition: hide rather than show.
  return "hidden";
}

/** Questions rendered on screen: active, soft (optional) and disabled rows. */
export function isVisible(question: Question, answers: Answers): boolean {
  return displayState(question, answers) !== "hidden";
}

/**
 * Questions in a section whose cards are rendered (hidden rows excluded).
 * Soft and disabled rows are included — they are displayed, just not
 * required. Nested branching chains work automatically: a grandchild's
 * showIf points at its immediate parent, and the ancestor cascade excludes
 * it whenever the chain above it breaks.
 */
export function getVisibleQuestions(section: string, answers: Answers): Question[] {
  return questions.filter((q) => q.section === section && isVisible(q, answers));
}

/**
 * Questions in a section that are fully applicable: shown AND required AND
 * written to the PDF. Validation and auto-fill operate on this set only.
 */
export function getActiveQuestions(section: string, answers: Answers): Question[] {
  return questions.filter(
    (q) => q.section === section && displayState(q, answers) === "active"
  );
}

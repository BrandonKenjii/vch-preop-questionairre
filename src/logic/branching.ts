// Visibility branching: which questions are shown given the answers so far.
import { questions, type Answers, type Question, type ShowIf } from "../data/questions";

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

export function isVisible(question: Question, answers: Answers): boolean {
  const showIf: ShowIf | undefined = question.showIf;
  if (!showIf) return true;
  const actual = answers[showIf.questionId];
  // Unanswered parent: the child is not applicable yet — hide it.
  if (actual === undefined) return false;
  if (showIf.notEquals !== undefined) {
    return !matches(showIf.notEquals, actual);
  }
  if (showIf.equals !== undefined) {
    return matches(showIf.equals, actual);
  }
  // Malformed condition: hide rather than show.
  return false;
}

/**
 * Questions in a section whose showIf conditions are satisfied.
 * Nested branching chains work automatically: a grandchild's showIf points
 * at its immediate parent, and the filter excludes it until that parent is
 * both visible and answered correctly.
 */
export function getVisibleQuestions(section: string, answers: Answers): Question[] {
  return questions.filter((q) => q.section === section && isVisible(q, answers));
}

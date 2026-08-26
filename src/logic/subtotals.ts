// Sum logic for the numeric subtotal sections:
//   - "functional": 4 difficulty questions + fall count (each 0-2, max 10)
//   - "pcs": 4 pain-catastrophizing statements (each 0-4, max 16)
import { questions, type Answers } from "../data/questions";

/**
 * Sum of the numeric answers for all questions in a numberGroup.
 * Unanswered or non-numeric answers contribute 0.
 */
export function getSubtotal(group: string, answers: Answers): number {
  return questions
    .filter((q) => q.numberGroup === group)
    .reduce((sum, q) => {
      const value = answers[q.id];
      return sum + (typeof value === "number" && Number.isFinite(value) ? value : 0);
    }, 0);
}

/** All distinct numberGroups defined in the schema, in schema order. */
export function getNumberGroups(): string[] {
  const groups: string[] = [];
  for (const q of questions) {
    if (q.numberGroup && !groups.includes(q.numberGroup)) groups.push(q.numberGroup);
  }
  return groups;
}

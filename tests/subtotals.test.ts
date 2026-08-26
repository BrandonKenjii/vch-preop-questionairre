import { describe, expect, it } from "vitest";
import { getNumberGroups, getSubtotal } from "../src/logic/subtotals";
import type { Answers } from "../src/data/questions";

describe("getSubtotal", () => {
  it("sums the functional status group (0-2 per item, max 10)", () => {
    const answers: Answers = {
      functional_lift: 0,
      functional_walk: 1,
      functional_transfer: 2,
      functional_stairs: 0,
      functional_falls: 2,
    };
    expect(getSubtotal("functional", answers)).toBe(5);
  });

  it("sums the PCS group (0-4 per statement, max 16)", () => {
    const answers: Answers = { pain_pcs1: 4, pain_pcs2: 3, pain_pcs3: 2, pain_pcs4: 4 };
    expect(getSubtotal("pcs", answers)).toBe(13);
  });

  it("ignores unanswered and non-numeric answers", () => {
    const answers: Answers = { functional_lift: 1, functional_walk: "2" };
    expect(getSubtotal("functional", answers)).toBe(1);
    expect(getSubtotal("functional", {})).toBe(0);
  });

  it("lists groups in schema order", () => {
    expect(getNumberGroups()).toEqual(["functional", "pcs"]);
  });
});

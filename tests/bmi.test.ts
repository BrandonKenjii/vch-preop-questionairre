import { describe, expect, it } from "vitest";
import { calculateBmi, cmToM, computeBmi, formatBmi, formatHeight, ftInToM, lbToKg } from "../src/logic/bmi";
import type { BmiAnswer } from "../src/data/questions";

describe("calculateBmi", () => {
  it("computes weight over height squared", () => {
    expect(calculateBmi(72, 1.7)).toBeCloseTo(24.91, 2);
  });

  it("handles zero-height defensively (Infinity is fine; callers validate)", () => {
    expect(calculateBmi(72, 0)).toBe(Infinity);
  });
});

describe("unit conversions", () => {
  it("converts pounds to kilograms", () => {
    expect(lbToKg(160)).toBeCloseTo(72.575, 3);
  });

  it("converts feet/inches and centimetres to metres", () => {
    expect(ftInToM(5, 7)).toBeCloseTo(1.7018, 4);
    expect(cmToM(170)).toBeCloseTo(1.7, 6);
  });
});

describe("computeBmi", () => {
  const metric: BmiAnswer = { height: "170", heightUnit: "cm", weight: "72", weightUnit: "kg" };
  const imperial: BmiAnswer = {
    height: "",
    heightUnit: "ftin",
    feet: "5",
    inches: "7",
    weight: "160",
    weightUnit: "lbs",
  };

  it("normalizes metric input", () => {
    const result = computeBmi(metric)!;
    expect(result.weightKg).toBeCloseTo(72, 6);
    expect(result.heightM).toBeCloseTo(1.7, 6);
    expect(result.bmi).toBeCloseTo(24.91, 2);
  });

  it("normalizes imperial input", () => {
    const result = computeBmi(imperial)!;
    expect(result.weightKg).toBeCloseTo(72.575, 2);
    expect(result.heightM).toBeCloseTo(1.7018, 3);
    expect(result.bmi).toBeCloseTo(25.06, 2);
  });

  it("returns null for missing or invalid values", () => {
    expect(computeBmi(undefined)).toBeNull();
    expect(computeBmi({ height: "", heightUnit: "cm", weight: "72", weightUnit: "kg" })).toBeNull();
    expect(computeBmi({ height: "170", heightUnit: "cm", weight: "", weightUnit: "kg" })).toBeNull();
    expect(computeBmi({ height: "0", heightUnit: "cm", weight: "72", weightUnit: "kg" })).toBeNull();
    expect(
      computeBmi({ height: "", heightUnit: "ftin", feet: "5", inches: "", weight: "160", weightUnit: "lbs" })
    ).toBeNull();
  });
});

describe("formatting", () => {
  it("formats BMI to one decimal", () => {
    expect(formatBmi(24.9123)).toBe("24.9");
  });

  it("formats height for the PDF", () => {
    expect(formatHeight({ height: "170", heightUnit: "cm", weight: "", weightUnit: "kg" })).toBe(
      "170 cm"
    );
    expect(
      formatHeight({ height: "", heightUnit: "ftin", feet: "5", inches: "7", weight: "", weightUnit: "lbs" })
    ).toBe(`5'7"`);
  });
});

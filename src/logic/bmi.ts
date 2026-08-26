// Unit conversion + BMI formula for the height/weight calculator.
import type { BmiAnswer } from "../data/questions";

export const LB_TO_KG = 0.45359237;
export const FT_TO_M = 0.3048;
export const IN_TO_M = 0.0254;
export const CM_TO_M = 0.01;

/** Classic BMI formula: weight in kg over height in metres squared. */
export function calculateBmi(weightKg: number, heightM: number): number {
  return weightKg / (heightM * heightM);
}

export function lbToKg(lb: number): number {
  return lb * LB_TO_KG;
}

export function ftInToM(feet: number, inches: number): number {
  return feet * FT_TO_M + inches * IN_TO_M;
}

export function cmToM(cm: number): number {
  return cm * CM_TO_M;
}

export interface BmiComputation {
  weightKg: number;
  heightM: number;
  bmi: number;
}

/**
 * Normalizes a BmiAnswer to metric and computes BMI.
 * Returns null when the entered values are missing or invalid.
 */
export function computeBmi(answer: BmiAnswer | undefined): BmiComputation | null {
  if (!answer) return null;
  const weight = parseFloat(answer.weight);
  if (!Number.isFinite(weight) || weight <= 0) return null;

  let heightM: number;
  if (answer.heightUnit === "cm") {
    const cm = parseFloat(answer.height);
    if (!Number.isFinite(cm) || cm <= 0) return null;
    heightM = cmToM(cm);
  } else {
    const feet = parseFloat(answer.feet ?? "");
    const inches = parseFloat(answer.inches ?? "");
    if (!Number.isFinite(feet) || !Number.isFinite(inches) || feet <= 0 || inches < 0) {
      return null;
    }
    heightM = ftInToM(feet, inches);
  }
  if (heightM <= 0) return null;

  const weightKg = answer.weightUnit === "kg" ? weight : lbToKg(weight);
  return { weightKg, heightM, bmi: calculateBmi(weightKg, heightM) };
}

/** "22.6" — one decimal place. */
export function formatBmi(bmi: number): string {
  return Number.isFinite(bmi) ? bmi.toFixed(1) : "";
}

/** Height as written into the PDF: "170 cm" or 5'7". */
export function formatHeight(answer: BmiAnswer): string {
  if (answer.heightUnit === "cm") return `${answer.height.trim()} cm`;
  return `${answer.feet ?? ""}'${answer.inches ?? ""}"`;
}

// Height/weight inputs with unit toggles (cm / ft-in, kg / lbs) and a live
// BMI readout. Values are converted when the unit is switched.
import type { Answer, BmiAnswer } from "../data/questions";
import { computeBmi, formatBmi, LB_TO_KG } from "../logic/bmi";

interface Props {
  value: Answer | undefined;
  onChange: (value: Answer | undefined) => void;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function cmToFtIn(cm: number): [string, string] {
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = round1(totalInches - feet * 12);
  return [String(feet), String(inches)];
}

function ftInToCm(feet: string, inches: string): string {
  const f = parseFloat(feet);
  const i = parseFloat(inches);
  if (!Number.isFinite(f) || !Number.isFinite(i)) return "";
  return String(round1(f * 30.48 + i * 2.54));
}

export function BmiCalculator({ value, onChange }: Props) {
  const answer: BmiAnswer = (value as BmiAnswer | undefined) ?? {
    height: "",
    heightUnit: "cm",
    weight: "",
    weightUnit: "kg",
  };
  const bmi = computeBmi(answer);

  const set = (patch: Partial<BmiAnswer>) => onChange({ ...answer, ...patch });

  const setHeightUnit = (unit: "cm" | "ftin") => {
    if (unit === answer.heightUnit) return;
    if (unit === "ftin" && answer.height.trim() !== "") {
      const cm = parseFloat(answer.height);
      if (Number.isFinite(cm) && cm > 0) {
        const [feet, inches] = cmToFtIn(cm);
        set({ heightUnit: unit, height: "", feet, inches });
        return;
      }
    }
    if (unit === "cm" && (answer.feet ?? "").trim() !== "") {
      const cm = ftInToCm(answer.feet ?? "", answer.inches ?? "");
      if (cm !== "") {
        set({ heightUnit: unit, height: cm, feet: "", inches: "" });
        return;
      }
    }
    set({ heightUnit: unit, height: "", feet: "", inches: "" });
  };

  const setWeightUnit = (unit: "kg" | "lbs") => {
    if (unit === answer.weightUnit) return;
    const w = parseFloat(answer.weight);
    if (Number.isFinite(w) && w > 0) {
      const converted = unit === "lbs" ? round1(w / LB_TO_KG) : round1(w * LB_TO_KG);
      set({ weightUnit: unit, weight: String(converted) });
    } else {
      set({ weightUnit: unit });
    }
  };

  return (
    <div className="bmi">
      <div className="bmi-row">
        <span className="bmi-label">Height</span>
        <div className="unit-toggle" role="radiogroup" aria-label="Height unit">
          <button
            type="button"
            role="radio"
            aria-checked={answer.heightUnit === "cm"}
            className={answer.heightUnit === "cm" ? "unit-selected" : ""}
            onClick={() => setHeightUnit("cm")}
          >
            cm
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={answer.heightUnit === "ftin"}
            className={answer.heightUnit === "ftin" ? "unit-selected" : ""}
            onClick={() => setHeightUnit("ftin")}
          >
            ft/in
          </button>
        </div>
        {answer.heightUnit === "cm" ? (
          <input
            className="bmi-input"
            type="text"
            inputMode="decimal"
            aria-label="Height in centimetres"
            placeholder="e.g. 170"
            value={answer.height}
            onChange={(e) => set({ height: e.target.value })}
          />
        ) : (
          <span className="bmi-ftin">
            <input
              className="bmi-input bmi-ft"
              type="text"
              inputMode="numeric"
              aria-label="Height in feet"
              placeholder="5"
              value={answer.feet ?? ""}
              onChange={(e) => set({ feet: e.target.value })}
            />
            <span className="bmi-sep">ft</span>
            <input
              className="bmi-input bmi-in"
              type="text"
              inputMode="decimal"
              aria-label="Height in inches"
              placeholder="7"
              value={answer.inches ?? ""}
              onChange={(e) => set({ inches: e.target.value })}
            />
            <span className="bmi-sep">in</span>
          </span>
        )}
      </div>

      <div className="bmi-row">
        <span className="bmi-label">Weight</span>
        <div className="unit-toggle" role="radiogroup" aria-label="Weight unit">
          <button
            type="button"
            role="radio"
            aria-checked={answer.weightUnit === "kg"}
            className={answer.weightUnit === "kg" ? "unit-selected" : ""}
            onClick={() => setWeightUnit("kg")}
          >
            kg
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={answer.weightUnit === "lbs"}
            className={answer.weightUnit === "lbs" ? "unit-selected" : ""}
            onClick={() => setWeightUnit("lbs")}
          >
            lbs
          </button>
        </div>
        <input
          className="bmi-input"
          type="text"
          inputMode="decimal"
          aria-label="Weight"
          placeholder={answer.weightUnit === "kg" ? "e.g. 72" : "e.g. 160"}
          value={answer.weight}
          onChange={(e) => set({ weight: e.target.value })}
        />
      </div>

      <div className="bmi-result" aria-live="polite">
        {bmi ? (
          <>
            BMI: <strong>{formatBmi(bmi.bmi)}</strong>
          </>
        ) : (
          <>Enter your height and weight to see your BMI.</>
        )}
      </div>
    </div>
  );
}

// Fills the cleaned reference template (src/data/template.pdf) with the
// patient's answers via fieldMap, flattens the form, and returns the PDF
// bytes. Runs entirely client-side.
//
// pdf-lib is lazy-loaded: it is only needed when the survey is completed,
// keeping the initial page load small.
import type {
  PDFDocument,
  PDFCheckBox,
  PDFTextField,
  PDFName,
  PDFString,
  StandardFonts,
  PDFFont,
  PDFForm,
} from "pdf-lib";
import templateUrl from "../data/template.pdf";
import { questions, type Answers, type BmiAnswer, getQuestion } from "../data/questions";
import { fieldMap } from "../data/fieldMap";
import { computeBmi, formatBmi, formatHeight } from "./bmi";
import { getSubtotal } from "./subtotals";

type PdfLib = {
  PDFDocument: typeof PDFDocument;
  PDFCheckBox: typeof PDFCheckBox;
  PDFTextField: typeof PDFTextField;
  PDFName: typeof PDFName;
  PDFString: typeof PDFString;
  StandardFonts: typeof StandardFonts;
};

let libPromise: Promise<PdfLib> | null = null;
function getPdfLib(): Promise<PdfLib> {
  libPromise ??= import("pdf-lib").then((m) => ({
    PDFDocument: m.PDFDocument,
    PDFCheckBox: m.PDFCheckBox,
    PDFTextField: m.PDFTextField,
    PDFName: m.PDFName,
    PDFString: m.PDFString,
    StandardFonts: m.StandardFonts,
  }));
  return libPromise;
}

// Auto-filled metadata (never patient input).
const DATE_FIELD_HEADER = "Text Field 6"; // "DATE:" header
const DATE_FIELD_SIGNATURE = "Text Field 1045"; // signature date

// Page 10 "extra space" fields (see design doc section 12, overflow handling).
const EXTRA_SPACE_GENERAL = "Text Field 1046";
const EXTRA_SPACE_MEDICATIONS = "Text Field 1047";

const START_SIZE = 9;
const MIN_SIZE = 6;

export interface PdfOptions {
  /** Template bytes; when omitted the bundled template is fetched (browser). */
  template?: Uint8Array | ArrayBuffer;
  /** Flatten the form so values are baked in and not editable. Default true. */
  flatten?: boolean;
}

function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

async function loadTemplate(template?: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  if (template) {
    return template instanceof Uint8Array ? template : new Uint8Array(template);
  }
  const res = await fetch(templateUrl);
  return new Uint8Array(await res.arrayBuffer());
}

/** Greedy word-wrap with width measurement; long words are hard-broken. */
function wrapToWidth(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    if (rawLine === "") {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of rawLine.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      let rest = word;
      while (rest.length > 1 && font.widthOfTextAtSize(rest, size) > maxWidth) {
        let cut = rest.length;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      current = rest;
    }
    if (current) lines.push(current);
  }
  return lines;
}

/**
 * Wrap and shrink text until it fits the field's rectangle (down to
 * MIN_SIZE). Returns null when it cannot fit, signalling overflow to the
 * extra-space page.
 */
function fitText(
  text: string,
  rect: { width: number; height: number },
  font: PDFFont
): { text: string; size: number } | null {
  const maxWidth = Math.max(rect.width - 4, 10);
  for (let size = START_SIZE; size >= MIN_SIZE; size -= 0.5) {
    const lines = wrapToWidth(text, font, size, maxWidth);
    const needed = lines.length * size * 1.15;
    if (needed <= Math.max(rect.height - 1, size)) {
      return { text: lines.join("\n"), size };
    }
  }
  return null;
}

/** Set a text field's value at a specific font size via its /DA entry. */
function setTextAtSize(
  lib: PdfLib,
  field: PDFTextField,
  text: string,
  font: PDFFont,
  size: number
): void {
  field.defaultUpdateAppearances(font);
  field.acroField
    .getWidgets()[0]
    .dict.set(lib.PDFName.of("DA"), lib.PDFString.of(`/Helv ${size} Tf 0 g`));
  field.setText(text);
}

function rectOf(field: PDFTextField): { width: number; height: number } {
  return field.acroField.getWidgets()[0].getRectangle();
}

interface OverflowEntry {
  label: string;
  text: string;
  medications: boolean;
}

/** Map a stored answer back to its option labels (handles numeric scales). */
function chosenLabels(questionId: string, value: unknown): string[] {
  const q = getQuestion(questionId);
  const options = q?.options ?? [];
  const values = q?.optionValues ?? options;
  const arr = Array.isArray(value) ? value : [value];
  return arr.map((v) => {
    const idx = values.indexOf(v);
    return idx >= 0 ? options[idx] : String(v);
  });
}

function applyAnswer(
  lib: PdfLib,
  form: PDFForm,
  questionId: string,
  value: unknown,
  font: PDFFont,
  overflow: OverflowEntry[]
): void {
  const target = fieldMap[questionId];
  if (!target || value === undefined) return;
  const label = getQuestion(questionId)?.label ?? questionId;

  if (typeof target === "string") {
    const field = form.getFieldMaybe(target);
    if (!field) return;
    if (field instanceof lib.PDFCheckBox) {
      if (value) form.getCheckBox(target).check();
      else form.getCheckBox(target).uncheck();
    } else if (field instanceof lib.PDFTextField) {
      const text = String(value).trim();
      if (text === "") return;
      const fitted = fitText(text, rectOf(field), font);
      if (fitted) {
        setTextAtSize(lib, field, fitted.text, font, fitted.size);
      } else {
        setTextAtSize(lib, field, "(see page 10)", font, 8);
        overflow.push({ label, text, medications: questionId === "medications_list" });
      }
    }
    return;
  }

  if ("yes" in target) {
    const yes = form.getCheckBox(target.yes);
    const no = form.getCheckBox(target.no);
    if (value === true) {
      yes.check();
      no.uncheck();
    } else if (value === false) {
      no.check();
      yes.uncheck();
    }
    return;
  }

  if ("options" in target) {
    const chosen = chosenLabels(questionId, value);
    for (const [optionLabel, fieldName] of Object.entries(target.options)) {
      const box = form.getCheckBox(fieldName);
      if (chosen.includes(optionLabel)) box.check();
      else box.uncheck();
    }
    return;
  }

  // BmiTarget
  const answer = value as BmiAnswer;
  if (answer.height && answer.height.trim() !== "") {
    const hField = form.getTextField(target.height);
    const fitted = fitText(formatHeight(answer), rectOf(hField), font);
    if (fitted) setTextAtSize(lib, hField, fitted.text, font, fitted.size);
  }
  if (answer.weight && answer.weight.trim() !== "") {
    const wField = form.getTextField(target.weight);
    const fitted = fitText(String(answer.weight).trim(), rectOf(wField), font);
    if (fitted) setTextAtSize(lib, wField, fitted.text, font, fitted.size);
  }
  for (const [unitLabel, fieldName] of Object.entries(target.unit.options)) {
    const box = form.getCheckBox(fieldName);
    if (answer.weightUnit === unitLabel) box.check();
    else box.uncheck();
  }
}

/** Write overflow text onto page 10, referenced by question label. */
function applyOverflow(
  lib: PdfLib,
  form: PDFForm,
  overflow: OverflowEntry[],
  font: PDFFont
): void {
  if (overflow.length === 0) return;
  const general: string[] = [];
  const medications: string[] = [];
  for (const entry of overflow) {
    (entry.medications ? medications : general).push(`${entry.label}:\n${entry.text}`);
  }
  const write = (fieldName: string, entries: string[]) => {
    const field = form.getTextField(fieldName);
    const body = entries.join("\n\n");
    const fitted = fitText(body, rectOf(field), font) ?? {
      text: wrapToWidth(body, font, MIN_SIZE, rectOf(field).width - 4).join("\n"),
      size: MIN_SIZE,
    };
    setTextAtSize(lib, field, fitted.text, font, fitted.size);
  };
  if (general.length) write(EXTRA_SPACE_GENERAL, general);
  if (medications.length) write(EXTRA_SPACE_MEDICATIONS, medications);
}

/**
 * The reference PDF prints "Total Score" labels for the functional-status
 * and PCS sections (and a "BMI" label) but has no fillable fields there, so
 * the computed values are drawn as text next to the labels after flattening.
 */
function drawComputedValues(pdfDoc: PDFDocument, answers: Answers, font: PDFFont): void {
  const pages = pdfDoc.getPages();
  const functionalTotal = getSubtotal("functional", answers);
  pages[1].drawText(String(functionalTotal), { x: 536, y: 594, size: 10, font });
  const pcsTotal = getSubtotal("pcs", answers);
  pages[5].drawText(String(pcsTotal), { x: 536, y: 47, size: 10, font });
  const bmi = computeBmi(answers.other_bmi as BmiAnswer | undefined);
  if (bmi) {
    pages[8].drawText(formatBmi(bmi.bmi), { x: 534, y: 181, size: 10, font });
  }
}

export async function generateFilledPdfBytes(
  answers: Answers,
  options: PdfOptions = {}
): Promise<Uint8Array> {
  const lib = await getPdfLib();
  const template = await loadTemplate(options.template);
  const pdfDoc = await lib.PDFDocument.load(template, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const font = await pdfDoc.embedFont(lib.StandardFonts.Helvetica);

  const overflow: OverflowEntry[] = [];
  for (const q of questions) {
    applyAnswer(lib, form, q.id, answers[q.id], font, overflow);
  }

  // Auto-filled dates.
  const today = todayIso();
  setTextAtSize(lib, form.getTextField(DATE_FIELD_HEADER), today, font, 9);
  setTextAtSize(lib, form.getTextField(DATE_FIELD_SIGNATURE), today, font, 9);

  applyOverflow(lib, form, overflow, font);

  if (options.flatten !== false) {
    form.flatten(); // bake values in; prevents further editing after download
  }
  drawComputedValues(pdfDoc, answers, font);

  return pdfDoc.save();
}

/** Browser-friendly: returns the completed PDF as a Blob for download. */
export async function generateFilledPdf(answers: Answers, options: PdfOptions = {}): Promise<Blob> {
  const bytes = await generateFilledPdfBytes(answers, options);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: "application/pdf" });
}

/** Plain download via a temporary anchor element — no server involved. */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function pdfFilename(answers: Answers): string {
  const name = typeof answers.patient_name === "string" ? answers.patient_name.trim() : "";
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `pre-operative-questionnaire-${slug}.pdf` : "pre-operative-questionnaire.pdf";
}

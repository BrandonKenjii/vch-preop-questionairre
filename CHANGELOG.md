# Changelog

## Iteration 1.3: September 2026

### Added
- Standalone bold group headings above related yes/no rows (heart symptoms, heart problems, heart tests, special blood requirements, chronic pain statements).
- Follow-up questions revealed by a parent answer are indented so they read as contingent.
- "Are you on dialysis?" gate before the dialysis route/schedule box; kidney cause question replaces "Other".
- "Return to Review" box at the bottom of a section reached via the review page's Edit button.
- Weight unit (kg/lbs) is circled on the printed form instead of crossing the kg/lbs checkbox.
- Multiline prior-procedures box (one line per procedure) with overflow to page 10.

### Changed
- Residency question reworked: "Are you a BC Resident with a BC PHN?" — Yes reveals the PHN box (placeholder "No spaces", hint adds "(No Spaces)"), No reveals the alternate identifier box.
- "List ALL prior procedures name, where and when." wording.
- Functional Status: "how many times?" only appears for "More than once a week"; minutes appear for either answer.
- Sleep apnea follow-up reworded; "Tried CPAP but not using regularly?" appears beside the CPAP question and is optional.
- Heart valve follow-ups: "Please describe your valve issue." remains required; "Please provide details of any previous operations." is now optional.
- Cardiologist question moved to the bottom of the heart tests group.
- Tracheostomy and ventilatory support questions only appear after a Yes to spinal cord injury.
- Blood thinners: reason box moved below the medication list; switching to No clears everything entered under Yes.
- Infections: treatment box moved below the infection list; switching to No clears everything entered under Yes.
- "Number of drinks per week" is a free-text box (patients describe drinking in words).
- Last known HbA1C is no longer required.

### Fixed
- Next button always lands on the top of the next section.
- Height (with cm or ft/in units) and weight (with unit) now written into the PDF.
- Yes/No answer reversal no longer leaves stale grayed-out entries visible.

## Iteration 1.2: September 2026

### Added
- Dear Patient preface shown before the questionnaire.
- Patient label (Last, First / DOB / PHN) printed over the PCIS LABEL corner of every PDF page; falls back to the alternate identifier when there is no BC PHN.
- Review & Confirm page listing all answers grouped by section, with per-section edit jumps.
- Overflowing answers route to the PDF's extra space (page 10) with a reference in the original field; medication overflow goes to EXTRA MEDICATION.
- Functional Status SARC-F total drawn into the PDF total-score box.
- Email input reveals a Confirm Email box; both must match.
- PDF audit/debug tooling under `tools/`.
- Height/weight units written into the PDF: height as `170 cm` or `5'8"`, weight as `72 kg` / `160 lbs`, with the kg/lbs box crossed per selection.

### Changed
- Patient name split into Last/First; PDF composed as `Last, First`.
- PHN restricted to digits, with a non-BC radio revealing an unrestricted alternate field.
- Yes/No buttons swapped (No first) to match the paper form's NO/YES.
- Blood-thinner and infection follow-ups visible by default, grayed out when No; values entered before a No flip are marked not recorded.
- Allergies: switching Yes to No hides every follow-up input.
- Living situation merged into one question with all 5 options.
- BMI calculator shows the active unit beside the weight input.
- PDF yes/no checkboxes render X marks instead of check glyphs.
- Inputs restricted by type (date, tel, email, digits, numeric bounds).
- Progress chips numbered from 0 to match section labels.

### Fixed
- Next button functionality.
- Submitting with unanswered required questions jumps to the specific question and frames it in red.
- Auto-selects the parent Yes when a blood thinner or infection type is ticked.
- ft/in height now written to the PDF (was skipped because `height` is empty for ft/in answers).

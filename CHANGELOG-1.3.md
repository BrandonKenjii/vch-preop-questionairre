# Changelog

## Iteration 1.3: September 2026

### Added
- Standalone bold group headings above related yes/no rows (heart symptoms, heart problems, heart tests, special blood requirements, chronic pain statements).
- Follow-up questions revealed by a parent answer are indented so they read as contingent.
- "Are you on dialysis?" question before the dialysis route/schedule box; "What is the cause of your kidney disease?" replaces the "Other" box.
- "Return to Review" box at the bottom of a section reached via the Review page's Edit button.
- Weight unit (kg or lbs) circled on the printed form, matching the form's "please circle" instruction.
- Prior procedures box accepts one procedure per line (Return key); overflow goes to page 10 extra space.
- PHN placeholder reads "No spaces"; helper text now includes "(No Spaces)".

### Changed
- BC residency reworked: "Are you a BC Resident with a BC PHN?" — Yes reveals the PHN box, No reveals the alternate identifier box.
- Anesthesia prior procedures reworded to "List ALL prior procedures name, where and when."
- Functional Status: "how many times?" appears only for "More than once a week"; minutes appear for either answer.
- Sleep apnea follow-up reworded to "Date of Diagnosis and where testing was done"; "Tried CPAP but not using regularly?" appears beside the CPAP question and is optional.
- Heart valve follow-ups: "Please describe your valve issue." remains required; "Please provide details of any previous operations." is now optional.
- "Followed by a Cardiologist" moved to the bottom of the heart tests group.
- Tracheostomy and ventilatory support questions only appear after Yes to spinal cord injury.
- Blood thinners: "Reason for medication" moved below the medication list.
- Infections: "Treatment" moved below the infection list.
- "Number of drinks per week" is now a free-text box.
- "Last known HbA1C" is no longer required.

### Fixed
- Next button always lands on the top of the next section.
- Switching blood thinner or Infections back to No clears the boxes entered under Yes.
- Height (with cm or ft/in units) and weight (with units) now written into the PDF; weight unit circled instead of crossed with an X.
- Smartphone compatible: responsive layout adapts to small screens.

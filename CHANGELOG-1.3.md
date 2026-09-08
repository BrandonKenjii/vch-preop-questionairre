# Pre-Operative Patient Questionnaire — Update 1.3

**September 2026**

Thank you for the detailed feedback on the questionnaire. All of your requested edits have been completed and tested. The changes are listed below, numbered to match your email.

---

## Survey Changes

### 1) Next Button Transition
The survey now always opens each new page at the top. Previously, after clicking "Next" on a longer page, the following page could sometimes appear halfway down — this has been fixed.

### 2) BC Residents (Section 1)
The BC residency question has been reworked:
- Single question: **"Are you a BC Resident with a BC PHN?"** — No or Yes
- **Yes** → the Personal Health Number (PHN) box appears
- **No** → a box for an alternate health number appears
- The PHN box now shows "No spaces" as a placeholder before typing, and the helper text now reads **"Found on your BC Services Card or CareCard (No Spaces)"**

### 3) Anesthesia — Prior Procedures
- The follow-up box now reads **"List ALL prior procedures name, where and when."**
- The box is now multiline — pressing **Enter/Return starts a new line**, so each procedure can be listed separately (like the Medications box).
- If the list is too long for the box on the PDF, it automatically overflows to **Page 10 – Extra Space if Required**.

### 4) Functional Status (Section 2)
- "Within that week, on average how many times?" now only appears when the patient answers **"More than once a week"**.
- "On average how many minutes each time?" appears for either answer, as requested.

### 5) Breathing / Respiratory (Section 3)
- The sleep apnea follow-up now reads **"If yes: Date of Diagnosis and where testing was done"**.
- **"Tried CPAP but not using regularly?"** now appears at the same time as the "Do you use a CPAP machine?" question, and is no longer a required (asterisked) answer.

### 6) Heart / Cardiovascular (Section 4)
- **"Any heart related symptoms at rest or with physical activity:"** now appears as a bold heading above the boxes, with the shorter items below (Chest pain, pressure, discomfort / Shortness of breath / Palpitations / Fainting or blackout).
- **"Any known heart related problems:"** now appears as a bold heading above its boxes (Heart murmur / Angina, heart attack, heart surgery, angioplasty, or stent / Heart valve problem / Weak heart / Pacemaker or defibrillator).
- The valve follow-ups are now: **"Please describe your valve issue."** (required, marked with a red asterisk) followed by **"Please provide details of any previous operations."** (optional — patients without prior interventions can leave it blank).
- **"Any one of the following tests in the past 5 years:"** now appears as a bold heading, and **"Followed by a Cardiologist"** has been moved to the bottom of the list.

### 7) Neurological (Section 5)
"Tracheostomy?" and "Ventilatory supports such as CPAP, BIPAP, or Home Ventilator?" now only appear when **"Spinal cord injury?" is answered Yes**.

### 8) Blood Problems / Hematological (Section 6)
- If a patient fills in the blood thinner details and then changes the answer back to **No**, the boxes below now reset to blank automatically — no leftover or greyed-out entries to cause confusion.
- **"Reason for medication"** now appears **below** the "Which blood thinner(s) do you take?" list.
- **"Have you been told by a health care professional that you have special blood requirements such as:"** now appears as a bold heading above its three Yes/No boxes (Blood antibodies / Irradiated blood / IgA deficiency).

### 9) Substance Use (Section 8)
"Number of drinks per week" is now a free text box, so patients can write answers like "only one or two drinks in a year".

### 10) Chronic Pain (Section 9)
**"In thinking about your pain, how much do you agree with the following statements?"** now appears as a bold heading above the boxes, with each statement and its 0–4 scale below.

### 11) Other Medical Problems (Section 10)
- "Last known HbA1C" is no longer a required answer (no red asterisk).
- **Kidney disease:** answering Yes now first asks **"Are you on dialysis?"** (Yes/No). The "Dialysis – route, schedule" box only appears if dialysis is answered Yes.
- The "Other" box has been replaced with **"What is the cause of your kidney disease?"**, which appears whenever "Kidney disease?" is answered Yes.
- **Infections:** switching the answer back to No now resets all of the boxes below to blank.
- The **"Treatment"** box now appears **after** the "Which infection(s)?" list.

### 12) Review Page
When a patient uses **Edit** on the Review page and is taken to a section, a **"Return to Review"** box now appears at the bottom of that section, so they can jump straight back to the Review page without paging through the rest of the questionnaire.

### 13) Height & Weight (PDF)
- The **Height** now prints correctly on the PDF, including its units (e.g. "170 cm" or "5'7\"").
- The **Weight** now prints with its units (e.g. "72 kg" or "160 lbs").
- The units used for weight are now **circled** on the printed form (e.g. ⃝kg or ⃝lbs), matching the form's "kg or lbs (please circle)" instruction — instead of being crossed with an X.

### 14) Branching Logic Pop-Up Questions
Any question that only appears after a Yes answer is now **slightly indented** under its parent question, so it is clear the follow-up is part of the answer above.

### 15) Smartphone Compatibility
Yes — the survey works on smartphones. It is a responsive web page that adapts to smaller screens.

---

## Testing
All changes have been verified with the project's automated test suite (105 tests passing), including the PDF output itself. The PDF continues to print the patient label, totals, and all answers exactly as before.

Please let me know if you would like any of these adjustments fine-tuned further.

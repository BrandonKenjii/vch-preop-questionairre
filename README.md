# Pre-Operative Questionnaire Web App

A client-side-only React app that replaces the "email a blank PDF, patient
fills it in" workflow for Vancouver Coastal Health's pre-operative patient
health questionnaire (form **VCH.0749-TRIAL**, Nov 2021).

The patient fills out a guided, step-through form in their browser. On
completion, the app writes the answers directly into the reference PDF's
fillable form fields (via pdf-lib), flattens the result, and downloads a
completed PDF the patient emails to the surgeon's office themselves — the
same way they would return a paper copy today.

**No backend, no database, no cloud storage.** Everything runs in the
browser; the only "server" is static file hosting.

## Stack

- React + TypeScript, Vite
- pdf-lib (lazy-loaded at completion time)
- Vitest + React Testing Library
- Plain CSS (single stylesheet)

## Commands

```sh
npm install
npm run dev        # dev server
npm test           # unit + component tests (vitest)
npm run build      # type-check + production build (dist/)
npm run preview    # serve the production build locally
```

## Structure

```
src/
  data/            questions.ts (question schema), fieldMap.ts (question id
                   -> AcroForm field name), template.pdf (cleaned reference)
  components/      Wizard, SectionScreen, question inputs, ProgressBar
  logic/           branching, validation, subtotals, bmi, pdfGenerator
  hooks/           useFormState
tests/             vitest suites + shared fixtures
tools/             one-time field-extraction / template-cleaning / QA tooling
```

## The field map (440 fields)

The reference PDF contains 440 AcroForm fields with generic names
("Text Field 6", "Check Box 4", …) and **no semantic structure**. The mapping
was built once, mechanically:

1. `tools/extract-fields.mjs` — dumps every field (name, type, rect, page)
   into `tools/fields.json` / `fields.txt`.
2. `tools/text-items.mjs` — extracts every text run with x/y coordinates so
   each field can be matched to the printed question it belongs to.
3. `tools/overlays/` — rendered pages with labeled field boxes (PNG/JPG),
   produced by `tools/render-overlays.mjs`.
4. The result is `src/data/fieldMap.ts` (438 mapped fields + 2 auto-filled
   date fields; the two page-10 fields are reserved for overflow text).

`tools/verify-fieldmap.mjs` cross-checks the map against the template in both
directions (every reference exists; nothing orphaned). The same check lives
on as a test in `tests/pdfGenerator.test.ts`.

## Template preprocessing (important)

The original reference PDF contains **two parallel copies of every widget** —
one set referenced from each page's `/Annots` (what viewers render) and a
duplicate set referenced from the AcroForm `/Fields` (what pdf-lib edits).
Neither copy carries a `/P` entry, which makes pdf-lib's `flatten()` throw
and would leave stale blank widgets on top of filled values.

`tools/clean-template.mjs` deduplicates this once: it rewrites every page's
`/Annots` to reference the `/Fields` widget objects. The bundled
`src/data/template.pdf` is the cleaned file; the original in Downloads is
untouched. If VCH ever revises the reference PDF, re-run:

```sh
node tools/clean-template.mjs   # from tools/
```

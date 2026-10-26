# Import overhaul proposal

Status (October 21): the previously shown design has now been followed by the user's explicit request to implement screenshot-to-card parsing. The first implementation is in source and staging: real OCR integration, section-aware text extraction, retained confidence/evidence, source correction and reparse, and review safeguards. The broader reconciliation/coverage design below remains a proposal where not listed as implemented. Production promotion still needs separate approval.

## Implemented screenshot-to-card path

- Screenshot reading defaults on for each import; attachment-only is an explicit opt-out. The browser preview now has its own local Tesseract worker instead of deliberately skipping image reading. Desktop staging uses the same parsing and OCR-result normalization.
- Source text is split into ingredients, methods, servings/yield, nutrition, notes, and unrelated sections. Common wrapped lines, inline lists, Unicode/spaced fractions, ranges, package/count units, and qualitative quantities are retained. Nutrition serving counts cannot overwrite recipe servings. Conflicting counts and nutrients stay unknown with warnings.
- Ingredient records reference source evidence/line numbers. Exact cross-source overlap is merged within a component with references retained; different ingredient groups remain separate. This is not a guarantee that every possible screenshot layout is complete.
- OCR confidence and line rectangles are retained. Low-confidence readings and alternate pass text are visible. Correcting extracted text rebuilds the card and preserves the original text. The image remains available for comparison.
- Imports report reading progress and extracted ingredient counts. A failed screenshot does not discard later screenshots; cancellation retains completed text and images. Timeouts prevent a stalled OCR operation from holding the import indefinitely.
- Extracted cards remain Needs Review. Saving an unfinished draft is allowed. Ready to Cook requires source review, nonempty ingredients/instructions, and resolution of conflicting ingredient amounts/recipe servings. Edits and scaling reopen source review. Nutrition matching is optional.
- Local AI cannot replace an already extracted ingredient list. Its fallback rejects source text over the input limit instead of truncating, and rejects unsupported ingredient/instruction wording or serving counts.

## OCR setup and verified limits

The preview launcher prepares the existing Tesseract English model once and serves a fixed list of local OCR assets. No screenshot is sent to an external OCR service. The model is also cached under isolated desktop staging data. Commands: `npm run setup:ocr`, then reopen `Start-Nibble-Preview.cmd`; `npm run test:ocr` runs a real authored-image check once the model exists.

The restricted agent session could not download the model (DNS lookup failed), and the browser download authority check was unavailable. **Live OCR recognition and accuracy are therefore not yet verified.** The real-image smoke check reports this as unavailable, not passed. Unit/integration checks cover mocked OCR results, per-file failure recovery, cancellation, preserved evidence, parser cases, and readiness validation. English printed, upright recipe cards are the intended first target; handwriting, other languages, tiny/cut-off text, complex columns, and missing screenshots still require user review. Existing website imports with supplemental evidence are not yet automatically reconciled into their fields.

Live browser verification confirmed pasted text → five ingredients and two instructions, four recipe servings, a separate one-bowl nutrition portion, joined wrapped ingredient text, editable fields, and source review controls. The old preview server must be restarted to load the new local-worker routes and policy; refreshing alone updates the UI but not the running server.

## Defects confirmed before implementation

Reproduced on October 21, 2026 using the actual parser bundled in memory:

- A recipe with `Servings: 4`, two ingredients, then `Nutrition Facts / Servings: 1 / Serving size: 1 bowl (250 g) / Calories: 180 / Protein: 4 g` becomes **one serving and six ingredient rows**, without a published nutrition record. The fallback parser has no nutrition section.
- `2 tbsp extra virgin` followed by `olive oil` becomes two ingredients.
- Two screenshots containing `1 tsp salt` under different recipe groups lose the second salt line during cross-source deduplication.

Code inspection also confirmed:

- OCR retains only text, discarding word/line positions and confidence supported by the installed Tesseract types. Evidence lacks ingredient-to-source references.
- Extra text/screenshots are attached to a website recipe but not reconciled into its fields.
- Optional local AI accepts schema-valid suggestions without checking field-to-source support. It silently sends only the first 40,000 characters.
- A blocked website produces an empty draft labelled `Ready to review`. A failed image can stop later images. Source-level retry and recovery are absent.
- Warnings do not prevent marking an incomplete recipe ready; website conflicts currently prevent saving even unfinished drafts.
- Native file selection can silently truncate to 20 files. Edited images replace the active asset without an explicit original/derivative link.

## Preview

The existing server at http://127.0.0.1:4175/ reads rebuilt assets on refresh. The new source is `nibble-import-overhaul.html`; the previous `nibble-import-sections.html` is retained. `/editor` still shows the current staging component.

The authored example contains an unclear yogurt fraction, overlapping screenshots, conflicting lemon-juice amounts, optional dill outside the ingredient list, qualitative salt, unknown drained weight, and separate recipe/nutrition servings. It is a design simulation, with no actual OCR, model call, USDA request, or desktop save.

### Preview verification performed

The rebuilt page loaded in the built-in browser on October 21. Its full-page desktop layout was visually inspected. Browser interaction confirmed that the fraction decision advances to the quantity conflict, optional dill is added as a seventh ingredient, leaving the disputed amount unknown keeps ready-save disabled even after both review confirmations, and the unfinished draft action remains available. Choosing an amount clears prior confirmations; checking them again enables the simulated ready-save. Changing recipe servings from 4 to 8 preserves published nutrition per original bowl. Missing published nutrition displays unknown values, not zeros. The preview was reset to its initial review state and retained for annotation.

The preview build, JavaScript syntax check, and HTML ID/label/tab-target checks passed. This does not verify real screenshot OCR or the proposed backend; those remain implementation acceptance work after preview review.

## Proposed workflow

1. **Add sources:** order screenshots and combine them with text and a website link. Preserve originals and link crop/rotation derivatives. Show per-source reading progress, failures, retry, and editable extracted text. Identify multiple recipes for explicit selection/splitting. Reject excess files visibly before import.
2. **Ingredients:** link every candidate to text lines or image regions. Surface unclear fractions, wrapped lines, conflicting quantities, and method/caption-only ingredients. Preserve groups, optional items, alternatives, preparation, ranges, package/count units, and qualitative amounts. Every candidate is included, intentionally excluded with a reason, or unresolved.
3. **Recipe details:** reconcile instructions, recipe servings/yield, and nutrition separately. Preserve original wording and alternatives. Conflicting websites/screenshots are competing evidence, never silently summed or overwritten.
4. **Finish review:** allow an unfinished draft to save with open issues. Ready-to-cook status requires resolution of critical issues and review of the supplied ingredient/method evidence. Later edits or new evidence reopen affected checks. Nutrition matching remains optional.

## Extraction and data contract

### Evidence first

Store ordered sources with raw text, stable source/block IDs, image dimensions, word/line rectangles and OCR confidence where available, original/edited asset links, read status, and recoverable errors. Persist after each source, including failures. Keep completed evidence through cancellation/restart.

Normalize websites, text, screenshots, and video evidence into one import document. Classify metadata, ingredients, instructions, nutrition, notes, unrelated text, and unresolved regions. Parsed fields reference original spans. A coverage ledger accounts for captured, overlapping, intentionally excluded, and unresolved candidates. This measures supplied-source coverage, not completeness of an unseen recipe. OCR confidence never becomes a “verified” guarantee.

### Conservative parsing

Support Unicode/mixed fractions, decimals, ranges, package sizes, count units, divided amounts, optional ingredients, alternatives, preparation qualifiers, and “to taste.” Preserve unsupported expressions. Package mass is not drained edible mass; volume is not mass. Join wrapped lines using adjacency/layout and section context; ask for review when ambiguous.

Nutrition serving counts never overwrite recipe servings. Nutrition, headings, instructions, and yield cannot become ingredient rows merely by following an Ingredients heading. Keep numeric conflicts as alternatives.

### Reconciliation

Detect adjacent screenshot overlap in source and group context. Identical ingredients in different components stay separate. Shared candidates retain every source reference. Near duplicates and different amounts require review rather than deletion or addition. Repeated instruction text is not globally deduplicated.

Reconcile supplemental text/images with website fields and prior user edits. Present added/changed candidates for review. A blocked website reports source failure and offers continuation with text/images without implying a successful extraction.

### Optional local AI

Keep the existing installed local model optional. Process bounded source/section chunks with IDs and a coverage inventory instead of silent truncation. Require suggestions to cite supplied source spans. Reject unsupported ingredients, changed quantities, or invented nutrition. Track omitted source candidates independently of model output. Valid JSON is not evidence verification.

### Source verification versus nutrition

Source review records ingredient identity, amount/qualifiers, supporting evidence, and user decisions. USDA matching separately records food identity, raw/cooked/drained state, edible weight, food record, retrieval date, and nutrient coverage. Published nutrition stays separate from estimates. Unknown values are null; partial estimates identify missing contributions. Importing a recipe does not require USDA or a key.

## Persistence and scope

Add optional/defaulted review/source metadata for backward compatibility. Distinguish intentional qualitative amounts from disputed or unreadable quantities. Record exclusions and decisions without deleting evidence. Enforce readiness both in UI and persistence. Save unresolved conflicts in review-status drafts; reject unjustified ready-status transitions. Never label legacy recipes retrospectively verified.

After approval, implement in source and build via `npm run build:staging`, using isolated staging data. No production replacement/migration, new external platform, paid service, embedded key, or automatic model installation is proposed.

## Acceptance checks after approval

- Parser fixtures: nutrition before/after ingredients, multiple serving scopes, wrapped lines, headings, groups, fractions/ranges, package/count units, qualitative and optional ingredients.
- Source fixtures: overlap, identical salt in different groups, quantity conflicts, missing continuation, caption/method-only ingredients, multiple dishes, website/text disagreement; assert retained evidence and coverage as well as parsed values.
- Real authored screenshot OCR cases: readable, low resolution, rotated, multi-column, cropped. Report runtime/language-data availability; mocked output alone is not live OCR verification.
- Local model cases: unsupported ingredients, changed numbers, missing references, omissions, oversized inputs, and embedded instructions.
- Lifecycle: failed image among successful images, cancellation, retry, restart, ordering, duplicates, and no silent file-limit truncation.
- Persistence/integrity: incomplete drafts save; critical unresolved issues prevent ready status; edits reopen affected checks; ownership, backups, sources, and original nutrition survive.
- UI: keyboard source review, image-region highlighting, decisions, undo, unknown nutrition, separate USDA matching, narrow layouts, and annotation workflow.
- Run relevant extraction, security, integrity, integration, and UI checks; then build staging and report unavailable live checks honestly.

# Architecture and development decisions

## Boundaries

React owns presentation. It receives a narrow `window.nibble` API from a sandboxed preload. Only the Electron main process accesses the database, managed media, encrypted credentials, validated public URL fetching, or executable tools. IPC validates the main frame and uses Zod schemas for all externally supplied values.

The renderer has context isolation, no Node integration, no remote navigation, no popups, and a restrictive Content Security Policy. Imported text is rendered as text. HTML is parsed into data; it is never executed. Public URL imports use HTTPS and validate/pin DNS results at each redirect, rejecting private, loopback, link-local, multicast, mapped private IPv6, credentials, and custom ports.

Ollama has a fixed loopback endpoint. Source instructions are treated as untrusted evidence. Validated model fields become suggestions until user review. No tool execution is exposed to the model.

## SQLite and migrations

`Store` uses Node's built-in SQLite API in the Electron runtime. This avoids a separately compiled native addon. Run the tests against the pinned Electron/Node combination before upgrading.

Version 1 uses SQLite `PRAGMA user_version`. All migration statements run inside one transaction. The app rejects databases newer than its supported version. A future migration must increment the version only after its SQL succeeds, preserve user identifiers/relationships, and include an old-version fixture test.

Tables: profiles, recipes, tag_groups, tags, collections, recipe_tags, recipe_collections, assets, jobs, settings, food_cache. Foreign keys are enabled. Join tables enforce relationship integrity. Domain arrays (ingredient groups, ingredients, steps, source evidence, nutrient matches) are schema-validated JSON in the recipe row. This keeps atomic recipe saves simple; a later migration can normalize these arrays for larger analytical workloads.

Every recipe records profile ownership, stable UUIDs, timestamps, revision, and soft deletion. Optimistic revisions reject stale editor saves. Retry creates a new job/draft, never overwrites a recipe. Deleting a collection/tag cascades only its join records, preserving recipes.

## Imports

`ImportService` persists meaningful processing stages. One job runs at a time to limit local CPU/memory use. OCR uses Tesseract worker threads; transcription/FFmpeg run as subprocesses with argument arrays and no shell interpolation. Requests and processes have cancellation/time/size limits. Interrupted jobs are marked failed on restart; already extracted evidence is recoverable.

Structured website Recipe data has precedence over loose text. Several Recipe objects create separately selectable drafts. The fallback text parser recognizes explicit sections/quantities; it does not guess missing instructions. Screenshot deduplication removes exact repeated lines across evidence items, retains differently written amounts, and flags repeated ingredient names with conflicts. It is not a full semantic OCR reconciliation system.

Additional evidence can be attached to a saved draft without replacing user-edited fields. Source-provided fields, user edits, and AI suggestions are distinguished in the domain model.

## Nutrition and measurements

Pure functions in `src/shared/recipe.ts` calculate each contribution as `grams × nutrient/100`. Each nutrient independently preserves unknown values. Partial sums remain labeled partial, with excluded ingredients/missing fields. Confirmed servings are required for per-serving results.

Mass and volume conversion are separate dimensions. No universal tablespoon-to-gram factor exists in the code. A USDA portion or user-confirmed gram weight supplies the bridge. Source ingredient wording is retained. Scaling multiplies normalized amounts and gram weights; changing serving count repartitions the same recipe. Neither changes cooking instructions, temperatures, or the original source/manual nutrition record. Ingredient-derived estimates reflect the scaled recipe; original published nutrition stays separately labeled.

## Backups and storage

Portable versioned JSON backups include retained media as base64. They exclude credentials and model caches. Restore validates ownership and references first, writes new media under generated IDs, then restores all relational data in one SQLite transaction. Failures remove newly written media. Restoration remaps IDs into new profiles, preserving existing libraries. Current restore size limit: 400 MB. Larger streaming archives are future work.

Original uploads remain until explicitly removed in Settings. Cover assets remain protected. Removing originals retains evidence text and recipe cards while making media-dependent retries require re-upload.

## Maintainability

Prefer pure domain functions for units/filtering/arithmetic, small replaceable service adapters, validated IPC methods, and repository transactions. Keep user-facing error messages actionable. Add tests for behavior or data-loss risks, not JSX snapshots that merely mirror markup. Introduce a migration instead of silently reinterpreting stored fields.

Future cloud sync should add authenticated ownership mapping and conflict handling behind the repository boundary. Local profile IDs must not be treated as secure authentication credentials.

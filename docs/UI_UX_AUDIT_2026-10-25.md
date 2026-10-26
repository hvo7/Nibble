# Save, draft trash, and UI audit — October 25, 2026

Implemented in source and rebuilt for staging. Production was not promoted or packaged.

## Fixes

- Added a trash-can button in Import History and the recipe editor. Confirmation moves the draft to recoverable Trash, retaining its ingredients, notes, source evidence, and import history.
- Save recipe now persists Needs Review drafts with unresolved website conflicts. Ready to Cook still requires review and resolved conflicts; empty titles remain invalid.
- Successful writes immediately update the library and editor revision. Refresh failures do not misreport committed writes as failed saves. Failed writes retain edits. Pending saves block duplicate clicks and editing.
- Import History distinguishes unsaved drafts, saved recipes, and recipes in Trash, and opens the latest saved version.
- Back to library opens All Recipes. Navigation resets hidden filters. Image paste, profile switching, and navigation protect unsaved changes.
- Adding screenshots or text adopts the saved revision. Canceling clears the import target. Supplemental evidence attaches only to the matching import job and still requires Save.
- Imports wait for media preparation and browser-file reading. Excess selections show an error instead of truncating. Successful attachments survive a subsequent read failure. Explicit screenshot imports still enable parsing by default.
- The blank USDA portion option preserves the ingredient weight.
- Settings and profile-name edits gain unsaved-change protection. Tool checks run on request. Profile creation, collection/tag writes, history actions, backup, and restore gain pending-operation guards.
- Modal Escape respects guarded close handlers. Editor and cooking layouts gain narrow-window rules.

## Verification

| Check | Result |
| --- | --- |
| React controls with real temporary SQLite databases | 26 passed |
| Offline recipe extraction regressions | 8 passed |
| Launcher, local preview server, and smoke-result regressions | 15 passed |
| Combined run | **49 passed, 0 failed, 0 skipped** |
| TypeScript | Passed |
| Desktop staging build | Passed |
| Browser-preview build only | Passed |
| Production hash comparison | 374 unchanged files; no added production files |

The UI suite checks restart persistence, save failure/retry, stale revisions, source-review gates, trash/restore, duplicate handling, dirty navigation, search/filters/favorites, collections/tags/bulk actions, settings/profiles, supplemental evidence, nutrition portions, manual edits, cooking controls/timers, import preparation, and desktop-action success/error/cancellation handling.

The UI tests click actual React controls in jsdom. Native file pickers, printing/export/backup dialogs, import-job execution, tool discovery, and external-service APIs are substituted at the desktop boundary. This verifies UI wiring and failure handling, not live native integration. Parser tests use local authored fixtures.

## Reproduce

```powershell
node --test scripts/ui-workflows.test.mjs scripts/import-representations.test.mjs scripts/staging-launch.test.mjs scripts/production-launch.test.mjs scripts/preview-server.test.mjs scripts/desktop-smoke-result.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node scripts/staging.mjs --build-only
node scripts/review-preview.mjs --build-only
```

The focused suite is also available as `npm run test:ui:offline` and included in normal staging verification. The broad npm/Vitest suite was not run during this task.

## Manual staging check

1. Open Start-Nibble-Staging.cmd from the project folder.
2. Review an imported draft with source conflicts, save as Needs Review, go Back to library, and reopen it.
3. Trash a draft from Import History, then restore it. Check its ingredients and evidence.
4. Edit a title and navigate away. Keep editing should retain changes; Save recipe should persist them.
5. Check native file selection, screenshot editing, export/print, backup/restore, and layout using staging test data.

## Limits

No live Electron window, visual-layout session, native-dialog, or external-service validation was performed. The earlier unexplained telemetry denial was respected: the rejected preview-launch, packaging, and broad test operations were not retried. Build-only previews were generated without launching a preview server. This does not certify a bug-free production release.

Raw logs: `.nibble-test/ui-audit-results.tap`, `.nibble-test/ui-audit-staging-build.log`, and `.nibble-test/ui-audit-preview-build.log`.

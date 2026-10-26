# Simpler imports - applied to staging on October 25, 2026

The previously prepared update is now applied to the normal Nibble source folder. All 13 archive entries matched their expected original and updated SHA-256 hashes before application. Source backups and validation logs are in `.nibble-test/import-resume-20261025`.

## Behavior

- Deleted drafts disappear completely from Import History, including the containing import card. No View in Trash remnant remains.
- The profile menu provides a Trash action. Recovery preserves recipe content and source evidence.
- Website, saved browser page, pasted text, and optional local-model imports produce one primary recipe in the existing editor.
- Older jobs with multiple candidates show one review card. Saved corrections take priority, and deleting the selected card does not reveal a hidden older version.
- Import diagnostics and retry controls are collapsed under Import details; source evidence is collapsed until opened.
- Ingredient lists from different records are not spliced together. Serving and nutrition disagreements remain explicit review decisions. Additional webpage records remain in source evidence, and unknown nutrition remains unknown.
- Saving drafts, including Needs Review recipes, persists their edits. Ready to Cook still enforces source-review requirements.

The first verification run caught an existing timer race: two clock reads could display 5:01 immediately after starting a five-minute timer. The timer now uses one start timestamp. Its existing UI test advances the clock between reads to reproduce the failure deterministically.

## Verification in the current project

| Check | Result |
| --- | --- |
| React UI with real temporary SQLite databases | 29 passed |
| Single-draft selection and import integration | 9 passed |
| Existing offline extraction regressions | 8 passed |
| Launcher, preview HTTP boundaries, smoke-result checks | 15 passed |
| Combined offline suite after timer correction | **61 passed, 0 failed, 0 skipped** |
| TypeScript and `npm run build:staging` | Passed |
| Browser-preview build only | Passed |
| Production build comparison | 374 files unchanged; none added or removed |
| Existing staging data comparison | 54 files unchanged; none added or removed |

Desktop import integration used the real ImportService, parser, and SQLite store with fixture webpage content at the network boundary. Browser import tests used the preview adapter. Local-model responses were test fixtures. UI tests exercised actual React controls in jsdom, with native and external-service boundaries substituted.

The broad npm/Vitest suite, native Electron launch, preview-server launch, visual-layout checks, and live website/AI/USDA calls were not run in this application pass. Earlier restrictions on broad tests and launching remain respected. A successful build does not establish native startup or live integration success. Production was not built, packaged, deployed, or migrated.

## Review staging

Open `Start-Nibble-Staging.cmd` from this Nibble folder. The updated app is built in `.nibble-staging/app` and uses `.nibble-staging/data`.

1. Open Import History, delete a draft, and verify its entire card disappears.
2. Open the profile menu, choose Trash, and restore the recipe.
3. Import a recipe with multiple source records. Review one card and inspect any serving/nutrition conflicts within it.
4. Save, return to All Recipes, reopen, and verify edits and evidence remain.
5. Start a five-minute cooking timer and verify it starts at 5:00.

The browser-preview assets are also rebuilt. The preview launcher remains `Start-Nibble-Preview.cmd`; it must be started by the user for a live side-panel session.

## Reproduce

```powershell
node --test scripts/single-import.test.mjs scripts/ui-workflows.test.mjs scripts/import-representations.test.mjs scripts/staging-launch.test.mjs scripts/production-launch.test.mjs scripts/preview-server.test.mjs scripts/desktop-smoke-result.test.mjs
npm run build:staging
node scripts/review-preview.mjs --build-only
```

Logs: `tests.tap` (initial timer failure), `tests-final.tap`, `staging-build.log`, `preview-build.log`, `protected-before.json`, and `protected-after.json` under `.nibble-test/import-resume-20261025`.

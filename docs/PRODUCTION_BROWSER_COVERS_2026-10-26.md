# Production browser covers — October 26, 2026

The user approved promoting the tested staging changes without versioning.
The app and production browser companion remain at **1.0.1**. No new release version or tag is created.

## Included behavior

- The companion selects the main recipe's dish photo using shared metadata/card/title ranking, decodes accessible pixels, and embeds a JPEG plus source details in version 2 JSON.
- Nibble imports that file offline, validates the image, and applies it to the draft and saved recipe card. Version 1 files still import; unreadable or protected photos leave a usable recipe and a manual fallback.
- Change cover photo supports Ctrl+V and a file picker, with preview, Use this photo and Cancel. Saving persists the chosen cover.
- Production and staging bundle the companion from `src/browser-companion`; production writes the existing app version into its manifest.
- Parity verification now includes the companion runtime and permissions, in addition to application source, desktop bundles and styles.

No user data migration, automatic recipe backfill, paid service or new platform is involved.

## Verification

- `npm run verify:staging`: 260 automated checks passed (185 unit/integration, 19 launcher/parity/security, 8 source representation, 39 React/SQLite workflows, 9 single-import checks), followed by TypeScript and staging build.
- `npm run build`: production app, desktop code, OCR resources and browser companion built successfully.
- `npm run verify:parity`: 39 application sources, both desktop bundles, stylesheet and all five companion runtime files match staging. Companion permissions/configuration match; channel name and companion version metadata intentionally differ.
- The fresh unpacked app passed exact production renderer/main/preload/resource comparisons, all eight browser companion files, bundled OCR with all 17 screenshot ingredients, and PNG/JPEG/WebP decoding with shipped native libraries.
- Windows refused to remove the previous locales directory during in-place packaging. The prior app was restored from the rollback copy; a fresh package was built and verified separately, then its files were copied into the existing release directory without deleting folders. No NSIS installer was created.

These checks use automated DOM fixtures, real SQLite and real image/OCR decoders. A native staging launch in this environment exited 2147483651 before a renderer report. Live Chrome/Edge extension installation, the native Windows clipboard and narrow-layout visual acceptance remain unverified. No further request to the previously declined recipe origin was made.

## Open the updated production app

1. Fully close Nibble and reopen `Start-Nibble.cmd`, or the refreshed `release/1.0.1/win-unpacked/Nibble.exe`.
2. On Chrome/Edge's Extensions page, reload the existing Nibble companion. If it points to a different folder, use Nibble's Import Recipe > Set up browser companion > Get browser companion and load that folder.
3. Capture a recipe again to include its dish photo in the JSON. Existing saved JSON files are not rewritten.
4. For manual covers, use Change cover photo > Ctrl+V > Use this photo > Save recipe.

Because version numbers were kept unchanged, restarting the app and reloading the unpacked extension are necessary to load the new code.

## Rollback

The pre-promotion app, companion, unpacked package and build configuration were copied to the path in `.nibble-test/browser-cover-production/rollback.json`, under `.nibble-staging/production-rollback/browser-covers-2026-10-26T06-59-41-030Z/`. This backup contains program files, not a migration of production recipes.

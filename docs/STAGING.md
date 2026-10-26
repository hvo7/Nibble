# Preview, staging, tests, production approval

The user authorized promotion of the current staging application to production 1.0.0 and publication to hvo7/Nibble. See [RELEASE_1.0.0.md](RELEASE_1.0.0.md) for verification and publishing status. Future changes still require staging review and explicit production approval.

## Run the approved changes

Double-click `Start-Nibble-Staging.cmd` in the project folder, or run:

```powershell
npm run staging
```

This type-checks and builds into `.nibble-staging/app`, then opens Electron using `.nibble-staging/data`. The app displays a staging banner. It starts with a separate library: create a test profile and test recipes. Production recipes, API credentials, and settings are not copied automatically.

The Windows launcher uses its own folder even when started elsewhere, checks for Node/Electron, and clears inherited `ELECTRON_RUN_AS_NODE`, `NIBBLE_SMOKE`, `NIBBLE_SCREENSHOT`, and `NIBBLE_DEV_URL`. After building and preparing OCR, it opens the Electron executable directly, matching the previously successful manual launch. The `npm run staging` path independently performs the same environment cleanup and data isolation. `.nibble-staging/staging-launch.log` records launch/exit details; `.nibble-staging/electron-startup.log` contains Electron diagnostics when the runtime starts far enough to write them. Neither normal launcher starts a smoke test.

`Start-Nibble.cmd` / `npm start` continue to use the existing build. Do not run `npm run build` or packaging commands to promote this candidate until production approval is given.

## Automated checks

```powershell
npm run verify:staging
npm run test:desktop
```

The first command runs the fixture/unit/integration/security/data tests, then type-checks and builds staging. The second opens a hidden Electron smoke window using a third, disposable `.nibble-staging/smoke/data` directory. A successful desktop run captures `.nibble-staging/smoke/startup.png`. Passing compilation is not equivalent to passing this desktop check.

Tests use temporary databases under the project's test runtime directory, never the real recipe library. Test failures stop the staging verification command before a new build is produced.

## Preview and annotate in ChatGPT

Double-click `Start-Nibble-Preview.cmd`, or run this in a normal PowerShell terminal in the project folder:

```powershell
npm run preview:staging
```

Keep that terminal open. In ChatGPT's side-panel browser, enter **http://127.0.0.1:4175/** in the address bar. The page title is **Nibble - App preview**. It opens on Home, as a fresh app launch. Select **Annotate** in the browser toolbar, click an element or drag over an area, save the comment, and send a chat message asking for the comments to be addressed. The Electron window is separate from this browser tab.

The default page renders the actual React app with a browser-only, in-memory API adapter. Home, All Recipes, Favorites, Collections, Tags, Import History, Settings, Trash, profiles, search, filters, editing, and saving are interactive. Pasted text uses the section-aware parser. Screenshot reading is enabled per import and builds an editable recipe from local OCR; crop/rotation and source evidence remain available. A recipe can be exported as preview JSON. **Proposed import review** opens the broader review prototype for annotations without discarding app edits. **Restart preview** confirms before clearing this visit's edits and returning to Home. Reload also resets the samples.

Screenshot OCR prepares two free English model files once: a text reader and a focused quantity reader for small printed fractions. Both have been downloaded in this checkout. Close the existing preview terminal and reopen `Start-Nibble-Preview.cmd` after updating; the server needs the new fixed worker/model routes. Refresh the side-panel page after it reports ready. If setup fails, run `npm run setup:ocr`, then restart the launcher. `npm run test:ocr` checks real pixels from an authored recipe card and the user's ingredient screenshot in `tests/fixtures/kimchi-ingredients.png`; missing models are reported as unavailable. All OCR worker/model requests stay on the local preview origin. Setup downloads language data only and does not send screenshots anywhere.

Website fetching, video transcription, local AI, live USDA, tool detection, desktop backup/restore, and printing still require desktop staging. The preview reports these limits instead of simulating success. It neither stores API keys nor accesses desktop recipes. **What can I test?** explains the available actions. `/editor` remains available for isolated website-review fixtures. Stop the terminal with Ctrl+C when finished.

Nibble uses port **4175** to avoid Milestone testing on 4174 and Dental Track testing on 4173. If occupied, use `npm run preview:staging -- --port 4176` and use the printed address. The server intentionally binds only to `127.0.0.1`; no public hosting or firewall changes are needed.

`node scripts/review-preview.mjs --build-only` builds preview assets without starting a server. `node --test scripts/preview-server.test.mjs` checks the preview HTTP handler's route, method, and origin restrictions without network access. These checks do not prove that a browser can reach the server.

The main Nibble React app requires Electron's `window.nibble` bridge. Opening its normal build in a browser does not provide that bridge. The preview bundle supplies an isolated test adapter from `tests/ui/preview-api.ts`; it never exposes Electron IPC or the desktop database over HTTP. Preview-only build adapters embed the icon and serve uploaded image data from memory. The app source and production build are unchanged by this preview setup. Narrow side panels use wrapped navigation so every tab stays accessible.

## Manual acceptance before production

1. Open desktop staging and create a test profile.
2. Import representative public recipe URLs. Check ingredient groups, quantities, instructions, published yield, serving size, and attribution against the site.
3. Review a serving/nutrition conflict. Saving must wait until a choice or **Leave unknown** is selected. Reopen the saved recipe and verify source alternatives remain.
4. Check nutrition with a declared basis and without one. Missing values must remain unknown. Scaling a recipe must leave published values unchanged.
5. If desired, enter your own free USDA key in staging Settings. Confirm food matches and weights, including a volume ingredient. Check complete and partial estimates.
6. Cancel an import, retry it, restart staging, and export/restore a backup using test data.
7. Review screenshots and report annotations. Production promotion requires a separate explicit approval after these checks.

## Current validation and limits

The full-app browser preview was verified in ChatGPT's side panel on October 21. It starts on Home and its narrow layout exposes every navigation tab. Live checks covered all sidebar destinations, recipe search, favorite changes, creating a collection, importing pasted text, reviewing its ingredients and unknown nutrition, saving the draft, and seeing it on Home. Switching between the app and the proposed import review preserves the sample review decisions.

The screenshot-parser update passed the app tests, five preview-server boundary checks, and the staging build. Tests cover mutation isolation, ownership, stale revisions, trash/restore, organization cleanup, pasted-text evidence, unknown nutrition, source conflicts, invalid assets, screenshot result parsing, failed-image recovery, cancellation, and readiness enforcement. Native annotations are available through ChatGPT's toolbar; no test annotation was submitted.

The October 21 screenshot follow-up successfully downloaded the models using Tesseract's existing official package CDN. `npm run test:ocr` now passes actual pixel recognition: the authored six-ingredient recipe preserves instructions, recipe servings and nutrition; the user's kimchi screenshot yields exactly 17 ingredient names, amounts and units, with 12 stew ingredients and five stock ingredients. It checks quarter/half/third fractions, half-inch tofu slices, the stock's 2½-cup yield, optional tofu, kelp dimensions, source references, unknown nutrition, and missing instructions/title. `Serves 2 to 3` stays source yield text, not an ingredient or a guessed single serving count. This verifies these two images, not all screenshots or handwriting.

Live browser testing exercised choosing the user's PNG, pasting the same image from the clipboard, real local OCR, and creating the editable 17-ingredient draft with its original image and OCR readings. The browser picker now keeps its input attached until selection/cancellation. Small quantities get focused pixel reads; borderline reads need agreement at two image sizes. The initial text and corrections remain visible, and the card stays Needs Review until explicitly checked. Broader crop/rotation and preview JSON export remain separate manual acceptance checks.

The final browser draft's 17 names and ingredient quantities matched the image. Saving, returning Home and reopening retained all 17; the nutrition tab displayed unknown values rather than zero. One browser-specific limitation remains: the small stock-heading yield was read as `2¥2 cups` and explicitly flagged for review, while the real-pixel Node regression read `2 1/2 cups`. This heading is not a recipe serving count or an ingredient. The saved test recipe is titled **Kimchi stew · screenshot test**; the preview was left on Home at `http://127.0.0.1:4176/` without replacing the user's existing 4175 tabs. Preview recipes last for the current browser visit only.

Validation: 108 tests passed in the full suite, the final focused OCR run passed five tests (including one subsequently added test, for 109 distinct app tests), seven launcher/server checks passed, both real-pixel OCR checks passed, and the final staging type-check/build passed. The native desktop failure below is excluded from those passing checks.

An earlier restricted agent-launched server reported `connect EACCES` and browser timeouts. The user's normal-session launcher resolved browser access. If this recurs, start the preview in normal PowerShell; do not weaken security controls or treat a printed listening URL as proof that the page loaded.

The user previously opened desktop staging manually. In the latest tool session, both the desktop smoke test and the `.cmd` launcher exited with `2147483651` (`0x80000003`) before Nibble loaded. The Electron binary also returned that code for `--version`, so this is not evidence of a recipe-parser failure. Desktop startup cannot be certified from this session. Run the updated launcher normally on Windows and retain its launch log if it still fails. No sandbox/security flags were disabled to force it to launch.

The production build has not been updated. Do not treat the fixture preview as a live desktop or live website integration test.

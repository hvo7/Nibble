# Browser recipe imports and profile fixes - 0.2.1, October 21, 2026

This update is included in source, staging, and the 0.2.1 production build. See `RELEASE_0.2.1.md` for current verification and launch limits. The existing 0.2.0 installer is preserved.

## Import a website that rejects a direct download

1. In Nibble staging, open **Import Recipe → Set up browser companion → Get browser companion**. The desktop button opens the bundled companion folder. The browser preview downloads a ZIP to extract.
2. In Chrome, open `chrome://extensions`; in Edge, open `edge://extensions`. Enable Developer mode, choose **Load unpacked**, and select the folder containing `manifest.json`. Keep that folder after installation.
3. Open the recipe website normally. Click the Nibble companion, then **Read this recipe**. Review the capture and select **Save recipe file**.
4. In Nibble, choose **Import Recipe → Choose saved recipe**, select the `.nibble-recipe.json` file, and select **Create recipe draft**.
5. Review ingredient quantities, directions, recipe yield, and any published nutrition. Confirm the source review before marking a card ready.

This uses the page already loaded in your browser. Nibble does not request that website again when importing the saved file. It needs no paid service, API key, cloud account, or local bridge server. It cannot capture content your browser cannot access. Screenshots and pasted text remain available for image-only recipes, videos, unsupported layouts, or access challenges.

The companion is distributed as a local extension, not a published store listing. It requests only `activeTab` and `scripting`; it has no background process, persistent host permissions, cookie/history permissions, or network calls. The source link, timestamp, recipe metadata, and sanitized recipe area are saved. Unknown nutrition remains unknown; conflicting sources remain reviewable. Its privacy and use policy is available in the import dialog, Settings, and `browser-companion/privacy.html`.

## Profile control

The entire bottom-left profile row now opens **Your kitchens**, even with one profile. It provides switching, profile settings, and kitchen creation. Switching checks unsaved recipe edits and clears prior-profile search/filter selections and pending supplemental imports.

## Verification

- The preceding import/profile implementation passed **129 tests across 16 suites**, including six DOM capture tests and three React interaction tests. The current broad rerun was blocked by automatic approval review before completion; those 129 results precede the latest live-page parser fix.
- **15 launcher, smoke-result, and preview HTTP-boundary tests passed**, plus **8 offline extraction regression tests** for the new parser changes.
- A real Maangchi page opened in the in-app browser. The unmodified companion capture function read its existing DOM; Nibble parsed that saved file without another website request. Result: **one recipe, all 17 ingredient amounts, 11 directions**, optional tofu, stock groups, the 2-3 serving range, and unknown nutrition preserved. The site's metadata was missing seven ingredients; Nibble now chooses the more complete matching visible list, preserves both versions as evidence, and warns about differences. The actual extension popup/install remains unverified.
- TypeScript checks and the staging build passed; the complete preview bundle was regenerated.
- Browser-capture fixtures preserve all **17 ingredient lines** from the user's supplied screenshot, their exact numeric amounts, optional tofu, the separate stock group, the 2–3 serving range, and the kelp dimensions. Directions in this fixture are authored test text, not a claim of live website capture.
- The import-service integration test asserts **zero website requests**, confirms the source-review requirement, saves the card, reopens SQLite, and verifies ingredients and capture evidence survive.
- Metadata nutrition, visible-page serving counts, malformed/oversized files, access-challenge pages, local JSON-LD references, and conflicting source representations are covered.
- DOM tests check exclusion of forms, hidden content, editable fields, comments, unrelated metadata, executable attributes, and known tracking/authentication URL parameters. Capture bounds prevent excessive metadata expansion.
- React tests exercise the actual profile button, create/switch actions, keep/discard-unsaved decisions, saved-file input, recipe draft opening with all 17 rows, privacy dialog, and invalid-file errors. These run in jsdom with dialog/popover shims; they are not native-window or visual-layout certification.
- Browser companion ZIP extraction and byte-for-byte source comparisons passed.
- Production dependency audit: **0 known vulnerabilities**. Development dependency installation still reports the existing **8 moderate** findings. License inventory regenerated.

## Checks still unavailable

The browser automation connection recovered, and live Maangchi capture/parser validation succeeded. Installing and invoking the actual Chrome/Edge extension and the native desktop folder-opening action remain unverified in this execution environment. No browser sandbox or security controls were disabled.

Automatic approval review again rejected the local preview-server launch, the broad test rerun, and installer packaging after detecting unexplained traffic to `dc.services.visualstudio.com`; the origin and transmitted payload remain unknown. The in-app browser reported `ERR_CONNECTION_REFUSED` at port 4176. These rejected actions were not retried through another execution route. New narrow offline parser tests used Node's built-in runner, local files, and a fetch function that throws. This report does not claim a running side-panel preview, a new installer, or a completed current full-suite rerun. The final local production build and a real OCR regression using its models/dependencies did pass.

The supplied Windows logs show that 0.2.0 rendered onboarding and an NSIS installer was created. Its old smoke checker falsely rejected the actual window title; that checker is fixed. A new 0.2.1 native probe still exited with `0x80000003` in the restricted execution environment. Installed 0.2.1 acceptance and save/restart remain unverified. This is not a claim of a bug-free release.

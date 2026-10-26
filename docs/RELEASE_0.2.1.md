# Nibble 0.2.1 - browser imports and profile repair

The user authorized updating the current production app and testing its launch on October 21, 2026. This release promotes the reviewed browser-import and profile changes and fixes an ingredient-loss issue found on the live Maangchi recipe page.

## Changes

- Free Chrome/Edge companion reads the page the user opened normally and saves a local recipe file. Importing that file never downloads the source website again. Setup and privacy policy are available inside Nibble.
- The complete bottom-left profile row opens kitchen management, including with a single profile. Switching protects unsaved edits and resets profile-specific filters.
- Website metadata is no longer presumed complete. The live Maangchi page's metadata contained 10 ingredients while its visible card contained 17. Matching representations now produce one draft using the longer source list, including its quantities and grouping. Original ingredient lists and directions remain in source evidence, with differences flagged for review.
- Method subsection headings are not separate cooking steps. Multiple visible cards remain separate recipes; same-title JSON-LD variants and unrelated partial lists are not automatically combined.
- The desktop smoke checker accepts the actual Nibble title and still requires rendered onboarding/home content and a clean exit. It rejects malformed records, blank/partial pages, crashes, signals, and timeouts.
- Staging reports the package version. Packaged-resource verification checks exact renderer assets and all seven companion files as well as existing OCR dependencies/models.

## Verification

- 15 launcher/preview-boundary/smoke-result checks passed.
- 8 new offline extraction checks passed using local authored fixtures and Node's built-in test runner. They cover incomplete metadata, alternative titles, group/order preservation, retained quantity differences, distinct recipes, instruction headings, and serving/nutrition separation.
- Live browser capture plus the production parser: one recipe, 17 exact ingredient amounts, 11 directions, optional tofu, stock grouping, kelp dimensions, ranged servings, and unknown nutrition. Evidence and results are under `.nibble-staging/live-validation/`. This exercised the companion's unmodified capture function, not Chrome/Edge extension installation or its popup.
- The preceding import/profile implementation passed 129 tests across 16 suites. The current broad rerun was blocked by automatic approval review; those results precede the latest parser changes and are not represented as a new full-suite pass.
- TypeScript, final staging and production builds, and the preview bundle build passed. Production and staging backend bundles have the same SHA-256 hash.
- Real OCR using the current production model files and dependencies, an empty local cache, and Electron environment detection in Node workers passed all 17 ingredient names/amounts/units, 12 + 5 grouping, fractions, slice thickness, stock yield, ranged servings, source references, optional tofu and unknown nutrition against the exact supplied PNG. This is a local OCR compatibility test, not a native window or installed-package pass.
- **No 0.2.1 installer was produced.** Automatic approval review blocked packaging at the unexplained telemetry connection after the production build completed. Packaged ASAR/resource verification could not run because there is no 0.2.1 package. Its checker has been strengthened, but that is not a completed package validation.

## Remaining live checks

The supplied normal-Windows logs demonstrate that 0.2.0 rendered onboarding and its NSIS installer was built. The misleading smoke failure was a title comparison bug. The 0.2.1 native probe still exits with `2147483651` (`0x80000003`) in the restricted execution environment. Normal installed 0.2.1 launch, save/restart, native folder/dialog actions, and extension installation remain unverified.

The in-app browser connection works and opened Maangchi. The Nibble preview URL at port 4176 refused connections. Automatic approval review blocked the preview launch, broad test run, and installer packaging because of unexplained traffic to `dc.services.visualstudio.com`; its origin and payload remain unknown. No alternate execution route was used to bypass those rejections. The local preview's code and browser CSP do not contain that telemetry destination, but that does not establish the origin of the reported traffic.

Live USDA with a user's free key, local AI/video dependencies, and clean-account installation still require their actual environments. OCR and website extraction remain review workflows, not guarantees that every site or image is complete.

## Launch and recovery

Close Nibble normally, then use `Start-Nibble.cmd` in the project folder to launch the current production build. Staging remains isolated through `Start-Nibble-Staging.cmd`. Installed copies must be updated using a completed 0.2.1 installer; rebuilding project files does not silently replace an installed application.

The original 0.2.0 installer remains in `release/0.2.0/`. Previous production app assets and package metadata are preserved in `.nibble-staging/production-rollback/before-0.2.1/`. No production recipe database was opened or migrated by these checks. Roll back app files without replacing user data.

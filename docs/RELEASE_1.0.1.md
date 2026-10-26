# Nibble 1.0.1 — website photo compatibility and build parity

## Problem and scope

A previously successful staging import had a cover while later staging and production imports for the same recipe URL recorded photo-saving failures. The 1.0.0 desktop bundles matched; matching source alone did not prove a successful live photo import. The old catch block discarded the failure reason.

The downloader advertised/accepted WebP but passed it to Electron nativeImage, whose documented portable formats are PNG and JPEG. This is a concrete compatibility gap; the exact HTTP response behind the user's failed imports was not retained and is not established as WebP.

## Changes

- Decode downloaded PNG, JPEG and WebP photos with the same pinned local sharp decoder in staging and production; normalize to PNG before storage. Preserve size/pixel limits, strip metadata, normalize orientation, and cap stored cover resolution.
- Include sharp and its native libraries in the production package; it was previously only a development dependency for icon generation.
- Try up to six ranked candidates within the existing 12-second budget. Failed attempts retain their URL and a safe error category in source evidence; the review form explains failed downloads without exposing local paths.
- Check cancellation after decoding, before writing an asset.
- Show version 1.0.1 in Settings so an older running process can be identified.
- Add `npm run verify:parity`: compare the active staging/production source maps with current application source, compare desktop bundle bytes, styles and versions. The intentional staging banner is the renderer's only channel difference.

No recipe migration, automatic backfill, nutrition change, paid service, or new external platform is involved. Existing recipes and profile data remain separate.

## Validation

- All 238 automated staging checks passed: 168 Vitest checks, 18 launcher/parity checks, 8 representation checks, 35 UI workflow checks and 9 single-import checks.
- Real image-byte tests cover PNG/JPEG/WebP decoding, dimensions, invalid content, pixel limits, metadata removal, saved cover persistence and cancellation without orphaned files.
- Offline workflow checks cover import/save/retry, drafts, trash/restore, navigation, profile ownership, source evidence and unknown nutrition.
- Production type-check/build passed. Channel parity passed for all 38 mapped application sources, both desktop bundles, styles and version 1.0.1.
- The unpacked 1.0.1 package passed exact production file/resource checks, bundled OCR regression, and real PNG/JPEG/WebP normalization using its shipped decoder and native libraries. sharp and native-library license notices are present.
- Production build rollback was saved under `.nibble-staging/production-rollback/before-1.0.1-20261026-005923/`. The unpacked production app is `release/1.0.1/win-unpacked/Nibble.exe`; no NSIS installer was created in this update.

These are automated fixture and real image-decoder checks, not a live import acceptance result. Shell network lookup could not resolve the recipe host in this environment. Native app inspection timed out at the app-approval step. Browser access to the recipe origin was declined; no further requests to that origin were made. A live retry of the reported URL and narrow-window visual acceptance remain unverified.

## Using the updated production build

Fully close the existing Nibble window and reopen `Start-Nibble.cmd`. Confirm **Nibble 1.0.1** in Settings, then start a new import. An already running process keeps its old code until it exits; opening another instance only focuses it. Failed or saved older imports are retained and are not silently changed.

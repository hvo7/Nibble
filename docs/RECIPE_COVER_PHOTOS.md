# Automatic recipe cover photos - October 25, 2026

New direct website imports choose a dish photo and save a local, re-encoded copy as the recipe cover. The existing Home/All Recipes cards and full recipe page display that asset. The editor offers Choose/Change cover photo and Remove cover photo. Existing saved recipes are not backfilled or migrated.

## Selection

Images attached to the selected Recipe in JSON-LD, microdata/RDFa, or visible recipe cards take priority. Fallbacks use the main page featured image, dish-title matches and prominent article photos. Lazy image attributes, picture/srcset alternatives, relative links and local JSON-LD references are supported. Obvious logos, avatars, advertising, related sections, cooking steps, tiny thumbnails and extreme aspect ratios are excluded. Empty/malformed/unsafe URLs are rejected.

This is heuristic selection based on page evidence, not visual food recognition. A site can label a photo incorrectly. Manual cover correction remains available; ambiguous pages may have no automatic cover.

Only the chosen main recipe triggers photo downloads. At most three ranked candidates are tried, within one 12-second photo budget. Photo failures preserve the recipe and show a review note. Canceling retains recovered ingredients. The selected photo URL and selection reason remain in website source records, and the photo remains available as source evidence.

Saved browser capture files continue to import without network requests. This feature downloads photos for direct website URL imports only. Screenshots still support choosing a cover manually. No paid service, cloud image model or new dependency is used.

## Transport and storage

Photo requests share the existing public-HTTPS validation, DNS address pinning, mixed/private-address rejection and per-redirect validation. No browser cookies or authorization are sent. Downloads and decompressed bodies are limited to 8 MiB; PNG/JPEG/WebP MIME types and signatures are checked. MediaStore rejects unusable/tiny/extremely shaped covers and decoded images above 40 megapixels, re-encodes to PNG and records ownership in the importing profile. The renderer loads only local media IDs, not arbitrary website URLs.

## Verification

- 79 tests passed across website-image selection, image storage, website extraction, network security, import lifecycle and browser-capture suites.
- 52 offline UI, single-import and extraction-representation tests passed.
- TypeScript and `npm run build:staging` passed.
- Tests cover Home and saved-page image binding, persistence/reopen, manual replacement/removal, picker cancellation, failed downloads/decoding, cancellation, profile isolation, source evidence and unchanged nutrition semantics.
- Network responses and the native image decoder were substituted in automated tests; these are offline integration checks, not live website or native Electron visual checks. No live website download or narrow-layout screenshot was verified in this turn.
- All production files under dist, dist-electron and release match the original hashes and file set. No production package, deployment or migration was performed.
- The staging data directory was already in use. Some Chromium caches and session files changed during the task, and several cache/lock files could not be read. The recorded recipe/database files did not change. Automated persistence tests used separate temporary stores under .nibble-test.

Logs and before/after hash evidence: `.nibble-test/recipe-cover-20261025/`. The initial offline harness lacked the new network export; it was updated and rerun successfully. A lazy-placeholder regression exposed empty URLs resolving to the page URL; the selector now rejects them and the regression test passes.

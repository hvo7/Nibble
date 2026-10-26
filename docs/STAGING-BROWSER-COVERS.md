# Browser covers in staging

**Promotion note:** on October 26, 2026, the user approved production promotion without changing version 1.0.1. See [the production deployment record](PRODUCTION_BROWSER_COVERS_2026-10-26.md). The implementation and validation notes below describe the earlier staging step.

The staging companion is version 1.1.0, named **Nibble Recipe Companion (Staging)**.
Run `npm run staging`. In staging choose Import Recipe > Set up browser companion > Get browser companion.
Load that folder in Chrome or Edge with Load unpacked. If an older companion is installed, use the staging extension for these captures.
The development source lives in `src/browser-companion`; the staging build bundles it into `.nibble-staging/app/browser-companion`.
The root `browser-companion` remains the production 1.0.1 companion.

The companion uses the same main-dish selection and photo ranking as Nibble's direct website importer.
It prefers recipe metadata and recipe-card photos over unrelated images, logos and process shots.
It reads accessible loaded pixels first, then attempts a same-origin HTTPS image request without cookies or redirects.
Cross-origin protected pixels cannot be embedded with the current temporary tab permission.
Such pages still export the recipe with an explanation and a paste fallback.

Version 2 JSON may include `coverPhoto`: JPEG base64 data, MIME type, dimensions, original source URL, recipe title and selection reason.
The image is re-encoded without metadata and capped at 1200 pixels on its longest side and 1 MB.
The whole JSON file is capped at 6 MB. Version 1 files still import.
Nibble imports the JSON offline, decodes the photo with its validated PNG/JPEG/WebP decoder, and uses it only for the matching recipe.
The source remains unverified until the user reviews it. Image provenance and recovery JSON are retained.

In Edit recipe or an import review, choose Change/Choose cover photo.
Copy an image or screenshot, focus the paste area and press Ctrl+V, or choose an image file.
Preview it, choose Use this photo, then Save recipe. Cancel keeps the old cover.
The file limit is 8 MB; decoding enforces 40 megapixels, useful photo dimensions and shape.
This action does not read clipboard contents in the background.

Production builds, releases, companion and user data are not changed by this staging feature.
Automated fixtures cover selection, decoding boundaries, offline import, image persistence and paste/save flows.
Live Chrome/Edge extension and native Windows clipboard verification require an available interactive session.

## Validation — October 26, 2026

- `npm run verify:staging`: passed, 259 automated checks (185 unit/integration, 18 launcher/security, 8 source representations, 39 React/SQLite workflows, 9 single-import checks); TypeScript and staging build passed.
- Actual bundled companion functions were serialized into an isolated DOM fixture; photo preview, embedded JSON export and filename passed. These are simulated browser checks, not a live extension session.
- Browser preview built; its 8-file companion ZIP matches the staged extension byte-for-byte.
- All 810 production build/release/companion files match their pre-change hashes; no additions or removals.
- Native staging smoke launch exited 2147483651 without a renderer report. Native Windows clipboard, live Chrome/Edge extension behavior and narrow-screen visual review remain unverified in this environment.

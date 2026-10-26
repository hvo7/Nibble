# Verification report

## Current release - 1.0.0

See [RELEASE_1.0.0.md](RELEASE_1.0.0.md) for the final source, build, packaging and publishing checks. Historical results below describe earlier local prereleases.

## Historical production update - 0.2.1

See [RELEASE_0.2.1.md](RELEASE_0.2.1.md) and [BROWSER_IMPORT.md](BROWSER_IMPORT.md). Current checks: 15 launcher/smoke/server tests, 8 offline parser tests, a live Maangchi capture parsed into one recipe with 17 exact ingredient amounts and 11 directions, and real OCR of the supplied PNG using production models/dependencies with all 17 names/amounts/units matching. The final production, staging and preview builds passed. The prior 129-test pass predates the live-page parser fix; the broad rerun, preview launch and installer packaging were blocked by automatic approval review. No 0.2.1 installer was produced. Native extension installation and installed 0.2.1 acceptance remain unverified.

## Previous production candidate - 0.2.0, October 21, 2026

See [RELEASE_0.2.0.md](RELEASE_0.2.0.md) for current tests, packaged offline OCR, production promotion and unresolved native startup/installer checks. The sections below are historical staging/MVP results; their approval and OCR-download statements have been superseded.

## Website-import staging candidate — October 21, 2026

- **81 tests pass across eight suites**, including extraction fixtures, network safety/compression/cancellation, USDA response handling and caching, import orchestration, legacy records, and real SQLite save/restart checks.
- Staging type-check and build pass. Output goes only to `.nibble-staging/app`; test data lives separately in `.nibble-staging/data`.
- The native desktop smoke process exits with status `2147483651` before a window is verified. No live desktop/UI acceptance pass is claimed.
- The actual editor is available as a fixture-only component preview through `npm run preview:staging`. Automated visual verification was blocked: local `file:` browser URLs are disallowed, and monitoring the preview process was rejected due to a separate telemetry connection.
- No live website, USDA credential, or USDA request was exercised in this upgrade. Remote-service tests use mocks. No paid service was activated.
- Production build outputs and production recipe data were not updated. Production approval is still required.

The earlier baseline report below describes the original MVP.

## Passed

- `npm run typecheck`: strict TypeScript check.
- `npm run build`: production React assets and Electron main/preload bundles.
- `npm test`: 33 behavioral tests in five suites.
- Windows x64 unpacked packaging using Electron 41.10.7 and electron-builder 26.15.3.
- Seven PNG icon sizes and a multi-resolution Windows ICO generated from the SVG; the 256 px image was visually inspected.
- Installed-package license inventory generated in `docs/dependency-licenses.json`.

## Behavioral coverage

| Area | Verified behavior |
| --- | --- |
| Persistence | Profile and recipe data survive closing/reopening SQLite; favorites and relationships survive |
| Ownership | Cross-profile tag/collection references rejected |
| Organization | Case/whitespace tag duplicates rejected; deleting tags/collections preserves recipes |
| Filtering | OR within groups, AND across groups |
| Data protection | Stale revisions cannot overwrite corrections; soft-deleted recipes recover |
| Imports | Interrupted jobs recover; inaccessible links retain URLs and fallback guidance; cancellation does not corrupt saved recipes; retries create independent drafts |
| Extraction | JSON-LD graphs and multiple recipes; instruction sections; unknown serving/nutrition bases; script stripping; incomplete text drafts |
| Screenshots | Overlapping text deduplicates across images while differing quantities remain flagged |
| Nutrition | Deterministic gram-based arithmetic; missing values stay unknown; partial estimates; unknown servings |
| Measurements | Fractions, ranges, qualitative amounts, mass conversion, no invented volume-to-mass conversion |
| Serving behavior | Repartitioning changes per-serving values only; scaling changes ingredient-derived totals, preserving cooking instructions and original source nutrition |
| Backup | Image bytes and many-to-many relationships preserved in new profiles; invalid relationships rejected without partial restore; credentials excluded |
| URL safety | Private, loopback, link-local, multicast and mapped IPv6 addresses rejected; credentialed/non-HTTPS/custom-port URLs rejected |

## Not verified live in this environment

Electron launch attempts exited with code 1 without diagnostics in the restricted execution environment. The native window, native dialogs, clipboard image input, visual layout, and end-to-end desktop interactions therefore have **not** been verified live. Successful compilation/packaging does not substitute for this check.

The NSIS installer attempt reached compilation but could not launch the cached `makensis.exe` (`spawn UNKNOWN`). A complete installer was not produced. The unpacked Windows application is available under `release/win-unpacked/`; run `npm run package:win` on the target machine to generate the installer.

Live website retrieval, English OCR language download/recognition, Ollama inference, Python/Whisper video transcription, FFmpeg sampling, and USDA API calls were not verified end-to-end. No paid service, API key, large model, or external account was activated. Run the release verification steps in PACKAGING.md on the target machine.

Dependency installation used existing cached npm archives because registry DNS was unavailable. The generated package-lock.json records resolved versions and integrity hashes. Normal `npm ci` on a connected machine is the reproducible installation route.

The focused tests exercise real SQLite files and domain logic; external services/processors are mocked only in the import-orchestration tests. No synthetic recipes are seeded into a new user profile.


## October 25, 2026 — save and draft trash audit

49 offline checks passed: 26 React/SQLite workflow tests, 8 extraction regressions, and 15 launcher/preview/smoke-result tests. TypeScript, desktop staging build, and browser-preview build passed. All 374 production files retained their SHA-256 hashes, with no added production files. Live desktop/native/service checks were not performed. See [the detailed audit](UI_UX_AUDIT_2026-10-25.md) for changes, reproduction commands, and limits.

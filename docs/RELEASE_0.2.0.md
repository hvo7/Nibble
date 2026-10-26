# Nibble 0.2.0 — local production promotion

Update: the subsequently supplied `desktop-check.txt` shows rendered onboarding and exit 0; the old checker falsely rejected the longer window title. `package-check.txt` and the existing installer confirm normal-Windows NSIS creation succeeded. These supersede the earlier environment-specific startup/installer limits below. See `RELEASE_0.2.1.md` for the current update and its separate remaining checks.

The user authorized promotion on October 21, 2026 after staging review. Production includes the current website, text, and screenshot import implementation. Existing recipe data is not migrated or replaced: the SQLite schema remains version 1 and added recipe fields are optional for older records.

## Included

- Section-aware recipe parsing, grouped ingredients, fractions, source references, review confirmation, conflicts, and separate nutrition portions.
- Actual screenshot OCR with focused quantity recognition, raw evidence retention, cancellation, and recovery of partial imports.
- Both tested English OCR models for offline first use, with pinned versions, checksums and upstream license. The app provisions a local cache from the bundled files before creating OCR workers, avoiding Tesseract 5's Electron local-path and language-buffer initialization bugs (https://github.com/naptha/tesseract.js/issues/925). Corrupt caches are repaired automatically.
- Production launchers that clear inherited staging, smoke-test, development URL, and Electron-as-Node flags. Staging remains isolated.
- Existing profile, organization, cooking, export, backup, nutrition, and optional local video/AI features.

## Verification

- 111 application tests in 13 suites: extraction, review, fractions, serving/nutrition separation, network safety, SQLite persistence and legacy records, ownership, revision checks, backup/restore, cancellation, import lifecycle and first-use/corrupt OCR cache recovery.
- 9 launcher and preview-server checks.
- Real OCR on an authored full recipe image and the exact supplied screenshot. The latter matches all 17 ingredient names, amounts and units, both groups, fractions, slice thickness, serving range and unknown nutrition.
- Packaged-file check: renderer/main/preload match the build; required assets, workers/WASM, model checksums, license and Python worker exist; development fixtures are excluded.
- OCR with dependencies extracted from the shipped package and its bundled models, starting with an empty cache and reproducing Electron environment detection in real Node worker threads: all 17 ingredients match. The same local cache-provisioning code runs in production. This compatibility test does not emulate the native window or IPC.
- Browser UI: Home, Collections, Tags, Settings, Import History and Trash navigation; text import; ingredients separated from servings and nutrition; review confirmation; save, search, favorite, reopen, cooking checklist and steps. No captured console warnings/errors. Preview returned to a fresh Home session.

The browser uses an in-memory test adapter. It does not establish native IPC, dialogs, persistent production storage or installed Windows behavior. SQLite/backup tests use real temporary databases.

## Dependency review

Vite is updated to 8.3.5, Vitest to 4.1.12, and compatible transitive build dependencies to patched versions. The full audit reports no high or critical findings and 8 moderate findings in development/build tooling. Production dependencies report zero known vulnerabilities. The remaining installer-tool chain has no compatible published patch; a forced downgrade/major override was not applied.

## Outstanding checks

**Native Windows startup is not verified.** The development Electron runtime, previous packaged app and new executable exit with `2147483651` (`0x80000003`) in the execution environment, including a basic runtime probe. The production smoke test fails with `rendered application: NOT VERIFIED`. The Windows automation helper cannot start (`codex app-server: program not found`). No sandbox or Windows security settings were changed. A normal desktop launch and save/restart check are required before calling this release stable.

**NSIS installer creation is blocked here.** Its `makensis.exe` compiler returns `spawn UNKNOWN`, including a direct version probe. The unpacked app is complete; no successful installer build is claimed. Run `npm run package:win` on a normal Windows build machine for the installer.

Live USDA requests with a user key, Ollama inference, video transcription, native print/export dialogs and clean-account installation are not verified. OCR remains fallible: uncertain readings require review. In the browser rendering path, the supplied screenshot's small stock-yield heading previously remained flagged; all 17 ingredient quantities matched.

A live fetch of the original Maangchi kimchi-jjigae URL returned HTTP 403. The site rejected the request; screenshot/text import remains the available fallback. Network/website parser fixture tests passing does not mean this site accepts automated imports.

## Launch and recovery

Double-click `Start-Nibble.cmd` from the project folder. Diagnostics go to `.nibble-runtime/production-launch.log` and, if Electron starts logging, `electron-startup.log`. The complete packaged app is `release/0.2.0/win-unpacked/Nibble.exe`.

Previous production assets and package metadata are preserved in `.nibble-staging/production-rollback/2026-10-21T10-20-41.480Z/`. Existing `release/win-unpacked/` and the 0.1.0 archive remain in place. No production user library was opened by tests; desktop probes and persistence checks use isolated paths. Roll back application files without replacing or deleting user data.

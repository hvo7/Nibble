# Windows builds

Browser companion files are copied to `resources/browser-companion` by the production packaging configuration and to `.nibble-staging/app/browser-companion` for staging. Keep this folder intact for Chrome/Edge's **Load unpacked** workflow. See `BROWSER_IMPORT.md` for companion setup and `RELEASE_1.0.0.md` for current release verification.

## Build and run locally

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm start
```

Build an unpacked app for verification:

```powershell
npm run package:dir
```

Build the Windows x64 NSIS installer:

```powershell
npm run package:win
```

The 1.0.0 output appears under `release/1.0.0/`; earlier release outputs are preserved. The installer supports a user-selected installation directory and does not delete app data on uninstall. It is unsigned by default. Packaging reuses the installed Electron distribution and puts temporary files and installer tooling in `.nibble-test/`. The first installer build may need internet access.

## Assets and optional processors

The source icon is `assets/icon.svg`. Raster PNG sizes and a multi-resolution Windows ICO accompany it. It contains a terracotta pot and dark-green steam curl with no lettering.

Electron includes Node and SQLite. OCR workers and WASM engines are unpacked beside the app archive; both English models are bundled under `resources/ocr/`. Their package version and SHA-256 checksums are pinned to the models exercised by the real-image regression test. Production build preparation fails if a model is missing or invalid. Runtime OCR uses local files and a versioned writable user cache. Ollama, its models, FFmpeg, and Python are installed separately. Python scripts are copied outside ASAR so an external interpreter can read them.

## Release verification

1. Build from the final lockfile, then run the focused test suite.
2. Launch the packaged executable on a clean Windows account.
3. Create a profile, save and reopen a recipe, restart, and verify persistence.
4. Run `npm run test:package` to validate packaged assets, model checksums, and real screenshot OCR with shipped dependencies and a fresh cache populated from the bundled models. Also exercise screenshot import inside the native app offline.
5. Configure the local transcription stack and test an actual video with speech and text.
6. Confirm a real USDA match using a user-owned free key.
7. Export/restore a backup with images and multiple collections/tags.
8. Verify original-media deletion, cancellation, and recipe trash recovery.
9. Generate license inventory and preserve full third-party notices.

Live integrations require their actual dependencies; mock/fixture tests do not establish that an external service or model works on every machine.

# Nibble 1.0.1

**Save the inspiration. Cook the recipe.**

Nibble is a Windows desktop cookbook that turns recipe websites, pasted text and screenshots into editable recipes. Recipes, photos, collections and import drafts are stored locally. No online account, subscription or paid AI service is required.

## What you can do

- Import a public HTTPS recipe page, a saved browser recipe file, text or screenshots into one consistent review draft.
- Automatically choose a likely dish photo from a website's recipe metadata or prominent page images and use it on Home, recipe cards and the full recipe page. Change or remove the cover when needed.
- Save a reviewed draft and immediately open the full recipe page. Reopening a saved card uses the same page; Edit recipe is a separate mode.
- Find unfinished imports in **Drafts**. Saved and trashed recipes leave that list; original evidence and recovery records remain available.
- Organize recipes with favorites, collections, tags, search, filters and grid/list views.
- Read screenshots locally with bundled English OCR. Browser-assisted imports help with websites that reject direct downloads.
- Review published nutrition separately from ingredient estimates. Unknown values stay unknown. Optionally connect your own free USDA FoodData Central key.
- Use cooking steps, ingredient checklists and timers; print recipes, export JSON, and back up or restore your library.

## Run from source

Requires Windows 10/11, Node.js 24.15+ in the 24 LTS line, and npm. Electron is installed by npm.

```powershell
git clone https://github.com/hvo7/Nibble.git
cd Nibble
npm ci
npm run build
npm start
```

`Start-Nibble.cmd` starts the production build from this folder. The first source build downloads the two pinned free English OCR models if they are not already cached. Packaged builds include them for offline screenshot reading.

## Staging and preview

```powershell
npm run staging
# Build without opening a window:
npm run build:staging
# Browser preview with temporary test recipes:
npm run preview:staging
```

`Start-Nibble-Staging.cmd` uses `.nibble-staging/app` and isolated `.nibble-staging/data`. `Start-Nibble-Preview.cmd` prints a local preview URL. The browser preview uses the actual interface with a temporary adapter; it does not provide every native desktop integration and resets on reload.

Staging changes do not promote themselves to production. Build or package production only after explicit approval. See [the development workflow](AGENTS.md).

## Verify and package

```powershell
npm run verify:staging
npm run test:ocr
npm run build
npm run package:win
npm run test:package
```

The unsigned Windows x64 installer and unpacked app are written under `release/1.0.1/`. `npm run test:package` checks the packaged application, bundled resources and real screenshot OCR. Native launch, clean-machine installation and live integrations are distinct checks; see the [1.0.1 release report](docs/RELEASE_1.0.1.md) for actual results.

## Production updates

Run the staging verification first. After production approval, build production and run `npm run verify:parity` to confirm both channels contain the same current application code. Packaged builds must also pass `npm run test:package`. Fully close Nibble before reopening an updated build; Settings shows the running version.

The original source publication is complete. `Publish-Nibble-1.0.0.cmd` is retained only as historical release tooling and intentionally refuses later versions. Generated builds, installers and personal data remain excluded from Git.

## Privacy and limits

Recipes are stored in the local Electron user-data folder. Staging and preview data are separate. Profiles organize content but are not password-protected accounts.

Direct website imports contact the source website and may download its selected photo from a public image host. Photos are saved locally; remote photo failures do not discard the recipe. Saved browser recipe files are read offline and currently need manual cover selection. The browser companion reads only a page you choose and does not read cookies, passwords or other tabs.

Photo selection uses metadata, title matches and page placement rather than visual food recognition. OCR and extracted quantities require review. Saving does not certify that a recipe or its nutrition is correct. Instagram/TikTok restrictions and private content are not bypassed; screenshots, saved browser files, pasted captions and user-provided videos are supported alternatives.

Optional Ollama, FFmpeg and Python/Whisper tools are installed separately. USDA requires your own free key in Settings. No credentials are included in this repository. Backups may contain personal recipe content and photos; keep them private.

## Project map

| Folder | Purpose |
| --- | --- |
| `src/` | React interface and shared recipe, nutrition and validation logic |
| `electron/` | Desktop bridge, SQLite persistence, imports, image selection, media and network validation |
| `browser-companion/` | Chrome/Edge companion for saving recipe-page content |
| `workers/` | Optional local video transcription |
| `tests/`, `scripts/` | Automated checks, build, launch and packaging tools |
| `docs/` | Setup, architecture, release history and verification records |

## Documentation

- [Changelog](CHANGELOG.md) and [1.0.1 release notes](docs/RELEASE_1.0.1.md)
- [Setup](docs/SETUP.md), [Windows packaging](docs/PACKAGING.md), [browser imports](docs/BROWSER_IMPORT.md)
- [Automatic cover photos](docs/RECIPE_COVER_PHOTOS.md), [known limitations](docs/KNOWN_LIMITATIONS.md)
- [Architecture](docs/ARCHITECTURE.md), [third-party licenses](docs/LICENSES.md)

Source, dependency lockfiles and documentation belong in Git. Generated builds, installers, node_modules, local databases, credentials, runtime caches and local agent settings are excluded. Earlier 0.2.x notes document local prerelease work; **1.0.0 is the initial GitHub release line**.

## License

Nibble uses the [Apache License 2.0](LICENSE), preserving the license already selected for hvo7/Nibble. Third-party components retain their own notices.

# Changelog

## 1.0.0 - October 25, 2026

Initial GitHub release, promoting the approved staging application to production.

### Added

- Local recipe library with profiles, favorites, collections, tags, search and bulk organization.
- One review draft for website links, saved browser recipe files, text and screenshots, with source evidence and conflict review.
- Automatic dish-photo selection for direct website imports, secure download and local cover storage.
- Choose, change and remove cover-photo controls.
- Full saved-recipe page with ingredients, instructions, notes, nutrition, source details and cooking controls.
- Local English OCR, optional local AI/video processors, optional free USDA integration, printing, JSON export and backup/restore.
- Isolated staging, actual-app browser preview, automated behavioral/security checks, and documented Windows packaging.

### Fixed

- Save recipe persists the draft and switches the workspace to the full saved-recipe page. Saved cards and Open saved recipe use that same page.
- Drafts replaces Import History in the sidebar; saved and trashed recipes no longer clutter pending work.
- Save failures retain edits and allow retries. Duplicate and supplemental-source flows preserve recipe identity and source evidence.
- Photo failures, malformed URLs, placeholders and unrelated page imagery do not discard extracted recipes.

### Data and compatibility

- Versioned application/package/companion metadata is 1.0.0. Existing user recipes are not replaced by staging data.
- Published nutrition remains distinct from estimates, and missing values are never treated as zero.
- Automatic photos apply to new direct website imports; existing recipes are not backfilled. Saved browser files remain offline.
- Windows packages are unsigned. No automatic updater, hosted account or paid AI platform is introduced.

See [release verification and remaining checks](docs/RELEASE_1.0.0.md). Historical local 0.2.x reports remain in docs.

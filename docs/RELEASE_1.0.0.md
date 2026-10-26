# Nibble 1.0.0 release report

Prepared October 25-26, 2026. The user explicitly authorized promotion of the staging version to production and publication to https://github.com/hvo7/Nibble.

## Current status

The local desktop production build is now **1.0.0**. The unpacked Windows x64 package passes file/resource checks and real-image OCR. **GitHub publication and the Windows installer are incomplete.** No release commit, version tag, push or GitHub Release entry was created during this session. Native application rendering remains unverified.

Production recipe data was not migrated, opened for editing, or replaced with staging data. Existing production outputs were backed up before rebuilding. Earlier 0.2.x release folders remain available.

## Included changes

- Saving a reviewed import opens the full saved-recipe page. Saved cards and Open saved recipe reach the same page, with editing as a separate mode. Failed saves preserve edits for retry.
- Drafts replaces Import History in the sidebar. Saved and trashed recipes leave the unfinished list while source evidence and recovery records remain available.
- Direct website imports choose a likely dish photo using recipe metadata, title matches and prominent page images. Downloads validate public HTTPS destinations, redirects, size and file contents, then store a local cover for Home, cards and recipe pages. Cover selection is editable. This is heuristic image selection, not visual food recognition.
- Unknown nutrition stays unknown; published nutrition and estimates remain separate. Saving does not certify source correctness.
- Application, lockfile and browser-companion versions are 1.0.0; repository metadata points to hvo7/Nibble. README, changelog, packaging/limitations documentation and this report describe the release. AGENTS.md records the approved workflow.
- The Apache-2.0 license already present on GitHub is preserved verbatim and bundled with the app. Third-party notices and the dependency license inventory remain included.
- Windows package verification now normalizes nested ASAR paths before reading them. This fixes a verifier failure caused by forward-slash paths on Windows; the renderer files were present and matched the production build.

## Verification

| Check | Result |
| --- | --- |
| Core Vitest suites | 157 passed across 18 files |
| Launcher, smoke-result and preview-server checks | 15 passed |
| Offline import representation checks | 8 passed |
| UI workflow checks | 35 passed |
| Single-import checks | 9 passed |
| Total automated staging checks | **224 passed** |
| Staging type-check and build | Passed through `npm run verify:staging` |
| Production type-check and build | Passed through `npm run build` |
| Unpacked package contents | Passed: exact renderer/main/preload bytes, version, license, assets, isolated contents, workers, OCR models/checksums and browser companion |
| Packaged OCR regression | Passed using shipped dependencies and locally bundled models: all 17 ingredient names, amounts and units in the supplied screenshot fixture |
| Publishing launcher checks | Untouched source and text line-ending conversions accepted; modified source and escaping paths rejected; validation mode leaves Git untouched |
| Dependency license inventory | Generated for 394 installed package declarations |
| Native desktop smoke | Failed to verify rendering; process exited 2147483651 (`0x80000003`) |
| Windows NSIS installer | Failed: Windows could not start cached `makensis.exe` (`spawn UNKNOWN`). No installer EXE was produced |
| GitHub source/tag publication | Blocked; not performed |

The automated UI and integration suites use fixtures and temporary data. They cover save success/failure/retry, navigation, drafts, persistence, trash/restore, profile isolation, source evidence and nutrition behavior. They do not establish live native behavior, actual window layout, or live external-service availability. Package OCR proves the supplied screenshot, not a general accuracy score.

Live USDA, optional local AI/video tools, clean-account installation, native offline screenshot import and manual narrow-window acceptance remain unverified. The earlier conversation preview attempt could not load the local app because of local-server/browser restrictions; native side-panel annotation controls were not verified. No screenshot or mockup is claimed as a completed interactive preview.

## Outputs and recovery

- Production: `dist/` and `dist-electron/`; run `Start-Nibble.cmd` from a normal Windows session.
- Unpacked app: `release/1.0.0/win-unpacked/Nibble.exe`. Resource/OCR checks passed; native launch acceptance is still required.
- `release/1.0.0/nibble-1.0.0-x64.nsis.7z` is intermediate installer data, not an installable release.
- An initial package replacement failed on a filesystem operation. Its partial output was preserved in `release/1.0.0/incomplete-before-installer/` before a clean rebuild produced the verified unpacked app.
- Pre-promotion rollback: `.nibble-staging/production-rollback/before-1.0.0-20261025-231249/`. This contains the prior build outputs and version/configuration documentation; it is not a user-data backup.
- Local logs: `.nibble-test/release-1.0.0/`, including `staging-verification.log`, `production-build.log`, `installer-package-retry.log`, `package-verification-final.log` and `desktop-smoke.log`. These generated logs are excluded from Git.

## Finish publishing

The public repository was read in the browser. Its `main` branch contained only README.md and LICENSE at initial commit `02a18c51f91e037ca9fab5b70e2153b925f93be4`, with no tags or releases. A dedicated local Nibble repository was initialized to avoid using the parent folder's repository. Adding `origin` failed because this session cannot write `.git/config`; Git network lookup also failed with `getaddrinfo() thread failed to start`. The browser was signed out. The declined GitHub plugin was not used.

From a normal Windows session, run **`Publish-Nibble-1.0.0.cmd`** in the project folder. Git, Node and working GitHub authentication are required. The launcher:

1. Verifies the prepared source, normalizing text line endings, against `scripts/release-1.0.0-files.json` and refuses changed files.
2. Adds the intended origin only if none exists; conflicting remotes stop the operation.
3. Preserves the observed bootstrap commit and Apache license. Changed remote history or unrelated local history stops publication for review.
4. Stages only the prepared source, commits `Release Nibble v1.0.0`, creates annotated tag `v1.0.0`, and atomically pushes main and the tag without force-pushing.
5. Verifies the remote commit and tag, then records a local receipt under `.nibble-runtime/`.

`node scripts/publish-1.0.0.mjs --check` validates the source manifest without changing Git state. The 153 source files plus the generated manifest were checked for common token/private-key patterns and absolute Windows user paths; none were found. The source inventory excludes generated outputs and private data. This scan is not a guarantee that every possible secret format can be detected. End-to-end authenticated publication could not be exercised in this session. The launcher publishes source and the tag; it does not upload binaries or create a GitHub Release entry.

To finish installer acceptance outside this session, run `npm run package:win`, then `npm run test:package`, launch/install the resulting build and exercise the native workflows above. Generated binaries, staging/user data, credentials and local agent settings are excluded from the source publication.

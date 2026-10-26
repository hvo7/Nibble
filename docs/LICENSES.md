# Cost, dependency, and model policy

Nibble requires no paid plan or recurring hosted service. The app must not embed paid AI API credentials, enable billing, auto-purchase credits, or silently switch to cloud inference. Local compute, disk, bandwidth, and electricity are still required.

## Core software

| Component | Role | Upstream license / notes |
| --- | --- | --- |
| Electron | Desktop runtime | MIT; preserve Electron/Chromium bundled third-party notices |
| React / React DOM | Interface | MIT |
| TypeScript | Type checking | Apache-2.0 |
| Vite / Vitest | Build / tests | MIT |
| esbuild | Desktop bundling | MIT |
| parse5 | HTML parsing | MIT |
| ipaddr.js | Address validation | MIT |
| Zod | Boundary validation | MIT |
| SQLite | Persistent storage through Node | Public domain; Node distributions include their own notices |
| Tesseract.js / Tesseract | Local OCR | Apache-2.0; preserve engine/language-data notices |
| electron-builder | Installer tooling | MIT |
| sharp | Development-only SVG icon rasterization | Apache-2.0; preserve libvips and native-package notices when distributing the tooling |

The exact installed versions are recorded in package-lock.json. `npm run licenses` writes an inventory of installed package declarations, including transitive dependencies. It is an inventory, not a substitute for preserving full license/NOTICE files.

## Optional software and data

English screenshot OCR data is included in 0.2.0: `@tesseract.js-data/eng@1.0.0`, variants `4.0.0_best_int` and `4.0.0`. Source: https://github.com/naptha/tessdata; upstream data: https://github.com/tesseract-ocr/tessdata. The unmodified models are licensed Apache-2.0. The full upstream license is preserved in `docs/third-party/tesseract-language-data-LICENSE.txt` and copied beside the packaged models. Exact hashes and variants are in `resources/ocr/models.json`. Screenshot pixels are processed locally.

- **Ollama local runtime:** MIT runtime; model licenses are separate. Users install a local model themselves. No model is redistributed by this project. Before bundling any model, record the exact model name, revision, source, license text, attribution, usage restrictions, and required notices.
- **faster-whisper:** MIT. Whisper weights/code are separately documented upstream; CTranslate2, PyAV/FFmpeg, and Python wheels have their own notices. Do not imply all transitive wheels have an identical license.
- **FFmpeg:** LGPL-2.1-or-later by default, but enabling GPL components changes the build's license, and nonfree configurations may not be redistributable. This project invokes a user-installed binary and does not bundle it. Review the precise build/configuration before redistribution.
- **USDA FoodData Central:** publicly available data under CC0. Attribution: “U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov.” API users need their own key and must observe rate limits.

Primary references checked for this build:

- https://www.electronjs.org/docs/latest/tutorial/security
- https://github.com/naptha/tesseract.js
- https://github.com/SYSTRAN/faster-whisper
- https://ffmpeg.org/legal.html
- https://ollama.com/pricing
- https://fdc.nal.usda.gov/api-guide/

## Distribution gate

Before a public release, generate the dependency inventory, preserve all upstream license/NOTICE files, inspect exact model and binary licenses, and perform a dependency security review against the final lockfile. No paid code-signing service is required for local testing; unsigned Windows builds may trigger publisher/reputation prompts.

The project owner should choose a license for Nibble's original source before public redistribution. This document does not assign one on their behalf.

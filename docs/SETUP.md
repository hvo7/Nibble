# Setup and optional free tools

## Desktop app

1. Install Node.js 24 LTS from https://nodejs.org/.
2. In this project folder run `npm ci`, then `npm run dev`.
3. Create a local profile. This is a device-local organizer, not an authenticated online account.
4. Use **Write a recipe**, pasted text, or a public HTTPS website recipe immediately.
5. Open Settings to choose the processing tools you want.

The renderer intentionally does not simulate persistence in a regular web browser. Start Electron to use the app.

## Screenshot OCR

Enable **Read screenshots with local OCR** in Settings. Tesseract.js and its WASM runtime are app dependencies. On the first OCR run, the worker fetches the English trained-data file and caches it locally. The approximate 10–20 MB download depends on the upstream model. No screenshot is sent to an AI service.

Use Choose files, drag/drop images, or Ctrl+V. Multiple images are processed in the displayed order. Crop unrelated comments and navigation first. Exact repeated lines across screenshots are deduplicated; different amounts remain for review.

## Local recipe organization with Ollama

1. Install/start the free local Ollama app: https://ollama.com/download.
2. Install a local, appropriately licensed model. Start with a small instruction model (roughly 1.5B–3B parameters) for typical laptops.
3. Review that exact model's model card/license before distribution. Nibble does not bundle or silently download a model.
4. In Settings click **Check tools**, select the installed local model, and enable local AI.

Nibble talks only to `127.0.0.1:11434`; there is no hosted AI provider selection. Remote/cloud-tagged models are excluded. A local model typically takes roughly 1–3 GB for this size class, with substantial RAM overhead. Larger models need more memory. CPU processing can be slow. Model output remains a reviewable suggestion; no model output executes code.

## Local video transcription

Use a Python version supported by the installed faster-whisper/CTranslate2 wheels. Python 3.11 or 3.12 is a conservative setup choice. A newer Python install alone does not guarantee wheel availability.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r workers/requirements.txt
.\.venv\Scripts\python.exe workers/setup_transcription.py --model tiny
```

The last command explicitly downloads a model. Tiny is roughly 75 MB, base roughly 145 MB, and small roughly 500 MB; actual converted-model files and caches vary. The runtime worker uses `local_files_only=True` and does not silently download missing models.

Install an appropriate FFmpeg build from https://ffmpeg.org/download.html and review its license/configuration. In Settings enter the absolute paths of your Python executable and `ffmpeg.exe`. Save, check tools, and enable video processing. Shell commands are not accepted in these fields; supply one executable path only.

Videos are limited to 250 MB and 10 minutes. Frames are sampled every 15 seconds, at most 40 frames. Fast-changing overlays may be missed. Silent videos still need readable on-screen text or supplemental captions.

## Nutrition: USDA FoodData Central

1. Obtain your own free API key at https://fdc.nal.usda.gov/api-key-signup.
2. Save it in Settings. Nibble encrypts the key using Electron safeStorage, backed by the operating system.
3. Open a recipe's Nutrition tab, search for an ingredient, and confirm the appropriate food record and edible gram weight.

The default documented limit is 1,000 requests/hour/IP. Nibble handles rate limits without purchasing an upgrade. Confirmed food details are cached. Search and uncached records need connectivity.

Use raw vs cooked records deliberately. A source volume is not silently converted to grams. Select a USDA portion or enter a measured weight. Unknown nutrients and unmatched ingredients produce a partial estimate. Manual/source nutrition remains separate, with an explicit basis.

## Development isolation

For automated smoke tests set `NIBBLE_DATA_DIR` to a temporary directory before launching Electron. This override is ignored in packaged builds. User data normally lives under Electron's platform-specific userData directory, usually `%APPDATA%/nibble` for this development package.

Keep API keys, personal backups, original media, model caches, and SQLite databases out of source control. No developer API key belongs in the installer.

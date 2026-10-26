import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createWorker } from 'tesseract.js';
import { app, nativeImage } from 'electron';
import { blankRecipe, type Evidence, type ImportJob, type ImportRequest } from '../src/shared/model';
import { dedupeEvidenceTexts } from '../src/shared/recipe';
import { parseRecipeSources } from '../src/shared/text-parser';
import { singleImportDraft, importTitleHint } from '../src/shared/import-draft';
import { recognizeRecipeImage, withAbort, ocrScale, ocrCrop, readFocusedRegion, type ReadOcrRegion } from '../src/shared/ocr-result';
import { Store } from './database';
import { MediaStore } from './media';
import { fetchPublic, fetchPublicImage } from './network';
import type { WebsiteImage } from './website-images';
import { extractWebsite, organizeLocal } from './extraction';
import { localOcrOptions } from './ocr-model';
import { extractBrowserCapture } from './browser-capture';

/** Spawn executable + argv directly; user content never becomes a shell command. */
export function runTool(executable: string, args: string[], signal?: AbortSignal, timeout = 120000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, signal });
    let output = ''; let error = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Processing timed out. Try a shorter video.')); }, timeout);
    child.stdout.on('data', data => { output += data; if (output.length > 2000000) { child.kill(); reject(new Error('Processor output exceeded the safe limit.')); } });
    child.stderr.on('data', data => { error = (error + data).slice(-3000); });
    child.on('error', cause => { clearTimeout(timer); reject(cause); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error(error || 'The local processing tool could not run. Check Settings.')); });
  });
}

export class ImportService {
  private running = new Map<string, AbortController>();
  constructor(private store: Store, private media: MediaStore, private notify: () => void) {}
  start(request: ImportRequest): string {
    if (request.browserCapture) request = { ...request, url: request.browserCapture.url };
    this.store.assertProfile(request.profileId);
    if (this.running.size >= 1) throw new Error('Finish or cancel the current import first.');
    if (!request.url.trim() && !request.text.trim() && !request.assetIds.length && !request.browserCapture) throw new Error('Add a link, some text, a browser recipe file, or media first.');
    request.assetIds.forEach(id => this.store.asset(id, request.profileId));
    const now = new Date().toISOString();
    const job: ImportJob = { id: randomUUID(), profileId: request.profileId, status: 'running', stage: 'Preparing import', error: '', createdAt: now, updatedAt: now, drafts: [], request };
    this.store.saveJob(job);
    const controller = new AbortController(); this.running.set(job.id, controller);
    void this.process(job, controller.signal); return job.id;
  }
  cancel(id: string) { this.running.get(id)?.abort(); }
  cancelAll() { this.running.forEach(controller => controller.abort()); }
  private async process(job: ImportJob, signal: AbortSignal) {
    const settings = this.store.settings();
    const evidence: Evidence[] = [];
    const notes: string[] = [];
    let websiteImages: Record<string, WebsiteImage[]> = {};
    let recipes = [] as ReturnType<typeof blankRecipe>[];
    let ocr: Awaited<ReturnType<typeof createWorker>> | undefined;
    let numbers: Awaited<ReturnType<typeof createWorker>> | undefined;
    const tempDir = path.join(this.store.directory, 'processing', job.id);
    mkdirSync(tempDir, { recursive: true });
    mkdirSync(path.join(this.store.directory, 'ocr-cache'), { recursive: true });
    const stage = (message: string) => { signal.throwIfAborted(); job.stage = message; this.store.saveJob(job); this.notify(); };
    const readImage = async (file: string) => {
      const readingSignal = AbortSignal.any([signal, AbortSignal.timeout(120000)]);
      // Installed releases always read their bundled models; no first-run CDN dependency.
      const languageRoot = app.isPackaged ? path.join(process.resourcesPath, 'ocr')
        : process.env.NIBBLE_CHANNEL === 'staging' ? path.resolve(app.getAppPath(), '..', 'ocr-assets')
        : path.join(app.getAppPath(), 'dist-electron', 'ocr');
      if (!ocr) {
        const cache = path.join(this.store.directory, 'ocr-cache', 'eng-1.0.0-text'); mkdirSync(cache, { recursive: true });
        const loading = createWorker('eng', 1, localOcrOptions(languageRoot, cache));
        void loading.then(created => { if (readingSignal.aborted) return created.terminate(); }).catch(() => {});
        ocr = await withAbort(loading, readingSignal);
        signal.throwIfAborted();
      }
      const image = nativeImage.createFromPath(file), size = image.getSize();
      if (image.isEmpty() || size.width * size.height > 40000000) throw new Error('Use a readable image under 40 megapixels.');
      const scale = ocrScale(size.width, size.height), enlarged = image.resize({ width: Math.round(size.width * scale), height: Math.round(size.height * scale), quality: 'best' });
      const dimensions = enlarged.getSize();
      const readRegion: ReadOcrRegion = async (box, kind) => {
        if (!numbers) {
          const cache = path.join(this.store.directory, 'ocr-cache', 'eng-1.0.0-numbers'); mkdirSync(cache, { recursive: true });
          const loading = createWorker('eng', 0, localOcrOptions(path.join(languageRoot, 'numbers'), cache));
          void loading.then(created => { if (readingSignal.aborted) return created.terminate(); }).catch(() => {});
          numbers = await withAbort(loading, readingSignal);
        }
        const crop = enlarged.crop(ocrCrop(box, dimensions.width, dimensions.height));
        return readFocusedRegion(numbers, height => crop.resize({ height, quality: 'best' }).toPNG(), kind, readingSignal);
      };
      return recognizeRecipeImage(ocr, enlarged.toPNG(), dimensions.width, dimensions.height, readingSignal, readRegion);
    };
    const cancelOcr = () => { void ocr?.terminate().catch(() => {}); void numbers?.terminate().catch(() => {}); };
    signal.addEventListener('abort', cancelOcr, { once: true });
    const persistEvidence = () => {
      if (recipes.length) { job.drafts = singleImportDraft(recipes.map(recipe => ({ ...recipe, evidence: [...evidence] })), importTitleHint(job)); this.store.saveJob(job); this.notify(); return; }
      const partial = parseRecipeSources(evidence.filter(e => e.kind !== 'website'), job.profileId);
      partial.evidence = [...evidence]; partial.sourceUrl = job.request.url; job.drafts = [partial]; this.store.saveJob(job); this.notify();
    };
    try {
      const request = job.request;
      if (request.text.trim()) { evidence.push({ id: randomUUID(), kind: 'text', label: 'Pasted recipe text', text: request.text, assetId: null }); persistEvidence(); }
      if (request.browserCapture) {
        stage('Reading your saved browser recipe');
        const extracted = extractBrowserCapture(request.browserCapture, request.profileId);
        recipes = extracted.recipes; evidence.push(extracted.evidence);
        job.drafts = singleImportDraft(recipes, importTitleHint(job)); this.store.saveJob(job); this.notify();
      } else if (request.url.trim()) {
        stage('Reading recipe webpage');
        try {
          const page = await fetchPublic(request.url, signal);
          const extracted = extractWebsite(page.body, page.url, request.profileId);
          recipes = extracted.recipes; websiteImages = extracted.images; evidence.push(extracted.evidence);
          persistEvidence();
        } catch (error) { signal.throwIfAborted(); notes.push(`Can't import this link? Use Import from browser to read a page you opened, add screenshots of the ingredients and instructions, or upload the video. ${error instanceof Error ? error.message : ''}`); }
      }
      for (const id of request.assetIds) {
        signal.throwIfAborted();
        const asset = this.store.asset(id, request.profileId);
        if (asset.mime.startsWith('image/')) {
          const source: Evidence = { id: randomUUID(), kind: 'image', label: asset.name, text: '', assetId: id };
          evidence.push(source);
          persistEvidence();
          if (!(request.readImages ?? settings.ocrEnabled)) notes.push('Screenshot reading was turned off for this import. Images were attached as evidence only.');
          else {
            stage(`Reading screenshot ${request.assetIds.indexOf(id) + 1} of ${request.assetIds.length}: ${asset.name}`);
            try { Object.assign(source, await readImage(this.media.file(id))); }
            catch (error) {
              signal.throwIfAborted();
              source.ocr = { confidence: null, width: null, height: null, lines: [], error: `Could not read this image. ${error instanceof Error ? error.message : ''}`.slice(0, 2000) };
              notes.push(`${asset.name}: OCR failed. The original is retained; other screenshots will still be processed.`);
              await ocr?.terminate().catch(() => {}); ocr = undefined;
              await numbers?.terminate().catch(() => {}); numbers = undefined;
            }
          }
        } else {
          if (!settings.videoEnabled) { notes.push('Video processing is not enabled. Configure FFmpeg and Whisper in Settings.'); continue; }
          stage(`Transcribing audio: ${asset.name}`);
          const workerRoot = app.isPackaged ? process.resourcesPath : app.getAppPath();
          const output = await runTool(settings.pythonPath, [path.join(workerRoot, 'workers', 'transcribe.py'), '--file', this.media.file(id), '--model', settings.whisperModel], signal, 300000);
          const segments = JSON.parse(output) as { start: number; end: number; text: string }[];
          evidence.push({ id: randomUUID(), kind: 'transcript', label: asset.name, text: segments.map(s => `[${s.start.toFixed(1)}–${s.end.toFixed(1)}s] ${s.text}`).join('\n'), assetId: id });
          if (settings.ocrEnabled) {
            stage('Reading on-screen video instructions');
            const frameDir = path.join(tempDir, id); mkdirSync(frameDir, { recursive: true });
            await runTool(settings.ffmpegPath, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file,pipe', '-i', this.media.file(id), '-t', '600', '-vf', 'fps=1/15,scale=1280:-2', '-frames:v', '40', path.join(frameDir, 'frame-%03d.png')], signal);
            const texts: string[] = [];
            for (const frame of readdirSync(frameDir).sort()) { signal.throwIfAborted(); texts.push((await readImage(path.join(frameDir, frame))).text); }
            evidence.push({ id: randomUUID(), kind: 'frame', label: `${asset.name}: frames sampled every 15 seconds (first 10 minutes)`, text: dedupeEvidenceTexts(texts), assetId: id });
          }
        }
        // Persist partial evidence so a canceled or failed import can still be reviewed.
        persistEvidence();
      }
      const combined = dedupeEvidenceTexts(evidence.map(e => e.text));
      if (!recipes.length) {
        const manualEvidence = evidence.filter(e => e.kind !== 'website').map(e => e.text).join('\n');
        const eligibleText = request.url ? manualEvidence : combined;
        const sourceDraft = parseRecipeSources(evidence.filter(e => e.kind !== 'website'), request.profileId);
        if (sourceDraft.ingredients.length) recipes = [sourceDraft];
        if (!recipes.length && request.useAI && settings.useAI && eligibleText.trim()) {
          stage('Organizing recipe with your local model');
          try { recipes = await organizeLocal(eligibleText, request.profileId, settings.model, signal); }
          catch (error) { signal.throwIfAborted(); notes.push(`${error instanceof Error ? error.message : 'AI could not run.'} The original text is available for review.`); }
        }
        if (!recipes.length) {
          // Website prose and error pages must not become invented recipe ingredients.
          recipes = [parseRecipeSources(evidence.filter(e => e.kind !== 'website'), request.profileId)];
          if (request.url && !manualEvidence.trim()) notes.push('No recipe card or ingredient section was found. The page may require JavaScript or block imports. Paste the recipe text or add screenshots.');
        }
      } else if (request.assetIds.length || request.text.trim()) notes.push('Website fields were preserved. Review the additional evidence for corrections.');
      const platform = /(?:instagram\.com)/i.test(request.url) ? 'Instagram' : /(?:tiktok\.com)/i.test(request.url) ? 'TikTok' : request.url ? 'Website' : request.assetIds.length ? 'Upload' : 'Text';
      for (const recipe of recipes) {
        recipe.sourceUrl ||= request.url; recipe.platform = platform; recipe.evidence = evidence;
        recipe.coverId ??= request.assetIds.find(id => this.store.asset(id, request.profileId).mime.startsWith('image/')) ?? null;
        recipe.warnings = [...new Set([...recipe.warnings, ...notes])];
      }
      // Select the one main dish before downloading; related recipe images never
      // consume network/storage or become this dish's cover.
      job.drafts = singleImportDraft(recipes, importTitleHint(job));
      const draft = job.drafts[0];
      const photos = draft ? websiteImages[draft.id] ?? [] : [];
      if (photos.length) {
        stage('Choosing the dish photo');
        const photoSignal = AbortSignal.any([signal, AbortSignal.timeout(12000)]);
        let selected = false;
        for (const photo of photos.slice(0, 3)) {
          if (photoSignal.aborted) break;
          try {
            const downloaded = await fetchPublicImage(photo.url, photoSignal);
            photoSignal.throwIfAborted();
            const asset = this.media.addImage(downloaded.bytes, `${draft.title.slice(0,250)} - dish photo.png`, request.profileId, true);
            draft.coverId = asset.id;
            draft.evidence.push({ id: randomUUID(), kind: 'image', label: 'Dish photo from website', assetId: asset.id, text: '' });
            if (draft.websiteImport) draft.websiteImport.sources = [...draft.websiteImport.sources.slice(0,99), { field: 'Cover photo', method: photo.reason, raw: downloaded.url }];
            selected = true; this.store.saveJob(job); this.notify(); break;
          } catch { signal.throwIfAborted(); /* A blocked/missing photo must not lose a usable recipe. */ }
        }
        if (!selected) draft.warnings.push('The website photo could not be saved. You can choose a cover photo in Edit recipe.');
      }
      signal.throwIfAborted(); job.status = 'review';
      job.stage = job.drafts.some(recipe => recipe.ingredients.length) ? `${job.drafts[0].ingredients.length} ingredients extracted · review recipe` : 'No ingredients extracted · source needs attention';
    } catch (error) {
      job.status = signal.aborted ? 'canceled' : 'failed';
      job.stage = signal.aborted ? 'Import canceled' : 'Import needs attention';
      job.error = signal.aborted ? 'Any recovered evidence is available below. Saved recipes were not changed.' : error instanceof Error ? error.message : 'Import failed.';
    } finally {
      signal.removeEventListener('abort', cancelOcr);
      try { await ocr?.terminate(); } catch { /* Already canceled. */ }
      try { await numbers?.terminate(); } catch { /* Already canceled. */ }
      // This is a generated UUID directory under app-owned processing, never a user-supplied path.
      rmSync(tempDir, { recursive: true, force: true });
      this.running.delete(job.id); this.store.saveJob(job); this.notify();
    }
  }
}

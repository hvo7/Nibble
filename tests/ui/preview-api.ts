import type { NibbleApi } from '../../src/shared/api';
import { defaultSettings, importSchema, recipeSchema, settingsSchema, uid, type Asset, type Evidence, type ImportJob, type Recipe, type Snapshot } from '../../src/shared/model';
import { assertSourceReview, parseRecipeSources } from '../../src/shared/text-parser';
import { pendingWebsiteConflicts } from '../../src/shared/website-review';
import { createPreviewReader } from './preview-ocr';
import { extractBrowserCapture } from '../../electron/browser-capture';
import { browserCoverForRecipe } from '../../src/shared/browser-capture';
import { singleImportDraft, importTitleHint } from '../../src/shared/import-draft';

const desktopOnly = (feature: string): never => { throw new Error(`${feature} needs desktop staging. This browser preview cannot access desktop tools, API keys, or backups. Your preview edits remain here until you reload.`); };
const copy = <T,>(value: T): T => structuredClone(value);
type PreviewAsset = Asset & { profileId: string; dataUrl: string };

export function createPreviewApi(fixtures: Record<string, Recipe>) {
  const profileId = uid();
  const now = new Date().toISOString();
  const collectionId = uid(), groupId = uid(), tagId = uid();
  const recipes = Object.entries(fixtures).map(([scenario, source], index) => recipeSchema.parse({
    ...copy(source), id: uid(), profileId, title: index === 0 ? 'Carrot & ginger soup' : index === 1 ? 'Carrot soup · nutrition not supplied' : 'Carrot soup · servings to review',
    description: `Authored sample: ${scenario}. Try editing, organizing, or deleting this recipe.`,
    notes: 'Preview sample only. Nutrition values are illustrative, not a verified food record.',
    favorite: index === 0, totalMinutes: 35, collectionIds: [collectionId], tagIds: [tagId],
    createdAt: new Date(Date.now() - index * 86400000).toISOString(), updatedAt: now,
  }));
  const state: Snapshot = {
    profiles: [{ id: profileId, name: 'Preview kitchen', avatar: '', units: 'metric', createdAt: now }],
    recipes, collections: [{ id: collectionId, profileId, name: 'Weeknight favorites', favorite: true, coverId: null }],
    groups: [{ id: groupId, profileId, name: 'Meal type' }],
    tags: [{ id: tagId, profileId, groupId, name: 'Soup', color: '#A7B89A' }],
    jobs: [], settings: { ...defaultSettings }, hasUsdaKey: false,
  };
  const assets = new Map<string, PreviewAsset>();
  const listeners = new Set<() => void>();
  const running = new Map<string, AbortController>();
  const changed = () => listeners.forEach(callback => callback());
  const requireProfile = (id: string) => { if (!state.profiles.some(p => p.id === id)) throw new Error('Preview profile not found.'); };
  const requireAsset = (id: string, owner?: string) => {
    const asset = assets.get(id);
    if (!asset || (owner && asset.profileId !== owner)) throw new Error('This file is not available in this preview profile.');
    return asset;
  };
  function upsert<T extends { id: string }>(rows: T[], value: T) {
    const index = rows.findIndex(row => row.id === value.id);
    if (index < 0) rows.push(copy(value)); else rows[index] = copy(value);
  }
  function checkOwner<T extends { id: string; profileId: string }>(rows: T[], value: T) {
    requireProfile(value.profileId);
    const prior = rows.find(row => row.id === value.id);
    if (prior && prior.profileId !== value.profileId) throw new Error('Cannot move records between preview profiles.');
  }
  async function processImport(job: ImportJob, controller: AbortController) {
    const request = job.request, evidence: Evidence[] = [], notes: string[] = [];
    let reader: Awaited<ReturnType<typeof createPreviewReader>> | undefined;
    let readingIndex = 0;
    let browserRecipes: Recipe[] = [];
    const refreshDraft = () => {
      if (browserRecipes.length) { job.drafts = singleImportDraft(browserRecipes.map(recipe => ({ ...recipe, evidence: [...evidence], coverId: request.assetIds[0] ?? null, warnings: [...recipe.warnings, ...notes] })), importTitleHint(job)); job.updatedAt = new Date().toISOString(); changed(); return; }
      const draft = parseRecipeSources(evidence, request.profileId);
      draft.sourceUrl = request.url; draft.platform = request.assetIds.length ? 'Upload' : 'Text';
      draft.coverId = request.assetIds[0] ?? null;
      draft.warnings = [...draft.warnings, ...notes]; job.drafts = [draft]; job.updatedAt = new Date().toISOString(); changed();
    };
    try {
      if (request.text.trim()) evidence.push({ id: uid(), kind: 'text', label: 'Pasted recipe text', text: request.text, assetId: null });
      if (request.browserCapture) { const extracted = extractBrowserCapture(request.browserCapture, request.profileId); browserRecipes = extracted.recipes; evidence.push(extracted.evidence); }
      if (request.url && !request.browserCapture) notes.push('Source link retained but not fetched in this browser preview.');
      if (request.useAI) notes.push('Local AI was not run in this browser preview. Source-based parsing was used.');
      for (const [index, id] of request.assetIds.entries()) {
        readingIndex = index;
        controller.signal.throwIfAborted();
        const asset = requireAsset(id, request.profileId);
        const source: Evidence = { id: uid(), kind: 'image', label: asset.name, text: '', assetId: id };
        evidence.push(source); refreshDraft();
        if (request.readImages === false) { notes.push(`${asset.name}: attached only; screenshot reading was turned off.`); continue; }
        try {
          reader ??= await createPreviewReader(message => { if (!controller.signal.aborted) { job.stage = `Screenshot ${readingIndex + 1}/${request.assetIds.length} · ${message}`; changed(); } }, controller.signal);
          Object.assign(source, await reader.read(asset.dataUrl));
        } catch (error) {
          controller.signal.throwIfAborted();
          await reader?.close(); reader = undefined;
          source.ocr = { confidence: null, width: null, height: null, lines: [], error: `OCR could not read this image. ${error instanceof Error ? error.message : ''}`.slice(0, 2000) };
          notes.push(`${asset.name}: reading failed. The original is preserved; correct its text or retry the import.`);
        }
        refreshDraft();
      }
      controller.signal.throwIfAborted(); refreshDraft();
      const draft = job.drafts[0];
      if (draft && request.browserCapture?.version === 2) {
        const capture = request.browserCapture, photo = browserCoverForRecipe(capture, draft);
        if (capture.photoNote) draft.warnings.push(capture.photoNote);
        if (photo) {
          try {
            const asset = await api.addImage(request.profileId, draft.title.slice(0, 250) + ' - browser dish photo.jpg', Uint8Array.from(atob(photo.data), c => c.charCodeAt(0)).buffer, true);
            controller.signal.throwIfAborted(); draft.coverId = asset.id;
            draft.evidence.push({ id: uid(), kind: 'image', label: 'Dish photo saved by browser companion', text: '', assetId: asset.id });
            if (draft.websiteImport) draft.websiteImport.sources = [...draft.websiteImport.sources.slice(0, 99), { field: 'Cover photo', method: photo.reason, raw: photo.sourceUrl }];
          } catch { controller.signal.throwIfAborted(); draft.warnings.push('The saved dish photo could not be read. Paste or choose another cover photo.'); }
        } else if (capture.coverPhoto) draft.warnings.push('The saved photo belongs to a different recipe record. Choose a cover photo for this dish.');
      }
      const count = job.drafts.reduce((sum, draft) => sum + draft.ingredients.length, 0);
      job.status = 'review'; job.stage = count ? `${count} ingredients extracted · review recipe` : 'No ingredients extracted · source needs attention';
    } catch (error) {
      refreshDraft(); job.status = controller.signal.aborted ? 'canceled' : 'failed'; job.stage = controller.signal.aborted ? 'Import canceled · recovered sources kept' : 'Import needs attention';
      job.error = controller.signal.aborted ? 'Recovered text and images are available for review.' : error instanceof Error ? error.message : 'Import failed.';
    } finally { await reader?.close(); running.delete(job.id); changed(); }
  }
  const api: NibbleApi = {
    async snapshot() { return copy(state); },
    onChange(callback) { listeners.add(callback); return () => { listeners.delete(callback); }; },
    async saveProfile(profile) {
      if (!profile.name.trim() || profile.name.length > 80) throw new Error('Enter a profile name of 1–80 characters.');
      upsert(state.profiles, { ...profile, name: profile.name.trim() }); changed();
    },
    async saveRecipe(input) {
      const recipe = recipeSchema.parse({ ...input, title: input.title.trim() }); checkOwner(state.recipes, recipe);
      assertSourceReview(recipe);
      const prior = state.recipes.find(r => r.id === recipe.id);
      if (prior && prior.revision !== recipe.revision) throw new Error('This recipe changed. Reopen it before saving.');
      if (!recipe.deletedAt && recipe.status === 'ready' && pendingWebsiteConflicts(recipe)) throw new Error('Resolve the source conflicts before marking Ready to Cook.');
      if (recipe.tagIds.some(id => !state.tags.some(t => t.id === id && t.profileId === recipe.profileId)) || recipe.collectionIds.some(id => !state.collections.some(c => c.id === id && c.profileId === recipe.profileId))) throw new Error('Choose tags and collections from this profile.');
      if (recipe.coverId) requireAsset(recipe.coverId, recipe.profileId);
      const saved = { ...recipe, revision: recipe.revision + 1, updatedAt: new Date().toISOString() };
      upsert(state.recipes, saved); changed(); return copy(saved);
    },
    async saveCollection(value) { checkOwner(state.collections, value); if (value.coverId) requireAsset(value.coverId, value.profileId); upsert(state.collections, value); changed(); },
    async deleteCollection(id) { state.collections = state.collections.filter(c => c.id !== id); state.recipes.forEach(r => { r.collectionIds = r.collectionIds.filter(c => c !== id); }); changed(); },
    async saveGroup(value) { checkOwner(state.groups, value); upsert(state.groups, value); changed(); },
    async saveTag(value) { checkOwner(state.tags, value); if (!state.groups.some(g => g.id === value.groupId && g.profileId === value.profileId)) throw new Error('Choose a group from this profile.'); upsert(state.tags, value); changed(); },
    async deleteTag(id) { state.tags = state.tags.filter(t => t.id !== id); state.recipes.forEach(r => { r.tagIds = r.tagIds.filter(t => t !== id); }); changed(); },
    async saveSettings(value) { state.settings = settingsSchema.parse(value); changed(); },
    async setUsdaKey() { desktopOnly('Saving a USDA key'); },
    async capabilities() { return desktopOnly('Checking installed tools'); },
    async selectMedia(owner) {
      requireProfile(owner);
      const files = await new Promise<File[]>(resolve => {
        const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp'; input.multiple = true;
        input.hidden = true; document.body.append(input);
        input.onchange = () => { const files = Array.from(input.files ?? []); input.remove(); resolve(files); };
        input.oncancel = () => { input.remove(); resolve([]); }; input.click();
      });
      if (files.length > 20) throw new Error('Choose up to 20 images.');
      if (files.some(f => f.size > 20 * 1024 * 1024)) throw new Error('Each image must be smaller than 20 MB.');
      const result: Asset[] = [];
      for (const file of files) result.push(await api.addImage(owner, file.name, await file.arrayBuffer()));
      return result;
    },
    async addImage(owner, name, bytes, cover) {
      requireProfile(owner);
      if (cover && bytes.byteLength > 8 * 1024 * 1024) throw new Error('Choose a photo smaller than 8 MB.');
      if (bytes.byteLength > 20 * 1024 * 1024) throw new Error('Images must be smaller than 20 MB.');
      const head = new Uint8Array(bytes);
      const mime = head[0] === 137 && head[1] === 80 && head[2] === 78 && head[3] === 71 ? 'image/png' : head[0] === 255 && head[1] === 216 && head[2] === 255 ? 'image/jpeg' : String.fromCharCode(...head.slice(0, 4)) === 'RIFF' && String.fromCharCode(...head.slice(8, 12)) === 'WEBP' ? 'image/webp' : '';
      if (!mime) throw new Error('Choose a PNG, JPG, or WebP image.');
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not read this image.')); reader.readAsDataURL(new Blob([bytes], { type: mime }));
      });
      const asset = { id: uid(), name: name.slice(0, 500), size: bytes.byteLength, mime };
      assets.set(asset.id, { ...asset, profileId: owner, dataUrl }); return asset;
    },
    async asset(id) { const { profileId: _owner, dataUrl: _url, ...asset } = requireAsset(id); return asset; },
    async startImport(input) {
      const request = importSchema.parse(input); requireProfile(request.profileId);
      if (running.size) throw new Error('Finish or cancel the current import first.');
      if (request.browserCapture) request.url = request.browserCapture.url;
      if (!request.text.trim() && !request.assetIds.length && !request.browserCapture) desktopOnly('Fetching recipe and social links');
      request.assetIds.forEach(id => requireAsset(id, request.profileId));
      const id = uid(), timestamp = new Date().toISOString();
      const job: ImportJob = { id, profileId: request.profileId, status: 'running', stage: 'Reading recipe sources', error: '', createdAt: timestamp, updatedAt: timestamp, drafts: [], request };
      state.jobs.push(job); const controller = new AbortController(); running.set(id, controller);
      changed(); void processImport(job, controller); return id;
    },
    async cancelImport(id) { running.get(id)?.abort(); },
    async searchFoods() { return desktopOnly('Live USDA food search'); },
    async getFood() { return desktopOnly('Live USDA food records'); },
    async exportRecipe(recipe) {
      const blob = new Blob([JSON.stringify(recipeSchema.parse(recipe), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = 'nibble-preview-recipe.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return true;
    },
    async backup() { return desktopOnly('Desktop backup export'); },
    async restore() { return desktopOnly('Desktop backup restore'); },
    async removeMedia(owner) {
      requireProfile(owner); let removed = 0;
      const covers = new Set([...state.recipes.map(r => r.coverId), ...state.collections.map(c => c.coverId)]);
      for (const [id, asset] of assets) if (asset.profileId === owner && !covers.has(id)) { assets.delete(id); removed++; }
      changed(); return removed;
    },
    async openBrowserCompanion() { const link = document.createElement('a'); link.href = '/nibble-browser-companion.zip'; link.download = 'nibble-browser-companion.zip'; document.body.append(link); link.click(); link.remove(); },
    async printRecipe() { desktopOnly('Desktop recipe printing'); },
    async openLink(value) { const url = new URL(value); if (url.protocol !== 'https:') throw new Error('Only HTTPS links can be opened.'); window.open(url.href, '_blank', 'noopener,noreferrer'); },
  };
  return { api, mediaUrl: (id: string) => assets.get(id)?.dataUrl ?? '', profileId };
}

import { describe, expect, it, vi } from 'vitest';
import { createPreviewApi } from './ui/preview-api';
import { blankRecipe, defaultSettings, uid } from '../src/shared/model';
import { savedBrowserRecipe } from './fixtures/browser-capture';

describe('isolated full-app browser preview', () => {
  it('parses saved browser files in the preview with source review and no website request', async () => {
    const { api, profileId } = createPreviewApi({});
    const id = await api.startImport({ profileId, text: '', url: '', assetIds: [], useAI: false, browserCapture: savedBrowserRecipe() });
    const job = (await api.snapshot()).jobs.find(j => j.id === id)!;
    expect(job.status).toBe('review'); expect(job.drafts[0].ingredients).toHaveLength(17);
    expect(job.drafts[0].sourceReview?.confirmed).toBe(false);
    expect(job.drafts[0].warnings.join(' ')).not.toContain('not fetched');
    await expect(api.saveRecipe({ ...job.drafts[0], status: 'ready' })).rejects.toThrow('Check');
  });
  it('supports edit, favorite, trash, and restore without mutating source fixtures or snapshots', async () => {
    const source = blankRecipe(uid());
    const { api } = createPreviewApi({ sample: source });
    const snapshot = await api.snapshot(), recipe = snapshot.recipes[0];
    snapshot.profiles[0].name = 'outside mutation';
    const saved = await api.saveRecipe({ ...recipe, title: 'My edited soup', favorite: false });
    const trashed = await api.saveRecipe({ ...saved, deletedAt: new Date().toISOString() });
    await api.saveRecipe({ ...trashed, deletedAt: null });
    const result = await api.snapshot();
    expect(result.recipes[0]).toMatchObject({ title: 'My edited soup', favorite: false, deletedAt: null, revision: 3, sourceNutrition: null });
    expect(result.profiles[0].name).toBe('Preview kitchen');
    expect(source.title).toBe('Untitled recipe');
    await expect(api.saveRecipe(saved)).rejects.toThrow('changed');
  });
  it('enforces profile ownership, removes dangling organization links, and notifies subscribers', async () => {
    const { api } = createPreviewApi({ sample: blankRecipe(uid()) });
    const changed = vi.fn(), stop = api.onChange(changed);
    const initial = await api.snapshot(), other = { ...initial.profiles[0], id: uid(), name: 'Other kitchen' };
    await api.saveProfile(other);
    await expect(api.saveRecipe({ ...initial.recipes[0], profileId: other.id })).rejects.toThrow('between');
    await api.deleteTag(initial.tags[0].id); await api.deleteCollection(initial.collections[0].id);
    expect((await api.snapshot()).recipes[0]).toMatchObject({ tagIds: [], collectionIds: [] });
    stop(); await api.saveSettings(defaultSettings); expect(changed).toHaveBeenCalledTimes(3);
  });
  it('imports real pasted text and preserves it as evidence, without claiming to fetch links or read images', async () => {
    const { api, profileId } = createPreviewApi({});
    const text = 'Test soup\nServes 4\nIngredients\n200 g carrots\n750 ml stock\nInstructions\n1. Simmer until tender.';
    const id = await api.startImport({ profileId, text, url: 'https://example.com/soup', assetIds: [], useAI: true });
    const job = (await api.snapshot()).jobs.find(j => j.id === id)!;
    expect(job.drafts[0].ingredients).toHaveLength(2);
    expect(job.drafts[0].servings).toBe(4);
    expect(job.drafts[0].evidence[0].text).toBe(text);
    expect(job.drafts[0].sourceNutrition).toBeNull();
    expect(job.drafts[0].warnings.join(' ')).toContain('not fetched');
    expect(job.drafts[0].warnings.join(' ')).toContain('AI was not run');
    await api.saveRecipe(job.drafts[0]);
    expect((await api.snapshot()).recipes[0].title).toBe('Test soup');
  });
  it('rejects unavailable desktop actions without storing a key or creating a fake successful import', async () => {
    const { api, profileId } = createPreviewApi({});
    await expect(api.setUsdaKey('test-placeholder')).rejects.toThrow('desktop staging');
    await expect(api.startImport({ profileId, text: '', url: 'https://example.com', assetIds: [], useAI: false })).rejects.toThrow('desktop staging');
    await expect(api.backup()).rejects.toThrow('desktop staging');
    expect((await api.snapshot()).hasUsdaKey).toBe(false);
    expect((await api.snapshot()).jobs).toEqual([]);
  });
  it('keeps source conflicts unresolved until reviewed and rejects missing or non-image uploads', async () => {
    const { api, profileId } = createPreviewApi({});
    const recipe = blankRecipe(profileId);
    recipe.websiteImport = { method: 'test', sources: [], conflicts: [{ id: uid(), field: 'servings', message: '4 or 6', resolved: false, choices: [] }] };
    const pending = await api.saveRecipe(recipe);
    expect(pending.websiteImport?.conflicts[0].resolved).toBe(false);
    await expect(api.saveRecipe({ ...pending, status: 'ready' })).rejects.toThrow('Resolve');
    await expect(api.startImport({ profileId, text: 'Soup', url: '', assetIds: [uid()], useAI: false })).rejects.toThrow('file');
    await expect(api.addImage(profileId, 'fake.png', new TextEncoder().encode('<script>bad</script>').buffer)).rejects.toThrow('PNG');
  });
});

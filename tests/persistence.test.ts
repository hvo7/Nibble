import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Store } from '../electron/database';
import { blankRecipe, uid, type ImportJob } from '../src/shared/model';
import { extractWebsite } from '../electron/website';
import { conflictHtml } from './fixtures/website';
import { resolveWebsiteConflict } from '../src/shared/website-review';

let directory: string; let store: Store; let profileId: string;
beforeEach(async () => { directory = mkdtempSync(path.join(os.tmpdir(), 'nibble-test-')); store = new Store(directory); await store.open(); profileId = uid(); store.saveProfile({ id: profileId, name: 'Test kitchen', units: 'metric', avatar: '', createdAt: new Date().toISOString() }); });
afterEach(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
describe('Transactional persistence', () => {
  it('saves conflicted drafts, requires review before ready and preserves provenance across restart', async () => {
    const draft = extractWebsite(conflictHtml, 'https://example.com', profileId).recipes[0];
    const pending = store.saveRecipe(draft);
    expect(pending.status).toBe('review');
    expect(() => store.saveRecipe({ ...pending, status: 'ready' })).toThrow();
    const reviewed = resolveWebsiteConflict(pending, draft.websiteImport!.conflicts[0].id, '4');
    const saved = store.saveRecipe(reviewed); store.close(); store = new Store(directory); await store.open();
    expect(store.snapshot().recipes[0]).toEqual(saved);
  });
  it('loads pre-upgrade records without a destructive database migration', () => {
    const legacy = { ...blankRecipe(profileId) } as Record<string, unknown>;
    delete legacy.websiteImport; delete legacy.servingSize; delete legacy.yieldText;
    const saved = store.saveRecipe(legacy as never);
    store.rows('UPDATE recipes SET data = ? WHERE id = ?', [JSON.stringify({ ...legacy, revision: saved.revision }), saved.id]);
    const loaded = store.snapshot().recipes[0];
    expect(loaded.websiteImport).toBeNull(); expect(loaded.servingSize).toBe('');
  });
  it('survives restart and keeps relationship deletions from removing recipes', async () => {
    const snapshot = store.snapshot(); const recipe = blankRecipe(profileId); recipe.title = 'Soup'; recipe.favorite = true;
    recipe.collectionIds = snapshot.collections.slice(0, 2).map(c => c.id); recipe.tagIds = snapshot.tags.slice(0, 2).map(t => t.id);
    store.saveRecipe(recipe); store.close(); store = new Store(directory); await store.open();
    expect(store.snapshot().recipes[0]).toMatchObject({ title: 'Soup', favorite: true, collectionIds: recipe.collectionIds, tagIds: recipe.tagIds });
    store.deleteCollection(recipe.collectionIds[0]); store.deleteTag(recipe.tagIds[0]);
    expect(store.snapshot().recipes).toHaveLength(1); expect(store.snapshot().recipes[0].collectionIds).toHaveLength(1); expect(store.snapshot().recipes[0].tagIds).toHaveLength(1);
  });
  it('rejects duplicate normalized tags and foreign profile relationships', () => {
    const tag = store.snapshot().tags[0];
    expect(() => store.saveTag({ ...tag, id: uid(), name: '  ' + tag.name.toUpperCase() + '  ' })).toThrow();
    const another = uid(); store.saveProfile({ id: another, name: 'Other', units: 'us', avatar: '', createdAt: '' });
    expect(() => store.saveRecipe({ ...blankRecipe(another), tagIds: [tag.id] })).toThrow('another profile');
    expect(store.snapshot().recipes).toHaveLength(0);
  });
  it('rejects stale drafts instead of overwriting user corrections', () => {
    const saved = store.saveRecipe(blankRecipe(profileId));
    store.saveRecipe({ ...saved, title: 'My corrected title' });
    expect(() => store.saveRecipe({ ...saved, title: 'Old import title' })).toThrow('changed');
    expect(store.snapshot().recipes[0].title).toBe('My corrected title');
  });
  it('recovers interrupted imports without modifying recipes', async () => {
    const recipe = store.saveRecipe(blankRecipe(profileId));
    const job: ImportJob = { id: uid(), profileId, status: 'running', stage: 'Reading screenshots', error: '', createdAt: '', updatedAt: '', drafts: [recipe], request: { profileId, text: 'Soup', url: '', assetIds: [], useAI: false } };
    store.saveJob(job); store.close(); store = new Store(directory); await store.open();
    expect(store.snapshot().jobs[0].status).toBe('failed'); expect(store.snapshot().jobs[0].drafts).toHaveLength(1);
    expect(store.snapshot().recipes[0]).toEqual(recipe);
  });
  it('keeps deleted recipes recoverable across restart', async () => {
    store.saveRecipe({ ...blankRecipe(profileId), deletedAt: new Date().toISOString() });
    store.close(); store = new Store(directory); await store.open();
    const deleted = store.snapshot().recipes[0]; expect(deleted.deletedAt).not.toBeNull();
    store.saveRecipe({ ...deleted, deletedAt: null }); expect(store.snapshot().recipes[0].deletedAt).toBeNull();
  });
});

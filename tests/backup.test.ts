import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
vi.mock('electron', () => ({ nativeImage: {} }));
import { Store } from '../electron/database';
import { MediaStore } from '../electron/media';
import { createBackup, restoreBackup } from '../electron/backup';
import { blankRecipe, uid } from '../src/shared/model';
import { parseBodyText } from '../src/shared/text-parser';

let directory: string; let store: Store; let media: MediaStore; let profileId: string;
beforeEach(async () => { directory = mkdtempSync(path.join(os.tmpdir(), 'nibble-backup-')); store = new Store(directory); await store.open(); media = new MediaStore(store); profileId = uid(); store.saveProfile({ id: profileId, name: 'Kitchen', units: 'metric', avatar: '', createdAt: '' }); });
afterEach(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
describe('Backup and restore', () => {
  it('preserves images and relationships in new profiles without replacing originals', async () => {
    const imageId = uid(); const pixels = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU1kAAAAASUVORK5CYII=', 'base64');
    writeFileSync(media.file(imageId), pixels); store.addAsset({ id: imageId, name: 'cover.png', mime: 'image/png', size: pixels.length }, profileId);
    const recipe = blankRecipe(profileId); recipe.title = 'My soup'; recipe.coverId = imageId; recipe.tagIds = [store.snapshot().tags[0].id]; recipe.collectionIds = store.snapshot().collections.slice(0, 2).map(c => c.id);
    store.saveRecipe(recipe); store.setSetting('usdaKey', 'private-value');
    const backup = createBackup(store, media); expect(JSON.stringify(backup)).not.toContain('private-value');
    await restoreBackup(backup, store, media);
    const snapshot = store.snapshot(); expect(snapshot.profiles).toHaveLength(2); expect(snapshot.recipes).toHaveLength(2);
    const restored = snapshot.recipes.find(r => r.id !== recipe.id)!;
    expect(restored.title).toBe(recipe.title); expect(restored.collectionIds).toHaveLength(2); expect(restored.tagIds).toHaveLength(1); expect(restored.profileId).not.toBe(profileId);
    expect(readFileSync(media.file(restored.coverId!))).toEqual(pixels);
    expect(snapshot.collections.filter(c => restored.collectionIds.includes(c.id)).every(c => c.profileId === restored.profileId)).toBe(true);
  });
  it('rejects malformed relationships without partial restoration', async () => {
    store.saveRecipe(blankRecipe(profileId)); const backup = createBackup(store, media); backup.recipes[0].tagIds = [uid()];
    await expect(restoreBackup(backup, store, media)).rejects.toThrow('invalid tag relation');
    expect(store.snapshot().profiles).toHaveLength(1); expect(store.snapshot().recipes).toHaveLength(1); expect(readdirSync(media.directory)).toHaveLength(0);
  });
  it('preserves source links, corrected text, and review status through backup and restore', async () => {
    const recipe = parseBodyText('Soup\nIngredients\n200 g carrots\nInstructions\nSimmer.', profileId);
    recipe.evidence[0].originalText = 'Soup\nIngredients\n2OO g carrots\nInstructions\nSimmer.';
    store.saveRecipe(recipe); await restoreBackup(createBackup(store, media), store, media);
    const restored = store.snapshot().recipes.find(value => value.id !== recipe.id)!;
    expect(restored.sourceReview).toEqual(recipe.sourceReview);
    expect(restored.evidence[0].originalText).toContain('2OO');
    expect(restored.ingredients[0].sourceRefs?.[0].evidenceId).toBe(restored.evidence[0].id);
    expect(restored.evidence[0].text).toContain('200 g');
  });
});

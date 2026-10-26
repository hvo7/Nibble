import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { z } from 'zod';
import { recipeSchema } from '../src/shared/model';
import { Store } from './database';
import { MediaStore } from './media';

export const profileSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(80), units: z.enum(['metric', 'us']), avatar: z.string().max(10), createdAt: z.string().max(100) });
export const collectionSchema = z.object({ id: z.string().uuid(), profileId: z.string().uuid(), name: z.string().trim().min(1).max(80), favorite: z.boolean(), coverId: z.string().uuid().nullable() });
export const groupSchema = z.object({ id: z.string().uuid(), profileId: z.string().uuid(), name: z.string().trim().min(1).max(80) });
export const tagSchema = z.object({ id: z.string().uuid(), profileId: z.string().uuid(), groupId: z.string().uuid(), name: z.string().trim().min(1).max(80), color: z.string().regex(/^#[a-fA-F0-9]{6}$/) });
const backupSchema = z.object({
  format: z.literal('nibble-backup'), version: z.literal(1), createdAt: z.string(),
  profiles: z.array(profileSchema).max(100), recipes: z.array(recipeSchema).max(20000),
  collections: z.array(collectionSchema).max(5000), groups: z.array(groupSchema).max(1000), tags: z.array(tagSchema).max(20000),
  media: z.array(z.object({ id: z.string().uuid(), profileId: z.string().uuid(), name: z.string().max(300), mime: z.string().max(100), base64: z.string().max(350000000) })).max(20000),
});
export type Backup = z.infer<typeof backupSchema>;
export function createBackup(store: Store, media: MediaStore): Backup {
  const snapshot = store.snapshot();
  return { format: 'nibble-backup', version: 1, createdAt: new Date().toISOString(), profiles: snapshot.profiles, recipes: snapshot.recipes, collections: snapshot.collections, groups: snapshot.groups, tags: snapshot.tags, media: store.assetList().filter(a => media.exists(a.asset.id)).map(({ asset, profileId }) => ({ id: asset.id, profileId, name: asset.name, mime: asset.mime, base64: readFileSync(media.file(asset.id)).toString('base64') })) };
}

/** Restores as additional profiles, leaving every existing recipe intact. Remap all identities together. */
export async function restoreBackup(value: unknown, store: Store, media: MediaStore): Promise<void> {
  const data = backupSchema.parse(value);
  const maps = new Map<string, string>();
  const register = (id: string) => { if (maps.has(id)) throw new Error('Backup contains duplicate identifiers.'); maps.set(id, crypto.randomUUID()); };
  for (const item of [...data.profiles, ...data.recipes, ...data.collections, ...data.groups, ...data.tags, ...data.media]) register(item.id);
  const map = (id: string) => { const next = maps.get(id); if (!next) throw new Error('Backup contains a missing relationship.'); return next; };
  const profiles = new Set(data.profiles.map(p => p.id));
  const assets = new Map(data.media.map(m => [m.id, m]));
  for (const item of [...data.recipes, ...data.collections, ...data.groups, ...data.tags, ...data.media]) if (!profiles.has(item.profileId)) throw new Error('Backup has an invalid profile owner.');
  for (const tag of data.tags) if (!data.groups.some(g => g.id === tag.groupId && g.profileId === tag.profileId)) throw new Error('Backup has an invalid tag group.');
  for (const recipe of data.recipes) {
    for (const id of recipe.tagIds) if (!data.tags.some(t => t.id === id && t.profileId === recipe.profileId)) throw new Error('Backup has an invalid tag relation.');
    for (const id of recipe.collectionIds) if (!data.collections.some(c => c.id === id && c.profileId === recipe.profileId)) throw new Error('Backup has an invalid collection relation.');
    for (const id of [recipe.coverId, ...recipe.evidence.map(e => e.assetId)].filter(Boolean) as string[]) if (!assets.has(id) || assets.get(id)!.profileId !== recipe.profileId) throw new Error('Backup has missing recipe media.');
  }
  for (const collection of data.collections) if (collection.coverId && assets.get(collection.coverId)?.profileId !== collection.profileId) throw new Error('Backup has invalid collection media.');
  const written: string[] = [];
  try {
    for (const asset of data.media) {
      const buffer = Buffer.from(asset.base64, 'base64');
      if (buffer.length > 250 * 1024 * 1024) throw new Error('A backup media file exceeds the import size limit.');
      const file = media.file(map(asset.id)); if (existsSync(file)) throw new Error('Media identifier collision.');
      writeFileSync(file, buffer); written.push(file);
    }
    store.restoreData({
      profiles: data.profiles.map(p => ({ ...p, id: map(p.id), name: `${p.name.slice(0, 60)} (restored)` })),
      collections: data.collections.map(c => ({ ...c, id: map(c.id), profileId: map(c.profileId), coverId: c.coverId ? map(c.coverId) : null })),
      groups: data.groups.map(g => ({ ...g, id: map(g.id), profileId: map(g.profileId) })),
      tags: data.tags.map(t => ({ ...t, id: map(t.id), profileId: map(t.profileId), groupId: map(t.groupId) })),
      recipes: data.recipes.map(r => ({ ...r, id: map(r.id), profileId: map(r.profileId), coverId: r.coverId ? map(r.coverId) : null, evidence: r.evidence.map(e => ({ ...e, assetId: e.assetId ? map(e.assetId) : null })), tagIds: r.tagIds.map(map), collectionIds: r.collectionIds.map(map) })),
      media: data.media.map(a => ({ asset: { id: map(a.id), name: a.name, mime: a.mime, size: Buffer.from(a.base64, 'base64').length }, profileId: map(a.profileId) })),
    });
  } catch (error) { for (const file of written) unlinkSync(file); throw error; }
}

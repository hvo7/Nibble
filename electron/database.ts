import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { defaultSettings, recipeSchema, settingsSchema, type Asset, type Collection, type ImportJob, type Profile, type Recipe, type Settings, type Snapshot, type Tag, type TagGroup } from '../src/shared/model';
import { normalize } from '../src/shared/recipe';
import { pendingWebsiteConflicts } from '../src/shared/website-review';
import { assertSourceReview } from '../src/shared/text-parser';

class SqliteDriver {
  readonly native: DatabaseSync;
  constructor(file: string) { this.native = new DatabaseSync(file); }
  run(sql: string, parameters?: (string | number | null)[]) { if (parameters) this.native.prepare(sql).run(...parameters); else this.native.exec(sql); }
  close() { this.native.close(); }
}
const taxonomy: Record<string, string[]> = {
  Course: ['Appetizer', 'Main Course', 'Side Dish', 'Dessert', 'Snack', 'Drink'],
  'Food type': ['Vegetables', 'Chicken', 'Beef', 'Pork', 'Seafood', 'Pasta', 'Rice', 'Soup', 'Salad', 'Bread'],
  Meal: ['Breakfast', 'Brunch', 'Lunch', 'Dinner'],
  Cuisine: ['Italian', 'Mexican', 'Korean', 'Japanese', 'Chinese', 'Indian', 'Vietnamese', 'Other'],
  'Cooking method': ['Baked', 'Roasted', 'Grilled', 'Stovetop', 'Air Fryer', 'Slow Cooker', 'No-Cook'],
  Preferences: ['Vegetarian', 'Vegan', 'Dairy-Free', 'Gluten-Free'],
  'Practical use': ['Meal Prep', 'Quick & Easy', 'One-Pot', 'Budget-Friendly'],
};

/** SQLite via Electron's bundled Node runtime: no separate database service or native addon.
 * Transactions and SQLite's journal guarantee that a failed save cannot leave partial relationships.
 */
export class Store {
  private db!: SqliteDriver;
  readonly file: string;
  constructor(readonly directory: string) { this.file = path.join(directory, 'nibble.sqlite'); }
  async open() {
    mkdirSync(this.directory, { recursive: true });
    this.db = new SqliteDriver(this.file);
    this.db.run('PRAGMA foreign_keys = ON');
    const version = Number(this.rows('PRAGMA user_version')[0]?.user_version ?? 0);
    if (version > 1) throw new Error('This library needs a newer version of Nibble.');
    if (version === 0) this.transaction(() => {
      this.db.run(`
        CREATE TABLE profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL);
        CREATE TABLE recipes (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), data TEXT NOT NULL, fingerprint TEXT NOT NULL);
        CREATE TABLE tag_groups (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), name TEXT NOT NULL, normalized TEXT NOT NULL, UNIQUE(profile_id, normalized));
        CREATE TABLE tags (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), group_id TEXT NOT NULL REFERENCES tag_groups(id), name TEXT NOT NULL, normalized TEXT NOT NULL, color TEXT NOT NULL, UNIQUE(profile_id, group_id, normalized));
        CREATE TABLE collections (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), name TEXT NOT NULL, normalized TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(profile_id, normalized));
        CREATE TABLE recipe_tags (recipe_id TEXT REFERENCES recipes(id) ON DELETE CASCADE, tag_id TEXT REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(recipe_id, tag_id));
        CREATE TABLE recipe_collections (recipe_id TEXT REFERENCES recipes(id) ON DELETE CASCADE, collection_id TEXT REFERENCES collections(id) ON DELETE CASCADE, PRIMARY KEY(recipe_id, collection_id));
        CREATE TABLE assets (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), data TEXT NOT NULL);
        CREATE TABLE jobs (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), data TEXT NOT NULL);
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE food_cache (id INTEGER PRIMARY KEY, data TEXT NOT NULL);
        CREATE INDEX recipes_owner ON recipes(profile_id);
        PRAGMA user_version = 1;
      `);
    });
    // Interrupted jobs are recoverable evidence, never an indefinite spinner after restart.
    const interrupted = this.rows('SELECT data FROM jobs').map(row => JSON.parse(row.data as string) as ImportJob).filter(job => job.status === 'running');
    if (interrupted.length) this.transaction(() => { for (const job of interrupted) { job.status = 'failed'; job.error = 'Processing was interrupted. Retry to create a new draft; saved edits are preserved.'; this.putJobRaw(job); } });
  }
  rows(sql: string, params: (string | number | null)[] = []) {
    return this.db.native.prepare(sql).all(...params) as Record<string, unknown>[];
  }
  private transaction<T>(fn: () => T): T {
    this.db.run('BEGIN IMMEDIATE');
    try {
      const result = fn(); this.db.run('COMMIT');
      return result;
    } catch (error) {
      this.db.run('ROLLBACK'); throw error;
    }
  }
  getSetting(key: string): string | null { return this.rows('SELECT value FROM settings WHERE key = ?', [key])[0]?.value as string ?? null; }
  setSetting(key: string, value: string) { this.transaction(() => this.db.run('INSERT OR REPLACE INTO settings VALUES (?, ?)', [key, value])); }
  settings(): Settings { const saved = this.getSetting('app'); return saved ? settingsSchema.parse(JSON.parse(saved)) : defaultSettings; }
  assertProfile(id: string) { if (!this.rows('SELECT id FROM profiles WHERE id = ?', [id]).length) throw new Error('Profile not found.'); }
  snapshot(): Snapshot {
    const tags = this.rows('SELECT * FROM tags').map(t => ({ id: t.id, profileId: t.profile_id, groupId: t.group_id, name: t.name, color: t.color })) as Tag[];
    const groups = this.rows('SELECT * FROM tag_groups').map(t => ({ id: t.id, profileId: t.profile_id, name: t.name })) as TagGroup[];
    const recipes = this.rows('SELECT data FROM recipes').map(row => {
      const recipe = recipeSchema.parse(JSON.parse(row.data as string));
      const tagIds = new Set(this.rows('SELECT tag_id FROM recipe_tags WHERE recipe_id = ?', [recipe.id]).map(r => String(r.tag_id)));
      const collectionIds = new Set(this.rows('SELECT collection_id FROM recipe_collections WHERE recipe_id = ?', [recipe.id]).map(r => String(r.collection_id)));
      recipe.tagIds = recipe.tagIds.filter(id => tagIds.has(id));
      recipe.collectionIds = recipe.collectionIds.filter(id => collectionIds.has(id));
      return recipe;
    });
    return { profiles: this.rows('SELECT data FROM profiles').map(r => JSON.parse(r.data as string)), recipes, tags, groups, collections: this.rows('SELECT data FROM collections').map(r => JSON.parse(r.data as string)), jobs: this.rows('SELECT data FROM jobs').map(r => JSON.parse(r.data as string)), settings: this.settings(), hasUsdaKey: Boolean(this.getSetting('usdaKey')) };
  }
  saveProfile(profile: Profile) {
    this.transaction(() => {
      const fresh = !this.rows('SELECT id FROM profiles WHERE id = ?', [profile.id]).length;
      this.db.run('INSERT INTO profiles VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, data=excluded.data', [profile.id, profile.name, JSON.stringify(profile)]);
      if (fresh) {
        for (const [name, names] of Object.entries(taxonomy)) {
          const groupId = randomUUID();
          this.db.run('INSERT INTO tag_groups VALUES (?, ?, ?, ?)', [groupId, profile.id, name, normalize(name)]);
          for (const tag of names) this.db.run('INSERT INTO tags VALUES (?, ?, ?, ?, ?, ?)', [randomUUID(), profile.id, groupId, tag, normalize(tag), '#A7B89A']);
        }
        for (const name of ['Recipes to Try', 'Weeknight Dinners', 'Meal Prep', 'Family Favorites']) {
          const collection: Collection = { id: randomUUID(), profileId: profile.id, name, favorite: false, coverId: null };
          this.db.run('INSERT INTO collections VALUES (?, ?, ?, ?, ?)', [collection.id, profile.id, name, normalize(name), JSON.stringify(collection)]);
        }
      }
    });
  }
  saveRecipe(input: Recipe): Recipe {
    const recipe = recipeSchema.parse({ ...input, title: input.title.trim() }); this.assertProfile(recipe.profileId);
    assertSourceReview(recipe);
    if (recipe.status === 'ready' && pendingWebsiteConflicts(recipe) && !recipe.deletedAt) throw new Error('Resolve conflicting website values, or leave them unknown, before marking Ready to Cook.');
    const previous = this.rows('SELECT data FROM recipes WHERE id = ?', [recipe.id])[0];
    if (previous) {
      const old = JSON.parse(previous.data as string) as Recipe;
      if (old.profileId !== recipe.profileId) throw new Error('A recipe cannot change profile ownership.');
      if (old.revision !== recipe.revision) throw new Error('This recipe changed in another view. Reopen it before saving.');
    }
    for (const id of recipe.tagIds) if (!this.rows('SELECT id FROM tags WHERE id=? AND profile_id=?', [id, recipe.profileId]).length) throw new Error('Tag belongs to another profile.');
    for (const id of recipe.collectionIds) if (!this.rows('SELECT id FROM collections WHERE id=? AND profile_id=?', [id, recipe.profileId]).length) throw new Error('Collection belongs to another profile.');
    for (const id of [recipe.coverId, ...recipe.evidence.map(e => e.assetId)].filter(Boolean) as string[]) this.asset(id, recipe.profileId);
    recipe.updatedAt = new Date().toISOString(); recipe.revision++;
    this.transaction(() => {
      this.db.run('INSERT INTO recipes VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, fingerprint=excluded.fingerprint', [recipe.id, recipe.profileId, JSON.stringify(recipe), fingerprint(recipe)]);
      this.db.run('DELETE FROM recipe_tags WHERE recipe_id=?', [recipe.id]);
      this.db.run('DELETE FROM recipe_collections WHERE recipe_id=?', [recipe.id]);
      for (const id of new Set(recipe.tagIds)) this.db.run('INSERT INTO recipe_tags VALUES (?, ?)', [recipe.id, id]);
      for (const id of new Set(recipe.collectionIds)) this.db.run('INSERT INTO recipe_collections VALUES (?, ?)', [recipe.id, id]);
    });
    return recipe;
  }
  saveCollection(collection: Collection) {
    this.assertProfile(collection.profileId);
    if (collection.coverId) this.asset(collection.coverId, collection.profileId);
    const existing = this.rows('SELECT profile_id FROM collections WHERE id=?', [collection.id])[0];
    if (existing && existing.profile_id !== collection.profileId) throw new Error('Invalid collection owner.');
    this.transaction(() => this.db.run('INSERT INTO collections VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, normalized=excluded.normalized, data=excluded.data', [collection.id, collection.profileId, collection.name, normalize(collection.name), JSON.stringify(collection)]));
  }
  deleteCollection(id: string) { this.transaction(() => this.db.run('DELETE FROM collections WHERE id=?', [id])); }
  saveGroup(group: TagGroup) {
    this.assertProfile(group.profileId);
    const existing = this.rows('SELECT profile_id FROM tag_groups WHERE id=?', [group.id])[0];
    if (existing && existing.profile_id !== group.profileId) throw new Error('Invalid tag group owner.');
    this.transaction(() => this.db.run('INSERT INTO tag_groups VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, normalized=excluded.normalized', [group.id, group.profileId, group.name, normalize(group.name)]));
  }
  saveTag(tag: Tag) {
    this.assertProfile(tag.profileId);
    if (!this.rows('SELECT id FROM tag_groups WHERE id=? AND profile_id=?', [tag.groupId, tag.profileId]).length) throw new Error('Invalid tag group.');
    const existing = this.rows('SELECT profile_id FROM tags WHERE id=?', [tag.id])[0];
    if (existing && existing.profile_id !== tag.profileId) throw new Error('Invalid tag owner.');
    this.transaction(() => this.db.run('INSERT INTO tags VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET group_id=excluded.group_id, name=excluded.name, normalized=excluded.normalized, color=excluded.color', [tag.id, tag.profileId, tag.groupId, tag.name, normalize(tag.name), tag.color]));
  }
  deleteTag(id: string) { this.transaction(() => this.db.run('DELETE FROM tags WHERE id=?', [id])); }
  addAsset(asset: Asset, profileId: string) { this.assertProfile(profileId); this.transaction(() => this.db.run('INSERT INTO assets VALUES (?, ?, ?)', [asset.id, profileId, JSON.stringify(asset)])); }
  asset(id: string, profileId?: string): Asset {
    const row = this.rows('SELECT data,profile_id FROM assets WHERE id=?', [id])[0];
    if (!row || (profileId && row.profile_id !== profileId)) throw new Error('Media not found in this profile.');
    return JSON.parse(row.data as string);
  }
  assetList() { return this.rows('SELECT id,data,profile_id FROM assets').map(r => ({ asset: JSON.parse(r.data as string) as Asset, profileId: String(r.profile_id) })); }
  private putJobRaw(job: ImportJob) { this.db.run('INSERT INTO jobs VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data', [job.id, job.profileId, JSON.stringify(job)]); }
  saveJob(job: ImportJob) { this.assertProfile(job.profileId); job.updatedAt = new Date().toISOString(); this.transaction(() => this.putJobRaw(job)); }
  cacheFood(id: number, data: string) { this.transaction(() => this.db.run('INSERT OR REPLACE INTO food_cache VALUES (?, ?)', [id, data])); }
  cachedFood(id: number) { return this.rows('SELECT data FROM food_cache WHERE id=?', [id])[0]?.data as string | undefined; }
  restoreData(data: { profiles: Profile[]; recipes: Recipe[]; collections: Collection[]; groups: TagGroup[]; tags: Tag[]; media: { asset: Asset; profileId: string }[] }) {
    this.transaction(() => {
      for (const p of data.profiles) this.db.run('INSERT INTO profiles VALUES (?, ?, ?)', [p.id, p.name, JSON.stringify(p)]);
      for (const g of data.groups) this.db.run('INSERT INTO tag_groups VALUES (?, ?, ?, ?)', [g.id, g.profileId, g.name, normalize(g.name)]);
      for (const t of data.tags) this.db.run('INSERT INTO tags VALUES (?, ?, ?, ?, ?, ?)', [t.id, t.profileId, t.groupId, t.name, normalize(t.name), t.color]);
      for (const c of data.collections) this.db.run('INSERT INTO collections VALUES (?, ?, ?, ?, ?)', [c.id, c.profileId, c.name, normalize(c.name), JSON.stringify(c)]);
      for (const { asset, profileId } of data.media) this.db.run('INSERT INTO assets VALUES (?, ?, ?)', [asset.id, profileId, JSON.stringify(asset)]);
      for (const r of data.recipes) {
        this.db.run('INSERT INTO recipes VALUES (?, ?, ?, ?)', [r.id, r.profileId, JSON.stringify(r), fingerprint(r)]);
        for (const id of new Set(r.tagIds)) this.db.run('INSERT INTO recipe_tags VALUES (?, ?)', [r.id, id]);
        for (const id of new Set(r.collectionIds)) this.db.run('INSERT INTO recipe_collections VALUES (?, ?)', [r.id, id]);
      }
    });
  }
  detachOriginalMedia(profileId: string, ids: string[]) {
    const removed = new Set(ids);
    this.transaction(() => {
      for (const row of this.rows('SELECT id,data FROM recipes WHERE profile_id=?', [profileId])) {
        const recipe = JSON.parse(row.data as string) as Recipe;
        recipe.evidence = recipe.evidence.map(e => e.assetId && removed.has(e.assetId) ? { ...e, assetId: null, label: e.label + ' (original removed)' } : e);
        recipe.revision++; this.db.run('UPDATE recipes SET data=? WHERE id=?', [JSON.stringify(recipe), recipe.id]);
      }
      for (const row of this.rows('SELECT id,data FROM jobs WHERE profile_id=?', [profileId])) {
        const job = JSON.parse(row.data as string) as ImportJob;
        job.request.assetIds = job.request.assetIds.filter(id => !removed.has(id));
        job.drafts.forEach(r => { r.evidence = r.evidence.map(e => e.assetId && removed.has(e.assetId) ? { ...e, assetId: null } : e); if (r.coverId && removed.has(r.coverId)) r.coverId = null; });
        this.putJobRaw(job);
      }
      for (const id of ids) this.db.run('DELETE FROM assets WHERE id=? AND profile_id=?', [id, profileId]);
    });
  }
  close() { this.db.close(); }
}
export function fingerprint(recipe: Recipe) {
  return createHash('sha256').update(normalize(recipe.title) + '|' + recipe.ingredients.map(i => normalize(i.original)).sort().join('|')).digest('hex');
}

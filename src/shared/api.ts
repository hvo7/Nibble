import type { Asset, Capabilities, Collection, FoodMatch, ImportRequest, Profile, Recipe, Settings, Snapshot, Tag, TagGroup } from './model';

/** The entire renderer privilege boundary. No generic filesystem, shell, or arbitrary IPC access. */
export interface NibbleApi {
  snapshot(): Promise<Snapshot>;
  saveProfile(profile: Profile): Promise<void>;
  saveRecipe(recipe: Recipe): Promise<Recipe>;
  saveCollection(collection: Collection): Promise<void>;
  deleteCollection(id: string): Promise<void>;
  saveGroup(group: TagGroup): Promise<void>;
  saveTag(tag: Tag): Promise<void>;
  deleteTag(id: string): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
  setUsdaKey(value: string): Promise<void>;
  capabilities(): Promise<Capabilities>;
  selectMedia(profileId: string): Promise<Asset[]>;
  addImage(profileId: string, name: string, bytes: ArrayBuffer, cover?: boolean): Promise<Asset>;
  asset(id: string): Promise<Asset>;
  startImport(request: ImportRequest): Promise<string>;
  cancelImport(id: string): Promise<void>;
  searchFoods(query: string): Promise<{ fdcId: number; description: string; dataType: string }[]>;
  getFood(id: number): Promise<FoodMatch>;
  exportRecipe(recipe: Recipe): Promise<boolean>;
  backup(): Promise<boolean>;
  restore(): Promise<boolean>;
  removeMedia(profileId: string): Promise<number>;
  printRecipe(recipe: Recipe): Promise<void>;
  openLink(url: string): Promise<void>;
  openBrowserCompanion(): Promise<void>;
  onChange(callback: () => void): () => void;
}
declare global { interface Window { nibble: NibbleApi } }

import { z } from 'zod';
import { browserCaptureSchema } from './browser-capture';

export const uid = () => crypto.randomUUID();
const text = z.string().max(20000);
const nullableNumber = z.number().finite().nonnegative().nullable();
export const macrosSchema = z.object({ calories: nullableNumber, protein: nullableNumber, carbs: nullableNumber, fat: nullableNumber });
export type Macros = z.infer<typeof macrosSchema>;
export const emptyMacros = (): Macros => ({ calories: null, protein: null, carbs: null, fat: null });
export const foodMatchSchema = z.object({
  fdcId: z.number().int().positive(), description: text, dataType: text,
  per100g: macrosSchema, retrievedAt: text, basis: z.literal('per100g'),
  portions: z.array(z.object({ description: text, grams: z.number().positive() })).default([]),
});
export type FoodMatch = z.infer<typeof foodMatchSchema>;
export const sourceRefSchema = z.object({ evidenceId: z.string().uuid(), lineStart: z.number().int().nonnegative(), lineEnd: z.number().int().nonnegative() });
export const ingredientSchema = z.object({
  id: z.string().uuid(), original: text, name: text, amount: nullableNumber,
  amountMax: nullableNumber, unit: z.string().max(100), group: z.string().max(200),
  notes: text, optional: z.boolean(), grams: nullableNumber,
  weightBasis: z.string().max(300), food: foodMatchSchema.nullable(),
  provenance: z.enum(['source', 'user', 'suggested']),
  sourceRefs: z.array(sourceRefSchema).max(100).optional(),
});
export type Ingredient = z.infer<typeof ingredientSchema>;
export const evidenceSchema = z.object({
  id: z.string().uuid(), kind: z.enum(['text', 'website', 'image', 'transcript', 'frame']),
  label: z.string().max(500), text: z.string().max(250000), assetId: z.string().uuid().nullable(),
  originalText: z.string().max(250000).optional(),
  ocr: z.object({
    confidence: nullableNumber, width: nullableNumber, height: nullableNumber,
    lines: z.array(z.object({ text: z.string().max(10000), confidence: nullableNumber,
      bbox: z.object({ x0: nullableNumber, y0: nullableNumber, x1: nullableNumber, y1: nullableNumber }) })).max(5000),
    error: z.string().max(2000).optional(),
    alternativeText: z.string().max(250000).optional(),
    numberChecks: z.array(z.string().max(1000)).max(5000).optional(),
    unresolvedNumbers: z.array(z.string().max(1000)).max(5000).optional(),
  }).optional(),
});
export type Evidence = z.infer<typeof evidenceSchema>;
export const sourceNutritionSchema = z.object({
  values: macrosSchema, basis: z.enum(['serving', '100g', 'recipe', 'unknown']), origin: z.enum(['source', 'user']),
  servings: z.number().positive().max(100000).nullable().default(null),
  servingSize: z.string().max(1000).default(''), servingGrams: nullableNumber.default(null),
});
export type SourceNutrition = z.infer<typeof sourceNutritionSchema>;
export const websiteImportSchema = z.object({
  method: z.string().max(100),
  sources: z.array(z.object({ field: z.string().max(100), method: z.string().max(100), raw: text })).max(100),
  conflicts: z.array(z.object({
    id: z.string().uuid(), field: z.enum(['servings', 'nutrition']), message: z.string().max(1000), resolved: z.boolean(),
    choices: z.array(z.object({ label: z.string().max(1000), value: z.string().max(5000) })).max(20),
  })).max(20),
});
export const recipeSchema = z.object({
  id: z.string().uuid(), profileId: z.string().uuid(), title: z.string().min(1).max(300), description: text,
  coverId: z.string().uuid().nullable(), sourceUrl: z.string().max(2000), creator: z.string().max(300),
  platform: z.string().max(100), servings: z.number().positive().max(100000).nullable(),
  yieldText: z.string().max(2000).default(''), servingSize: z.string().max(1000).default(''),
  websiteImport: websiteImportSchema.nullable().default(null),
  prepMinutes: nullableNumber, cookMinutes: nullableNumber, totalMinutes: nullableNumber,
  ingredients: z.array(ingredientSchema).max(500),
  steps: z.array(z.object({ id: z.string().uuid(), text, provenance: z.enum(['source', 'user', 'suggested']) })).max(500),
  evidence: z.array(evidenceSchema).max(100), warnings: z.array(text).max(100), notes: text,
  tagIds: z.array(z.string().uuid()).max(300), collectionIds: z.array(z.string().uuid()).max(100),
  favorite: z.boolean(), status: z.enum(['ready', 'review']),
  sourceNutrition: sourceNutritionSchema.nullable(),
  sourceReview: z.object({ confirmed: z.boolean(), parser: z.literal('sections-v2') }).optional(),
  createdAt: text, updatedAt: text, deletedAt: text.nullable(), revision: z.number().int().nonnegative(),
});
export type Recipe = z.infer<typeof recipeSchema>;
export type Profile = { id: string; name: string; units: 'metric' | 'us'; avatar: string; createdAt: string };
export type Collection = { id: string; profileId: string; name: string; favorite: boolean; coverId: string | null };
export type TagGroup = { id: string; profileId: string; name: string };
export type Tag = { id: string; profileId: string; groupId: string; name: string; color: string };
export type Asset = { id: string; name: string; mime: string; size: number };
export type ImportJob = { id: string; profileId: string; status: 'running' | 'review' | 'failed' | 'canceled'; stage: string; error: string; createdAt: string; updatedAt: string; drafts: Recipe[]; request: ImportRequest };
export const importSchema = z.object({
  profileId: z.string().uuid(), url: z.string().max(2000), text: z.string().max(200000),
  assetIds: z.array(z.string().uuid()).max(20), useAI: z.boolean(),
  readImages: z.boolean().optional(),
  browserCapture: browserCaptureSchema.optional(),
});
export type ImportRequest = z.infer<typeof importSchema>;
export const settingsSchema = z.object({
  model: z.string().max(200), useAI: z.boolean(), ocrEnabled: z.boolean(),
  videoEnabled: z.boolean(), pythonPath: z.string().max(1000), ffmpegPath: z.string().max(1000),
  whisperModel: z.enum(['tiny', 'base', 'small']), keepMedia: z.boolean(), setupDone: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = { model: '', useAI: false, ocrEnabled: false, videoEnabled: false, pythonPath: 'python', ffmpegPath: 'ffmpeg', whisperModel: 'tiny', keepMedia: true, setupDone: false };
export type Snapshot = { profiles: Profile[]; recipes: Recipe[]; tags: Tag[]; groups: TagGroup[]; collections: Collection[]; jobs: ImportJob[]; settings: Settings; hasUsdaKey: boolean };
export type Capabilities = { ramGB: number; models: string[]; ollama: boolean; ffmpeg: boolean; whisper: boolean };
export function blankRecipe(profileId: string): Recipe {
  const now = new Date().toISOString();
  return { id: uid(), profileId, title: 'Untitled recipe', description: '', coverId: null, sourceUrl: '', creator: '', platform: 'Manual', servings: null, yieldText: '', servingSize: '', websiteImport: null, prepMinutes: null, cookMinutes: null, totalMinutes: null, ingredients: [], steps: [], evidence: [], warnings: [], notes: '', tagIds: [], collectionIds: [], favorite: false, status: 'review', sourceNutrition: null, createdAt: now, updatedAt: now, deletedAt: null, revision: 0 };
}

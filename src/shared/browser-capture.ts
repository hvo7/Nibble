import { z } from 'zod';
import type { Recipe } from './model';

export const MAX_CAPTURE_BYTES = 6 * 1024 * 1024;
const safeUrl = z.string().max(2000).url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}, 'Use a recipe from an HTTPS webpage.');
const base = {
  format: z.literal('nibble-browser-recipe'), url: safeUrl,
  title: z.string().max(300), capturedAt: z.string().datetime(),
  html: z.string().min(1).max(1000000),
};
export const browserCoverSchema = z.object({
  mime: z.literal('image/jpeg'),
  data: z.string().min(4).max(1398104).refine(value => value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value), 'Invalid photo data.'),
  width: z.number().int().min(200).max(1600), height: z.number().int().min(160).max(1600),
  sourceUrl: safeUrl, recipeTitle: z.string().min(1).max(300), reason: z.string().max(200),
}).strict();
export const browserCaptureSchema = z.discriminatedUnion('version', [
  z.object({ ...base, version: z.literal(1) }).strict(),
  z.object({ ...base, version: z.literal(2), coverPhoto: browserCoverSchema.optional(), photoNote: z.string().max(500).optional() }).strict(),
]);
export type BrowserCapture = z.infer<typeof browserCaptureSchema>;
export function browserCoverForRecipe(capture: BrowserCapture, recipe: Pick<Recipe, 'title'>) {
  const title = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return capture.version === 2 && capture.coverPhoto && title(capture.coverPhoto.recipeTitle) === title(recipe.title) ? capture.coverPhoto : undefined;
}
export function readBrowserCapture(contents: string): BrowserCapture {
  if (new TextEncoder().encode(contents).length > MAX_CAPTURE_BYTES) throw new Error('This recipe file is too large (maximum 6 MB).');
  try { return browserCaptureSchema.parse(JSON.parse(contents)); }
  catch { throw new Error('Choose a .nibble-recipe.json file saved by the Nibble browser companion. This file is invalid or uses an unsupported version.'); }
}

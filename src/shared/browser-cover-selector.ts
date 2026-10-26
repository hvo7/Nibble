import { extractBrowserCapture } from '../../electron/browser-capture';
import type { BrowserCapture } from './browser-capture';
import { primaryImportRecipe } from './import-draft';
import { uid } from './model';

export function selectBrowserCover(capture: BrowserCapture) {
  const extracted = extractBrowserCapture(capture, uid());
  const recipe = primaryImportRecipe(extracted.recipes, capture.title);
  return { recipeTitle: recipe?.title ?? '', candidates: recipe ? (extracted.images[recipe.id] ?? []).slice(0, 6) : [] };
}

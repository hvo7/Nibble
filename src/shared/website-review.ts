import { sourceNutritionSchema, type Recipe, type SourceNutrition } from './model';

/** Resolve an explicit source conflict without discarding the alternatives or their evidence. */
export function resolveWebsiteConflict(recipe: Recipe, id: string, value: string): Recipe {
  const conflict = recipe.websiteImport?.conflicts.find(c => c.id === id);
  if (!conflict || !conflict.choices.some(c => c.value === value)) throw new Error('Choose one of the supplied source records.');
  const result = structuredClone(recipe);
  if (conflict.field === 'servings') {
    result.servings = value === 'null' ? null : Number(value);
    if (result.sourceNutrition) result.sourceNutrition.servings = result.servings;
  } else {
    result.sourceNutrition = value === 'null' ? null : sourceNutritionSchema.parse(JSON.parse(value));
    if (result.sourceNutrition) {
      result.sourceNutrition.servings = result.servings;
      result.servingSize = result.sourceNutrition.servingSize;
    }
  }
  result.websiteImport!.conflicts.find(c => c.id === id)!.resolved = true;
  return result;
}
export function pendingWebsiteConflicts(recipe: Recipe): boolean {
  return recipe.websiteImport?.conflicts.some(c => !c.resolved) ?? false;
}
/** Published numbers always describe the original recipe, independently of later scaling/edits. */
export function publishedNutrition(source: SourceNutrition, target: 'serving' | 'recipe') {
  if (source.basis === 'unknown' || source.basis === '100g') return { values: source.values, basis: source.basis, converted: false };
  if (source.basis === target) return { values: source.values, basis: source.basis, converted: false };
  if (!source.servings) return null;
  const factor = target === 'recipe' ? source.servings : 1 / source.servings;
  const values = Object.fromEntries(Object.entries(source.values).map(([key, value]) => [key, value === null ? null : value * factor])) as SourceNutrition['values'];
  return { values, basis: target, converted: true };
}

import { blankRecipe, emptyMacros, uid, type Ingredient, type Macros, type Recipe, type Tag } from './model';

const fractions: Record<string, string> = { '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8', '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6' };
const fractionText = (value: string) => value.replace(/(\d)([½¼¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚])/g, '$1 $2').replace(/[½¼¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚]/g, c => fractions[c]).replace(/(\d)\s*[\/⁄]\s*(\d)/g, '$1/$2').replace(/^\s*\./, '0.');
export const normalize = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
export function parseNumber(value: string): number | null {
  const normalized = fractionText(value).trim();
  if (!/^\d+(?:\.\d+)?(?:\s+\d+\/\d+|\/\d+)?$/.test(normalized)) return null;
  const parts = normalized.split(/\s+/).map(part => {
    const [n, d] = part.split('/').map(Number);
    return d === undefined ? n : n / d;
  });
  const total = parts.reduce((a, b) => a + b, 0);
  return Number.isFinite(total) ? total : null;
}
const mass: Record<string, number> = { g: 1, gram: 1, grams: 1, kg: 1000, kilogram: 1000, kilograms: 1000, oz: 28.349523125, ounce: 28.349523125, ounces: 28.349523125, lb: 453.59237, lbs: 453.59237, pound: 453.59237, pounds: 453.59237 };
const volume: Record<string, number> = { ml: 1, milliliter: 1, milliliters: 1, l: 1000, liter: 1000, liters: 1000, tsp: 4.92892159375, teaspoon: 4.92892159375, teaspoons: 4.92892159375, tbsp: 14.78676478125, tablespoon: 14.78676478125, tablespoons: 14.78676478125, cup: 236.5882365, cups: 236.5882365 };

/** Only explicit mass quantities become grams. Volumes need a food-specific conversion. */
export function parseIngredient(original: string, group = ''): Ingredient {
  const source = original.trim().replace(/^[-•*]\s*/, '');
  const cleaned = fractionText(source);
  const dimension = /^\d+(?:\.\d+)?\s*[×x]\s*\d+(?:\.\d+)?\s*[- ]?\s*(?:inch(?:es)?|cm|mm)\b/i.test(cleaned);
  const quantity = dimension ? null : cleaned.match(/^(\d+(?:\.\d+)?(?:\s+\d+\/\d+|\/\d+)?)(?:\s*(?:[-–—]|to\b)\s*(\d+(?:\.\d+)?(?:\s+\d+\/\d+|\/\d+)?))?\s*/i);
  const amount = quantity ? parseNumber(quantity[1]) : null;
  const amountMax = quantity?.[2] ? parseNumber(quantity[2]) : null;
  const rest = quantity ? cleaned.slice(quantity[0].length) : cleaned;
  const unitMatch = rest.match(/^(kg|g|grams?|kilograms?|oz|ounces?|lbs?|pounds?|ml|milliliters?|l|liters?|tsp|teaspoons?|tbsp|tablespoons?|cups?|cloves?|cans?|packages?|packets?|bunch(?:es)?|sprigs?|pinch(?:es)?|dash(?:es)?)\b\.?\s*/i);
  const unit = unitMatch?.[1] ?? '';
  const grams = amount !== null && amountMax === null && mass[unit.toLowerCase()] ? amount * mass[unit.toLowerCase()] : null;
  return { id: uid(), original: source, name: unitMatch ? rest.slice(unitMatch[0].length) : rest, amount, amountMax, unit, group, notes: '', optional: /\boptional\b/i.test(cleaned), grams, weightBasis: grams === null ? '' : 'Source mass measurement', food: null, provenance: 'source' };
}

/** Dedupe overlap across evidence items only; repeated instructions within one item can be meaningful. */
export function dedupeEvidenceTexts(texts: string[]): string {
  const combined: string[] = [];
  for (const source of texts) {
    const lines = source.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
      .filter(line => !/^(like|share|follow|save|reply|view all comments|\d+[,.\d]*\s+(likes|comments|views))$/i.test(line));
    let overlap = 0;
    for (let size = Math.min(combined.length, lines.length); size > 0; size--) {
      if (lines.slice(0, size).every((line, i) => normalize(line) === normalize(combined[combined.length - size + i]))) { overlap = size; break; }
    }
    combined.push(...lines.slice(overlap));
  }
  return combined.join('\n');
}

export { parseBodyText as parseRecipeText } from './text-parser';

export function reviewWarnings(recipe: Recipe): string[] {
  const warnings: string[] = [];
  if (!recipe.servings) warnings.push('Confirm servings before showing nutrition per serving.');
  if (!recipe.ingredients.length) warnings.push('No ingredients found. Add the ingredient list.');
  if (!recipe.steps.length) warnings.push('No instructions found. Add the cooking method.');
  if (recipe.ingredients.some(i => i.amount === null)) warnings.push('Some ingredient amounts are unknown or qualitative.');
  const amounts = new Map<string, Set<string>>();
  for (const item of recipe.ingredients) {
    const key = normalize(item.group + '|' + item.name);
    const found = amounts.get(key) ?? new Set<string>();
    found.add(`${item.amount}-${item.amountMax}-${normalize(item.unit)}`); amounts.set(key, found);
  }
  if ([...amounts.values()].some(set => set.size > 1)) warnings.push('Repeated ingredients have differing amounts. Check the source evidence for conflicts.');
  return warnings;
}

export type NutritionResult = { totals: Macros; perServing: Macros | null; partial: boolean; excluded: string[]; matched: number };
/** Recompute editable-field warnings so resolved imports do not keep stale missing-data notices. */
export function reviewMessages(recipe: Recipe): string[] {
  const dynamic = /^(Confirm servings before|No ingredients found\.|No instructions found\.|Some ingredient amounts are unknown|Repeated ingredients have differing amounts)/;
  const retained = recipe.warnings.filter(warning => !dynamic.test(warning) && !(warning.startsWith('Published nutrition has no clear basis.') && recipe.sourceNutrition?.basis !== 'unknown'));
  return [...new Set([...retained, ...reviewWarnings(recipe)])];
}
/** Null is unknown, never zero. Each nutrient has its own coverage tracking. */
export function calculateNutrition(recipe: Recipe): NutritionResult {
  const totals = emptyMacros();
  const excluded: string[] = [];
  let matched = 0;
  let partial = recipe.ingredients.length === 0;
  for (const ingredient of recipe.ingredients) {
    if (ingredient.grams === null || !ingredient.food) { excluded.push(ingredient.name || ingredient.original); partial = true; continue; }
    matched++;
    for (const key of Object.keys(totals) as (keyof Macros)[]) {
      const nutrient = ingredient.food.per100g[key];
      if (nutrient === null) { partial = true; excluded.push(`${ingredient.name}: missing ${key}`); continue; }
      totals[key] = (totals[key] ?? 0) + ingredient.grams * nutrient / 100;
    }
  }
  const perServing = recipe.servings ? Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v === null ? null : v / recipe.servings!])) as Macros : null;
  return { totals, perServing, partial, excluded, matched };
}

/** A new serving count repartitions the same food. Scaling changes amounts and total nutrients. */
export function scaleRecipe(recipe: Recipe, factor: number): Recipe {
  if (!Number.isFinite(factor) || factor <= 0 || factor > 1000) throw new Error('Choose a scale factor between 0 and 1000.');
  const multiply = (n: number | null) => n === null ? null : n * factor;
  return {
    ...recipe,
    ...(recipe.sourceReview ? { sourceReview: { ...recipe.sourceReview, confirmed: false }, status: 'review' as const } : {}),
    servings: multiply(recipe.servings),
    ingredients: recipe.ingredients.map(item => ({
      ...item,
      amount: multiply(item.amount),
      amountMax: multiply(item.amountMax),
      grams: multiply(item.grams),
      provenance: 'user',
    })),
    // Preserve the published/manual record. Ingredient-derived estimates reflect the scaled recipe.
    sourceNutrition: recipe.sourceNutrition,
  };
}

export function displayAmount(ingredient: Ingredient, units: 'metric' | 'us'): string {
  if (ingredient.amount === null) return ingredient.original;
  let amount = ingredient.amount;
  let max = ingredient.amountMax;
  let unit = ingredient.unit;
  const normalized = unit.toLowerCase();
  let factor = 1;
  if (mass[normalized]) { factor = units === 'metric' ? mass[normalized] : mass[normalized] / 28.349523125; unit = units === 'metric' ? 'g' : 'oz'; }
  else if (volume[normalized]) { factor = units === 'metric' ? volume[normalized] : volume[normalized] / 236.5882365; unit = units === 'metric' ? 'ml' : 'cups'; }
  amount *= factor; max = max === null ? null : max * factor;
  const format = (value: number) => Number(value.toFixed(2)).toString();
  return `${format(amount)}${max === null ? '' : '–' + format(max)} ${unit} ${ingredient.name}`.trim();
}

export function matchesTags(recipe: Recipe, selected: string[], tags: Tag[]): boolean {
  const groups = new Map<string, string[]>();
  selected.forEach(id => { const tag = tags.find(t => t.id === id); if (tag) groups.set(tag.groupId, [...(groups.get(tag.groupId) ?? []), id]); });
  return [...groups.values()].every(ids => ids.some(id => recipe.tagIds.includes(id)));
}

export function searchable(recipe: Recipe): string {
  return normalize([recipe.title, recipe.description, recipe.notes, ...recipe.ingredients.map(i => i.original + ' ' + i.name)].join(' '));
}

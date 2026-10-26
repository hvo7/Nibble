import { emptyMacros, type SourceNutrition } from '../src/shared/model';
import { clean } from './website-dom';

export type NutritionInput = { calories?: unknown; proteinContent?: unknown; carbohydrateContent?: unknown; fatContent?: unknown; servingSize?: unknown; label?: string };
const numberPattern = '(?:\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';
/** Explicit supported units only. Inequalities, ranges and ambiguous decimal commas stay unknown. */
export function nutrientValue(raw: unknown, energy: boolean): number | null {
  const match = clean(raw).match(new RegExp('^(' + numberPattern + ')\\s*(kcal|kilocalories?|calories?|cal|kj|kilojoules?|mg|milligrams?|kg|kilograms?|g|grams?)?$', 'i'));
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, '')); const unit = (match[2] ?? '').toLowerCase();
  if (energy) return /^(kj|kilojoules?)$/.test(unit) ? value / 4.184 : /^(|kcal|kilocalories?|calories?|cal)$/.test(unit) ? value : null;
  return /^(|g|grams?)$/.test(unit) ? value : /^(mg|milligrams?)$/.test(unit) ? value / 1000 : /^(kg|kilograms?)$/.test(unit) ? value * 1000 : null;
}
export function servingCount(raw: string): number | null {
  const match = raw.trim().match(/^(?:(?:serves|servings?|portions?|yield)\s*:?\s*)?(\d+(?:\.\d+)?)\s*(?:servings?|people|persons?|portions?)?$/i);
  const count = match ? Number(match[1]) : 0;
  return count > 0 && count <= 100000 ? count : null;
}
export function parseNutrition(input: NutritionInput, servings: number | null): SourceNutrition | null {
  const values = emptyMacros();
  for (const [key, field] of Object.entries({ calories: 'calories', protein: 'proteinContent', carbs: 'carbohydrateContent', fat: 'fatContent' }) as [keyof typeof values, keyof NutritionInput][]) values[key] = nutrientValue(input[field], key === 'calories');
  if (Object.values(values).every(value => value === null)) return null;
  const servingSize = clean(input.servingSize, 1000);
  const grams = servingSize.match(/(?:^|\()(\d+(?:\.\d+)?)\s*(g|grams?|kg|kilograms?)\s*(?:\)|$)/i);
  const servingGrams = grams ? Number(grams[1]) * (/^k/i.test(grams[2]) ? 1000 : 1) : null;
  const label = input.label ?? '';
  const is100g = /\bper\s*100\s*g\b/i.test(label) || /^100\s*(g|grams?)$/i.test(servingSize);
  const isRecipe = /\b(?:per|whole|entire|total for (?:the )?)\s*recipe\b/i.test(label);
  const isServing = /\bper\s*(serving|portion)\b/i.test(label);
  const contradictory = [is100g, isRecipe, isServing].filter(Boolean).length > 1;
  const basis = contradictory ? 'unknown' : is100g ? '100g' : isRecipe ? 'recipe' : isServing || servingSize ? 'serving' : 'unknown';
  return { values, basis, origin: 'source', servings, servingSize, servingGrams };
}
export function nutritionFromText(text: string): NutritionInput {
  const result: NutritionInput = { label: text.slice(0, 5000) };
  const fields = { calories: '(?:calories|energy)', proteinContent: 'protein', carbohydrateContent: '(?:carbohydrates?|carbs)', fatContent: '(?:total\\s+)?fat' };
  for (const [field, name] of Object.entries(fields)) {
    // A label boundary avoids confusing saturated fat with total fat.
    const match = text.match(new RegExp('(?:^|[\\n|;·])\\s*' + name + '\\s*:?\\s*(' + numberPattern + '\\s*(?:kcal|calories?|kJ|mg|kg|g|grams?)?)(?=\\s*(?:$|[\\n|;·]))', 'im'));
    if (match) result[field as keyof NutritionInput] = match[1];
  }
  result.servingSize = text.match(/(?:^|\n)\s*serving size\s*:\s*([^\n]+)/i)?.[1] ?? '';
  return result;
}

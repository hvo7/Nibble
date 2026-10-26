import { describe, expect, it } from 'vitest';
import { blankRecipe, emptyMacros, uid, type FoodMatch, type Tag } from '../src/shared/model';
import { calculateNutrition, dedupeEvidenceTexts, displayAmount, matchesTags, parseIngredient, parseNumber, parseRecipeText, reviewWarnings, scaleRecipe } from '../src/shared/recipe';

const food: FoodMatch = { fdcId: 123, description: 'Confirmed test food', dataType: 'Foundation', per100g: { calories: 100, protein: 10, carbs: 20, fat: 1 }, basis: 'per100g', portions: [], retrievedAt: '2026-10-21' };
describe('Evidence and honest extraction', () => {
  it('parses fractions, ranges, mass and qualitative amounts without inventing density', () => {
    expect(parseNumber('1½')).toBe(1.5); expect(parseNumber('1 1/2')).toBe(1.5); expect(parseNumber('1/0')).toBeNull();
    expect(parseIngredient('200 g carrots').grams).toBe(200);
    expect(parseIngredient('2 tbsp gochujang').grams).toBeNull();
    expect(parseIngredient('2–3 cups water').amountMax).toBe(3);
    expect(parseIngredient('Salt to taste').amount).toBeNull();
    expect(parseIngredient('1½ cups flour').amount).toBe(1.5);
    expect(parseIngredient('1 ½ cups flour').amount).toBe(1.5);
  });
  it('deduplicates screenshot overlap while retaining conflicting quantities', () => {
    expect(dedupeEvidenceTexts(['Ingredients\n2 tbsp oil\n3 eggs\nShare', '3 eggs\n3 tbsp oil\nInstructions\nMix well'])).toBe('Ingredients\n2 tbsp oil\n3 eggs\n3 tbsp oil\nInstructions\nMix well');
    expect(dedupeEvidenceTexts(['Stir\nRest\nStir'])).toBe('Stir\nRest\nStir');
  });
  it('keeps absent servings and methods unknown', () => {
    const recipe = parseRecipeText('Noodle bowl\nIngredients\n200 g noodles', uid());
    expect(recipe.servings).toBeNull(); expect(recipe.steps).toEqual([]);
    expect(reviewWarnings(recipe)).toContain('No instructions found. Add the cooking method.');
  });
  it('flags conflicting ingredient quantities', () => {
    const recipe = parseRecipeText('Eggs\nIngredients\n2 tbsp oil\n3 tbsp oil\nInstructions\nCook.', uid());
    expect(recipe.warnings.some(w => w.includes('differing amounts'))).toBe(true);
  });
});
describe('Nutrition and serving behavior', () => {
  it('calculates deterministic totals and per-serving values', () => {
    const recipe = blankRecipe(uid()); recipe.servings = 2; recipe.ingredients = [{ ...parseIngredient('200 g carrots'), food }];
    expect(calculateNutrition(recipe)).toMatchObject({ totals: { calories: 200, protein: 20, carbs: 40, fat: 2 }, perServing: { calories: 100, protein: 10, carbs: 20, fat: 1 }, partial: false });
  });
  it('never equates unknown nutrition or unmatched ingredients with zero', () => {
    const recipe = blankRecipe(uid()); recipe.ingredients = [parseIngredient('oil to taste')];
    expect(calculateNutrition(recipe)).toMatchObject({ totals: emptyMacros(), perServing: null, partial: true });
    recipe.ingredients.push({ ...parseIngredient('100 g carrots'), food: { ...food, per100g: { ...food.per100g, fat: null } } });
    expect(calculateNutrition(recipe).totals.fat).toBeNull(); expect(calculateNutrition(recipe).totals.calories).toBe(100);
    expect(calculateNutrition(recipe).partial).toBe(true);
  });
  it('distinguishes repartitioning portions from scaling food', () => {
    const recipe = blankRecipe(uid()); recipe.servings = 2; recipe.cookMinutes = 30; recipe.ingredients = [{ ...parseIngredient('100 g carrots'), food }];
    recipe.steps = [{ id: uid(), text: 'Bake at 180 C for 30 minutes.', provenance: 'source' }];
    recipe.sourceNutrition = { values: { ...emptyMacros(), calories: 120 }, basis: 'recipe', origin: 'source', servings: null, servingSize: '', servingGrams: null };
    const repartitioned = { ...recipe, servings: 4 }; const scaled = scaleRecipe(recipe, 2);
    expect(calculateNutrition(repartitioned).totals.calories).toBe(100);
    expect(calculateNutrition(repartitioned).perServing?.calories).toBe(25);
    expect(calculateNutrition(scaled).totals.calories).toBe(200);
    expect(calculateNutrition(scaled).perServing?.calories).toBe(50);
    expect(scaled.cookMinutes).toBe(30); expect(scaled.steps).toEqual(recipe.steps);
    expect(scaled.ingredients[0].original).toBe('100 g carrots');
    expect(scaled.sourceNutrition).toEqual(recipe.sourceNutrition);
  });
  it('converts within a measurement dimension without assigning gram weights to volume', () => {
    expect(displayAmount(parseIngredient('2 tbsp gochujang'), 'metric')).toBe('29.57 ml gochujang');
    expect(parseIngredient('2 tbsp gochujang').grams).toBeNull();
    expect(() => scaleRecipe(blankRecipe(uid()), 0)).toThrow();
  });
});
describe('Tag filtering', () => {
  it('uses OR within groups and AND across groups', () => {
    const profileId = uid(); const course = uid(); const cuisine = uid();
    const tags: Tag[] = [{ id: uid(), profileId, groupId: course, name: 'Main Course', color: '#A7B89A' }, { id: uid(), profileId, groupId: course, name: 'Side Dish', color: '#A7B89A' }, { id: uid(), profileId, groupId: cuisine, name: 'Korean', color: '#A7B89A' }];
    const recipe = blankRecipe(profileId); recipe.tagIds = [tags[0].id, tags[2].id];
    expect(matchesTags(recipe, tags.map(t => t.id), tags)).toBe(true);
    expect(matchesTags({ ...recipe, tagIds: [tags[0].id] }, tags.map(t => t.id), tags)).toBe(false);
    expect(matchesTags(recipe, [], tags)).toBe(true);
  });
});

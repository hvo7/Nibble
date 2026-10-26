import { describe, expect, it } from 'vitest';
import { parseRecipeSources, parseBodyText, assertSourceReview } from '../src/shared/text-parser';
import { recipeSchema, uid, type Evidence } from '../src/shared/model';
import { parseIngredient } from '../src/shared/recipe';

const parse = (text: string) => parseBodyText(text, uid());
const image = (text: string): Evidence => ({ id: uid(), kind: 'image', text, label: 'Screenshot', assetId: uid() });
describe('screenshot and body text recipe parsing', () => {
  it('preserves ranged and unclear yield separately from ingredient rows', () => {
    for (const yieldText of ['Serves 2 to 3.', 'Serves 2–3', 'Serves 210 3.']) {
      const result = parse('Ingredients\n' + yieldText + '\n1 pound kimchi\nFor stock (makes about 2½ cups):\n4 cups water');
      expect(result.ingredients).toHaveLength(2); expect(result.servings).toBeNull(); expect(result.yieldText).toBe(yieldText);
      expect(result.ingredients[1].group).toBe('For stock (makes about 2½ cups)');
    }
  });
  it('treats kelp dimensions as dimensions, not the number of pieces or a weight', () => {
    expect(parseIngredient('4 × 5-inch dried kelp')).toMatchObject({ amount: null, grams: null, name: '4 × 5-inch dried kelp' });
    expect(parseIngredient('4 x 5-inch dried kelp')).toMatchObject({ amount: null, grams: null });
    expect(parseIngredient('4 pieces dried kelp')).toMatchObject({ amount: 4 });
  });
  it('keeps nutrition servings and macros out of the ingredient list', () => {
    const r = parse('Carrot soup\nServings: 4\nIngredients\n200 g carrots\n750 ml stock\nNutrition Facts\nServings: 1\nServing size: 1 bowl (250 g)\nCalories: 180\nProtein: 4 g\nCarbs: 26 g\nFat: 6 g\nInstructions\n1. Simmer until tender.');
    expect(r.servings).toBe(4); expect(r.ingredients.map(i => i.original)).toEqual(['200 g carrots', '750 ml stock']);
    expect(r.sourceNutrition).toMatchObject({ basis: 'serving', servings: 4, servingSize: '1 bowl (250 g)', servingGrams: 250, values: { calories: 180, protein: 4, carbs: 26, fat: 6 } });
    expect(r.steps).toHaveLength(1); expect(recipeSchema.safeParse(r).success).toBe(true);
  });
  it('handles nutrition before the ingredients and recipe metadata after it', () => {
    const r = parse('Soup\nNutrition\nPer serving\nCalories: 200\nIngredients\n200 g carrots\nServes 4\nMethod\nSimmer.');
    expect(r.title).toBe('Soup'); expect(r.servings).toBe(4); expect(r.ingredients).toHaveLength(1);
    expect(r.sourceNutrition?.values.protein).toBeNull();
  });
  it('joins wrapped quantities and preparation without collapsing qualitative ingredients', () => {
    const r = parse('Salad\nIngredients\n2 tbsp extra virgin\nolive oil\n200 g\ncarrots\nSalt to taste\nBlack pepper to taste\nInstructions\nMix well.');
    expect(r.ingredients.map(i => i.original)).toEqual(['2 tbsp extra virgin olive oil', '200 g carrots', 'Salt to taste', 'Black pepper to taste']);
    expect(r.ingredients[0].sourceRefs).toHaveLength(2); expect(r.ingredients[1].grams).toBe(200);
  });
  it('preserves Unicode fractions, ranges, optional foods, package details, and unknown edible weights', () => {
    const r = parse('Bowls\nIngredients\n½ cup yogurt\n1 (400 g) can chickpeas, drained\n2–3 tbsp lemon juice\nDill, optional\nInstructions\nMix.');
    expect(r.ingredients[0].amount).toBe(.5); expect(r.ingredients[1].grams).toBeNull();
    expect(r.ingredients[2].amountMax).toBe(3); expect(r.ingredients[3].optional).toBe(true);
    expect(parseIngredient('1 ⁄ 2 cup milk').amount).toBe(.5);
    expect(parseIngredient('.5 cup milk').amount).toBe(.5);
    expect(parseIngredient('2 to 3 cloves garlic')).toMatchObject({ amount: 2, amountMax: 3, unit: 'cloves', name: 'garlic', grams: null });
  });
  it('retains repeated salt in different recipe components across screenshots', () => {
    const r = parseRecipeSources([image('Rice bowl\nIngredients\nFor the rice:\n1 tsp salt\n200 g rice'), image('For the sauce:\n1 tsp salt\n½ cup yogurt\nInstructions\nMix well.')], uid());
    expect(r.ingredients.filter(i => i.name === 'salt')).toHaveLength(2);
    expect(r.ingredients.filter(i => i.name === 'salt').map(i => i.group)).toEqual(['For the rice', 'For the sauce']);
  });
  it('merges exact overlap within one component while keeping every source reference', () => {
    const one = image('Soup\nIngredients\n200 g carrots\n1 tsp salt'), two = image('1 tsp salt\n750 ml stock\nInstructions\nSimmer.');
    const r = parseRecipeSources([one, two], uid());
    expect(r.ingredients).toHaveLength(3); expect(r.ingredients[1].sourceRefs?.map(ref => ref.evidenceId)).toEqual([one.id, two.id]);
    expect(r.evidence).toHaveLength(2);
  });
  it('keeps conflicting quantities, servings, and nutrition visible rather than guessing', () => {
    const r = parse('Soup\nServes 4\nServes 6\nIngredients\n1 tbsp oil\n2 tbsp oil\nInstructions\nMix.\nNutrition\nPer serving\nCalories: 180\nCalories: 220\nProtein: 4 g');
    expect(r.servings).toBeNull(); expect(r.ingredients).toHaveLength(2); expect(r.sourceNutrition?.values.calories).toBeNull();
    expect(r.warnings.join(' ')).toContain('differing amounts'); expect(r.warnings.join(' ')).toContain('Conflicting recipe servings');
  });
  it('parses inline captions and excludes comments and preparation verbs from ingredients', () => {
    const r = parse('Weeknight soup\nIngredients: 200 g carrots, 750 ml stock; 1 tsp salt\nSimmer until tender.\nComments\n200 g chocolate');
    expect(r.ingredients.map(i => i.name)).toEqual(['carrots', 'stock', 'salt']); expect(r.steps).toHaveLength(1);
  });
  it('handles a separate serving label/value and preserves non-serving yield', () => {
    expect(parse('Soup\nServings\n4\nIngredients\n200 g carrots').servings).toBe(4);
    const r = parse('Sauce\nMakes 2 cups\nIngredients\n500 g tomatoes'); expect(r.servings).toBeNull(); expect(r.yieldText).toBe('Makes 2 cups');
  });
  it('flags unreadable images and low-confidence lines without calling them verified', () => {
    const evidence = image('Soup\nIngredients\n1/7 cup yogurt');
    evidence.ocr = { confidence: 60, width: 800, height: 600, lines: [{ text: '1/7 cup yogurt', confidence: 52, bbox: { x0: 10, y0: 20, x1: 200, y1: 40 } }] };
    const r = parseRecipeSources([evidence, image('')], uid());
    expect(r.warnings.join(' ')).toContain('low-confidence'); expect(r.ingredients[0].amount).toBeCloseTo(1 / 7);
    expect(r.sourceReview?.confirmed).toBe(false);
    expect(() => assertSourceReview({ ...r, status: 'ready' })).toThrow('Check');
    expect(() => assertSourceReview(r)).not.toThrow();
  });
  it('notices a garnish mentioned only by the method without inventing its amount', () => {
    const r = parse('Salad\nIngredients\n1 cucumber\nInstructions\nDice cucumber.\nGarnish with fresh dill.');
    expect(r.ingredients).toHaveLength(1); expect(r.warnings.join(' ')).toContain('fresh dill');
  });
});

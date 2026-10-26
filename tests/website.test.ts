import { describe, expect, it } from 'vitest';
import { extractWebsite } from '../electron/website';
import { nutrientValue, parseNutrition, servingCount } from '../electron/website-nutrition';
import { recipeSchema, uid } from '../src/shared/model';
import { publishedNutrition, resolveWebsiteConflict } from '../src/shared/website-review';
import { reviewMessages, scaleRecipe } from '../src/shared/recipe';
import { cardHtml, conflictHtml, headingHtml, jsonLd, sourceRecipe } from './fixtures/website';

const extract = (html: string) => extractWebsite(html, 'https://example.com/soup', uid());
describe('Layered website extraction', () => {
  it('resolves local graph references, scoped instructions and nutrition without fetching @context', () => {
    const graph = { '@context': 'https://schema.org', '@graph': [{ ...sourceRecipe, nutrition: { '@id': '#nutrition' }, recipeInstructions: { '@id': '#step' } }, { '@id': '#nutrition', ...sourceRecipe.nutrition }, { '@id': '#step', '@type': 'HowToStep', text: 'Simmer &amp; blend.' }] };
    const recipe = extract(jsonLd(graph)).recipes[0];
    expect(recipe.steps[0].text).toBe('Simmer & blend.'); expect(recipe.sourceNutrition?.basis).toBe('serving');
    expect(recipe.sourceNutrition?.servingGrams).toBe(300); expect(recipe.servings).toBe(4);
    expect(recipe.yieldText).toContain('4 bowls'); expect(recipeSchema.parse(recipe)).toEqual(recipe);
  });
  it('uses common recipe cards even when JSON-LD is malformed', () => {
    const recipe = extract('<script type="application/ld+json">invalid</script>' + cardHtml).recipes[0];
    expect(recipe.ingredients).toHaveLength(5); expect(recipe.ingredients[0].group).toBe('Soup'); expect(recipe.servings).toBe(6); expect(recipe.websiteImport?.method).toBe('Recipe card');
  });
  it('keeps conflicting servings unresolved and retains source alternatives', () => {
    const recipe = extract(conflictHtml).recipes[0];
    expect(extract(conflictHtml).recipes).toHaveLength(1); expect(recipe.servings).toBeNull();
    const conflict = recipe.websiteImport!.conflicts[0]; expect(conflict.field).toBe('servings');
    const resolved = resolveWebsiteConflict(recipe, conflict.id, '4');
    expect(resolved.servings).toBe(4); expect(resolved.sourceNutrition?.servings).toBe(4); expect(resolved.websiteImport?.conflicts[0].resolved).toBe(true);
    expect(reviewMessages(resolved).some(w => w.startsWith('Confirm servings before'))).toBe(false);
    expect(resolved.websiteImport?.sources.length).toBeGreaterThan(3); expect(recipe.servings).toBeNull();
    expect(() => resolveWebsiteConflict(recipe, conflict.id, '999')).toThrow();
  });
  it('keeps disagreeing published nutrition unknown until a source is selected', () => {
    const recipe = extract(jsonLd(sourceRecipe) + jsonLd({ ...sourceRecipe, nutrition: { ...sourceRecipe.nutrition, calories: '300 kcal' } })).recipes[0];
    expect(recipe.sourceNutrition).toBeNull();
    const issue = recipe.websiteImport!.conflicts.find(c => c.field === 'nutrition')!;
    const chosen = resolveWebsiteConflict(recipe, issue.id, issue.choices[1].value);
    expect(chosen.sourceNutrition?.values.calories).toBe(300);
  });
  it('extracts microdata without confusing an author name with the recipe', () => {
    const html = `<article itemscope itemtype="https://schema.org/Recipe"><span itemprop="author" itemscope itemtype="https://schema.org/Person"><span itemprop="name">Chef Test</span></span><h1 itemprop="name">Soup</h1><meta itemprop="recipeYield" content="2 servings"><span itemprop="recipeIngredient">100 g carrots</span><ol itemprop="recipeInstructions"><li>Cook.</li></ol><div itemprop="nutrition" itemscope itemtype="https://schema.org/NutritionInformation"><meta itemprop="calories" content="200 kcal"><meta itemprop="servingSize" content="100 g"></div></article>`;
    const recipe = extract(html).recipes[0]; expect(recipe.title).toBe('Soup'); expect(recipe.creator).toBe('Chef Test'); expect(recipe.servings).toBe(2); expect(recipe.sourceNutrition?.basis).toBe('100g');
  });
  it('extracts RDFa recipe fields and preserves missing nutrition as unknown', () => {
    const recipe = extract('<section vocab="https://schema.org/" typeof="Recipe"><h2 property="name">Toast</h2><p property="recipeIngredient">1 slice bread</p><p property="recipeInstructions">Toast the bread.</p><meta property="recipeYield" content="1 serving"></section>').recipes[0];
    expect(recipe.title).toBe('Toast'); expect(recipe.websiteImport?.method).toBe('RDFa'); expect(recipe.sourceNutrition).toBeNull();
  });
  it('uses bounded ingredient/instruction headings and excludes comments and navigation', () => {
    const recipe = extract(headingHtml).recipes[0];
    expect(recipe.ingredients).toHaveLength(2); expect(recipe.steps).toHaveLength(2); expect(recipe.ingredients[1].amount).toBe(1.5);
    expect(recipe.sourceNutrition?.values.calories).toBe(200); expect(recipe.sourceNutrition?.basis).toBe('serving');
    expect(recipe.ingredients.some(i => i.original.includes('chocolate'))).toBe(false);
  });
  it('does not fabricate ingredients for a blocked page or an ordinary article', () => {
    expect(extract('<main><h1>Access denied</h1><p>403: please sign in</p></main>').recipes).toHaveLength(0);
    expect(extract('<article><h1>Best food ideas</h1><p>20 recipes and 200 calories.</p></article>').recipes).toHaveLength(0);
  });
  it('keeps genuinely different recipes as separate choices and deduplicates repeated metadata', () => {
    const result = extract(jsonLd([sourceRecipe, sourceRecipe, { ...sourceRecipe, name: 'Bean stew', recipeIngredient: ['200 g beans'] }]));
    expect(result.recipes.map(r => r.title)).toEqual(['Carrot & ginger soup', 'Bean stew']);
  });
  it('fills absent ingredients from a matching recipe card', () => {
    const recipe = extract(jsonLd({ ...sourceRecipe, recipeIngredient: [] }) + cardHtml).recipes[0]; expect(recipe.ingredients).toHaveLength(5);
  });
  it('preserves structured yield units rather than mistaking pieces for servings', () => {
    const recipe = extract(jsonLd({ ...sourceRecipe, recipeYield: { '@type': 'QuantitativeValue', value: 12, unitText: 'cookies' } })).recipes[0];
    expect(recipe.yieldText).toBe('12 cookies'); expect(recipe.servings).toBeNull();
  });
  it('keeps same-title structured variants separate when their ingredients differ', () => {
    const result = extract(jsonLd([sourceRecipe, { ...sourceRecipe, recipeIngredient: ['200 g beans'] }])); expect(result.recipes).toHaveLength(2);
  });
  it('keeps the title and yield outside a nested Tasty content wrapper', () => {
    const html = '<div class="tasty-recipes"><h2 class="tasty-recipes-title">Rice bowl</h2><span class="tasty-recipes-yield">2 servings</span><div class="tasty-recipes-entry-content"><div class="tasty-recipes-ingredients"><ul><li>200 g rice</li></ul></div><div class="tasty-recipes-instructions"><ol><li>Cook rice.</li></ol></div></div></div>';
    const recipe = extract(html).recipes[0]; expect(recipe.title).toBe('Rice bowl'); expect(recipe.servings).toBe(2); expect(recipe.ingredients).toHaveLength(1);
  });
  it('bounds cyclic references and large input', () => {
    const recipe = extract(jsonLd({ '@graph': [{ ...sourceRecipe, recipeInstructions: { '@id': '#cycle' } }, { '@id': '#cycle', itemListElement: { '@id': '#cycle' } }] })).recipes[0];
    expect(recipe.steps).toHaveLength(0); expect(() => extract('x'.repeat(4 * 1024 * 1024 + 1))).toThrow(/too large/);
  });
});
describe('Serving and nutrition semantics', () => {
  it.each(['12 cookies', '1 loaf', '4–6 servings', '4 to 6', '0', '-2', '4 cups'])('does not turn %s into a serving count', text => expect(servingCount(text)).toBeNull());
  it.each([['4 servings', 4], ['Serves: 2', 2], ['2.5 portions', 2.5]])('recognizes explicit %s', (text, value) => expect(servingCount(text as string)).toBe(value));
  it('converts explicit energy/mass units and rejects ambiguous values', () => {
    expect(nutrientValue('836.8 kJ', true)).toBeCloseTo(200); expect(nutrientValue('500 mg', false)).toBe(.5); expect(nutrientValue('0.02 kg', false)).toBe(20);
    for (const raw of ['<1 g', '1–2 g', '1,5 g', '-5 g', '200%']) expect(nutrientValue(raw, false)).toBeNull();
    expect(nutrientValue('1,200 kcal', true)).toBe(1200);
  });
  it('never assumes a basis from the number of servings alone', () => {
    expect(parseNutrition({ calories: '200 kcal' }, 4)?.basis).toBe('unknown');
    expect(parseNutrition({ calories: '200 kcal', label: 'Per 100 g / per serving' }, 4)?.basis).toBe('unknown');
  });
  it('does not change published nutrition when the user scales or repartitions ingredients', () => {
    const recipe = extract(jsonLd(sourceRecipe)).recipes[0];
    const scaled = scaleRecipe(recipe, 2); scaled.servings = 9;
    expect(publishedNutrition(scaled.sourceNutrition!, 'recipe')?.values.calories).toBe(720);
    expect(publishedNutrition(scaled.sourceNutrition!, 'serving')?.values.calories).toBe(180);
  });
  it('does not convert per-100g values or invent missing nutrients', () => {
    const source = parseNutrition({ calories: '200 kcal', servingSize: '100 g' }, 4)!;
    expect(publishedNutrition(source, 'recipe')?.basis).toBe('100g'); expect(source.values.protein).toBeNull();
  });
});

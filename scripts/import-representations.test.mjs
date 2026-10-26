import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';

// Deliberately offline: Node's built-in test runner, local parser and authored
// fixtures only. No npm/Vitest runtime, network integration tests or live browser.
await mkdir('.nibble-test', { recursive: true });
const output = await mkdtemp(path.resolve('.nibble-test/import-representations-'));
const bundle = path.join(output, 'parser.cjs');
await build({ stdin: { contents: "export { extractWebsite } from './electron/website'; export { jsonLd, sourceRecipe, conflictHtml } from './tests/fixtures/website';", resolveDir: process.cwd(), loader: 'ts' }, outfile: bundle, bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
const { extractWebsite, jsonLd, sourceRecipe, conflictHtml } = createRequire(import.meta.url)(bundle);
globalThis.fetch = () => { throw new Error('Offline extraction must never fetch.'); };
const parse = html => extractWebsite(html, 'https://example.com/soup', randomUUID()).recipes;
const ingredients = ['600 g carrots', '150 g onion', '15 g olive oil', '10 g ginger', '750 ml stock'];
const metadata = (overrides = {}) => jsonLd({ '@type': 'Recipe', name: 'Garden soup (Test soup)', recipeIngredient: ingredients.slice(0, 3), recipeInstructions: ['Cook the soup.'], recipeYield: '4 servings', ...overrides });
const card = (title = 'Garden soup', lines = ingredients) => `<div class="recipe-card"><h2 class="recipe-title">${title}</h2><div class="recipe-card-ingredients"><h2>Ingredients</h2><ul>${lines.slice(0, 3).map(line => `<li>${line}</li>`).join('')}</ul><h3>For stock:</h3><ul>${lines.slice(3).map(line => `<li>${line}</li>`).join('')}</ul></div><div class="recipe-card-directions"><h2>Directions</h2><h3>Prepare stock:</h3><ol><li>Cook the stock.</li></ol><h3>Finish soup:</h3><ol><li>Simmer the vegetables.</li></ol></div></div>`;

test('partial metadata with a parenthetical title yields one complete, grouped card', () => {
  const recipes = parse(metadata() + card());
  assert.equal(recipes.length, 1);
  const [recipe] = recipes;
  assert.deepEqual(recipe.ingredients.map(i => i.original), ingredients);
  assert.deepEqual(recipe.ingredients.map(i => i.group), ['', '', '', 'For stock', 'For stock']);
  assert.deepEqual(recipe.steps.map(s => s.text), ['Cook the stock.', 'Simmer the vegetables.']);
  assert.equal(recipe.websiteImport.method, 'Recipe card');
  assert.ok(recipe.warnings.some(w => w.includes('Ingredient lists differ')));
  assert.equal(recipe.websiteImport.sources.filter(s => s.field === 'Ingredients' && s.method === 'JSON-LD')[0].raw.split('\n').length, 3);
  assert.equal(recipe.websiteImport.sources.filter(s => s.field === 'Directions').length, 3);
});

test('a section heading is not a recipe title when the page supplies its title', () => {
  const html = '<h1>Garden soup</h1>' + card().replace('<h2 class="recipe-title">Garden soup</h2>', '');
  const recipes = parse(metadata() + html);
  assert.equal(recipes.length, 1);
  assert.equal(recipes[0].ingredients.length, 5);
  assert.ok(recipes[0].websiteImport.sources.some(s => s.method === 'Recipe card'));
});

test('unrelated partial recipes and different titled dishes remain separate', () => {
  assert.equal(parse(metadata({ recipeIngredient: ['1 cup beans', '2 tsp cumin', '1 tbsp paprika'] }) + card()).length, 2);
  assert.equal(parse(metadata({ name: 'Different stew' }) + card()).length, 2);
  assert.equal(parse(metadata({ name: 'Garden soup (winter)' }) + card('Garden soup (summer)')).length, 2);
});

test('same-title JSON-LD variants are not collapsed just because one is shorter', () => {
  assert.equal(parse(metadata({ name: 'Garden soup' }) + metadata({ name: 'Garden soup', recipeIngredient: ingredients })).length, 2);
});

test('different quantities remain in source evidence without mixing competing lists', () => {
  const [recipe] = parse(metadata({ name: 'Garden soup', recipeIngredient: ['100 g carrots', ...ingredients.slice(1, 3)] }) + card());
  assert.deepEqual(recipe.ingredients.map(i => i.amount), [600, 150, 15, 10, 750]);
  assert.ok(recipe.websiteImport.sources.some(s => s.method === 'JSON-LD' && s.raw.includes('100 g carrots')));
  assert.ok(recipe.warnings.some(w => w.includes('Ingredient lists differ')));
});

test('multiple recipe cards never create an extra combined whole-page draft', () => {
  const recipes = parse(card() + card('Fruit salad', ['1 apple', '2 pears', '3 plums']));
  assert.deepEqual(recipes.map(r => [r.title, r.ingredients.length]), [['Garden soup', 5], ['Fruit salad', 3]]);
});

test('text-only method headings are not instructions and nutrition servings stay separate', () => {
  const [recipe] = parse('<article><h1>Soup</h1><p>Serves 4</p><h2>Ingredients</h2><p>200 g carrots</p><h2>Directions</h2><h3>Prepare vegetables:</h3><p>Chop carrots.</p><h3>Finish:</h3><p>Simmer.</p><h2>Nutrition</h2><p>Servings: 1</p><p>Serving size: 1 bowl</p><p>Calories: 180</p></article>');
  assert.deepEqual(recipe.steps.map(s => s.text), ['Chop carrots.', 'Simmer.']);
  assert.equal(recipe.servings, 4); assert.equal(recipe.ingredients.length, 1);
  assert.equal(recipe.sourceNutrition.servingSize, '1 bowl');
});

test('existing serving conflicts, structured instructions and unknown nutrients survive', () => {
  const recipes = parse(conflictHtml);
  assert.equal(recipes.length, 1);
  assert.equal(recipes[0].servings, null);
  assert.ok(recipes[0].websiteImport.conflicts.some(c => c.field === 'servings' && !c.resolved));
  assert.equal(recipes[0].steps.length, 2);
  assert.equal(parse(jsonLd({ ...sourceRecipe, nutrition: undefined }))[0].sourceNutrition, null);
});

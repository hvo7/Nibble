// Regression for the user's Maangchi recipe, captured from an already-open page.
// No website requests or browser automation: the input is a local capture file.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';

const input = process.argv[2];
if (!input) throw new Error('Supply the saved Maangchi .nibble-recipe.json file.');
const output = path.resolve('.nibble-staging/live-validation');
await mkdir(output, { recursive: true });
const bundle = path.join(output, 'browser-parser.cjs');
await build({ entryPoints: ['electron/browser-capture.ts'], outfile: bundle, bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
const { extractBrowserCapture } = createRequire(import.meta.url)(bundle);
const capture = JSON.parse(await readFile(input, 'utf8'));
assert.equal(capture.url, 'https://www.maangchi.com/recipe/kimchi-jjigae');
const parsed = extractBrowserCapture(capture, randomUUID());
assert.equal(parsed.recipes.length, 1);
const [recipe] = parsed.recipes;
assert.equal(recipe.ingredients.length, 17);
assert.deepEqual(recipe.ingredients.map(i => i.amount), [1, .25, .5, .5, 3, 1, 1, 2, 2, 1, 1, 2, 7, 1 / 3, null, 3, 4]);
const names = ['kimchi', 'kimchi brine', 'pork shoulder', 'tofu', 'green onions', 'onion', 'kosher salt', 'sugar', 'gochugaru', 'gochujang', 'sesame oil', 'anchovy stock', 'anchovies', 'radish', 'kelp', 'green onion roots', 'water'];
names.forEach((name, index) => assert.ok(recipe.ingredients[index].name.includes(name), `Ingredient ${index + 1} should be ${name}`));
assert.equal(recipe.ingredients[3].optional, true);
assert.equal(recipe.steps.length, 11);
assert.match(recipe.yieldText, /2\s*(?:to|-)\s*3/);
assert.equal(recipe.servings, null);
assert.equal(recipe.sourceNutrition, null);
assert.equal(recipe.sourceReview.confirmed, false);
assert.equal(recipe.status, 'review');
assert.equal(recipe.sourceUrl, capture.url);
assert.ok(!/<!--|<form|<input|<iframe|<img|onclick=|370 Comments|Leave a Reply/i.test(capture.html));
await writeFile(path.join(output, 'maangchi-parsed.json'), JSON.stringify(recipe, null, 2));
const report = { passed: true, capturedAt: capture.capturedAt, source: capture.url, ingredients: recipe.ingredients.length, directions: recipe.steps.length, exactAmounts: true, optionalTofu: true, kelpDimensionsNotAQuantity: true, servingRange: recipe.yieldText, nutrition: recipe.sourceNutrition, reviewRequired: !recipe.sourceReview.confirmed, captureBytes: Buffer.byteLength(JSON.stringify(capture)), method: 'Unmodified companion capture function read the live page through the in-app browser; local production parser consumed that saved capture. Extension installation and popup invocation were not exercised.' };
await writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));

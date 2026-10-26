import assert from 'node:assert/strict';
import { mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import sharp from 'sharp';
import { createWorker as developmentWorker } from 'tesseract.js';
import { prepareOcr, ocrDirectory, ocrNumberDirectory } from './prepare-ocr.mjs';

const output = path.resolve('.nibble-staging/ocr-regression');
await mkdir(output, { recursive: true });
const watchdog = setTimeout(() => { console.error('Real-image OCR regression exceeded 120 seconds.'); process.exit(1); }, 120000); watchdog.unref();
const packageIndex = process.argv.indexOf('--package-content');
const packageContent = packageIndex >= 0 ? path.resolve(process.argv[packageIndex + 1]) : null;
const modelIndex = process.argv.indexOf('--models');
const models = modelIndex >= 0 ? path.resolve(process.argv[modelIndex + 1]) : ocrDirectory;
const createWorker = packageContent ? createRequire(path.join(packageContent, 'package.json'))('tesseract.js').createWorker : developmentWorker;
if (!packageContent && !await prepareOcr()) throw new Error('OCR models are missing. Run npm run setup:ocr, then repeat this test.');
await build({ stdin: { contents: `export { parseRecipeSources } from './src/shared/text-parser'; export { recognizeRecipeImage, ocrCrop, ocrScale, readFocusedRegion } from './src/shared/ocr-result'; export { recipeSchema } from './src/shared/model'; export { calculateNutrition } from './src/shared/recipe'; export { localOcrOptions } from './electron/ocr-model';`, resolveDir: process.cwd(), loader: 'ts' }, outfile: path.join(output, 'parser.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
const { parseRecipeSources, recognizeRecipeImage, ocrCrop, ocrScale, readFocusedRegion, recipeSchema, calculateNutrition, localOcrOptions } = createRequire(import.meta.url)(path.join(output, 'parser.cjs'));
// Start with a new empty cache, then use the same local provisioning as the desktop.
const cache = await mkdtemp(path.join(output, 'first-use-'));
const reader = await createWorker('eng', 1, localOcrOptions(models, path.join(cache, 'text')));
const numbers = await createWorker('eng', 0, localOcrOptions(packageContent ? path.join(models, 'numbers') : ocrNumberDirectory, path.join(cache, 'numbers')));
const expected = [
  [1, 'pound', 'kimchi, cut into bite-size pieces'], [.25, 'cup', 'kimchi brine'],
  [.5, 'pound', 'pork shoulder (or pork belly)'], [.5, 'package', 'of tofu (optional), sliced into 1/2-inch-thick bite-size pieces'],
  [3, '', 'green onions'], [1, '', 'medium onion, sliced (1 cup)'], [1, 'teaspoon', 'kosher salt'],
  [2, 'teaspoons', 'sugar'], [2, 'teaspoons', 'gochugaru (Korean hot pepper flakes)'], [1, 'tablespoon', 'gochujang (hot pepper paste)'],
  [1, 'teaspoon', 'toasted sesame oil'], [2, 'cups', 'of anchovy stock (or chicken or beef broth)'],
  [7, '', 'large dried anchovies, heads and guts removed'], [1/3, 'cup', 'Korean radish (or daikon radish), sliced thinly'],
  [null, '', '4 x 5-inch dried kelp'], [3, '', 'green onion roots'], [4, 'cups', 'water'],
];
try {
  // This fixture is the exact screenshot supplied by the user, not OCR mock text.
  const file = path.resolve('tests/fixtures/kimchi-ingredients.png'), metadata = await sharp(file).metadata();
  const scale = ocrScale(metadata.width, metadata.height), width = Math.round(metadata.width * scale), height = Math.round(metadata.height * scale);
  const pixels = await sharp(file).resize(width, height).png().toBuffer();
  const evidence = await recognizeRecipeImage(reader, pixels, width, height, AbortSignal.timeout(120000), async (box, kind) => {
    const crop = ocrCrop(box, width, height);
    return readFocusedRegion(numbers, height => sharp(pixels).extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height }).resize({ height }).png().toBuffer(), kind);
  });
  const sourceId = crypto.randomUUID(), recipe = parseRecipeSources([{ id: sourceId, label: 'User ingredient screenshot', kind: 'image', assetId: null, ...evidence }], crypto.randomUUID());
  await writeFile(path.join(output, 'kimchi-result.json'), JSON.stringify(recipe, null, 2));
  assert.equal(recipe.ingredients.length, 17);
  assert.deepEqual(recipe.ingredients.map(item => [item.amount, item.unit, item.name]), expected);
  assert.equal(recipe.ingredients.slice(0, 12).every(item => !item.group), true);
  assert.equal(recipe.ingredients.slice(12).every(item => item.group === 'For stock (makes about 2 1/2 cups)'), true);
  assert.equal(recipe.ingredients[3].optional, true); assert.equal(recipe.ingredients[3].grams, null);
  assert.equal(recipe.ingredients[14].grams, null);
  assert.equal(recipe.yieldText, 'Serves 2 to 3.'); assert.equal(recipe.servings, null);
  assert.equal(recipe.steps.length, 0); assert.equal(recipe.title, 'Untitled recipe'); assert.equal(recipe.sourceNutrition, null);
  assert.equal(recipe.sourceReview.confirmed, false); assert.equal(recipe.status, 'review');
  assert.equal(recipe.ingredients.every(item => item.sourceRefs.every(ref => ref.evidenceId === sourceId)), true);
  assert.deepEqual(calculateNutrition(recipe).totals, { calories: null, protein: null, carbs: null, fat: null });
  assert.equal(recipeSchema.safeParse(recipe).success, true); assert.equal(evidence.ocr.unresolvedNumbers.length, 0);
  console.log('REAL IMAGE PASS: all 17 names/amounts/units, 12 + 5 groups, all fractions, slice thickness, stock yield, serving range, source references, optional tofu, unknown nutrition, and missing instructions checked against the supplied PNG.');
  console.log('This proves this screenshot; it is not a general OCR accuracy score.');
} finally { clearTimeout(watchdog); await reader.terminate(); await numbers.terminate(); }

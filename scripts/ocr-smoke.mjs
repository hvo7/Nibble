import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { prepareOcr, ocrDirectory } from './prepare-ocr.mjs';

const output = path.resolve('.nibble-staging/ocr-smoke'); await mkdir(output, { recursive: true });
const text = ['Lemon chickpea bowls', 'Servings: 4', 'Ingredients', '1 can chickpeas, drained', '200 g cooked rice', '1 cucumber, diced', 'For the sauce:', '1/2 cup Greek yogurt', '2 tbsp olive oil', 'Salt to taste', 'Instructions', '1. Mix the yogurt and oil.', '2. Toss with chickpeas, rice, and cucumber.', 'Nutrition Facts', 'Serving size: 1 bowl (310 g)', 'Calories: 460', 'Protein: 18 g', 'Carbs: 60 g', 'Fat: 16 g'];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="1100"><rect width="100%" height="100%" fill="white"/>${text.map((line, i) => `<text x="60" y="${70 + i * 51}" font-family="Arial" font-size="30" fill="#111">${line}</text>`).join('')}</svg>`;
const file = path.join(output, 'recipe-card.png'); await sharp(Buffer.from(svg)).png().toFile(file);
if (!(await prepareOcr())) { console.error('LIVE OCR CHECK UNAVAILABLE: English language data is missing. Run npm run setup:ocr, then npm run test:ocr. The authored screenshot is ready in .nibble-staging/ocr-smoke/recipe-card.png.'); process.exitCode = 2; }
else {
  const moduleFile = path.join(output, 'parse.cjs');
  await build({ stdin: { contents: `export { parseRecipeSources } from './src/shared/text-parser'; export { recognizeRecipeImage } from './src/shared/ocr-result';`, resolveDir: process.cwd(), loader: 'ts' }, outfile: moduleFile, bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
  const { parseRecipeSources, recognizeRecipeImage } = createRequire(import.meta.url)(moduleFile);
  const worker = await createWorker('eng', 1, { langPath: ocrDirectory, cachePath: output, errorHandler: () => {} });
  try {
    const extracted = await recognizeRecipeImage(worker, file, 1100, 1100, AbortSignal.timeout(120000));
    const recipe = parseRecipeSources([{ id: crypto.randomUUID(), label: 'Authored OCR test card', kind: 'image', assetId: null, ...extracted }], crypto.randomUUID());
    await writeFile(path.join(output, 'result.json'), JSON.stringify(recipe, null, 2));
    const failures = [];
    if (recipe.ingredients.length !== 6) failures.push(`Expected 6 ingredients, found ${recipe.ingredients.length}`);
    if (recipe.steps.length !== 2) failures.push(`Expected 2 instructions, found ${recipe.steps.length}`);
    if (recipe.servings !== 4) failures.push('Recipe serving count was not 4');
    if (recipe.sourceNutrition?.values.calories !== 460) failures.push('Published calories were not 460');
    if (recipe.ingredients.find(i => /yogurt/i.test(i.name))?.amount !== .5) failures.push('Yogurt fraction was not 1/2');
    if (failures.length) throw new Error(failures.join('; '));
    console.log(`LIVE OCR CHECK PASSED: 6 ingredients, 2 instructions, recipe servings 4, nutrition kept separate. Confidence ${extracted.ocr.confidence}. This verifies the authored readable screenshot only.`);
  } finally { await worker.terminate(); }
}

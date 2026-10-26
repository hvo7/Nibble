import { captureRecipePage } from '../../browser-companion/capture.js';
import { extractBrowserCapture } from '../../electron/browser-capture';
import { uid } from '../../src/shared/model';
import { screenshotIngredients } from '../fixtures/browser-capture';

document.querySelector('#capture-test').addEventListener('click', () => {
  const output = document.querySelector('#capture-result');
  try {
    const before = document.querySelector('input').value;
    const capture = captureRecipePage();
    const [recipe] = extractBrowserCapture(capture, uid()).recipes;
    if (JSON.stringify(recipe.ingredients.map(i => i.original)) !== JSON.stringify(screenshotIngredients)) throw new Error('The ingredient list changed.');
    if (/private form value|Private message|chocolate|secret-value|external-pixel|onclick=/.test(capture.html)) throw new Error('Unrelated or private content was captured.');
    if (capture.url !== 'https://example.com/fixture-recipe') throw new Error('Tracking or authentication parameters were retained.');
    if (document.querySelector('input').value !== before) throw new Error('The source page was mutated.');
    output.textContent = `PASS: ${recipe.ingredients.length} exact ingredient lines; fractions and stock group retained; private fields, hidden content, comments, and executable attributes excluded. No source edits. ${recipe.steps.length} authored instructions.`;
    const link = document.querySelector('#capture-download');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(capture)], { type: 'application/json' }));
    link.download = 'browser-test.nibble-recipe.json'; link.hidden = false;
  } catch (error) { output.textContent = `FAIL: ${error.message}`; }
});

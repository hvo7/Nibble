import { browserCaptureSchema, type BrowserCapture } from '../src/shared/browser-capture';
import { extractWebsite } from './website';

/** Parse inert source data only. Never load the page, execute its scripts, or fetch its assets. */
export function extractBrowserCapture(input: BrowserCapture, profileId: string) {
  const capture = browserCaptureSchema.parse(input);
  const result = extractWebsite(capture.html, capture.url, profileId);
  result.evidence.label = `Browser capture: ${capture.title || new URL(capture.url).hostname}`.slice(0, 500);
  if (!result.recipes.some(recipe => recipe.ingredients.length)) throw new Error('No ingredient list was found in this saved page. Open the full recipe, then capture it again, or import screenshots or text.');
  for (const recipe of result.recipes) {
    if (recipe.title === 'Untitled recipe' && capture.title) recipe.title = capture.title;
    recipe.sourceReview = { confirmed: false, parser: 'sections-v2' };
    recipe.status = 'review';
    recipe.warnings.push('Imported from the page you saved in your browser. Check ingredient quantities and directions against the source before marking it ready.');
  }
  return result;
}

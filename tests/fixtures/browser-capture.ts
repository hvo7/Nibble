import type { BrowserCapture } from '../../src/shared/browser-capture';

// Ingredient text from the user's supplied screenshot; directions below are authored test text.
export const screenshotIngredients = [
  '1 pound kimchi, cut into bite-size pieces', '¼ cup kimchi brine',
  '½ pound pork shoulder (or pork belly)', '½ package of tofu (optional), sliced into ½-inch-thick bite-size pieces',
  '3 green onions', '1 medium onion, sliced (1 cup)', '1 teaspoon kosher salt', '2 teaspoons sugar',
  '2 teaspoons gochugaru (Korean hot pepper flakes)', '1 tablespoon gochujang (hot pepper paste)',
  '1 teaspoon toasted sesame oil', '2 cups of anchovy stock (or chicken or beef broth)',
  '7 large dried anchovies, heads and guts removed', '⅓ cup Korean radish (or daikon radish), sliced thinly',
  '4 × 5-inch dried kelp', '3 green onion roots', '4 cups water',
];
export const browserFixtureHtml = `<article><h1>Kimchi stew — browser import test</h1><h2>Ingredients</h2><p>Serves 2 to 3.</p><ul>${screenshotIngredients.slice(0, 12).map(line => `<li>${line}</li>`).join('')}</ul><h3>For stock (makes about 2½ cups):</h3><ul>${screenshotIngredients.slice(12).map(line => `<li>${line}</li>`).join('')}</ul><h2>Directions</h2><ol><li>Prepare the stock for this test recipe.</li><li>Cook the stew and add tofu.</li></ol><h2>Comments</h2><p>200 g chocolate is unrelated user commentary.</p><form><input value="private form value"><textarea>Private message</textarea></form></article>`;
export const savedBrowserRecipe = (html = browserFixtureHtml): BrowserCapture => ({ format: 'nibble-browser-recipe', version: 1, url: 'https://www.maangchi.com/recipe/kimchi-jjigae', title: 'Kimchi stew — browser import test', capturedAt: '2026-10-21T12:00:00.000Z', html });

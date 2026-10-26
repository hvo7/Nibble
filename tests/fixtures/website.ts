/** Authored fixtures: reproducible extraction tests, not scraped or measured nutrition data. */
export const sourceRecipe = {
  '@type': 'Recipe', name: 'Carrot & ginger soup', recipeYield: ['4 servings', '4 bowls'],
  recipeIngredient: ['600 g carrots, peeled', '150 g onion, chopped', '15 g olive oil', '10 g fresh ginger', '750 ml vegetable stock'],
  recipeInstructions: [{ '@type': 'HowToSection', name: 'Soup', itemListElement: [{ '@type': 'HowToStep', text: 'Soften onion in oil, then add ginger and carrots.' }, { '@type': 'HowToStep', text: 'Add stock, simmer until tender, then blend.' }] }],
  nutrition: { '@type': 'NutritionInformation', calories: '180 kcal', proteinContent: '3 g', carbohydrateContent: '23 g', fatContent: '8 g', servingSize: '1 bowl (300 g)' },
};
export const jsonLd = (recipe: unknown) => `<script type="application/ld+json">${JSON.stringify(recipe)}</script>`;
export const cardHtml = `<article class="wprm-recipe"><h2 class="wprm-recipe-name">Carrot &amp; ginger soup</h2><div class="wprm-recipe-servings-container">6 servings</div><h3 class="wprm-recipe-ingredient-group-name">Soup</h3><ul><li class="wprm-recipe-ingredient">600 g carrots, peeled</li><li class="wprm-recipe-ingredient">150 g onion, chopped</li><li class="wprm-recipe-ingredient">15 g olive oil</li><li class="wprm-recipe-ingredient">10 g fresh ginger</li><li class="wprm-recipe-ingredient">750 ml vegetable stock</li></ul><div class="wprm-recipe-instruction">Simmer the soup, then blend.</div></article>`;
export const conflictHtml = jsonLd(sourceRecipe) + cardHtml;
export const headingHtml = `<nav>42 recipes</nav><article><h1>Simple soup</h1><p>Serves: 4</p><h2>Ingredients</h2><h3>Soup</h3><ul><li>200 g carrots</li><li>1½ tbsp oil</li></ul><h2>Instructions</h2><ol><li>Chop the carrots.</li><li>Simmer until tender.</li></ol><h2>Nutrition</h2><p>Per serving</p><p>Calories: 200 kcal</p><p>Protein: 3 g</p><h2>Comments</h2><p>200 g chocolate is my variation.</p></article>`;

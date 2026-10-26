import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { browserCaptureSchema, readBrowserCapture } from '../src/shared/browser-capture';
import { uid, recipeSchema } from '../src/shared/model';
import { extractBrowserCapture } from '../electron/browser-capture';
import { savedBrowserRecipe, screenshotIngredients } from './fixtures/browser-capture';
import { sourceRecipe, conflictHtml, jsonLd } from './fixtures/website';

describe('saved browser recipe imports', () => {
  it('preserves all 17 screenshot ingredients, fractions, component yield, and ranged servings', () => {
    const capture = readBrowserCapture(JSON.stringify(savedBrowserRecipe()));
    const { recipes: [recipe], evidence } = extractBrowserCapture(capture, uid());
    expect(recipe.ingredients.map(i => i.original)).toEqual(screenshotIngredients);
    expect(recipe.ingredients.map(i => i.amount)).toEqual([1, .25, .5, .5, 3, 1, 1, 2, 2, 1, 1, 2, 7, 1 / 3, null, 3, 4]);
    expect(recipe.ingredients.slice(12).every(i => i.group.includes('2½'))).toBe(true);
    expect(recipe.servings).toBeNull(); expect(recipe.yieldText).toContain('2 to 3');
    expect(recipe.ingredients[3].optional).toBe(true); expect(recipe.sourceNutrition).toBeNull();
    expect(recipe.steps).toHaveLength(2); expect(recipeSchema.safeParse(recipe).success).toBe(true);
    expect(recipe.sourceReview?.confirmed).toBe(false); expect(recipe.evidence[0]).toEqual(evidence);
  });
  it('keeps metadata nutrition and serving portions distinct from recipe yield and ingredient rows', () => {
    const [recipe] = extractBrowserCapture(savedBrowserRecipe(jsonLd(sourceRecipe)), uid()).recipes;
    expect(recipe.ingredients).toHaveLength(5); expect(recipe.servings).toBe(4);
    expect(recipe.sourceNutrition).toMatchObject({ servingSize: '1 bowl (300 g)', values: { calories: 180, protein: 3 } });
  });
  it('retains conflicts between metadata and the visible card for explicit review', () => {
    const [recipe] = extractBrowserCapture(savedBrowserRecipe(conflictHtml), uid()).recipes;
    expect(recipe.websiteImport?.conflicts.some(c => c.field === 'servings' && !c.resolved)).toBe(true);
    expect(recipe.websiteImport?.sources.filter(s => s.field === 'Ingredients').length).toBeGreaterThan(1);
  });
  it('does not confuse a nutrition-panel serving count with the recipe yield in visible page text', () => {
    const html = '<article><h1>Test soup</h1><p>Serves 4</p><h2>Ingredients</h2><ul><li>200 g carrots</li></ul><h2>Instructions</h2><p>Simmer.</p><h2>Nutrition Facts</h2><p>Servings: 1</p><p>Serving size: 1 bowl</p><p>Calories: 180</p></article>';
    const [recipe] = extractBrowserCapture(savedBrowserRecipe(html), uid()).recipes;
    expect(recipe.servings).toBe(4); expect(recipe.yieldText).toBe('Serves 4');
    expect(recipe.ingredients).toHaveLength(1); expect(recipe.sourceNutrition?.servingSize).toBe('1 bowl');
    expect(recipe.websiteImport?.conflicts).toHaveLength(0);
  });
  it('rejects unsupported, oversized, empty, malformed, and executable-link captures', () => {
    for (const value of ['not json', '{}', JSON.stringify({ ...savedBrowserRecipe(), version: 3 }), JSON.stringify({ ...savedBrowserRecipe(), url: 'javascript:alert(1)' }), JSON.stringify({ ...savedBrowserRecipe(), url: 'https://user:password@example.com/' }), JSON.stringify({ ...savedBrowserRecipe(), cookies: 'not accepted' }), ' '.repeat(6 * 1024 * 1024 + 1)]) expect(() => readBrowserCapture(value)).toThrow();
    expect(browserCaptureSchema.safeParse({ ...savedBrowserRecipe(), html: '' }).success).toBe(false);
    expect(() => extractBrowserCapture(savedBrowserRecipe('<h1>Verify you are human</h1><p>Access denied</p>'), uid())).toThrow('No ingredient');
  });
  it('treats all captured markup as data without running scripts or fetching remote content', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    try {
      const capture = savedBrowserRecipe(`<script>throw new Error('executed')</script><img src="https://attacker.example/pixel">${jsonLd(sourceRecipe)}`);
      expect(extractBrowserCapture(capture, uid()).recipes[0].ingredients).toHaveLength(5);
      expect(fetch).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it('requests only temporary active-tab access without host, cookie, history, or background permissions', () => {
    const manifest = JSON.parse(readFileSync('browser-companion/manifest.json', 'utf8'));
    expect(manifest.permissions).toEqual(['activeTab', 'scripting']);
    expect(manifest.host_permissions).toBeUndefined(); expect(manifest.background).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined(); expect(manifest.content_security_policy.extension_pages).toContain("connect-src 'none'");
  });
});

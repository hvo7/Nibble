// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://example.com/fixture-recipe?utm_source=test&token=secret-value"}
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error The companion intentionally ships as dependency-free JavaScript.
import { captureRecipePage } from '../browser-companion/capture.js';
import { extractBrowserCapture } from '../electron/browser-capture';
import { uid } from '../src/shared/model';
import { browserFixtureHtml, screenshotIngredients } from './fixtures/browser-capture';

afterEach(() => { document.body.innerHTML = ''; document.head.innerHTML = ''; vi.unstubAllGlobals(); });
describe('browser companion reading real DOM structures', () => {
  it('captures all 17 ingredients while excluding forms, hidden data, scripts, comments, and tracking tokens', () => {
    document.body.innerHTML = browserFixtureHtml.replace('<h2>Comments</h2>', '<p style="display:none">secret-value</p><div contenteditable="true">Private draft</div><div class="comments">Private comment</div><img src="https://example.com/pixel"><h2>Comments</h2>');
    const before = document.body.innerHTML;
    const network = vi.fn(); vi.stubGlobal('fetch', network);
    const capture = captureRecipePage();
    const [recipe] = extractBrowserCapture(capture, uid()).recipes;
    expect(recipe.ingredients.map(i => i.original)).toEqual(screenshotIngredients);
    expect(capture.html).not.toMatch(/private form value|Private|chocolate|secret-value|<img|<input|<form|contenteditable/);
    expect(capture.url).toBe('https://example.com/fixture-recipe');
    expect(document.body.innerHTML).toBe(before); expect(network).not.toHaveBeenCalled();
  });
  it('resolves local structured references, preserves nutrition, and excludes unrelated metadata', () => {
    document.head.innerHTML = '<title>Reference soup</title>';
    const graph = { '@graph': [
      { '@type': 'Recipe', name: 'Reference soup', recipeIngredient: ['200 g carrots', '1 tbsp oil'], recipeYield: '4 servings', recipeInstructions: { '@id': '#method' }, nutrition: { '@id': '#nutrition' }, author: { '@id': '#author' }, trackingSecret: 'private-secret' },
      { '@id': '#method', '@type': 'HowToStep', text: 'Simmer the carrots.' },
      { '@id': '#nutrition', '@type': 'NutritionInformation', calories: '180 kcal', servingSize: '1 bowl' },
      { '@id': '#author', name: 'Test author', email: 'private-email@example.com' },
    ] };
    const script = document.createElement('script'); script.type = 'application/ld+json'; script.textContent = JSON.stringify(graph); document.head.append(script);
    document.body.innerHTML = '<form><input value="private-form"></form>';
    const capture = captureRecipePage(), [recipe] = extractBrowserCapture(capture, uid()).recipes;
    expect(recipe.ingredients).toHaveLength(2); expect(recipe.steps[0].text).toBe('Simmer the carrots.');
    expect(recipe.creator).toBe('Test author'); expect(recipe.sourceNutrition?.servingSize).toBe('1 bowl');
    expect(capture.html).not.toMatch(/private-secret|private-email|private-form/);
  });
  it('excludes executable attributes and link targets while retaining card markup', () => {
    document.body.innerHTML = '<article class="recipe-card"><h1>Soup</h1><h2>Ingredients</h2><ul><li onclick="alert(1)">200 g <a href="https://tracking.example">carrots</a></li></ul><h2>Instructions</h2><p>Simmer.</p></article>';
    const capture = captureRecipePage();
    expect(capture.html).not.toMatch(/onclick|href|tracking.example/);
    expect(extractBrowserCapture(capture, uid()).recipes[0].ingredients[0].name).toBe('carrots');
  });
  it('rejects a challenge or unrelated account page without collecting the whole body', () => {
    document.body.innerHTML = '<main><h1>Verify you are human</h1><p>Private account dashboard</p></main>';
    expect(() => captureRecipePage()).toThrow('No recipe');
  });
  it('supports blog content wrappers and bold section labels without collecting the page shell', () => {
    document.body.innerHTML = '<nav>Private navigation</nav><div class="entry-content"><h1>Soup</h1><strong>Ingredients</strong><ul><li>200 g carrots</li></ul><b>Instructions</b><p>Simmer the carrots.</p></div>';
    const capture = captureRecipePage(), [recipe] = extractBrowserCapture(capture, uid()).recipes;
    expect(recipe.ingredients).toHaveLength(1); expect(recipe.steps).toHaveLength(1); expect(capture.html).not.toContain('Private navigation');
  });
  it('bounds unusually large metadata rather than expanding an untrusted page indefinitely', () => {
    const script = document.createElement('script'); script.type = 'application/ld+json';
    script.textContent = JSON.stringify({ '@type': 'Recipe', recipeIngredient: Array(20001).fill('1 g rice') });
    document.head.append(script);
    expect(() => captureRecipePage()).toThrow('too complex');
  });
});

import { describe, expect, it } from 'vitest';
import { extractWebsite } from '../electron/extraction';
import { isPublicAddress, publicUrl } from '../electron/network';
import { recipeSchema, uid } from '../src/shared/model';

describe('Website extraction boundary', () => {
  it('supports graph recipes, multiple choices, sections and unknown yield basis', () => {
    const recipe = { '@type': 'Recipe', name: 'Carrot soup', recipeYield: '12 cups', recipeIngredient: ['200 g carrots'], recipeInstructions: [{ '@type': 'HowToSection', itemListElement: [{ '@type': 'HowToStep', text: 'Chop &amp; simmer.' }] }], cookTime: 'PT1H5M', nutrition: { calories: '200 calories', proteinContent: '4 g' } };
    const html = `<main><h1>Soup</h1><p>Source recipe.</p></main><script type="application/ld+json">${JSON.stringify({ '@graph': [recipe, { ...recipe, name: 'Another soup' }] })}</script>`;
    const result = extractWebsite(html, 'https://example.com/soup', uid());
    expect(result.recipes).toHaveLength(2); const parsed = result.recipes[0];
    expect(parsed.servings).toBeNull(); expect(parsed.cookMinutes).toBe(65);
    expect(parsed.steps[0].text).toBe('Chop & simmer.'); expect(parsed.sourceNutrition?.basis).toBe('unknown');
    expect(recipeSchema.safeParse(parsed).success).toBe(true);
  });
  it('retains visible fallback evidence and ignores scripts and interface clutter', () => {
    const result = extractWebsite('<body><nav>Sign in</nav><article><h1>My soup</h1><p>200 g carrots</p></article><script>steal()</script></body>', 'https://example.com', uid());
    expect(result.recipes).toHaveLength(0); expect(result.evidence.text).toContain('200 g carrots'); expect(result.evidence.text).not.toContain('steal');
  });
  it('converts explicitly supported energy and mass units', () => {
    const result = extractWebsite(`<script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: 'Soup', nutrition: { calories: '400 kJ', proteinContent: '500 mg' } })}</script>`, 'https://example.com', uid());
    expect(result.recipes[0].sourceNutrition?.values.calories).toBeCloseTo(400 / 4.184); expect(result.recipes[0].sourceNutrition?.values.protein).toBe(0.5);
  });
});
describe('URL safety', () => {
  it.each(['127.0.0.1', '10.2.3.4', '192.168.0.1', '169.254.169.254', '0.0.0.0', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '224.0.0.1'])('blocks private/reserved address %s', address => expect(isPublicAddress(address)).toBe(false));
  it('allows public addresses and rejects unsafe schemes or credentialed URLs', () => {
    expect(isPublicAddress('8.8.8.8')).toBe(true); expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
    expect(() => publicUrl('file:///C:/secrets')).toThrow(); expect(() => publicUrl('https://user:pass@example.com')).toThrow(); expect(() => publicUrl('https://example.com:8443')).toThrow();
  });
});

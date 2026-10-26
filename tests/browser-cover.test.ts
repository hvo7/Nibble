import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readBrowserCapture, browserCoverForRecipe, browserCoverSchema } from '../src/shared/browser-capture';
import { selectBrowserCover } from '../src/shared/browser-cover-selector';
import { savedBrowserRecipe } from './fixtures/browser-capture';
import { sourceRecipe, jsonLd } from './fixtures/website';

const photo = { mime: 'image/jpeg' as const, data: '/9j/AA==', width: 640, height: 480, sourceUrl: 'https://example.com/soup.jpg', recipeTitle: sourceRecipe.name, reason: 'Recipe metadata' };
describe('portable browser cover files', () => {
  it('selects the main dish instead of a larger related recipe or site logo', () => {
    const capture = { ...savedBrowserRecipe(jsonLd([{ ...sourceRecipe, name: 'Banana bread', image: '/banana-bread.jpg', recipeIngredient: Array(20).fill('1 cup flour') }, { ...sourceRecipe, image: ['/site-logo.jpg', '/carrot-ginger-soup.jpg'] }])), title: sourceRecipe.name };
    const selection = selectBrowserCover(capture);
    expect(selection.recipeTitle).toBe(sourceRecipe.name);
    expect(selection.candidates[0].url).toBe('https://www.maangchi.com/carrot-ginger-soup.jpg');
    expect(selection.candidates.some(item => /banana|logo/.test(item.url))).toBe(false);
  });
  it('round-trips embedded image and provenance, accepts legacy files and refuses cross-dish covers', () => {
    const capture = readBrowserCapture(JSON.stringify({ ...savedBrowserRecipe(), version: 2, coverPhoto: photo }));
    expect(capture.version).toBe(2);
    expect(browserCoverForRecipe(capture, { title: sourceRecipe.name })).toEqual(photo);
    expect(browserCoverForRecipe(capture, { title: 'Banana bread' })).toBeUndefined();
    expect(readBrowserCapture(JSON.stringify(savedBrowserRecipe())).version).toBe(1);
  });
  it('rejects malformed or oversized image payloads, active formats, unsafe URLs and dimensions', () => {
    for (const patch of [{ data: 'bad!' }, { data: 'AA=' }, { data: 'A'.repeat(1398108) }, { mime: 'image/svg+xml' }, { sourceUrl: 'javascript:alert(1)' }, { sourceUrl: 'https://user:pass@example.com/x' }, { width: 0 }, { height: 100000 }]) expect(browserCoverSchema.safeParse({ ...photo, ...patch }).success).toBe(false);
    expect(browserCoverSchema.safeParse({ ...photo, data: 'A'.repeat(1398104) }).success).toBe(true);
  });
  it('keeps staging separate with temporary tab permissions and no persistent website access', () => {
    const staged = JSON.parse(readFileSync('src/browser-companion/manifest.json', 'utf8'));
    const production = JSON.parse(readFileSync('browser-companion/manifest.json', 'utf8'));
    expect(staged.name).toContain('Staging'); expect(staged.version).toBe('1.1.0');
    expect(production.version).toBe('1.0.1');
    expect(staged.permissions).toEqual(['activeTab', 'scripting']);
    expect(staged.host_permissions).toBeUndefined(); expect(staged.background).toBeUndefined();
    expect(staged.content_security_policy.extension_pages).toContain("connect-src 'none'");
  });
});

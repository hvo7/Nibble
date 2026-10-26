import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
// @ts-expect-error jsdom is used as a runtime fixture; its optional type package is not installed.
import { JSDOM } from 'jsdom';
import { readBrowserCapture } from '../src/shared/browser-capture';
import { selectBrowserCover } from '../src/shared/browser-cover-selector';
import { sourceRecipe, jsonLd } from './fixtures/website';
import { savedBrowserRecipe } from './fixtures/browser-capture';

const windows: JSDOM[] = [];
afterEach(() => { windows.splice(0).forEach(dom => dom.window.close()); });
describe('bundled browser companion flow', () => {
  it('executes serialized capture functions and saves a self-contained v2 file with a photo preview', async () => {
    const output = await build({ entryPoints: ['src/browser-companion/popup.js'], bundle: true, platform: 'browser', format: 'iife', target: 'chrome120', write: false, logLevel: 'silent' });
    const page = new JSDOM(jsonLd({ ...sourceRecipe, image: 'https://example.com/food.jpg' }) + '<article><h1>' + sourceRecipe.name + '</h1><img src="https://example.com/food.jpg"></article>', { url: 'https://example.com/recipe', runScripts: 'outside-only' });
    const popup = new JSDOM(readFileSync('src/browser-companion/popup.html', 'utf8'), { url: 'https://extension.example/popup.html', runScripts: 'outside-only' });
    windows.push(page, popup);
    Object.assign(popup.window, { structuredClone, TextEncoder, TextDecoder });
    Object.defineProperties(page.window.document.images[0], { complete: { value: true }, naturalWidth: { value: 640 }, naturalHeight: { value: 480 } });
    page.window.HTMLCanvasElement.prototype.getContext = (() => ({ fillRect() {}, drawImage() {}, fillStyle: '' })) as unknown as typeof page.window.HTMLCanvasElement.prototype.getContext;
    page.window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,/9j/AA==';
    let download: Blob | undefined; let injections = 0;
    popup.window.URL.createObjectURL = (blob: Blob) => { download = blob as Blob; return 'blob:https://extension.example/photo-file'; };
    popup.window.URL.revokeObjectURL = () => {};
    Object.assign(popup.window, { chrome: {
      tabs: { query: async () => [{ id: 7 }] },
      scripting: { executeScript: async ({ func, args = [] }: { func: (...args: unknown[]) => unknown; args?: unknown[] }) => {
        injections++; const injected = page.window.eval('(' + func.toString() + ')');
        return [{ result: await injected(...args) }];
      } },
    } });
    popup.window.eval(output.outputFiles[0].text);
    (popup.window.document.querySelector('#read') as HTMLButtonElement).click();
    await expect.poll(() => download !== undefined).toBe(true);
    const json = await new Promise<string>((resolve, reject) => {
      const reader = new popup.window.FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject;
      reader.readAsText(download!);
    });
    const capture = readBrowserCapture(json);
    expect(capture.version).toBe(2); expect(injections).toBe(2);
    if (capture.version !== 2) throw new Error('Expected v2');
    expect(capture.coverPhoto).toMatchObject({ recipeTitle: sourceRecipe.name, sourceUrl: 'https://example.com/food.jpg', mime: 'image/jpeg' });
    expect((popup.window.document.querySelector('#photo') as HTMLImageElement).hidden).toBe(false);
    expect(popup.window.document.querySelector('#photo-status')?.textContent).toContain('included');
    expect((popup.window.document.querySelector('#save') as HTMLAnchorElement).download).toMatch(/\.nibble-recipe\.json$/);
  });
  it('uses the same fallback title as the saved-file importer for unnamed recipe metadata', () => {
    const capture = { ...savedBrowserRecipe(jsonLd({ ...sourceRecipe, name: undefined, image: 'https://example.com/food.jpg' })), title: 'My soup' };
    expect(selectBrowserCover(capture).recipeTitle).toBe('My soup');
  });
});

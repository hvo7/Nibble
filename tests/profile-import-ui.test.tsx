// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from '../src/App';
import { createPreviewApi } from './ui/preview-api';
import { savedBrowserRecipe } from './fixtures/browser-capture';

let root: Root;
let api: ReturnType<typeof createPreviewApi>['api'];
const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent?.trim() === name)!;
const click = async (element: HTMLElement) => { expect(element).toBeTruthy(); await act(async () => { element.click(); }); };
const fill = async (selector: string, value: string) => { await act(async () => { const input = document.querySelector<HTMLInputElement>(selector)!; expect(input).toBeTruthy(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }); };
const profiles = () => document.querySelector<HTMLButtonElement>('button[aria-label^="Open profiles:"]')!;
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function() { this.removeAttribute('open'); };
  HTMLElement.prototype.showPopover = function() { this.setAttribute('data-popover-visible', ''); };
  localStorage.clear(); document.body.innerHTML = '<div id="test-root"></div>';
  ({ api } = createPreviewApi({})); window.nibble = api;
  root = createRoot(document.querySelector('#test-root')!);
  await act(async () => { root.render(<App/>); });
});
afterEach(async () => { await act(async () => root.unmount()); document.body.innerHTML = ''; });

describe('profile and browser import UI interactions', () => {
  it('opens the full profile button, creates a kitchen, switches, and protects unsaved edits', async () => {
    await click(profiles()); expect(document.querySelector('dialog[aria-label="Your kitchens"][open]')).toBeTruthy();
    await fill('input[placeholder="e.g. Family recipes"]', 'Second kitchen'); await click(button('Add a kitchen'));
    expect(profiles().getAttribute('aria-label')).toBe('Open profiles: Second kitchen');
    expect(document.querySelector('h1')?.textContent).toBe('Welcome to your kitchen.');
    await click(button('Write a recipe')); await fill('input[aria-label="Recipe title"]', 'Unsaved soup');
    await click(profiles()); await click([...document.querySelectorAll<HTMLButtonElement>('.profile-choice')].find(node => node.textContent?.includes('Preview kitchen'))!);
    expect(document.querySelector('dialog[aria-label="Keep your changes?"][open]')).toBeTruthy();
    await click(button('Keep editing')); expect(document.querySelector<HTMLInputElement>('input[aria-label="Recipe title"]')?.value).toBe('Unsaved soup');
    expect(profiles().getAttribute('aria-label')).toBe('Open profiles: Second kitchen');
    await click(profiles()); await click([...document.querySelectorAll<HTMLButtonElement>('.profile-choice')].find(node => node.textContent?.includes('Preview kitchen'))!); await click(button('Discard changes'));
    expect(profiles().getAttribute('aria-label')).toBe('Open profiles: Preview kitchen');
    expect(document.querySelector('h1')?.textContent).toBe('Welcome to your kitchen.');
    expect((await api.snapshot()).profiles).toHaveLength(2);
  });
  it('reads a saved recipe through the file control, creates a draft, and opens all 17 ingredient rows', async () => {
    await click(button('Import Recipe'));
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Saved browser recipe file"]')!;
    const contents = JSON.stringify(savedBrowserRecipe()), file = new File([contents], 'kimchi.nibble-recipe.json', { type: 'application/json' });
    // jsdom's File lacks Blob.text; the browser supplies this standard method.
    Object.defineProperty(file, 'text', { value: async () => contents });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(document.querySelector('.browser-capture-ready')?.textContent).toContain('Ready to parse locally');
    expect(button('Create recipe draft').disabled).toBe(false);
    await click(button('Create recipe draft')); await click(button('Review recipe'));
    expect(document.querySelectorAll('input[aria-label^="Ingredient "]')).toHaveLength(17);
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Ingredient 2"]')?.value).toBe('¼ cup kimchi brine');
    expect(document.querySelector('.extraction-summary')?.textContent).toContain('17 ingredients');
    expect((await api.snapshot()).jobs[0].drafts[0].sourceNutrition).toBeNull();
  });
  it('shows the privacy notice and reports invalid files without enabling an empty import', async () => {
    await click(button('Import Recipe')); await click(button('Privacy & import policy'));
    expect(document.querySelector('dialog[aria-label="Browser import privacy"][open]')?.textContent).toContain('cookies');
    const dialogs = [...document.querySelectorAll('dialog')]; await click(dialogs[dialogs.length - 1].querySelector<HTMLButtonElement>('button[aria-label="Close dialog"]')!);
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Saved browser recipe file"]')!, file = new File(['{}'], 'wrong.json');
    Object.defineProperty(file, 'text', { value: async () => '{}' }); Object.defineProperty(input, 'files', { value: [file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('unsupported version');
    expect(button('Create recipe draft').disabled).toBe(true);
  });
});

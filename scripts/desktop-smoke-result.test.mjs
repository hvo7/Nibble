import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderedApplication, desktopSmokePassed } from './desktop-smoke-result.mjs';

const result = (overrides = {}) => 'NIBBLE_SMOKE ' + JSON.stringify({
  title: 'Nibble — Your recipe collection',
  text: 'WELCOME TO NIBBLE\nWhat should we call your kitchen?\nMake yourself at home',
  ...overrides,
});

test('the actual production page title and rendered onboarding pass', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const title = html.match(/<title>(.*?)<\/title>/)?.[1];
  assert.equal(title, 'Nibble — Your recipe collection');
  assert.equal(desktopSmokePassed(result({ title }), 0, null), true);
});

test('home content and original short title remain recognized', () => {
  assert.equal(renderedApplication(result({ title: 'Nibble', text: 'Welcome to your kitchen\nImport Recipe' })), true);
});

test('empty, malformed, error and partially rendered pages never pass', () => {
  for (const output of ['', 'NIBBLE_SMOKE invalid', 'NIBBLE_SMOKE null', result({ title: 'Error' }), result({ title: 'Nibble — Error' }), result({ text: 'Loading...' }), result({ text: null }), result({ text: 'Make yourself at home' }), result({ text: 'Welcome to your kitchen' })]) {
    assert.equal(desktopSmokePassed(output, 0, null), false, output);
  }
});

test('startup warnings do not mask valid renderer evidence; a later bad report does', () => {
  assert.equal(renderedApplication('DeprecationWarning: punycode\r\n' + result() + '\r\n'), true);
  assert.equal(renderedApplication(result() + '\nNIBBLE_SMOKE malformed'), false);
});

test('a crash, signal or timeout fails even after rendering', () => {
  assert.equal(desktopSmokePassed(result(), 1, null), false);
  assert.equal(desktopSmokePassed(result(), null, 'SIGTERM'), false);
  assert.equal(desktopSmokePassed(result(), 0, null, true), false);
});

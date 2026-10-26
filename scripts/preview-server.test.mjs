import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { previewHandler, previewPort } from './preview-server.mjs';

// Test the HTTP boundary without sockets: this agent environment denies local
// client connections with EACCES. These tests do not claim browser verification.
async function request(url, options = {}) {
  const reads = [];
  const headers = {};
  const response = {
    setHeader(key, value) { headers[key] = value; },
    writeHead(status) { this.status = status; return this; },
    end(body) { this.body = body; },
  };
  await previewHandler('preview-output', async file => { reads.push(file); return 'fixture'; })({
    method: 'GET', url, socket: { localPort: previewPort },
    headers: { host: `127.0.0.1:${previewPort}` }, ...options,
  }, response);
  return { ...response, headers, reads };
}

test('design and actual editor have separate stable routes', async () => {
  for (const [route, file] of [['/', 'design.html'], ['/editor', 'index.html'], ['/preview.js', 'preview.js'], ['/design.js', 'design.js'], ['/preview.css', 'preview.css'], ['/design.css', 'design.css']]) {
    const result = await request(route);
    assert.equal(result.status, 200);
    assert.deepEqual(result.reads, [path.join('preview-output', file)]);
    assert.match(result.headers['Content-Security-Policy'], /connect-src 'self'/);
    assert.doesNotMatch(result.headers['Content-Security-Policy'], /https:|unsafe-eval|wasm-unsafe-eval/);
    assert.equal(result.headers['Cache-Control'], 'no-store');
  }
});

test('private files, traversal, unknown routes and writes cannot reach the filesystem', async () => {
  for (const route of ['/../package.json', '/%2e%2e/.env', '/.nibble-staging/data', '/electron/main.ts', '/?file=.env', '//editor']) {
    const result = await request(route);
    assert.equal(result.status, 404);
    assert.deepEqual(result.reads, []);
  }
  const result = await request('/', { method: 'POST' });
  assert.equal(result.status, 405);
  assert.deepEqual(result.reads, []);
});

test('cross-origin and unexpected Host requests cannot read preview files', async () => {
  for (const headers of [{ host: 'attacker.example' }, { host: `127.0.0.1:${previewPort}`, origin: 'https://attacker.example' }]) {
    const result = await request('/', { headers });
    assert.equal(result.status, 403);
    assert.deepEqual(result.reads, []);
  }
});

test('HEAD checks availability without a response body', async () => {
  const result = await request('/', { method: 'HEAD' });
  assert.equal(result.status, 200);
  assert.equal(result.body, undefined);
});

test('only the packaged browser companion ZIP is downloadable', async () => {
  const result = await request('/nibble-browser-companion.zip');
  assert.equal(result.status, 200); assert.equal(result.headers['Content-Type'], 'application/zip');
  assert.deepEqual(result.reads, [path.join('preview-output', 'nibble-browser-companion.zip')]);
  assert.equal((await request('/browser-companion/manifest.json')).status, 404);
});

test('OCR serves only fixed local assets, with WASM compilation confined to the worker', async () => {
  for (const route of ['/ocr/worker.min.js', '/ocr/tesseract-core-lstm.wasm.js', '/ocr/tesseract-core.wasm.js', '/ocr/eng.traineddata.gz', '/ocr/numbers/eng.traineddata.gz']) {
    const result = await request(route); assert.equal(result.status, 200);
    assert.equal(result.headers['Content-Security-Policy'].includes('wasm-unsafe-eval'), route === '/ocr/worker.min.js');
  }
  for (const route of ['/ocr/../../package.json', '/ocr/custom.js', '/ocr/eng.traineddata.gz?url=https://evil.example']) {
    const result = await request(route); assert.equal(result.status, 404); assert.deepEqual(result.reads, []);
  }
});

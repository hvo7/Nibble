import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { extractAll, extractFile, listPackage } from '@electron/asar';
import { companionFiles } from './prepare-browser-companion.mjs';

const root = process.cwd(), metadata = JSON.parse(readFileSync('package.json', 'utf8'));
const directory = path.resolve(metadata.build.directories.output, 'win-unpacked');
const resources = path.join(directory, 'resources'), archive = path.join(resources, 'app.asar');
const list = listPackage(archive).map(file => file.replaceAll('\\', '/').replace(/^\//, ''));
// @electron/asar resolves nested directory names with the host path separator.
const readArchive = name => extractFile(archive, path.normalize(name));
const pkg = JSON.parse(readArchive('package.json').toString());
assert.equal(pkg.license, metadata.license);
assert.deepEqual(readArchive('LICENSE'), readFileSync('LICENSE'), 'Project license missing or outdated');
assert.equal(pkg.version, metadata.version); assert.equal(pkg.main, 'dist-electron/main.cjs');
assert.ok(existsSync(path.join(directory, 'Nibble.exe')));
for (const name of ['dist/index.html', 'dist-electron/main.cjs', 'dist-electron/preload.cjs']) assert.deepEqual(readArchive(name), readFileSync(name), 'Shipped file differs from production build: ' + name);
const html = readArchive('dist/index.html').toString();
for (const [, asset] of html.matchAll(/(?:src|href)="\.\/(assets\/[^\"]+)"/g)) {
  assert.ok(list.includes('dist/' + asset), 'Renderer asset missing: ' + asset);
  assert.deepEqual(readArchive('dist/' + asset), readFileSync(path.join('dist', asset)), 'Shipped renderer asset differs from production: ' + asset);
}
assert.ok(!list.some(file => /^(?:tests|scripts|\.nibble-staging|\.nibble-test|\.env)(?:\/|$)/.test(file)), 'Development content leaked into release');
assert.ok(!list.some(file => file.startsWith('dist-electron/ocr/')), 'OCR models should exist once, outside ASAR');
for (const name of ['tesseract.js/src/worker-script/node/index.js', 'tesseract.js-core/tesseract-core.wasm.js', 'tesseract.js-core/tesseract-core-lstm.wasm.js']) assert.ok(existsSync(path.join(resources, 'app.asar.unpacked', 'node_modules', name)), 'OCR worker/WASM not unpacked: ' + name);
const manifest = JSON.parse(readFileSync(path.join(resources, 'ocr/models.json'), 'utf8'));
for (const model of manifest.models) assert.equal(createHash('sha256').update(readFileSync(path.join(resources, 'ocr', model.file))).digest('hex'), model.sha256, 'Model checksum mismatch');
assert.ok(readFileSync(path.join(resources, 'ocr/LICENSE.txt'), 'utf8').includes('Apache License'));
assert.ok(existsSync(path.join(resources, 'workers/transcribe.py')));
for (const name of companionFiles) assert.deepEqual(readFileSync(path.join(resources, 'browser-companion', name)), readFileSync(path.join(root, 'browser-companion', name)), 'Browser companion resource missing or outdated: ' + name);
console.log('PACKAGE PASS: version, exact renderer/main/preload, assets, isolated contents, OCR workers, model checksums, license, external Python worker and all seven browser companion resources.');

mkdirSync('.nibble-test', { recursive: true });
const content = mkdtempSync(path.resolve('.nibble-test/package-content-'));
extractAll(archive, content);
const require = createRequire(path.join(content, 'package.json'));
assert.ok(require.resolve('tesseract.js').startsWith(content + path.sep), 'Package OCR must not resolve development dependencies');
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['--require', path.join(root, 'tests/fixtures/electron-environment.cjs'), 'scripts/ocr-regression.mjs', '--package-content', content, '--models', path.join(resources, 'ocr')], { cwd: root, stdio: 'inherit', windowsHide: true });
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error('Shipped OCR regression failed: ' + code)));
});
console.log('PACKAGE OCR PASS: shipped dependencies + bundled models, a fresh cache provisioned locally, and Electron environment detection in real Node workers read all 17 ingredients. This does not replace the native Windows launch check.');

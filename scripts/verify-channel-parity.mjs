import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = text => text.replaceAll('\r\n', '\n');
function sourceRecords(root, app) {
  const html = fs.readFileSync(path.join(app, 'dist/index.html'), 'utf8');
  const script = html.match(/src="\.\/(assets\/[^"]+\.js)"/)?.[1];
  assert.ok(script, 'Active renderer script missing from ' + app);
  const maps = [path.join(app, 'dist', script + '.map'), ...['main','preload'].map(name => path.join(app, 'dist-electron', name + '.cjs.map'))];
  const records = new Map();
  for (const file of maps) {
    const map = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(map.sources.length, map.sourcesContent.length, 'Incomplete source map: ' + file);
    for (let i = 0; i < map.sources.length; i++) {
      const source = path.resolve(path.dirname(file), map.sources[i]);
      const relative = path.relative(root, source).replaceAll('\\', '/');
      if (!/^(src\/|electron\/|package\.json$)/.test(relative)) continue;
      const content = hash(canonical(map.sourcesContent[i]));
      assert.equal(content, hash(canonical(fs.readFileSync(source, 'utf8'))), 'Stale compiled source: ' + relative + ' in ' + app);
      if (records.has(relative)) assert.equal(records.get(relative), content, 'Inconsistent compiled source: ' + relative);
      records.set(relative, content);
    }
  }
  for (const required of ['src/App.tsx','electron/main.ts','electron/processing.ts','electron/website-images.ts','electron/cover-photo.ts']) assert.ok(records.has(required), 'Missing compiled source: ' + required);
  const css = [...html.matchAll(/href="\.\/(assets\/[^"]+\.css)"/g)].map(match => hash(fs.readFileSync(path.join(app, 'dist', match[1])))).sort();
  assert.ok(css.length, 'No active stylesheet found in ' + app);
  return { records: [...records].sort(([a],[b]) => a.localeCompare(b)), css };
}
export function verifyChannelParity(root = process.cwd()) {
  const staging = path.join(root, '.nibble-staging/app');
  const prod = sourceRecords(root, root), stage = sourceRecords(root, staging);
  assert.deepEqual(prod.records, stage.records, 'Staging and production contain different application source');
  assert.deepEqual(prod.css, stage.css, 'Staging and production styles differ');
  for (const file of ['main.cjs','preload.cjs']) assert.equal(hash(fs.readFileSync(path.join(root,'dist-electron',file))), hash(fs.readFileSync(path.join(staging,'dist-electron',file))), 'Desktop bundle differs: ' + file);
  const version = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
  assert.equal(JSON.parse(fs.readFileSync(path.join(staging,'package.json'),'utf8')).version, version, 'Staging version differs');
  return { version, applicationSources: prod.records.length, desktopBundles: 2, stylesheets: prod.css.length, rendererDifference: 'staging banner only; application sources match' };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('CHANNEL PARITY PASS: ' + JSON.stringify(verifyChannelParity()));
}

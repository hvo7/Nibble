import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { productionLaunch } from './start-production.mjs';

test('production cannot inherit staging data, test mode, or a dev renderer', () => {
  const root = path.resolve('project with spaces');
  const inherited = { PATH: 'tools', ELECTRON_RUN_AS_NODE: '1', nibble_smoke: '1', NIBBLE_SCREENSHOT: 'test.png', NIBBLE_DEV_URL: 'http://127.0.0.1:5173', nibble_data_dir: 'staging-data', NIBBLE_CHANNEL: 'staging' };
  const launch = productionLaunch(root, inherited);
  assert.deepEqual(launch.options.env, { PATH: 'tools' });
  assert.equal(inherited.nibble_data_dir, 'staging-data');
  assert.equal(launch.args[0], root); assert.equal(launch.options.cwd, root);
  assert.equal(launch.options.shell, undefined);
  assert.equal(launch.args[2], '--log-file=' + path.join(root, '.nibble-runtime', 'electron-startup.log'));
});

test('double-click launcher checks production assets and removes test flags before Electron', async () => {
  const source = await readFile(new URL('../Start-Nibble.cmd', import.meta.url), 'utf8');
  for (const key of ['ELECTRON_RUN_AS_NODE', 'NIBBLE_SMOKE', 'NIBBLE_SCREENSHOT', 'NIBBLE_DEV_URL', 'NIBBLE_DATA_DIR', 'NIBBLE_CHANNEL']) assert.ok(source.includes(`set "${key}="`));
  assert.match(source, /setlocal/); assert.match(source, /call npm\.cmd run build/);
  assert.match(source, /dist-electron\\ocr\\numbers\\eng\.traineddata\.gz/);
  assert.match(source, /start "" \/wait "%~dp0node_modules\\electron\\dist\\electron\.exe" "%~dp0\."/);
  assert.match(source, /if not "%NIBBLE_LAUNCH_EXIT%"=="0" goto failed/);
});

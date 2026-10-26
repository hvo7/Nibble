import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { stagingLaunch } from './staging-launch.mjs';

test('normal staging strips all inherited test flags and isolates data without mutating the parent', () => {
  const root = path.resolve('project with spaces'), inherited = { PATH: 'tools', ELECTRON_RUN_AS_NODE: '1', nibble_smoke: '1', NIBBLE_SCREENSHOT: 'production.png', NIBBLE_DEV_URL: 'http://localhost:5173', NIBBLE_DATA_DIR: 'production', NIBBLE_CHANNEL: 'production' };
  const launch = stagingLaunch(root, inherited);
  assert.equal(launch.options.env.PATH, 'tools');
  assert.equal(launch.options.env.NIBBLE_CHANNEL, 'staging');
  assert.equal(launch.options.env.NIBBLE_DATA_DIR, path.join(root, '.nibble-staging/data'));
  assert.equal(Object.keys(launch.options.env).some(key => /smoke|screenshot|dev_url|run_as_node/i.test(key)), false);
  assert.equal(inherited.nibble_smoke, '1'); assert.equal(inherited.NIBBLE_DATA_DIR, 'production');
  assert.equal(launch.args[0], path.join(root, '.nibble-staging/app'));
  assert.equal(launch.args[2], '--log-file=' + path.join(root, '.nibble-staging/electron-startup.log'));
  assert.equal(launch.options.shell, undefined);
});
test('Windows entry point uses its own directory and npm.cmd with error recovery', async () => {
  const source = await readFile(new URL('../Start-Nibble-Staging.cmd', import.meta.url), 'utf8');
  assert.match(source, /setlocal/); assert.match(source, /cd \/d "%~dp0"/);
  assert.match(source, /call npm\.cmd run build:staging/); assert.match(source, /if errorlevel 1 goto failed/);
  assert.match(source, /start "" \/wait "%~dp0node_modules\\electron\\dist\\electron\.exe"/);
  assert.match(source, /set "NIBBLE_DATA_DIR=%~dp0\.nibble-staging\\data"/);
  assert.match(source, /set "NIBBLE_SMOKE="/); assert.match(source, /exit \/b 1/);
});

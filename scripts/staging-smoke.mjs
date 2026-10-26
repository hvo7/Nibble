import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import { renderedApplication, desktopSmokePassed } from './desktop-smoke-result.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const production = process.argv.includes('--production');
const base = path.join(root, '.nibble-test'); mkdirSync(base, { recursive: true });
const scratch = mkdtempSync(path.join(base, production ? 'production-smoke-' : 'staging-smoke-'));
const env = { ...process.env };
for (const key of Object.keys(env)) if (/^(ELECTRON_RUN_AS_NODE|NIBBLE_SMOKE|NIBBLE_SCREENSHOT|NIBBLE_DEV_URL|NIBBLE_DATA_DIR|NIBBLE_CHANNEL)$/i.test(key)) delete env[key];
Object.assign(env, { NIBBLE_DATA_DIR: path.join(scratch, 'data'), NIBBLE_SMOKE: '1', NIBBLE_SCREENSHOT: path.join(scratch, 'startup.png') });
if (!production) env.NIBBLE_CHANNEL = 'staging';
let timedOut = false;
let output = '';
const child = spawn(electron, [production ? root : path.join(root, '.nibble-staging', 'app')], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk); });
child.stderr.on('data', chunk => process.stderr.write(chunk));
const timeout = setTimeout(() => { timedOut = true; console.error('Desktop smoke check timed out.'); child.kill(); }, 20000);
child.on('error', error => { clearTimeout(timeout); console.error(error.message); process.exitCode = 1; });
child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const verified = renderedApplication(output);
  console.log(`Desktop smoke exit: ${code}; signal: ${signal ?? 'none'}; rendered application: ${verified ? 'verified' : 'NOT VERIFIED'}`);
  process.exitCode = desktopSmokePassed(output, code, signal, timedOut) ? 0 : 1;
});

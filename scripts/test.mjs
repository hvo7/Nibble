import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// Keep transient test caches inside the project for restricted Windows environments.
// These variables apply only to the child test process, not the user's environment.
const temporary = path.resolve('.nibble-test/runtime');
mkdirSync(temporary, { recursive: true });
const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...process.argv.slice(2)], {
  stdio: 'inherit', env: { ...process.env, TEMP: temporary, TMP: temporary, TMPDIR: temporary }, windowsHide: true,
});
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd(), require = createRequire(import.meta.url);
const packageFile = require.resolve('electron-builder/package.json');
const metadata = JSON.parse(readFileSync(packageFile, 'utf8'));
const temporary = path.join(root, '.nibble-test', 'packaging-temp');
const cache = path.join(root, '.nibble-test', 'builder-cache');
mkdirSync(temporary, { recursive: true }); mkdirSync(cache, { recursive: true });
const child = spawn(process.execPath, [path.resolve(path.dirname(packageFile), metadata.bin['electron-builder']), '--win', ...(process.argv.includes('--dir') ? ['--dir'] : ['nsis']), '--x64'], {
  cwd: root, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, TEMP: temporary, TMP: temporary, TMPDIR: temporary, ELECTRON_BUILDER_CACHE: cache },
});
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });

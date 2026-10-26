import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, copyFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import electron from 'electron';
import { prepareOcr } from './prepare-ocr.mjs';
import { stagingLaunch } from './staging-launch.mjs';
import { copyBrowserCompanion } from './prepare-browser-companion.mjs';

// Staging never overwrites dist/, dist-electron/, release/, or the normal user-data folder.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.nibble-staging', 'app');
const data = path.join(root, '.nibble-staging', 'data');
const launchLog = path.join(root, '.nibble-staging', 'staging-launch.log');
async function run(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Staging check failed (${code}).`)));
  });
}
await run(['node_modules/typescript/bin/tsc', '--noEmit']);
await mkdir(output, { recursive: true });
await copyBrowserCompanion(path.join(output, 'browser-companion'), { staging: true });
await run(['node_modules/vite/bin/vite.js', 'build', '--mode', 'staging', '--outDir', path.join(output, 'dist')]);
await build({ entryPoints: ['electron/main.ts', 'electron/preload.ts'], absWorkingDir: root, outdir: path.join(output, 'dist-electron'), outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', format: 'cjs', target: 'node22', packages: 'external', sourcemap: true, define: { 'import.meta.url': '__filename' } });
await mkdir(path.join(output, 'assets'), { recursive: true });
await copyFile(path.join(root, 'assets/icon.ico'), path.join(output, 'assets/icon.ico'));
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await writeFile(path.join(output, 'package.json'), JSON.stringify({ name: 'nibble-staging', productName: 'Nibble Staging', version, main: 'dist-electron/main.cjs' }, null, 2));
await mkdir(path.join(output, 'workers'), { recursive: true });
for (const file of ['transcribe.py', 'setup_transcription.py', 'requirements.txt']) await copyFile(path.join(root, 'workers', file), path.join(output, 'workers', file));
console.log(`Staging build: ${output}\nIsolated test data: ${data}`);
if (!process.argv.includes('--build-only')) {
  try { await prepareOcr({ download: true }); console.log('Screenshot reading is ready (local English OCR).'); }
  catch (error) { console.warn(`Screenshot setup needs attention: ${error.cause?.code ?? error.message}. Text imports still work. Run npm run setup:ocr while online.`); }
  const launch = stagingLaunch(root);
  await writeFile(launchLog, `${new Date().toISOString()}\nNode ${process.version}\nElectron: ${electron}\nApp: ${output}\nData: ${data}\nInteractive staging; smoke/dev flags removed.\n`);
  console.log('Opening Nibble Staging. The app stays open until you close its window.');
  const child = spawn(electron, launch.args, launch.options);
  child.on('error', error => { console.error(error.message); void appendFile(launchLog, `Launch error: ${error.message}\n`); process.exitCode = 1; });
  child.on('exit', (code, signal) => {
    void appendFile(launchLog, `Exit: ${code ?? signal} (${code === null ? signal : '0x' + (code >>> 0).toString(16)}).\n`);
    if (code !== 0) console.error(`Nibble exited before normal shutdown (${code ?? signal}). See .nibble-staging/staging-launch.log and electron-startup.log. No production data was changed.`);
    process.exitCode = code === 0 ? 0 : 1;
  });
}

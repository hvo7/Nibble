import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

export function productionLaunch(root, inherited = process.env) {
  const env = { ...inherited };
  for (const key of Object.keys(env)) if (/^(ELECTRON_RUN_AS_NODE|NIBBLE_SMOKE|NIBBLE_SCREENSHOT|NIBBLE_DEV_URL|NIBBLE_DATA_DIR|NIBBLE_CHANNEL)$/i.test(key)) delete env[key];
  return { args: [root, '--enable-logging=file', '--log-file=' + path.join(root, '.nibble-runtime', 'electron-startup.log')], options: { cwd: root, env, stdio: 'inherit', windowsHide: true } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  for (const file of ['dist/index.html', 'dist-electron/main.cjs', 'dist-electron/preload.cjs', 'dist-electron/ocr/eng.traineddata.gz', 'dist-electron/ocr/numbers/eng.traineddata.gz']) {
    if (!existsSync(path.join(root, file))) throw new Error('Production build is incomplete. Run npm run build first. Missing: ' + file);
  }
  const log = path.join(root, '.nibble-runtime', 'production-launch.log');
  mkdirSync(path.dirname(log), { recursive: true });
  writeFileSync(log, `${new Date().toISOString()} Production launch\nApp: ${root}\n`);
  const launch = productionLaunch(root), child = spawn(electron, launch.args, launch.options);
  child.on('error', error => { appendFileSync(log, `Launch error: ${error.message}\n`); console.error(error.message); process.exitCode = 1; });
  child.on('exit', (code, signal) => {
    appendFileSync(log, `Exit: ${code ?? signal}${code === null ? '' : ' (0x' + (code >>> 0).toString(16) + ')'}\n`);
    if (code !== 0) console.error(`Nibble could not start (${code ?? signal}). See ${log}.`);
    process.exitCode = code === 0 ? 0 : 1;
  });
}

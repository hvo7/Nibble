import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { copyDesktopOcr } from './prepare-ocr.mjs';

await mkdir('dist-electron', { recursive: true });
await mkdir('dist', { recursive: true });
await mkdir('public', { recursive: true });
await build({
  entryPoints: ['electron/main.ts', 'electron/preload.ts'],
  outdir: 'dist-electron', outExtension: { '.js': '.cjs' },
  bundle: true, platform: 'node', format: 'cjs', target: 'node22',
  packages: 'external', sourcemap: true, define: { 'import.meta.url': '__filename' },
});
await copyFile('assets/icon.svg', 'dist/icon.svg');
await copyFile('assets/icon.svg', 'public/icon.svg');
await copyDesktopOcr('dist-electron/ocr');
console.log('Production includes both tested English OCR models for offline screenshot import.');

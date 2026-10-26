import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createPreviewServer, previewPort } from './preview-server.mjs';
import { prepareOcr, copyPreviewOcr } from './prepare-ocr.mjs';
import { zipBrowserCompanion } from './prepare-browser-companion.mjs';

// This fixture-only UI server has no database, native bridge, API key or external network requests.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.nibble-staging', 'ui-preview'); await mkdir(output, { recursive: true });
await zipBrowserCompanion(path.join(output, 'nibble-browser-companion.zip'));
let ocrReady = false;
try { ocrReady = await prepareOcr({ download: !process.argv.includes('--build-only') }); }
catch (error) { console.error(`Screenshot OCR setup needs attention: ${error.cause?.code ?? error.message}. Run npm run setup:ocr when online, then restart this preview.`); }
await copyPreviewOcr(output);
const fixtureFile = path.join(output, 'fixtures.cjs');
await build({ stdin: { contents: `import { extractWebsite } from './electron/website'; import { sourceRecipe, jsonLd, conflictHtml } from './tests/fixtures/website'; import { randomUUID } from 'node:crypto'; const profile = randomUUID(); const parse = html => extractWebsite(html, 'https://example.com/carrot-soup', profile).recipes[0]; export const fixtures = { 'Published nutrition': parse(jsonLd(sourceRecipe)), 'Missing nutrition': parse(jsonLd({ ...sourceRecipe, nutrition: undefined })), 'Conflicting servings': parse(conflictHtml) };`, resolveDir: root, loader: 'ts' }, outfile: fixtureFile, bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
const { fixtures } = createRequire(import.meta.url)(fixtureFile);
await build({ entryPoints: [path.join(root, 'tests/ui/website-review.tsx')], outfile: path.join(output, 'preview.js'), bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' } });
const fixtureJson = JSON.stringify(fixtures).replaceAll('<', '\\u003c');
const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Nibble staging editor preview</title><link rel="stylesheet" href="./preview.css"></head><body><nav style="padding:12px 20px"><a href="/">Back to Nibble home</a> &middot; <strong>Current staging editor</strong></nav><div id="root"></div><script id="test-fixtures" type="application/json">${fixtureJson}</script><script src="./preview.js"></script></body></html>`;
await writeFile(path.join(output, 'index.html'), html);

// Package the already-proposed design as a normal HTTP page. Keeping its script
// and stylesheet separate lets the preview block inline script execution.
const design = await readFile(path.join(root, 'nibble-import-overhaul.html'), 'utf8');
const style = design.match(/<style>([\s\S]*?)<\/style>/);
const script = design.match(/<script>([\s\S]*?)<\/script>/);
if (!style || !script) throw new Error('The proposed import preview is missing its style or script.');
const body = design.replace(style[0], '').replace(script[0], '');
const icon = `data:image/svg+xml;base64,${(await readFile(path.join(root, 'public/icon.svg'))).toString('base64')}`;
// Bundle the actual app with a browser-only adapter. Reuse the existing allowlisted
// asset routes so an already-running preview picks up changes without a restart.
await build({
  entryPoints: [path.join(root, 'tests/ui/full-app-preview.tsx')], outfile: path.join(output, 'design.js'),
  bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"', '__NIBBLE_OCR_READY__': JSON.stringify(ocrReady) },
  plugins: [{ name: 'preview-only-adapters', setup(builder) {
    builder.onResolve({ filter: /^nibble:proposed-review$/ }, () => ({ path: 'review', namespace: 'preview-design' }));
    builder.onLoad({ filter: /.*/, namespace: 'preview-design' }, () => ({ contents: `export const proposedHtml = ${JSON.stringify(body)}; export function mountProposedReview() { ${script[1]} }`, loader: 'js' }));
    builder.onLoad({ filter: /[\\/]src[\\/]App\.tsx$/ }, async args => {
      const source = await readFile(args.path, 'utf8');
      if (!source.includes('"./icon.svg"')) throw new Error('App icon location changed; update the preview asset adapter.');
      return { contents: source.replaceAll('"./icon.svg"', JSON.stringify(icon)).replace('Saved locally', 'Preview session'), loader: 'tsx' };
    });
    builder.onLoad({ filter: /[\\/]src[\\/]components[\\/]ui\.tsx$/ }, async args => {
      const source = await readFile(args.path, 'utf8');
      const native = '`nibble://media/${id}`';
      if (!source.includes(native)) throw new Error('Media URL implementation changed; update the preview media adapter.');
      return { contents: source.replace(native, 'window.__nibblePreviewMedia(id)'), loader: 'tsx' };
    });
  } }],
});
await writeFile(path.join(output, 'design.css'), (await readFile(path.join(output, 'design.css'), 'utf8')) + '\n' + style[1]);
await writeFile(path.join(output, 'design.html'), `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Nibble - App preview</title><link rel="icon" href="${icon}"><link rel="stylesheet" href="/design.css"></head><body><div id="root"></div><script id="test-fixtures" type="application/json">${fixtureJson}</script><script src="/design.js"></script></body></html>`);

if (process.argv.includes('--build-only')) console.log(`Nibble previews built in ${output}`);
else {
  const flag = process.argv.indexOf('--port');
  const port = flag === -1 ? previewPort : Number(process.argv[flag + 1]);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('--port must be an integer from 1024 to 65535.');
  const server = createPreviewServer(output);
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE'
      ? `Port ${port} is already in use. Stop the previous preview, or run npm run preview:staging -- --port ${port + 1}.`
      : `Preview could not start: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', async () => {
    console.log(`\nNibble preview: http://127.0.0.1:${port}/`);
    console.log(`Current staging editor: http://127.0.0.1:${port}/editor`);
    console.log("Paste the preview URL into ChatGPT's side-panel browser, then use Annotate in its toolbar.");
    console.log('Synthetic data only. Keep this terminal open; press Ctrl+C to stop.');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(3000) });
      if (!response.ok || !(await response.text()).includes('<title>Nibble - App preview</title>')) {
        throw new Error('The server did not return the Nibble preview page.');
      }
      console.log('Local HTTP check passed. The preview is ready to open in the side panel.');
    } catch (error) {
      console.error(`Local HTTP check failed: ${error.cause?.code ?? error.message}`);
      console.error('A listening address alone does not confirm browser access. If launched by a restricted agent, stop it and run Start-Nibble-Preview.cmd from your normal Windows session.');
    }
  });
}

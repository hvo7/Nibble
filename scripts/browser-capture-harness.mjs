import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createPreviewServer } from './preview-server.mjs';
const root = process.cwd(), output = '.nibble-test/browser-capture-ui';
await mkdir(output, { recursive: true });
await build({ entryPoints: ['tests/fixtures/browser-capture.ts'], outfile: `${output}/fixture.cjs`, bundle: true, platform: 'node', format: 'cjs' });
const { browserFixtureHtml } = createRequire(import.meta.url)(`${root}/${output}/fixture.cjs`);
await build({ entryPoints: ['tests/ui/browser-capture-harness.js'], outfile: `${output}/design.js`, bundle: true, platform: 'browser', plugins: [{ name: 'fixture-source-url', setup(builder) {
  builder.onLoad({ filter: /browser-companion[\\/]capture\.js$/ }, async args => ({ contents: (await readFile(args.path, 'utf8')).replace('location.href', "document.querySelector('link[rel=canonical]').href"), loader: 'js' }));
} }] });
await writeFile(`${output}/design.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Nibble capture regression</title><link rel="canonical" href="https://example.com/fixture-recipe?utm_source=test&token=secret-value"></head><body><h1>Browser capture test fixture</h1><p>Authored instructions with the user's screenshot ingredient list. This tests the real capture function with only the source URL adapted for localhost.</p><button id="capture-test">Test browser capture</button><p id="capture-result" role="status"></p><a id="capture-download" hidden>Download captured test recipe</a>${browserFixtureHtml.replace('<h2>Comments</h2>', '<p hidden>secret-value</p><img src="data:,external-pixel"><div class="comments">Private message</div><h2>Comments</h2>')}<script src="/design.js"></script></body></html>`);
createPreviewServer(output).listen(4178, '127.0.0.1', () => console.log('Capture test: http://127.0.0.1:4178/'));

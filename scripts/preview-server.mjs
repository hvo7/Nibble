import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const previewPort = 4175;
const routes = new Map([
  ['/nibble-browser-companion.zip', ['nibble-browser-companion.zip', 'application/zip']],
  ['/', ['design.html', 'text/html; charset=utf-8']],
  ['/design.css', ['design.css', 'text/css; charset=utf-8']],
  ['/design.js', ['design.js', 'text/javascript; charset=utf-8']],
  ['/editor', ['index.html', 'text/html; charset=utf-8']],
  ['/preview.js', ['preview.js', 'text/javascript; charset=utf-8']],
  ['/preview.css', ['preview.css', 'text/css; charset=utf-8']],
  ['/ocr/worker.min.js', ['ocr/worker.min.js', 'text/javascript; charset=utf-8']],
  ['/ocr/tesseract-core-lstm.wasm.js', ['ocr/tesseract-core-lstm.wasm.js', 'text/javascript; charset=utf-8']],
  ['/ocr/tesseract-core.wasm.js', ['ocr/tesseract-core.wasm.js', 'text/javascript; charset=utf-8']],
  ['/ocr/eng.traineddata.gz', ['ocr/eng.traineddata.gz', 'application/octet-stream']],
  ['/ocr/numbers/eng.traineddata.gz', ['ocr/numbers/eng.traineddata.gz', 'application/octet-stream']],
]);

// Only these generated preview files are served. Never expose the repository,
// Electron bridge, recipe databases, credentials, or arbitrary filesystem paths.
export function previewHandler(output, load = readFile) {
  return async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    // Only the fixed local worker may compile WASM. No external connections,
    // inline/eval JavaScript, arbitrary workers, or database endpoints are allowed.
    const worker = request.url === '/ocr/worker.min.js';
    response.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'self'${worker ? " 'wasm-unsafe-eval'" : ''}; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
    const host = `127.0.0.1:${request.socket.localPort}`;
    if (request.headers.host !== host || (request.headers.origin && request.headers.origin !== `http://${host}`)) {
      response.writeHead(403).end('Local preview only'); return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      response.writeHead(405).end(); return;
    }
    // Match literal routes, including rejecting encoded traversal and query paths.
    const route = routes.get(request.url);
    if (!route) { response.writeHead(404).end('Not found'); return; }
    try {
      const data = await load(path.join(output, route[0]));
      response.setHeader('Content-Type', route[1]);
      response.writeHead(200).end(request.method === 'HEAD' ? undefined : data);
    } catch { response.writeHead(500).end('Preview unavailable. Rebuild the preview.'); }
  };
}

export function createPreviewServer(output) {
  return createServer(previewHandler(output));
}

import https from 'node:https';
import dns from 'node:dns/promises';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { TextDecoder } from 'node:util';
import ipaddr from 'ipaddr.js';

const MAX_BYTES = 4 * 1024 * 1024;
type ResourceKind = 'page' | 'image';
export function publicUrl(input: string): URL {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Use a public HTTPS link without credentials or custom ports.');
  if (url.href.length > 2000) throw new Error('This link is too long.');
  url.hash = ''; return url;
}
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  return ipaddr.process(address).range() === 'unicast';
}
/** Bound DNS waiting as well as socket time; a slow resolver cannot hold an import open. */
async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener('abort', aborted, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}
type PageResponse = { bytes: Buffer; contentType: string; location?: string };
function requestPage(url: URL, address: { address: string; family: number }, signal: AbortSignal, kind: ResourceKind): Promise<PageResponse> {
  const limit = kind === 'image' ? 8 * 1024 * 1024 : MAX_BYTES;
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      signal, timeout: 15000, family: address.family,
      headers: { 'User-Agent': 'Nibble/1.0.0 Recipe Importer', Accept: kind === 'image' ? 'image/jpeg,image/png,image/webp' : 'text/html,application/xhtml+xml', 'Accept-Encoding': 'gzip, deflate, br' },
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
    }, response => {
      const contentType = response.headers['content-type'] ?? '';
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0) && response.headers.location) {
        response.destroy(); resolve({ bytes: Buffer.alloc(0), contentType, location: response.headers.location }); return;
      }
      if (response.statusCode !== 200) { response.destroy(); reject(new Error(`The site returned ${response.statusCode}. Paste the recipe text or try again later.`)); return; }
      if (!(kind === 'image' ? /^image\/(jpeg|png|webp)(?:\s*;|$)/i : /^(text\/html|application\/xhtml\+xml)(?:\s*;|$)/i).test(contentType)) { response.destroy(); reject(new Error(kind === 'image' ? 'This link did not return a supported photo.' : 'This link did not return a recipe webpage.')); return; }
      const encoding = (response.headers['content-encoding'] ?? 'identity').toLowerCase().trim();
      const decoder = encoding === 'gzip' ? createGunzip() : encoding === 'deflate' ? createInflate() : encoding === 'br' ? createBrotliDecompress() : null;
      if (!decoder && encoding !== 'identity') { response.destroy(); reject(new Error('This page uses an unsupported compression format.')); return; }
      const stream = decoder ?? response; let received = 0; let decoded = 0; const chunks: Buffer[] = []; let finished = false;
      const fail = (error: Error) => { if (finished) return; finished = true; reject(error); response.destroy(); decoder?.destroy(); };
      if (Number(response.headers['content-length']) > limit) { fail(new Error('This page is too large to import safely.')); return; }
      response.on('data', (chunk: Buffer) => { received += chunk.length; if (received > limit) fail(new Error('This page is too large to import safely.')); });
      response.on('error', fail); response.on('aborted', () => fail(new Error('The website response was interrupted.')));
      stream.on('error', fail);
      stream.on('data', (chunk: Buffer) => { decoded += chunk.length; if (decoded > limit) fail(new Error('The expanded page is too large to import safely.')); else chunks.push(chunk); });
      stream.on('end', () => { if (!finished) { finished = true; resolve({ bytes: Buffer.concat(chunks), contentType }); } });
      if (decoder) response.pipe(decoder);
    });
    request.on('timeout', () => request.destroy(new Error('The site took too long to respond.')));
    request.on('error', reject);
  });
}
function decodePage(bytes: Buffer, contentType: string): string {
  const header = contentType.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1];
  const meta = bytes.subarray(0, 4096).toString('latin1').match(/<meta\b[^>]*charset\s*=\s*["']?([a-z0-9_-]+)/i)?.[1];
  try { return new TextDecoder(header || meta || 'utf-8').decode(bytes); }
  catch { throw new Error('This page uses an unsupported text encoding. Paste its recipe text instead.'); }
}
/** Every redirect repeats validation, and the connection is pinned to the validated DNS address. */
async function fetchResource(input: string, kind: ResourceKind, externalSignal?: AbortSignal): Promise<PageResponse & { url: string }> {
  const timeout = AbortSignal.timeout(kind === 'image' ? 12000 : 30000);
  const signal = externalSignal ? AbortSignal.any([externalSignal, timeout]) : timeout;
  let url = publicUrl(input);
  for (let redirects = 0; redirects <= 4; redirects++) {
    signal.throwIfAborted();
    const addresses = await abortable(dns.lookup(url.hostname.replace(/^\[|\]$/g, ''), { all: true }), signal);
    if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new Error('Private and local network links cannot be imported.');
    const result = await requestPage(url, addresses[0], signal, kind);
    if (!result.location) return { ...result, url: url.href };
    url = publicUrl(new URL(result.location, url).href);
  }
  throw new Error('This link redirects too many times.');
}

export async function fetchPublic(input: string, signal?: AbortSignal): Promise<{ body: string; url: string }> {
  const result = await fetchResource(input, 'page', signal);
  return { body: decodePage(result.bytes, result.contentType), url: result.url };
}
/** Photos use the same pinned public-DNS/redirect protections as recipe pages.
 * Never pass remote URLs to the renderer or the native image decoder. */
export async function fetchPublicImage(input: string, signal?: AbortSignal): Promise<{ bytes: Buffer; url: string }> {
  const result = await fetchResource(input, 'image', signal);
  const bytes = result.bytes;
  const jpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.length >= 24 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp = bytes.length >= 16 && bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
  if (!((jpeg && /^image\/jpeg/i.test(result.contentType)) || (png && /^image\/png/i.test(result.contentType)) || (webp && /^image\/webp/i.test(result.contentType)))) throw new Error('The photo did not contain the advertised image format.');
  return { bytes, url: result.url };
}

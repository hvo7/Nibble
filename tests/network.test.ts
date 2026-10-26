import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { gzipSync } from 'node:zlib';
import type { IncomingMessage } from 'node:http';
vi.mock('node:https', () => ({ default: { get: vi.fn() } }));
vi.mock('node:dns/promises', () => ({ default: { lookup: vi.fn() } }));
import https from 'node:https';
import dns from 'node:dns/promises';
import { fetchPublic, fetchPublicImage } from '../electron/network';

type Page = { status?: number; headers?: Record<string, string>; body?: Buffer; hang?: boolean; timeout?: boolean };
let pages: Page[];
beforeEach(() => {
  pages = []; vi.mocked(https.get).mockReset(); vi.mocked(dns.lookup).mockReset();
  vi.mocked(dns.lookup).mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as never);
  vi.mocked(https.get).mockImplementation(((_url: URL, options: https.RequestOptions, callback: (value: IncomingMessage) => void) => {
    const page = pages.shift() ?? {}; const request = new EventEmitter();
    const response = Object.assign(new PassThrough(), { statusCode: page.status ?? 200, headers: { 'content-type': 'text/html; charset=utf-8', ...page.headers } });
    Object.assign(request, { destroy: (error: Error) => { request.emit('error', error); response.destroy(); } });
    const signal = options.signal as AbortSignal;
    const abort = () => { request.emit('error', signal.reason); response.destroy(); };
    signal?.addEventListener('abort', abort, { once: true });
    response.on('close', () => signal?.removeEventListener('abort', abort));
    queueMicrotask(() => { callback(response as unknown as IncomingMessage); if (page.timeout) request.emit('timeout'); else if (!page.hang) response.end(page.body ?? Buffer.from('<h1>Recipe</h1>')); });
    return request;
  }) as unknown as typeof https.get);
});
afterEach(() => vi.restoreAllMocks());
describe('Public website transport', () => {
  it('decodes gzip and pins the lookup to the validated IP', async () => {
    pages.push({ headers: { 'content-encoding': 'gzip' }, body: gzipSync('<h1>Soup</h1>') });
    const result = await fetchPublic('https://example.com/soup#recipe'); expect(result.body).toBe('<h1>Soup</h1>'); expect(result.url).toBe('https://example.com/soup');
    const options = vi.mocked(https.get).mock.calls[0][1] as https.RequestOptions;
    expect(options.family).toBe(4); const callback = vi.fn();
    (options.lookup as Function)('example.com', {}, callback); expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4);
  });
  it('revalidates redirect targets and never connects to a private address', async () => {
    pages.push({ status: 302, headers: { location: 'https://localhost/secrets' } });
    vi.mocked(dns.lookup).mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }] as never).mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }] as never);
    await expect(fetchPublic('https://example.com')).rejects.toThrow(/Private/); expect(https.get).toHaveBeenCalledTimes(1);
  });
  it('rejects mixed public/private DNS answers', async () => {
    vi.mocked(dns.lookup).mockResolvedValue([{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }] as never);
    await expect(fetchPublic('https://example.com')).rejects.toThrow(/Private/); expect(https.get).not.toHaveBeenCalled();
  });
  it('follows relative HTTPS redirects and retains the final source URL', async () => {
    pages.push({ status: 301, headers: { location: '/new' } }, {});
    expect((await fetchPublic('https://example.com/old')).url).toBe('https://example.com/new'); expect(dns.lookup).toHaveBeenCalledTimes(2);
  });
  it('rejects HTTPS downgrades and redirect loops', async () => {
    pages.push({ status: 302, headers: { location: 'http://example.com' } });
    await expect(fetchPublic('https://example.com')).rejects.toThrow(/HTTPS/);
    pages = Array.from({ length: 5 }, () => ({ status: 302, headers: { location: '/again' } }));
    await expect(fetchPublic('https://example.com')).rejects.toThrow(/too many/);
  });
  it('rejects compressed expansion bombs and broken compression', async () => {
    pages.push({ headers: { 'content-encoding': 'gzip' }, body: gzipSync('x'.repeat(4 * 1024 * 1024 + 1)) });
    await expect(fetchPublic('https://example.com')).rejects.toThrow(/too large/);
    pages.push({ headers: { 'content-encoding': 'gzip' }, body: Buffer.from('not gzip') });
    await expect(fetchPublic('https://example.com')).rejects.toThrow();
  });
  it('rejects non-HTML, HTTP errors and declared oversize bodies', async () => {
    pages.push({ headers: { 'content-type': 'application/pdf' } }, { status: 429 }, { headers: { 'content-length': '9000000' } });
    await expect(fetchPublic('https://example.com')).rejects.toThrow(/webpage/);
    await expect(fetchPublic('https://example.com')).rejects.toThrow(/429/);
    await expect(fetchPublic('https://example.com')).rejects.toThrow(/too large/);
  });
  it('decodes an explicit legacy charset without corrupting fractions', async () => {
    pages.push({ headers: { 'content-type': 'text/html; charset=windows-1252' }, body: Buffer.from([0x31, 0xbd, 0x20, 0x67]) });
    expect((await fetchPublic('https://example.com')).body).toBe('1½ g');
  });
  it('cancels while DNS is still pending', async () => {
    vi.mocked(dns.lookup).mockImplementation(() => new Promise(() => {}) as never);
    const controller = new AbortController(); const result = fetchPublic('https://example.com', controller.signal); controller.abort(new Error('Canceled by user'));
    await expect(result).rejects.toThrow(/Canceled/); expect(https.get).not.toHaveBeenCalled();
  });
  it('cancels an active request and handles socket timeouts', async () => {
    pages.push({ hang: true }); const controller = new AbortController(); const result = fetchPublic('https://example.com', controller.signal);
    await vi.waitFor(() => expect(https.get).toHaveBeenCalledTimes(1)); controller.abort(new Error('Canceled by user')); await expect(result).rejects.toThrow(/Canceled/);
    pages.push({ timeout: true }); await expect(fetchPublic('https://example.com')).rejects.toThrow(/too long/);
  });
});

const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(24)]);
describe('Public photo transport', () => {
  it('downloads raster bytes with the same pinned DNS transport and no cookies', async () => {
    pages.push({ headers: { 'content-type': 'image/png' }, body: png });
    expect((await fetchPublicImage('https://cdn.example.com/photo.png')).bytes).toEqual(png);
    const options = vi.mocked(https.get).mock.calls[0][1] as https.RequestOptions;
    expect(options.headers).toMatchObject({ Accept: 'image/jpeg,image/png,image/webp' });
    expect(options.headers).not.toHaveProperty('Cookie'); expect(options.headers).not.toHaveProperty('Authorization');
    const callback = vi.fn(); (options.lookup as Function)('cdn.example.com',{},callback); expect(callback).toHaveBeenCalledWith(null,'8.8.8.8',4);
  });
  it('rejects SVG/HTML and disguised active content before decoding', async () => {
    for (const contentType of ['image/svg+xml','text/html','image/png','image/jpeg']) {
      pages.push({ headers: { 'content-type': contentType }, body: Buffer.from('<svg onload="alert(1)"></svg>') });
      await expect(fetchPublicImage('https://example.com/image')).rejects.toThrow(/photo|format/);
    }
  });
  it('accepts JPEG and WebP signatures only when the MIME matches', async () => {
    for (const [type,bytes] of [['image/jpeg',Buffer.from([255,216,255,224,0,0])],['image/webp',Buffer.from('RIFF1234WEBP1234')]] as const) {
      pages.push({headers:{'content-type':type},body:bytes}); expect((await fetchPublicImage('https://example.com/image')).bytes).toEqual(bytes);
    }
    pages.push({headers:{'content-type':'image/jpeg'},body:png}); await expect(fetchPublicImage('https://example.com/image')).rejects.toThrow(/format/);
  });
  it('rechecks CDN redirects and blocks private IPv4, IPv6 and mixed DNS', async () => {
    for (const address of ['127.0.0.1','10.0.0.1','169.254.169.254','::1','::ffff:127.0.0.1']) {
      vi.mocked(https.get).mockClear(); vi.mocked(dns.lookup).mockResolvedValueOnce([{address:'8.8.8.8',family:4}] as never).mockResolvedValueOnce([{address,family:address.includes(':')?6:4}] as never);
      pages.push({status:302,headers:{location:'https://internal.example/photo'}});
      await expect(fetchPublicImage('https://example.com/photo')).rejects.toThrow(/Private/); expect(https.get).toHaveBeenCalledTimes(1);
    }
    vi.mocked(dns.lookup).mockResolvedValueOnce([{address:'8.8.8.8',family:4},{address:'10.1.1.1',family:4}] as never);
    await expect(fetchPublicImage('https://example.com/photo')).rejects.toThrow(/Private/);
  });
  it('caps declared, streamed and decompressed photo sizes', async () => {
    pages.push({headers:{'content-type':'image/png','content-length':'9000000'},body:png});
    await expect(fetchPublicImage('https://example.com/photo')).rejects.toThrow(/too large/);
    pages.push({headers:{'content-type':'image/png'},body:Buffer.alloc(8*1024*1024+1)});
    await expect(fetchPublicImage('https://example.com/photo')).rejects.toThrow(/too large/);
    pages.push({headers:{'content-type':'image/png','content-encoding':'gzip'},body:gzipSync(Buffer.alloc(8*1024*1024+1))});
    await expect(fetchPublicImage('https://example.com/photo')).rejects.toThrow(/too large/);
  });
  it('rejects downgrades, credentials and cancellation during photo download', async () => {
    await expect(fetchPublicImage('https://user:password@example.com/photo')).rejects.toThrow(/HTTPS/);
    pages.push({status:302,headers:{location:'http://example.com/photo'}}); await expect(fetchPublicImage('https://example.com/photo')).rejects.toThrow(/HTTPS/);
    pages.push({hang:true,headers:{'content-type':'image/png'}}); const controller=new AbortController(); const download=fetchPublicImage('https://example.com/photo',controller.signal);
    await vi.waitFor(()=>expect(pages).toHaveLength(0)); controller.abort(new Error('Canceled photo')); await expect(download).rejects.toThrow(/Canceled/);
  });
});

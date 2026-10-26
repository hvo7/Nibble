// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://example.com/recipe"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Serializable extension function.
import { capturePagePhoto } from '../src/browser-companion/photo-capture.js';
const candidate = (url = 'https://example.com/dish.webp') => ({ url, reason: 'Recipe metadata' });
const context = { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: '' };
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,/9j/AA==');
});
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('companion image decoding', () => {
  it('embeds already loaded dish pixels without any fetch or page changes', async () => {
    document.body.innerHTML = '<img src="https://example.com/dish.webp">';
    const image = document.images[0];
    Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 1800 }, naturalHeight: { value: 1200 } });
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); const before = document.body.innerHTML;
    const result = await capturePagePhoto([candidate()]);
    expect(result.coverPhoto).toMatchObject({ mime: 'image/jpeg', width: 1200, height: 800, sourceUrl: candidate().url });
    expect(fetch).not.toHaveBeenCalled(); expect(document.body.innerHTML).toBe(before);
  });
  it('decodes same-site WebP using a bounded cookieless request without redirects', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/webp' } }));
    const close = vi.fn(); vi.stubGlobal('fetch', fetch); vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 400, height: 428, close }));
    const result = await capturePagePhoto([candidate()]);
    expect(result.coverPhoto.mime).toBe('image/jpeg'); expect(close).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(candidate().url, expect.objectContaining({ credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: expect.any(AbortSignal) }));
  });
  it('skips protected cross-site images and private addresses without fetching them', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const result = await capturePagePhoto([candidate('https://cdn.example.org/dish.jpg'), candidate('https://127.0.0.1/x'), candidate('http://example.com/x'), candidate('https://user:pass@example.com/x')]);
    expect(result.photoNote).toContain('paste'); expect(fetch).not.toHaveBeenCalled();
  });
  it('tries a second dish photo when the first is corrupt and caps attempts at six', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('corrupt')).mockImplementation(async () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', fetch); vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 640, height: 480, close: vi.fn() }));
    expect((await capturePagePhoto([candidate(), candidate('https://example.com/second.png')])).coverPhoto.sourceUrl).toContain('second.png');
    fetch.mockReset().mockRejectedValue(new Error('blocked'));
    await capturePagePhoto(Array.from({ length: 10 }, (_, i) => candidate('https://example.com/' + i + '.jpg')));
    expect(fetch).toHaveBeenCalledTimes(6);
  });
  it('rejects oversized downloads, tiny images and untrusted MIME types', async () => {
    const decode = vi.fn().mockResolvedValue({ width: 20, height: 20, close: vi.fn() });
    vi.stubGlobal('createImageBitmap', decode);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/jpeg', 'content-length': '999999999' } }))
      .mockResolvedValueOnce(new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } })));
    expect((await capturePagePhoto([candidate(), candidate(), candidate()])).coverPhoto).toBeUndefined();
    expect(decode).toHaveBeenCalledTimes(1);
  });
});

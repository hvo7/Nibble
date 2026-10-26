import sharp from 'sharp';

/** CDNs can serve WebP even at .png URLs; nativeImage only guarantees PNG/JPEG. */
export async function normalizeCoverPhoto(bytes: Buffer): Promise<Buffer> {
  if (bytes.length > 8 * 1024 * 1024) throw new Error('The photo exceeds the 8 MB download limit.');
  const decoder = sharp(bytes, { limitInputPixels: 40000000, failOn: 'error' });
  const metadata = await decoder.metadata();
  if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '')) throw new Error('The photo is not a supported PNG, JPEG or WebP image.');
  const { width = 0, height = 0 } = metadata;
  if (width < 200 || height < 160 || width / height > 3.2 || height / width > 3.2) throw new Error('The photo is too small or has a banner-like shape.');
  // Decode fully, normalize orientation and strip metadata before storing locally.
  return decoder.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
}

/** Safe categories reach the review form, never error messages containing local paths. */
export function coverPhotoFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (/timeout|timed out|too long/i.test(message)) return 'The image server timed out.';
  if (/ENOTFOUND|EAI_AGAIN/.test(code)) return 'The image server could not be found.';
  if (/ECONN|ENET|EHOST|EPIPE/.test(code)) return 'The image connection failed.';
  if (/returned (403|429)/.test(message)) return 'The image server blocked or limited the download.';
  if (/returned 404/.test(message)) return 'The image link no longer exists.';
  if (/Private|HTTPS|credentials|redirects/.test(message)) return 'The image link did not pass the public HTTPS checks.';
  if (/too small|banner-like/.test(message)) return 'The available photo is too small or unusually shaped.';
  if (/large|limit|megapixel/i.test(message)) return 'The available photo exceeds the image size limit.';
  if (/supported|format|decode|corrupt|header|image|photo|buffer/i.test(message)) return 'The downloaded file could not be read as a supported photo.';
  return 'The photo could not be downloaded or stored.';
}

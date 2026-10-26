import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { normalizeCoverPhoto, coverPhotoFailure } from '../electron/cover-photo';

const make = (width = 400, height = 428) => sharp({create:{width,height,channels:3,background:{r:130,g:70,b:30}}});
describe('Website photo decoding with real image bytes', () => {
  it.each(['png','jpeg','webp'] as const)('normalizes %s bytes to a readable PNG with the same dimensions', async format => {
    const bytes = await make().toFormat(format).toBuffer();
    const result = await normalizeCoverPhoto(bytes);
    expect(await sharp(result).metadata()).toMatchObject({format:'png',width:400,height:428});
  });
  it('limits stored cover resolution and removes EXIF metadata', async () => {
    const bytes = await make(2400,1800).withMetadata().jpeg().toBuffer();
    const result = await sharp(await normalizeCoverPhoto(bytes)).metadata();
    expect(result).toMatchObject({width:1600,height:1200,format:'png'});
    expect(result.exif).toBeUndefined();
  });
  it('rejects corrupt bytes, non-raster content, tiny photos and banners', async () => {
    for (const bytes of [Buffer.from('broken'),Buffer.from('<svg width="400" height="400"></svg>'),await make(1,1).png().toBuffer(),await make(1400,200).png().toBuffer()]) {
      await expect(normalizeCoverPhoto(bytes)).rejects.toThrow();
    }
  });
  it('rejects decoded images above the pixel limit and oversized downloads', async () => {
    const bytes = await make(6500,6500).png().toBuffer();
    await expect(normalizeCoverPhoto(bytes)).rejects.toThrow(/pixel limit/i);
    await expect(normalizeCoverPhoto(Buffer.alloc(8*1024*1024+1))).rejects.toThrow(/8 MB/);
  });
  it('reports actionable categories without leaking local paths', () => {
    expect(coverPhotoFailure(Object.assign(new Error('host'),{code:'ENOTFOUND'}))).toContain('could not be found');
    expect(coverPhotoFailure(new Error('The site returned 403.'))).toContain('blocked');
    expect(coverPhotoFailure(new Error('Input buffer has corrupt header'))).toContain('could not be read');
    expect(coverPhotoFailure(new Error('EACCES C:\\Users\\private\\photos'))).not.toContain('Users');
  });
});

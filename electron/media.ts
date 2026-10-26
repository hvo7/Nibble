import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { nativeImage } from 'electron';
import type { Asset } from '../src/shared/model';
import { Store } from './database';
import { normalizeCoverPhoto } from './cover-photo';

export class MediaStore {
  readonly directory: string;
  constructor(private store: Store) { this.directory = path.join(store.directory, 'media'); mkdirSync(this.directory, { recursive: true }); }
  file(id: string) { if (!/^[\da-f-]{36}$/.test(id)) throw new Error('Invalid media identifier.'); return path.join(this.directory, id); }
  addImage(bytes: Buffer, name: string, profileId: string, recipeCover = false): Asset {
    this.store.assertProfile(profileId);
    if (bytes.length > 20 * 1024 * 1024) throw new Error('Images must be smaller than 20 MB.');
    const image = nativeImage.createFromBuffer(bytes);
    const size = image.getSize();
    if (image.isEmpty() || size.width * size.height > 40000000) throw new Error('Use a readable JPG, PNG, or WebP image under 40 megapixels.');
    if (recipeCover && (size.width < 200 || size.height < 160 || size.width / size.height > 3.2 || size.height / size.width > 3.2)) throw new Error('The photo is too small or has a banner-like shape.');
    // Re-encoding removes active formats and metadata and gives OCR consistent PNG input.
    return this.savePng(image.toPNG(), name, profileId);
  }
  async addCoverPhoto(bytes: Buffer, name: string, profileId: string, signal?: AbortSignal): Promise<Asset> {
    this.store.assertProfile(profileId);
    signal?.throwIfAborted();
    const png = await normalizeCoverPhoto(bytes);
    signal?.throwIfAborted();
    return this.savePng(png, name, profileId);
  }
  private savePng(png: Buffer, name: string, profileId: string): Asset {
    const asset: Asset = { id: randomUUID(), name: name.slice(0, 300), mime: 'image/png', size: png.length };
    writeFileSync(this.file(asset.id), png);
    try { this.store.addAsset(asset, profileId); } catch (error) { unlinkSync(this.file(asset.id)); throw error; }
    return asset;
  }
  addVideo(file: string, profileId: string): Asset {
    this.store.assertProfile(profileId);
    const size = statSync(file).size;
    if (size > 250 * 1024 * 1024) throw new Error('Videos must be smaller than 250 MB.');
    if (!/\.(mp4|mov|webm)$/i.test(file)) throw new Error('Use an MP4, MOV, or WebM video.');
    const bytes = readFileSync(file);
    const isWebm = bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    const isMp4 = bytes.subarray(4, 8).toString() === 'ftyp';
    if (!isWebm && !isMp4) throw new Error('This file does not have a supported video header.');
    const asset: Asset = { id: randomUUID(), name: path.basename(file), mime: isWebm ? 'video/webm' : 'video/mp4', size };
    writeFileSync(this.file(asset.id), bytes);
    try { this.store.addAsset(asset, profileId); } catch (error) { unlinkSync(this.file(asset.id)); throw error; }
    return asset;
  }
  exists(id: string) { return existsSync(this.file(id)); }
}

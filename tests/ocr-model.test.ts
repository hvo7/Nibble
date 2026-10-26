import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { gzipSync } from 'node:zlib';
import { localOcrOptions } from '../electron/ocr-model';
const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
describe('bundled OCR model first use and recovery', () => {
  it('populates an empty cache locally and repairs a corrupt cache before recognition', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'nibble-model-')); folders.push(root);
    const cache = path.join(root, 'cache with spaces');
    const data = Buffer.alloc(1000000); data.writeUInt32LE(24);
    const compressed = gzipSync(data); writeFileSync(path.join(root, 'eng.traineddata.gz'), compressed);
    const options = localOcrOptions(root, cache);
    expect(options.cacheMethod).toBe('readOnly'); expect(options.langPath).toBe(root);
    expect(readFileSync(path.join(cache, 'eng.traineddata')).equals(data)).toBe(true);
    writeFileSync(path.join(cache, 'eng.traineddata'), 'interrupted');
    localOcrOptions(root, cache); expect(readFileSync(path.join(cache, 'eng.traineddata')).equals(data)).toBe(true);
    expect(readFileSync(path.join(root, 'eng.traineddata.gz')).equals(compressed)).toBe(true);
  });
  it('rejects invalid model data without overwriting an existing cache', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'nibble-model-')); folders.push(root);
    const cache = path.join(root, 'cache'); mkdirSync(cache);
    writeFileSync(path.join(cache, 'eng.traineddata'), 'previous');
    writeFileSync(path.join(root, 'eng.traineddata.gz'), gzipSync(Buffer.from('not a model')));
    expect(() => localOcrOptions(root, cache)).toThrow('damaged');
    expect(readFileSync(path.join(cache, 'eng.traineddata'), 'utf8')).toBe('previous');
  });
});

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

/** Tesseract 5 misinterprets local langPath in Electron and has a broken Lang[]
 * initializer. Seed its supported filesystem cache from the bundled model before
 * creating a worker. No network or pre-existing cache is needed on first use. */
export function localOcrOptions(languageDirectory: string, cacheDirectory: string) {
  const bytes = gunzipSync(readFileSync(path.join(languageDirectory, 'eng.traineddata.gz')), { maxOutputLength: 40000000 });
  if (bytes.length < 1000000 || bytes.readUInt32LE(0) < 1 || bytes.readUInt32LE(0) > 1000) throw new Error('The bundled English OCR model is damaged. Rebuild or reinstall Nibble.');
  mkdirSync(cacheDirectory, { recursive: true });
  // Rewrite on worker creation to repair an interrupted/corrupt cache automatically.
  writeFileSync(path.join(cacheDirectory, 'eng.traineddata'), bytes);
  return { langPath: languageDirectory, cachePath: cacheDirectory, cacheMethod: 'readOnly' as const, errorHandler: () => {} };
}

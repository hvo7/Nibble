import { mkdir, readFile, writeFile, rename, copyFile, access } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ocrDirectory = path.join(root, '.nibble-staging', 'ocr-assets');
export const ocrNumberDirectory = path.join(ocrDirectory, 'numbers');
// This is Tesseract.js's existing free English language data, not a remote OCR service.
const languageUrl = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz';
const textHash = '45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91';
const numberHash = 'ed350f3752f81ee8f38769edc14d92d997dababe23b565c59879372cc46a2468';
function validate(bytes, expectedHash) {
  if (createHash('sha256').update(bytes).digest('hex') !== expectedHash) throw new Error('The OCR model does not match the tested release.');
  const decoded = gunzipSync(bytes, { maxOutputLength: 40000000 });
  if (decoded.length < 1000000 || decoded.readUInt32LE(0) < 1 || decoded.readUInt32LE(0) > 1000) throw new Error('The English OCR file is not valid trained language data.');
  return decoded;
}
async function prepareModel(directory, url, cache, download, expectedHash) {
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, 'eng.traineddata.gz');
  let compressed;
  try { compressed = await readFile(file); validate(compressed, expectedHash); }
  catch (error) {
    if (!download) return false;
    console.log('Preparing free English OCR data. Images are processed locally; none are uploaded.');
    const response = await fetch(url, { signal: AbortSignal.timeout(60000), redirect: 'error' });
    if (!response.ok || !response.body) throw new Error(`OCR language download failed (HTTP ${response.status}).`);
    const pieces = []; let length = 0;
    for await (const chunk of response.body) { length += chunk.length; if (length > 20000000) throw new Error('OCR download exceeded its size limit.'); pieces.push(chunk); }
    compressed = Buffer.concat(pieces); validate(compressed, expectedHash);
    await writeFile(file + '.partial', compressed); await rename(file + '.partial', file);
  }
  // Reuse the same model in desktop staging; this never touches production data.
  if (cache) {
    await mkdir(cache, { recursive: true });
    await writeFile(path.join(cache, 'eng.traineddata'), validate(compressed, expectedHash));
  }
  return true;
}
export async function prepareOcr({ download = false, cacheDirectory = path.join(root, '.nibble-staging', 'data', 'ocr-cache') } = {}) {
  const text = await prepareModel(ocrDirectory, languageUrl, cacheDirectory, download, textHash);
  const numbers = await prepareModel(ocrNumberDirectory, 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0/eng.traineddata.gz', cacheDirectory && path.join(cacheDirectory, 'numbers'), download, numberHash);
  return text && numbers;
}
export async function copyDesktopOcr(target) {
  if (!await prepareOcr({ download: true, cacheDirectory: null })) throw new Error('Both OCR models are required for a production build.');
  await mkdir(path.join(target, 'numbers'), { recursive: true });
  await copyFile(path.join(ocrDirectory, 'eng.traineddata.gz'), path.join(target, 'eng.traineddata.gz'));
  await copyFile(path.join(ocrNumberDirectory, 'eng.traineddata.gz'), path.join(target, 'numbers', 'eng.traineddata.gz'));
  await copyFile(path.join(root, 'docs', 'third-party', 'tesseract-language-data-LICENSE.txt'), path.join(target, 'LICENSE.txt'));
  await writeFile(path.join(target, 'models.json'), JSON.stringify({ package: '@tesseract.js-data/eng@1.0.0', license: 'Apache-2.0', source: 'https://github.com/naptha/tessdata', models: [{ file: 'eng.traineddata.gz', variant: '4.0.0_best_int', sha256: textHash }, { file: 'numbers/eng.traineddata.gz', variant: '4.0.0', sha256: numberHash }] }, null, 2) + '\n');
}
export async function copyPreviewOcr(output) {
  const target = path.join(output, 'ocr'); await mkdir(target, { recursive: true });
  await copyFile(path.join(root, 'node_modules/tesseract.js/dist/worker.min.js'), path.join(target, 'worker.min.js'));
  await copyFile(path.join(root, 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js'), path.join(target, 'tesseract-core-lstm.wasm.js'));
  await copyFile(path.join(root, 'node_modules/tesseract.js-core/tesseract-core.wasm.js'), path.join(target, 'tesseract-core.wasm.js'));
  await mkdir(path.join(target, 'numbers'), { recursive: true });
  try {
    await access(path.join(ocrNumberDirectory, 'eng.traineddata.gz'));
    await copyFile(path.join(ocrDirectory, 'eng.traineddata.gz'), path.join(target, 'eng.traineddata.gz'));
    await copyFile(path.join(ocrNumberDirectory, 'eng.traineddata.gz'), path.join(target, 'numbers', 'eng.traineddata.gz')); return true;
  }
  catch { return false; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await prepareOcr({ download: true }); console.log('English screenshot OCR is ready.'); }
  catch (error) { console.error(`Could not prepare OCR: ${error.cause?.code ?? error.message}. Check internet access and run npm run setup:ocr again.`); process.exitCode = 1; }
}

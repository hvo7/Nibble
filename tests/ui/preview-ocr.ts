import { createWorker, type Worker } from 'tesseract.js';
import { recognizeRecipeImage, withAbort, ocrScale, ocrCrop, readFocusedRegion, type ReadOcrRegion } from '../../src/shared/ocr-result';
declare const __NIBBLE_OCR_READY__: boolean;

export async function createPreviewReader(progress: (message: string) => void, signal: AbortSignal) {
  if (typeof __NIBBLE_OCR_READY__ !== 'undefined' && !__NIBBLE_OCR_READY__) throw new Error('The English OCR model is not prepared yet. Restart Start-Nibble-Preview.cmd with internet access; it downloads the free language data once.');
  let worker: Worker | undefined;
  let numbers: Worker | undefined;
  const cancel = () => { void worker?.terminate().catch(() => {}); void numbers?.terminate().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const loadingSignal = AbortSignal.any([signal, AbortSignal.timeout(60000)]);
    const loading = createWorker('eng', 1, {
      workerPath: '/ocr/worker.min.js', workerBlobURL: false,
      corePath: '/ocr/tesseract-core-lstm.wasm.js',
      langPath: '/ocr', gzip: true, cachePath: 'nibble-preview-ocr-v1',
      logger: message => progress(`${message.status} · ${Math.round(message.progress * 100)}%`), errorHandler: () => {},
    });
    void loading.then(created => { if (loadingSignal.aborted) return created.terminate(); }).catch(() => {});
    worker = await withAbort(loading, loadingSignal);
    if (signal.aborted) { await worker.terminate(); signal.throwIfAborted(); }
    return {
      async read(dataUrl: string) {
        signal.throwIfAborted();
        const readingSignal = AbortSignal.any([signal, AbortSignal.timeout(120000)]);
        const image = new Image(); image.src = dataUrl; await withAbort(image.decode(), readingSignal);
        if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 40000000) throw new Error('Use a readable screenshot under 40 megapixels.');
        const scale = ocrScale(image.naturalWidth, image.naturalHeight);
        const canvas = document.createElement('canvas'); canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
        const context = canvas.getContext('2d')!; context.imageSmoothingQuality = 'high'; context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const readRegion: ReadOcrRegion = async (box, kind) => {
          if (!numbers) {
            progress('Checking small quantities and fractions');
            const loading = createWorker('eng', 0, { workerPath: '/ocr/worker.min.js', workerBlobURL: false, corePath: '/ocr/tesseract-core.wasm.js', langPath: '/ocr/numbers', gzip: true, cachePath: 'nibble-preview-numbers-v1', errorHandler: () => {} });
            void loading.then(created => { if (readingSignal.aborted) return created.terminate(); }).catch(() => {});
            numbers = await withAbort(loading, readingSignal);
          }
          const crop = ocrCrop(box, canvas.width, canvas.height);
          return readFocusedRegion(numbers, height => {
            const region = document.createElement('canvas'); region.width = Math.round(crop.width * height / crop.height); region.height = height;
            const regionContext = region.getContext('2d')!; regionContext.imageSmoothingQuality = 'high'; regionContext.drawImage(canvas, crop.x, crop.y, crop.width, crop.height, 0, 0, region.width, region.height);
            return region;
          }, kind, readingSignal);
        };
        return recognizeRecipeImage(worker!, canvas, canvas.width, canvas.height, readingSignal, readRegion);
      },
      async close() { signal.removeEventListener('abort', cancel); await worker?.terminate().catch(() => {}); await numbers?.terminate().catch(() => {}); },
    };
  } catch (error) { signal.removeEventListener('abort', cancel); await worker?.terminate().catch(() => {}); await numbers?.terminate().catch(() => {}); throw error; }
}

import type { Page, Worker, ImageLike } from 'tesseract.js';
import type { Evidence } from './model';

export type OcrBox = { x0: number; y0: number; x1: number; y1: number };
export type ReadOcrRegion = (box: OcrBox, kind: 'number' | 'text') => Promise<{ text: string; confidence: number; corroborated?: boolean }>;
export async function readFocusedRegion(worker: Worker, imageAtHeight: (height: number) => ImageLike | Promise<ImageLike>, kind: 'number' | 'text', signal?: AbortSignal) {
  await withAbort(worker.setParameters({ tessedit_pageseg_mode: '13' as never, tessedit_char_whitelist: kind === 'number' ? '0123456789/. ' : '0123456789/.-inchthick', classify_bln_numeric_mode: kind === 'number' ? '1' : '0' }), signal);
  const read = async (height: number) => focusedReading((await withAbort(worker.recognize(await imageAtHeight(height)), signal)).data);
  const first = await read(100);
  if (first.confidence >= 65) return first;
  const second = await read(140);
  return { ...first, corroborated: first.text === second.text && first.confidence >= 60 && second.confidence >= 60 };
}
/** Separate a whole digit from a raised fraction numerator using glyph geometry. */
export function focusedReading(data: Page) {
  let text = data.text.trim();
  if (/^\d{2,}\/\d+$/.test(text)) {
    const symbols = (data.symbols ?? []).filter(symbol => symbol.text.trim());
    const slash = symbols.findIndex(symbol => symbol.text === '/');
    if (slash > 1) {
      const whole = symbols[0].bbox, numerator = symbols[slash - 1].bbox;
      const height = whole.y1 - whole.y0;
      if (numerator.y1 - numerator.y0 < height * .8 && numerator.y1 < whole.y1 - height * .2) {
        const offset = symbols.slice(0, slash - 1).map(symbol => symbol.text).join('').length;
        text = text.slice(0, offset) + ' ' + text.slice(offset);
      }
    }
  }
  return { text, confidence: data.confidence };
}
// Both desktop and preview enlarge small screenshots before reading tiny fractions.
export const ocrScale = (width: number, height: number) => Math.min(3, Math.max(1, 2000 / width), Math.sqrt(12000000 / (width * height)));
export function ocrCrop(box: OcrBox, width: number, height: number) {
  const pad = Math.max(2, Math.round((box.y1 - box.y0) * .08));
  const x = Math.max(0, box.x0 - 1), y = Math.max(0, box.y0 - pad);
  return { x, y, width: Math.min(width, box.x1 + 1) - x, height: Math.min(height, box.y1 + pad) - y };
}

export function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason ?? new Error('Reading canceled.')); };
    signal.addEventListener('abort', abort, { once: true });
    promise.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
    if (signal.aborted) abort();
  });
}

export function ocrEvidence(data: Page, width: number | null = null, height: number | null = null): Pick<Evidence, 'text' | 'ocr'> {
  const confidence = (n: number) => Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
  const lines = (data.lines ?? []).slice(0, 5000).map(line => ({ text: line.text.trim().slice(0, 10000), confidence: confidence(line.confidence), bbox: { x0: line.bbox.x0, y0: line.bbox.y0, x1: line.bbox.x1, y1: line.bbox.y1 } }));
  return { text: data.text.slice(0, 250000), ocr: { confidence: confidence(data.confidence), width, height, lines } };
}

/** Retry a weak layout without silently replacing a conflicting, readable result. */
export async function recognizeRecipeImage(worker: Worker, input: ImageLike, width: number | null = null, height: number | null = null, signal?: AbortSignal, readRegion?: ReadOcrRegion) {
  signal?.throwIfAborted();
  await withAbort(worker.setParameters({ tessedit_pageseg_mode: '3' as never, preserve_interword_spaces: '1', user_defined_dpi: '300' }), signal);
  const first = (await withAbort(worker.recognize(input, { rotateAuto: true }, { text: true, blocks: true }), signal)).data;
  let selected = first;
  const result = ocrEvidence(first, width, height);
  if (!first.text.trim() || first.confidence < 75) {
    await withAbort(worker.setParameters({ tessedit_pageseg_mode: '6' as never }), signal);
    const second = (await withAbort(worker.recognize(input, { rotateAuto: true }, { text: true, blocks: true }), signal)).data;
    if (!first.text.trim()) { selected = second; Object.assign(result, ocrEvidence(second, width, height)); }
    if (second.text.trim() && second.text.trim() !== first.text.trim()) result.ocr!.alternativeText = second.text.slice(0, 250000);
  }
  // Layout OCR is poor at small typeset fractions. Read the actual number pixels
  // with the second, character-based engine; never map guessed strings to amounts.
  if (readRegion && selected.lines?.some(line => line.words?.length)) {
    const checks: string[] = [], unresolved: string[] = [];
    const rewritten: string[] = [];
    for (const line of selected.lines) {
      signal?.throwIfAborted();
      const words = [...(line.words ?? [])];
      const firstWord = words[0], next = words[1];
      if (firstWord && next && /^[•·«»*+eo.]$/.test(firstWord.text) && firstWord.bbox.y1 - firstWord.bbox.y0 < .65 * (next.bbox.y1 - next.bbox.y0) && firstWord.bbox.x1 < next.bbox.x0) words.shift();
      const texts = words.map(word => word.text);
      for (let index = 0; index < words.length; index++) {
        const word = words[index];
        const followedByUnit = /^(?:cups?|tbsp|tsp|tablespoons?|teaspoons?|pounds?|lbs?|oz|ounces?|g|grams?|kg|ml|packages?)\b/i.test(words[index + 1]?.text ?? '');
        const firstQuantity = index === 0 && /^(?:[\d¼½¾⅓⅔%¥]|[YyVv][a-z\d/]|[«»“”]\w)/.test(word.text) && (!word.text.includes('%') || followedByUnit) && (word.confidence < 85 || !/^[\d./¼½¾⅓⅔]+$/.test(word.text));
        const mixedFraction = /^\d+(?:[%¥][a-z\d]?|[Yy][a-z\d])$/.test(word.text) && followedByUnit;
        const fractionSize = /^[^\s]+-inch(?:-|$)/.test(word.text) && word.confidence < 70;
        if (!firstQuantity && !mixedFraction && !fractionSize) continue;
        if (checks.length + unresolved.length >= 150) { unresolved.push('Additional quantities need manual checking.'); break; }
        const box = { ...word.bbox };
        try {
          const read = await withAbort(readRegion(box, fractionSize ? 'text' : 'number'), signal);
          const value = read.text.trim().replace(/\s*\/\s*/g, '/');
          const valid = fractionSize ? /^(?:\d+\/\d+|[¼½¾⅓⅔])-inch(?:-\w+)?$/.test(value) : /^(?:\d+(?:\.\d+)?|\d+\/[1-9]\d?|\d+\s+\d+\/[1-9]\d?|[¼½¾⅓⅔])$/.test(value);
          if (valid && (read.confidence >= 65 || read.corroborated)) {
            texts[index] = value;
            if (texts[index] !== word.text) checks.push(`"${word.text}" → "${texts[index]}" (${Math.round(read.confidence)}% focused OCR confidence${read.corroborated ? '; two image sizes agree' : ''})`);
          } else {
            unresolved.push(line.text.trim());
            // Do not turn a low-confidence digit (often half a fraction) into a
            // confident 2-pound ingredient. Keep the reading, leave amount unknown.
            if (index === 0) texts[index] = '?' + word.text;
          }
        } catch (error) {
          signal?.throwIfAborted(); unresolved.push(`Quantity reader unavailable: ${error instanceof Error ? error.message : 'could not read'}`);
          if (index === 0) texts[index] = '?' + word.text;
        }
      }
      rewritten.push(texts.length ? texts.join(' ') : line.text.trim());
    }
    const text = rewritten.join('\n');
    if (text !== result.text) (result as Pick<Evidence, 'text' | 'ocr' | 'originalText'>).originalText = result.text;
    result.text = text;
    result.ocr!.lines = result.ocr!.lines.map((line, index) => ({ ...line, text: rewritten[index] ?? line.text }));
    result.ocr!.numberChecks = checks; result.ocr!.unresolvedNumbers = [...new Set(unresolved)];
  }
  return result;
}

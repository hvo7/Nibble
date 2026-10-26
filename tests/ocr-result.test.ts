import { describe, expect, it, vi } from 'vitest';
import type { Page } from 'tesseract.js';
import { focusedReading, recognizeRecipeImage, readFocusedRegion } from '../src/shared/ocr-result';

const word = (text: string, x0: number, x1: number, confidence = 95) => ({ text, confidence, bbox: { x0, y0: 10, x1, y1: 50 }, symbols: [] });
const page = (quantity: string, confidence = 50) => {
  const words = [word(quantity, 20, 60, confidence), word('cup', 70, 130), word('yogurt', 140, 230)];
  const text = quantity + ' cup yogurt';
  return { text, confidence: 95, lines: [{ text, confidence: 90, bbox: { x0: 20, y0: 10, x1: 230, y1: 50 }, words }] } as unknown as Page;
};
const worker = (data: Page) => ({ setParameters: vi.fn().mockResolvedValue({}), recognize: vi.fn().mockResolvedValue({ data }) });
describe('focused quantity OCR', () => {
  it('requires two matching size reads for a borderline result and retains its original confidence', async () => {
    for (const secondText of ['2 1/2', '2 1/3']) {
      const engine = worker(page('2'));
      engine.recognize.mockResolvedValueOnce({ data: { text: '2 1/2', confidence: 63 } as Page }).mockResolvedValueOnce({ data: { text: secondText, confidence: 64 } as Page });
      const sizes: number[] = [];
      const result = await readFocusedRegion(engine as never, height => { sizes.push(height); return ''; }, 'number');
      expect(result.confidence).toBe(63); expect(result).toHaveProperty('corroborated', secondText === '2 1/2'); expect(sizes).toEqual([100, 140]);
    }
  });
  it('uses real secondary readings and retains the initial OCR when a digit becomes a fraction', async () => {
    const data = page('2'), reader = vi.fn().mockResolvedValue({ text: '1/2', confidence: 88 });
    const result = await recognizeRecipeImage(worker(data) as never, '' as never, 300, 100, undefined, reader);
    expect(result.text).toBe('1/2 cup yogurt'); expect(result).toHaveProperty('originalText', '2 cup yogurt');
    expect(result.ocr?.numberChecks?.[0]).toContain('1/2'); expect(reader).toHaveBeenCalledTimes(1);
  });
  it('does not guess an ambiguous fraction when the number reader fails or disagrees weakly', async () => {
    for (const read of [vi.fn().mockResolvedValue({ text: '1/3', confidence: 30 }), vi.fn().mockRejectedValue(new Error('Unavailable'))]) {
      const result = await recognizeRecipeImage(worker(page('2')) as never, '' as never, 300, 100, undefined, read);
      expect(result.text).toBe('?2 cup yogurt'); expect(result.ocr?.unresolvedNumbers?.length).toBe(1);
    }
  });
  it('does not reread or change a clear integer quantity', async () => {
    const read = vi.fn();
    const result = await recognizeRecipeImage(worker(page('2', 96)) as never, '' as never, 300, 100, undefined, read);
    expect(result.text).toBe('2 cup yogurt'); expect(read).not.toHaveBeenCalled();
  });
  it('uses glyph geometry to distinguish a mixed fraction from an improper fraction', () => {
    const symbols = ['2', '1', '/', '2'].map((text, i) => ({ text, bbox: { x0: i * 20, x1: i * 20 + 18, y0: 0, y1: i === 1 ? 55 : 100 } }));
    expect(focusedReading({ text: '21/2', confidence: 80, symbols } as Page).text).toBe('2 1/2');
    symbols[1].bbox.y1 = 100;
    expect(focusedReading({ text: '21/2', confidence: 80, symbols } as Page).text).toBe('21/2');
  });
});

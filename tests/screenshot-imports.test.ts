import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
vi.mock('electron', () => {
  const image = { getSize: () => ({ width: 800, height: 900 }), isEmpty: () => false, resize: () => image, crop: () => image, toPNG: () => Buffer.from('mock image') };
  return { app: { isPackaged: false, getAppPath: vi.fn(() => process.cwd()) }, nativeImage: { createFromPath: () => image } };
});
vi.mock('tesseract.js', () => ({ createWorker: vi.fn() }));
import { createWorker } from 'tesseract.js';
import { app } from 'electron';
import { Store } from '../electron/database';
import { MediaStore } from '../electron/media';
import { ImportService } from '../electron/processing';
import { uid } from '../src/shared/model';

let directory: string, store: Store, service: ImportService, profileId: string;
const page = (text: string) => ({ data: { text, confidence: 95, lines: text.split('\n').map((text, index) => ({ text, confidence: 95, bbox: { x0: 10, y0: index * 20, x1: 400, y1: index * 20 + 18 } })) } });
const worker = () => ({ setParameters: vi.fn().mockResolvedValue({}), recognize: vi.fn().mockResolvedValue(page('Soup\nServes 4\nIngredients\n200 g carrots\n750 ml stock\nInstructions\nSimmer until tender.\nNutrition Facts\nServing size: 1 bowl\nCalories: 180')), terminate: vi.fn().mockResolvedValue({}) });
const asset = (name: string) => { const id = uid(); store.addAsset({ id, name, mime: 'image/png', size: 1000 }, profileId); return id; };
beforeEach(async () => {
  vi.stubEnv('NIBBLE_CHANNEL', '');
  directory = mkdtempSync(path.join(os.tmpdir(), 'nibble-screenshot-')); store = new Store(directory); await store.open(); profileId = uid();
  store.saveProfile({ id: profileId, name: 'OCR test', units: 'metric', avatar: '', createdAt: '' }); service = new ImportService(store, new MediaStore(store), () => {});
  vi.mocked(createWorker).mockReset();
  vi.mocked(app.getAppPath).mockReturnValue(directory);
  mkdirSync(path.join(directory, 'dist-electron', 'ocr'), { recursive: true });
  const model = Buffer.alloc(1000000); model.writeUInt32LE(24);
  writeFileSync(path.join(directory, 'dist-electron', 'ocr', 'eng.traineddata.gz'), gzipSync(model));
});
afterEach(() => { service.cancelAll(); store.close(); rmSync(directory, { recursive: true, force: true }); vi.unstubAllEnvs(); });
describe('screenshot import lifecycle (mocked OCR engine)', () => {
  it('reads screenshots when selected per import and produces an editable, source-linked card', async () => {
    vi.mocked(createWorker).mockResolvedValue(worker() as never);
    const id = service.start({ profileId, text: '', url: '', assetIds: [asset('recipe.png')], useAI: false, readImages: true });
    await vi.waitFor(() => expect(store.snapshot().jobs.find(j => j.id === id)?.status).toBe('review'));
    const draft = store.snapshot().jobs.find(j => j.id === id)!.drafts[0];
    expect(vi.mocked(createWorker).mock.calls[0][0]).toBe('eng');
    expect(vi.mocked(createWorker).mock.calls[0][2]?.cacheMethod).toBe('readOnly');
    expect(draft.title).toBe('Soup'); expect(draft.ingredients).toHaveLength(2); expect(draft.steps).toHaveLength(1); expect(draft.servings).toBe(4);
    expect(draft.sourceNutrition?.servingSize).toBe('1 bowl'); expect(draft.evidence[0].ocr?.lines).toHaveLength(10);
    expect(draft.ingredients[0].sourceRefs?.[0].evidenceId).toBe(draft.evidence[0].id);
    const saved = store.saveRecipe(draft); expect(saved.evidence).toEqual(draft.evidence);
    expect(() => store.saveRecipe({ ...saved, status: 'ready' })).toThrow('Check');
    expect(store.saveRecipe({ ...saved, status: 'ready', sourceReview: { parser: 'sections-v2', confirmed: true } }).status).toBe('ready');
  });
  it('continues to later screenshots after one reading fails, retaining the failed source', async () => {
    const first = worker(); first.recognize.mockRejectedValue(new Error('Damaged image'));
    vi.mocked(createWorker).mockResolvedValueOnce(first as never).mockResolvedValueOnce(worker() as never);
    const id = service.start({ profileId, text: '', url: '', assetIds: [asset('broken.png'), asset('good.png')], useAI: false, readImages: true });
    await vi.waitFor(() => expect(store.snapshot().jobs.find(j => j.id === id)?.status).toBe('review'));
    const draft = store.snapshot().jobs.find(j => j.id === id)!.drafts[0];
    expect(draft.evidence).toHaveLength(2); expect(draft.evidence[0].ocr?.error).toContain('Damaged'); expect(draft.ingredients).toHaveLength(2);
  });
  it('makes attachment-only an explicit opt-out and never reports extracted ingredients', async () => {
    const id = service.start({ profileId, text: '', url: '', assetIds: [asset('recipe.png')], useAI: false, readImages: false });
    await vi.waitFor(() => expect(store.snapshot().jobs.find(j => j.id === id)?.status).toBe('review'));
    const job = store.snapshot().jobs.find(j => j.id === id)!;
    expect(createWorker).not.toHaveBeenCalled(); expect(job.drafts[0].evidence).toHaveLength(1); expect(job.stage).toContain('No ingredients');
  });
  it('cancels an OCR operation even when the worker never resolves its recognition promise', async () => {
    const stalled = worker(); stalled.recognize.mockImplementation(() => new Promise(() => {}));
    vi.mocked(createWorker).mockResolvedValue(stalled as never);
    const id = service.start({ profileId, text: 'Soup\nIngredients\n200 g carrots', url: '', assetIds: [asset('slow.png')], useAI: false, readImages: true });
    await vi.waitFor(() => expect(stalled.recognize).toHaveBeenCalled()); service.cancel(id);
    await vi.waitFor(() => expect(store.snapshot().jobs.find(j => j.id === id)?.status).toBe('canceled'));
    const job = store.snapshot().jobs.find(j => j.id === id)!;
    expect(job.drafts[0].ingredients).toHaveLength(1); expect(job.drafts[0].evidence).toHaveLength(2); expect(stalled.terminate).toHaveBeenCalled();
  });
});

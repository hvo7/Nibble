import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
vi.mock('electron', () => ({ safeStorage: { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(value), decryptString: (value: Buffer) => value.toString() } }));
import { Store } from '../electron/database';
import { NutritionService } from '../electron/nutrition';
import { blankRecipe, uid } from '../src/shared/model';
import { calculateNutrition, parseIngredient } from '../src/shared/recipe';

let store: Store; let directory: string; let service: NutritionService;
const fetchMock = vi.fn();
beforeEach(async () => { directory = mkdtempSync(path.join(os.tmpdir(), 'nibble-usda-')); store = new Store(directory); await store.open(); service = new NutritionService(store); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); store.close(); rmSync(directory, { recursive: true, force: true }); });
const food = { fdcId: 123, description: 'Carrots, raw', dataType: 'Foundation', foodNutrients: [{ nutrient: { id: 1008, unitName: 'KCAL' }, amount: 40 }, { nutrient: { id: 1003, unitName: 'G' }, amount: 1 }, { nutrient: { id: 1004, unitName: 'G' }, amount: null }], foodPortions: [{ gramWeight: 80, amount: 1, modifier: 'carrot' }] };
const key = 'fixture-key-never-a-real-credential';
describe('Optional USDA matching', () => {
  it('does not call an external service without a user key', async () => {
    await expect(service.search('carrots')).rejects.toThrow(/key/); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('normalizes per-100g nutrients and reuses cached food details', async () => {
    service.setKey(key); fetchMock.mockResolvedValue(new Response(JSON.stringify(food)));
    const matched = await service.food(123); expect(matched.per100g).toEqual({ calories: 40, protein: 1, carbs: null, fat: null });
    expect(matched.portions).toEqual([{ grams: 80, description: '1 carrot' }]);
    expect(await service.food(123)).toEqual(matched); expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain(key);
  });
  it('calculates partial estimates from confirmed weights without inventing volume conversions', async () => {
    service.setKey(key); fetchMock.mockResolvedValue(new Response(JSON.stringify(food)));
    const recipe = blankRecipe(uid()); recipe.servings = 2;
    recipe.ingredients = [{ ...parseIngredient('200 g carrots'), food: await service.food(123) }, parseIngredient('1 cup stock')];
    const result = calculateNutrition(recipe); expect(result.totals.calories).toBe(80); expect(result.perServing?.calories).toBe(40); expect(result.totals.fat).toBeNull(); expect(result.partial).toBe(true); expect(result.excluded).toContain('stock');
  });
  it('handles rate limits and server failures without saving a bogus match', async () => {
    service.setKey(key); fetchMock.mockResolvedValueOnce(new Response('', { status: 429 })).mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(service.food(123)).rejects.toThrow(/limit/); await expect(service.food(123)).rejects.toThrow(/could not respond/); expect(store.cachedFood(123)).toBeFalsy();
  });
  it('rejects wrong food IDs and leaves negative or incompatible nutrients unknown', async () => {
    service.setKey(key); fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ...food, fdcId: 456 })));
    await expect(service.food(123)).rejects.toThrow(/unexpected/);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ...food, foodNutrients: [{ nutrient: { id: 1008, unitName: 'KJ' }, amount: 400 }, { nutrient: { id: 1003, unitName: 'G' }, amount: -2 }] })));
    const matched = await service.food(123); expect(Object.values(matched.per100g).every(value => value === null)).toBe(true);
  });
  it('rejects oversized responses', async () => {
    service.setKey(key); fetchMock.mockResolvedValue(new Response('{}', { headers: { 'content-length': '3000000' } }));
    await expect(service.food(123)).rejects.toThrow(/too much/);
  });
});

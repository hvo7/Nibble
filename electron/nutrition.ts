import { safeStorage } from 'electron';
import { emptyMacros, foodMatchSchema, type FoodMatch } from '../src/shared/model';
import { Store } from './database';

/** Credentials exist only in the main process and are encrypted by the OS credential facility. */
export class NutritionService {
  constructor(private store: Store) {}
  setKey(value: string) {
    if (!value.trim()) { this.store.setSetting('usdaKey', ''); return; }
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(value)) throw new Error('Enter a valid USDA API key.');
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure credential storage is unavailable on this machine.');
    this.store.setSetting('usdaKey', safeStorage.encryptString(value.trim()).toString('base64'));
  }
  private async request(endpoint: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
    const encrypted = this.store.getSetting('usdaKey');
    if (!encrypted) throw new Error('Add your free USDA FoodData Central API key in Settings.');
    const key = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    const url = new URL(`https://api.nal.usda.gov/fdc/v1/${endpoint}`);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'X-Api-Key': key } });
    if (response.status === 429) throw new Error('USDA’s free request limit was reached. Try again later; cached food matches still work.');
    if (!response.ok) throw new Error('USDA could not respond. Check the API key or try again later.');
    if (Number(response.headers.get('content-length')) > 2 * 1024 * 1024) { await response.body?.cancel(); throw new Error('USDA returned too much data. Try a narrower search.'); }
    const reader = response.body?.getReader(); if (!reader) throw new Error('USDA returned an empty response.');
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new Error('USDA returned too much data. Try a narrower search.'); }
      chunks.push(value);
    }
    const result: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('USDA returned an unexpected response.');
    return result as Record<string, unknown>;
  }
  async search(query: string) {
    const result = await this.request('foods/search', { query, pageSize: '15' });
    if (!Array.isArray(result.foods)) return [];
    return (result.foods as { fdcId: number; description: string; dataType: string }[]).filter(f => f && Number.isSafeInteger(f.fdcId) && f.fdcId > 0 && typeof f.description === 'string' && typeof f.dataType === 'string').slice(0, 15).map(f => ({ fdcId: f.fdcId, description: f.description.slice(0, 20000), dataType: f.dataType.slice(0, 20000) }));
  }
  async food(id: number): Promise<FoodMatch> {
    const cached = this.store.cachedFood(id);
    if (cached) return foodMatchSchema.parse(JSON.parse(cached));
    const result = await this.request(`food/${id}`);
    if (result.fdcId !== id || typeof result.description !== 'string' || !Array.isArray(result.foodNutrients)) throw new Error('USDA returned an unexpected food record. Try another match.');
    const values = emptyMacros();
    const ids: Record<number, keyof typeof values> = { 1008: 'calories', 1003: 'protein', 1004: 'fat', 1005: 'carbs' };
    for (const item of (result.foodNutrients ?? []) as { nutrient?: { id: number; unitName: string }; amount?: number }[]) {
      const key = ids[item.nutrient?.id ?? -1];
      if (!key || !Number.isFinite(item.amount) || item.amount! < 0) continue;
      const unit = typeof item.nutrient?.unitName === 'string' ? item.nutrient.unitName.toLowerCase() : '';
      if ((key === 'calories' && unit === 'kcal') || (key !== 'calories' && unit === 'g')) values[key] = item.amount!;
    }
    const food: FoodMatch = { fdcId: id, description: String(result.description), dataType: String(result.dataType), per100g: values, basis: 'per100g', retrievedAt: new Date().toISOString(), portions: ((result.foodPortions ?? []) as { gramWeight: number; amount?: number; modifier?: string; measureUnit?: { name: string } }[]).filter(p => Number.isFinite(p.gramWeight) && p.gramWeight > 0).map(p => ({ description: `${p.amount ?? 1} ${p.modifier || p.measureUnit?.name || 'portion'}`, grams: p.gramWeight })) };
    const validated = foodMatchSchema.parse(food); this.store.cacheFood(id, JSON.stringify(validated)); return validated;
  }
}

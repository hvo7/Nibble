import { uid, type Evidence, type ImportJob, type Recipe, type SourceNutrition } from './model';
import { normalize } from './recipe';

const tokens = (text: string) => new Set(normalize(text).replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/).filter(word => word.length > 1 && !['recipe', 'recipes', 'www', 'com'].includes(word)));
export function importTitleHint(job: Pick<ImportJob, 'request'>): string {
  if (job.request.browserCapture?.title) return job.request.browserCapture.title;
  try { return decodeURIComponent(new URL(job.request.url).pathname.split('/').filter(Boolean).pop() ?? '').replace(/[-_]/g, ' '); } catch { return ''; }
}
/** Rank complete records; never splice ingredients or quantities from competing dishes. */
export function primaryImportRecipe(candidates: Recipe[], titleHint = ''): Recipe | undefined {
  const hint = tokens(titleHint);
  const score = (recipe: Recipe) => {
    const name = tokens(recipe.title), overlap = [...name].filter(word => hint.has(word)).length;
    const relevance = hint.size && name.size ? overlap / Math.min(hint.size, name.size) : 0;
    const method = recipe.websiteImport?.method ?? '';
    return [Number(recipe.ingredients.length > 0), relevance >= .5 ? relevance : 0, Number(recipe.steps.length > 0),
      /recipe card/i.test(method) ? 4 : /json-ld/i.test(method) ? 3 : /microdata/i.test(method) ? 2 : 1,
      recipe.ingredients.length, recipe.steps.length];
  };
  return candidates.reduce<Recipe | undefined>((best, candidate) => {
    if (!best) return candidate;
    const left = score(candidate), right = score(best);
    for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return left[i] > right[i] ? candidate : best;
    return best;
  }, undefined);
}
/** One editable draft, retaining the source evidence for all extracted candidates. */
export function singleImportDraft(candidates: Recipe[], titleHint = ''): Recipe[] {
  const primary = primaryImportRecipe(candidates, titleHint);
  if (!primary) return [];
  if (candidates.length === 1) return candidates;
  const recipe = structuredClone(primary);
  const evidence = new Map<string, Evidence>();
  for (const candidate of candidates) for (const item of candidate.evidence) if (!evidence.has(item.id)) evidence.set(item.id, structuredClone(item));
  // Structured webpage metadata is not always present in visible page text.
  // Keep other records as inert website evidence, excluded from text reparsing.
  for (const candidate of candidates) {
    if (candidate.id === primary.id || !candidate.websiteImport || evidence.has(candidate.id)) continue;
    const raw = JSON.stringify({ title: candidate.title, sourceUrl: candidate.sourceUrl,
      ingredients: candidate.ingredients.map(i => i.original), instructions: candidate.steps.map(s => s.text),
      servings: candidate.servings, publishedNutrition: candidate.sourceNutrition,
      sourceRecords: candidate.websiteImport.sources, conflicts: candidate.websiteImport.conflicts }, null, 2);
    if (raw.length > 250000 || evidence.size >= 100) throw new Error('This page contains too much recipe content for one import. Save only the recipe area or import its screenshots.');
    evidence.set(candidate.id, { id: candidate.id, kind: 'website', label: ('Additional source record: ' + candidate.title).slice(0, 500), text: raw, assetId: null });
  }
  if (evidence.size > 100) throw new Error('Too many sources for one import. Import just the recipe area.');
  const sameTitle = candidates.filter(candidate => normalize(candidate.title) === normalize(primary.title));
  if (recipe.websiteImport) {
    const servings = [...new Set(sameTitle.map(r => r.servings).filter((n): n is number => n !== null))];
    if (servings.length > 1 && !recipe.websiteImport.conflicts.some(c => c.field === 'servings' && !c.resolved)) {
      if (servings.length > 20) throw new Error('Too many serving variants. Import just the recipe area.');
      recipe.servings = null;
      if (recipe.sourceNutrition) recipe.sourceNutrition.servings = null;
      recipe.websiteImport.conflicts.push({ id: uid(), field: 'servings', resolved: false,
        message: 'Source records disagree about servings. Confirm the count for this recipe.',
        choices: servings.map(value => ({ label: value + ' servings', value: String(value) })) });
    }
    const nutrition = sameTitle.map(r => r.sourceNutrition).filter((n): n is SourceNutrition => n !== null);
    const disagree = (a: SourceNutrition, b: SourceNutrition) =>
      (a.basis !== 'unknown' && b.basis !== 'unknown' && a.basis !== b.basis) ||
      (!!a.servingSize && !!b.servingSize && normalize(a.servingSize) !== normalize(b.servingSize)) ||
      (['calories','protein','carbs','fat'] as const).some(key => a.values[key] !== null && b.values[key] !== null && Math.abs(a.values[key]! - b.values[key]!) > .02);
    if (nutrition.some((a,i) => nutrition.slice(i+1).some(b => disagree(a,b))) && !recipe.websiteImport.conflicts.some(c => c.field === 'nutrition' && !c.resolved)) {
      const unique = [...new Map(nutrition.map(item => [JSON.stringify(item), item])).values()];
      if (unique.length > 20) throw new Error('Too many nutrition variants. Import just the recipe area.');
      recipe.sourceNutrition = null; recipe.servingSize = '';
      recipe.websiteImport.conflicts.push({ id: uid(), field: 'nutrition', resolved: false,
        message: 'Published nutrition records disagree. Select the record that belongs to this recipe.',
        choices: unique.map((item,i) => ({ label: 'Source ' + (i+1) + ': ' + (item.values.calories ?? 'Unknown') + ' kcal · ' + item.basis, value: JSON.stringify(item) })) });
    }
    if (recipe.websiteImport.conflicts.length > 20) throw new Error('Too many conflicting records. Import just the recipe area.');
    if (sameTitle.some(r => r.ingredients.map(i => i.original).join('\n') !== primary.ingredients.map(i => i.original).join('\n'))) recipe.warnings.push('Ingredient lists differ between source records. One complete list is shown; check amounts against the original source.');
  }
  recipe.evidence = [...evidence.values()];
  recipe.status = 'review'; recipe.sourceReview = { confirmed: false, parser: 'sections-v2' };
  recipe.warnings = [...new Set([...recipe.warnings, 'The source contains more than one recipe record. Check the selected recipe against the original source.'])];
  return [recipe];
}
/** Legacy jobs keep saved edits and a stable identity, including a deleted record:
 * deleting the chosen recipe must not reveal an older unsaved version. */
export function historyImportRecipe(job: ImportJob, saved: Recipe[]): Recipe | undefined {
  const records = saved.filter(recipe => job.drafts.some(draft => draft.id === recipe.id));
  if (records.length) return [...records].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt) || b.revision - a.revision)[0];
  return singleImportDraft(job.drafts, importTitleHint(job))[0];
}


/** Pending work only. Keep raw jobs for evidence/recovery; a saved or trashed
 * recipe consumes its draft, including evidence explicitly merged into a recipe. */
export function pendingImportEntries(jobs: ImportJob[], saved: Recipe[]) {
  return [...jobs].sort((a,b) => b.createdAt.localeCompare(a.createdAt))
    .map(job => ({ job, recipe: historyImportRecipe(job, saved.filter(r => r.profileId === job.profileId)) }))
    .filter(({ job, recipe }) => {
      if (recipe?.deletedAt) return false;
      if (job.status === 'running') return true;
      return !saved.some(r => r.profileId === job.profileId && job.drafts.some(draft =>
        r.id === draft.id || (draft.evidence.length > 0 && draft.evidence.every(item => r.evidence.some(source => source.id === item.id)))));
    });
}

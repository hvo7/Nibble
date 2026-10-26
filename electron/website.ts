import { uid as randomUUID } from '../src/shared/model';
import { blankRecipe, type Evidence, type Recipe, type SourceNutrition } from '../src/shared/model';
import { normalize, parseIngredient, reviewWarnings } from '../src/shared/recipe';
import { attr, children, classes, clean, clutter, documentFor, nodes, tag, textOf, tokens, valueOf, type HtmlNode } from './website-dom';
import { nutritionFromText, parseNutrition, servingCount, type NutritionInput } from './website-nutrition';

import { structuredImages, scopedRecipeImages, rankRecipeImages, type WebsiteImage } from './website-images';

type RecordValue = Record<string, unknown>;
type Candidate = {
  method: string; title: string; description: string; creator: string; images: WebsiteImage[];
  ingredients: { text: string; group: string }[]; steps: string[];
  yields: string[]; nutrition: NutritionInput | null; servingSize: string;
  prep: string; cook: string; total: string;
};
const object = (value: unknown): RecordValue | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
const list = (value: unknown): unknown[] => value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
const hasType = (node: RecordValue, type: string) => list(node['@type']).some(t => typeof t === 'string' && t.split(/[\/#]/).pop() === type);
const empty = (method: string): Candidate => ({ method, images: [], title: '', description: '', creator: '', ingredients: [], steps: [], yields: [], nutrition: null, servingSize: '', prep: '', cook: '', total: '' });

function duration(value: string): number | null {
  const iso = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (iso && iso.slice(1).some(Boolean)) return Number(iso[1] ?? 0) * 1440 + Number(iso[2] ?? 0) * 60 + Number(iso[3] ?? 0) + Number(iso[4] ?? 0) / 60;
  const human = value.match(/^(?:(\d+)\s*(?:hours?|hrs?|h)\s*)?(?:(\d+)\s*(?:minutes?|mins?|m))?$/i);
  return human && human.slice(1).some(Boolean) ? Number(human[1] ?? 0) * 60 + Number(human[2] ?? 0) : null;
}

/** Resolve local JSON-LD @id references only; metadata can never trigger another fetch. */
function structured(document: HtmlNode): Candidate[] {
  const objects: RecordValue[] = [];
  for (const script of nodes(document).filter(n => tag(n) === 'script' && attr(n, 'type').split(';')[0].trim().toLowerCase() === 'application/ld+json')) {
    try {
      const stack: { value: unknown; depth: number }[] = [{ value: JSON.parse(textOf(script, true).replace(/^\uFEFF/, '').replace(/^\s*<!--|-->\s*$/g, '')), depth: 0 }];
      while (stack.length && objects.length < 20000) {
        const { value, depth } = stack.pop()!; if (depth > 32) continue;
        if (Array.isArray(value)) { for (let i = value.length - 1; i >= 0; i--) stack.push({ value: value[i], depth: depth + 1 }); continue; }
        const record = object(value); if (!record) continue; objects.push(record);
        for (const [key, child] of Object.entries(record)) if (key !== '@context') stack.push({ value: child, depth: depth + 1 });
      }
    } catch { /* A broken/unrelated JSON-LD script must not suppress DOM fallbacks. */ }
  }
  const refs = new Map<string, RecordValue>();
  for (const record of objects) if (typeof record['@id'] === 'string' && Object.keys(record).length > Object.keys(refs.get(record['@id']) ?? {}).length) refs.set(record['@id'], record);
  const resolve = (value: unknown): unknown => {
    const record = object(value); return record && typeof record['@id'] === 'string' ? { ...(refs.get(record['@id']) ?? {}), ...record } : value;
  };
  function instructions(value: unknown, seen = new Set<unknown>(), depth = 0): string[] {
    if (depth > 20 || seen.has(value)) return [];
    if (typeof value === 'string') return value.split(/\n|<br\s*\/?\s*>/i).map(v => clean(v)).filter(Boolean);
    seen.add(value);
    if (Array.isArray(value)) return value.flatMap(item => instructions(item, new Set(seen), depth + 1));
    const item = object(resolve(value)); if (!item) return [];
    return item.itemListElement ? instructions(item.itemListElement, seen, depth + 1) : item.text ? [clean(item.text)] : item.item ? instructions(item.item, seen, depth + 1) : [];
  }
  function ingredients(value: unknown, group = '', depth = 0): Candidate['ingredients'] {
    if (depth > 12) return [];
    return list(value).flatMap(entry => {
      const item = resolve(entry);
      if (typeof item === 'string') return item.split(/\n|<br\s*\/?\s*>/i).map(v => ({ text: clean(v), group })).filter(v => v.text);
      const record = object(item); if (!record) return [];
      if (record.itemListElement) return ingredients(record.itemListElement, clean(record.name, 200) || group, depth + 1);
      if (record.value !== undefined && record.name) return [{ text: [clean(record.value), clean(record.unitText ?? record.unitCode), clean(record.name)].filter(Boolean).join(' '), group }];
      return record.text ? [{ text: clean(record.text), group }] : [];
    });
  }
  return objects.filter(node => hasType(node, 'Recipe')).slice(0, 40).map(node => {
    const candidate = empty('JSON-LD');
    candidate.images = structuredImages(node.image, resolve);
    candidate.title = clean(node.name, 300); candidate.description = clean(node.description);
    const author = resolve(list(node.author)[0]); candidate.creator = clean(object(author)?.name ?? author, 300);
    candidate.ingredients = ingredients(node.recipeIngredient).slice(0, 500);
    candidate.steps = instructions(node.recipeInstructions).slice(0, 500);
    candidate.yields = list(node.recipeYield).map(v => { const record = object(resolve(v)); return record ? [clean(record.value), clean(record.unitText ?? record.unitCode)].filter(Boolean).join(' ').slice(0, 1000) : clean(v, 1000); }).filter(Boolean);
    const nutrition = object(resolve(list(node.nutrition)[0]));
    candidate.nutrition = nutrition ? { ...nutrition, label: clean(nutrition.description) } : null;
    candidate.servingSize = clean(nutrition?.servingSize, 1000);
    candidate.prep = clean(node.prepTime); candidate.cook = clean(node.cookTime); candidate.total = clean(node.totalTime);
    return candidate;
  });
}

function schemaType(node: HtmlNode, type: string): boolean {
  return [...tokens(node, 'itemtype'), ...tokens(node, 'typeof')].some(v => v.split(/[\/#:]/).pop() === type);
}
/** Scope properties to one recipe, excluding nested/recommended recipes. */
function properties(root: HtmlNode, property: string): HtmlNode[] {
  const found: HtmlNode[] = []; const stack = [root]; let visited = 0;
  while (stack.length && visited++ < 100000) {
    const node = stack.pop()!; if (clutter(node) || (node !== root && schemaType(node, 'Recipe'))) continue;
    if ([...tokens(node, 'itemprop'), ...tokens(node, 'property')].some(p => p.split(':').pop() === property)) found.push(node);
    if (node !== root && (attr(node, 'itemtype') || attr(node, 'typeof') || ('attrs' in node && node.attrs.some(a => a.name === 'itemscope')))) continue;
    const nested = children(node); for (let i = nested.length - 1; i >= 0; i--) stack.push(nested[i]);
  }
  return found;
}
function embedded(document: HtmlNode): Candidate[] {
  return nodes(document, clutter).filter(n => schemaType(n, 'Recipe')).slice(0, 30).map(root => {
    const first = (key: string) => properties(root, key)[0];
    const value = (key: string) => first(key) ? valueOf(first(key)!) : '';
    const candidate = empty(attr(root, 'itemtype') ? 'Microdata' : 'RDFa');
    candidate.images = scopedRecipeImages(root);
    candidate.title = value('name'); candidate.description = value('description');
    candidate.creator = first('author') ? valueOf(first('author')!) : '';
    candidate.ingredients = properties(root, 'recipeIngredient').map(n => ({ text: valueOf(n), group: '' }));
    const instruction = first('recipeInstructions');
    const steps = instruction ? nodes(instruction, clutter).filter(n => schemaType(n, 'HowToStep') || tag(n) === 'li') : [];
    candidate.steps = (steps.length ? steps.map(valueOf) : instruction ? [valueOf(instruction)] : []).filter(Boolean);
    candidate.yields = properties(root, 'recipeYield').map(valueOf);
    const nutritionRoot = first('nutrition');
    if (nutritionRoot) {
      candidate.nutrition = { label: textOf(nutritionRoot) };
      for (const key of ['calories', 'proteinContent', 'carbohydrateContent', 'fatContent', 'servingSize'] as const) {
        const element = properties(nutritionRoot, key)[0]; if (element) candidate.nutrition[key] = valueOf(element);
      }
      candidate.servingSize = clean(candidate.nutrition.servingSize, 1000);
    }
    candidate.prep = value('prepTime'); candidate.cook = value('cookTime'); candidate.total = value('totalTime');
    return candidate;
  });
}

const cardRoot = (n: HtmlNode) => classes(n).some(c => /^(wprm-recipe|wprm-recipe-container|tasty-recipes|tasty-recipes-entry-content|easyrecipe|mv-create-card|recipe-card)$/.test(c));
const classMatches = (node: HtmlNode, pattern: RegExp) => classes(node).some(c => pattern.test(c));
function cardCandidates(document: HtmlNode): Candidate[] {
  const roots = nodes(document, clutter).filter(cardRoot).slice(0, 60);
  // Keep the outer recipe wrapper: its title/servings may sit above an inner content wrapper.
  const rootSet = new Set(roots);
  const actual = roots.filter(root => {
    let parent = 'parentNode' in root ? root.parentNode : null;
    while (parent) { if (rootSet.has(parent)) return false; parent = 'parentNode' in parent ? parent.parentNode : null; }
    return true;
  });
  return actual.slice(0, 20).map(root => {
    const all = nodes(root, clutter);
    const first = (pattern: RegExp) => all.find(n => classMatches(n, pattern));
    const value = (pattern: RegExp) => { const node = first(pattern); return node ? valueOf(node) : ''; };
    const candidate = empty('Recipe card');
    candidate.images = scopedRecipeImages(root);
    const heading = all.find(n => /^h[1-3]$/.test(tag(n)));
    const headingTitle = heading ? valueOf(heading) : '';
    const pageTitle = actual.length === 1 ? nodes(document, clutter).find(n => tag(n) === 'h1') : undefined;
    candidate.title = value(/^(wprm-recipe-name|tasty-recipes-title|mv-create-title|fn|recipe-title)$/) ||
      (/^(ingredients?|instructions?|directions?|method)\s*:?$/i.test(headingTitle) || !headingTitle ? (pageTitle ? valueOf(pageTitle) : '') : headingTitle).slice(0, 300);
    candidate.description = value(/^(wprm-recipe-summary|tasty-recipes-description|summary)$/);
    candidate.creator = value(/^(wprm-recipe-author|author)$/);
    let group = '';
    const explicitRows = all.filter(n => classMatches(n, /^(wprm-recipe-ingredient|ingredient|mv-create-ingredients-list-item)$/));
    for (const node of all) {
      if (classMatches(node, /^(wprm-recipe-ingredient-group-name|ingredient-group-name)$/)) group = valueOf(node).slice(0, 200);
      if (explicitRows.includes(node)) candidate.ingredients.push({ text: valueOf(node), group });
    }
    if (!candidate.ingredients.length) {
      const container = first(/^(tasty-recipes-ingredients|ingredients|mv-create-ingredients|recipe-card-ingredients)$/);
      if (container) {
        for (const node of nodes(container, clutter)) {
          if (/^h[2-6]$/.test(tag(node)) && !/^ingredients?\s*:?$/i.test(valueOf(node))) group = valueOf(node).replace(/:$/, '').slice(0, 200);
          if (tag(node) === 'li' && !nodes(node).slice(1).some(n => tag(n) === 'li')) candidate.ingredients.push({ text: valueOf(node), group });
        }
      }
    }
    const stepRows = all.filter(n => classMatches(n, /^(wprm-recipe-instruction|instruction|mv-create-instructions-list-item)$/));
    candidate.steps = stepRows.map(valueOf);
    if (!candidate.steps.length) {
      const container = first(/^(tasty-recipes-instructions|instructions|directions|mv-create-instructions|recipe-card-directions|recipe-card-instructions)$/);
      if (container) candidate.steps = nodes(container, clutter).filter(n => tag(n) === 'li').map(valueOf);
    }
    const yieldText = value(/^(wprm-recipe-servings-container|tasty-recipes-yield|yield|recipe-yield)$/) || [value(/^wprm-recipe-servings$/), value(/^wprm-recipe-servings-unit$/)].filter(Boolean).join(' ');
    candidate.yields = yieldText ? [yieldText.replace(/\s*Scale.*$/i, '').trim()] : [];
    const nutritionNode = first(/^(wprm-nutrition-label-container|wprm-nutrition-label|tasty-recipes-nutrition|nutrition|nutrition-facts)$/);
    if (nutritionNode) candidate.nutrition = nutritionFromText(textOf(nutritionNode));
    const nutrientClasses = { calories: /^(wprm-nutrition-label-text-nutrition-container-calories|calories)$/, proteinContent: /^(wprm-nutrition-label-text-nutrition-container-protein|protein)$/, carbohydrateContent: /^(wprm-nutrition-label-text-nutrition-container-carbohydrates|carbohydrates)$/, fatContent: /^(wprm-nutrition-label-text-nutrition-container-fat|fat)$/ };
    for (const [key, pattern] of Object.entries(nutrientClasses)) {
      const raw = value(pattern).replace(/^(calories|protein|carbohydrates?|fat)\s*:\s*/i, '');
      if (raw) { candidate.nutrition ??= {}; candidate.nutrition[key as keyof NutritionInput] = raw; }
    }
    candidate.servingSize = value(/^(wprm-nutrition-label-text-nutrition-container-serving_size|serving-size)$/).replace(/^serving(?: size)?\s*:\s*/i, '');
    if (candidate.nutrition) candidate.nutrition.servingSize = candidate.servingSize || candidate.nutrition.servingSize;
    candidate.prep = value(/^(wprm-recipe-prep-time-container|prep-time)$/).replace(/^prep(?:aration)?\s*(?:time)?\s*:?/i, '').trim();
    candidate.cook = value(/^(wprm-recipe-cook-time-container|cook-time)$/).replace(/^cook\s*(?:time)?\s*:?/i, '').trim();
    candidate.total = value(/^(wprm-recipe-total-time-container|total-time)$/).replace(/^total\s*(?:time)?\s*:?/i, '').trim();
    return candidate;
  });
}

/** Text fallback requires an ingredient heading. Unrelated prose never becomes a recipe. */
function textCandidate(document: HtmlNode): Candidate[] {
  const root = nodes(document, clutter).find(n => tag(n) === 'article') ?? nodes(document, clutter).find(n => tag(n) === 'main') ?? document;
  const candidate = empty('Page text');
  let section: 'none' | 'ingredients' | 'steps' | 'nutrition' = 'none'; let group = ''; const nutritionLines: string[] = [];
  const stack = [root]; let visited = 0;
  while (stack.length && visited++ < 100000) {
    const node = stack.pop()!; if (clutter(node)) continue;
    const block = /^(h[1-6]|p|li|dt|dd|tr)$/.test(tag(node));
    const value = block ? valueOf(node) : '';
    if (block && value) {
      if (tag(node) === 'h1' && !candidate.title) candidate.title = value;
      if (/^ingredients?\s*:?$/i.test(value)) section = 'ingredients';
      else if (/^(instructions?|directions?|method|preparation)\s*:?$/i.test(value)) section = 'steps';
      else if (/^(nutrition(?: facts| information)?|nutritional information)\s*:?$/i.test(value)) section = 'nutrition';
      else if (/^(notes?|tips|equipment|reviews?|comments?|related recipes)\s*:?$/i.test(value)) section = 'none';
      else if (section !== 'nutrition' && /^(servings?|serves|yield)\s*:?\s*\d/i.test(value)) candidate.yields.push(value);
      else if (/^serving size\s*:/i.test(value)) candidate.servingSize = value.replace(/^serving size\s*:\s*/i, '');
      else if (section === 'ingredients' && /^h[2-6]$/.test(tag(node))) group = value.replace(/:$/, '').slice(0, 200);
      else if (section === 'ingredients') candidate.ingredients.push({ text: value, group });
      else if (section === 'steps' && /^h[2-6]$/.test(tag(node))) { /* A method subsection is not a cooking step. */ }
      else if (section === 'steps') candidate.steps.push(value.replace(/^\d+[.)]\s+/, ''));
      else if (section === 'nutrition') nutritionLines.push(value);
      continue;
    }
    const nested = children(node); for (let i = nested.length - 1; i >= 0; i--) stack.push(nested[i]);
  }
  if (!candidate.ingredients.length) return [];
  candidate.nutrition = nutritionLines.length ? nutritionFromText(nutritionLines.join('\n')) : null;
  if (candidate.nutrition && candidate.servingSize) candidate.nutrition.servingSize = candidate.servingSize;
  return [candidate];
}

function sameRecipe(a: Candidate, b: Candidate): boolean {
  if (a.title && b.title && normalize(a.title) === normalize(b.title)) {
    // Two structured recipes with the same title can be different variants.
    if (a.method === 'JSON-LD' && b.method === 'JSON-LD' && a.ingredients.length && b.ingredients.length) return a.ingredients.map(i => normalize(i.text)).join('|') === b.ingredients.map(i => normalize(i.text)).join('|');
    return true;
  }
  if (!a.ingredients.length || !b.ingredients.length) return false;
  const left = new Set(a.ingredients.map(i => normalize(i.text)));
  const overlap = b.ingredients.filter(i => left.has(normalize(i.text))).length;
  if (overlap >= 2 && overlap / Math.max(a.ingredients.length, b.ingredients.length) >= .8) return true;
  // A site's metadata can omit ingredients and append a translated name in
  // parentheses. Match that partial list only across representations, with a
  // matching base title and substantial overlap; never conflate JSON-LD variants.
  const baseTitle = (title: string) => normalize(title.replace(/\s*\([^)]*\)\s*$/u, ''));
  const matchingTitle = normalize(a.title) === baseTitle(b.title) || normalize(b.title) === baseTitle(a.title);
  return a.method !== b.method && !!a.title && !!b.title && matchingTitle &&
    overlap >= 3 && overlap / Math.min(a.ingredients.length, b.ingredients.length) >= .8;
}
const equalNutrition = (a: SourceNutrition, b: SourceNutrition) => {
  if (a.basis !== b.basis && a.basis !== 'unknown' && b.basis !== 'unknown') return false;
  if (a.servingSize && b.servingSize && normalize(a.servingSize) !== normalize(b.servingSize)) return false;
  return (Object.keys(a.values) as (keyof typeof a.values)[]).every(k => a.values[k] === null || b.values[k] === null || Math.abs(a.values[k]! - b.values[k]!) < .02);
};

export function extractWebsite(html: string, url: string, profileId: string): { recipes: Recipe[]; evidence: Evidence; images: Record<string, WebsiteImage[]> } {
  const document = documentFor(html);
  const root = nodes(document, clutter).find(n => /^(main|article)$/.test(tag(n))) ?? document;
  const evidence: Evidence = { id: randomUUID(), kind: 'website', label: url.slice(0, 500), text: textOf(root).slice(0, 150000), assetId: null };
  const cards = cardCandidates(document);
  // A whole-page text list would concatenate separate recipe cards.
  const fallback = cards.filter(c => c.ingredients.length).length > 1 ? [] : textCandidate(document);
  const candidates = [...structured(document), ...embedded(document), ...cards, ...fallback].filter(c => c.ingredients.length || c.steps.length || c.nutrition);
  const groups: Candidate[][] = [];
  for (const candidate of candidates) {
    const matches = groups.filter(group => group.some(member => sameRecipe(member, candidate)));
    if (matches.length === 1) matches[0].push(candidate); else groups.push([candidate]);
  }
  const images: Record<string, WebsiteImage[]> = {};
  const recipes = groups.slice(0, 20).map(group => {
    const recipe = blankRecipe(profileId); const primary = group[0];
    recipe.title = (group.find(c => c.title)?.title || 'Untitled recipe').slice(0, 300);
    images[recipe.id] = rankRecipeImages(document, url, recipe.title, group.flatMap(c => c.images), groups.length === 1);
    recipe.description = (group.find(c => c.description)?.description ?? '').slice(0, 20000);
    recipe.creator = (group.find(c => c.creator)?.creator ?? '').slice(0, 300); recipe.platform = 'Website'; recipe.sourceUrl = url.slice(0, 2000);
    recipe.websiteImport = { method: primary.method, sources: [], conflicts: [] };
    const sources = recipe.websiteImport.sources;
    for (const candidate of group) {
      if (candidate.ingredients.length) sources.push({ field: 'Ingredients', method: candidate.method, raw: candidate.ingredients.map(i => i.text).join('\n').slice(0, 20000) });
      if (candidate.steps.length) sources.push({ field: 'Directions', method: candidate.method, raw: candidate.steps.join('\n').slice(0, 20000) });
      candidate.yields.forEach(raw => sources.push({ field: 'Yield / servings', method: candidate.method, raw: raw.slice(0, 20000) }));
      if (candidate.nutrition) sources.push({ field: 'Nutrition', method: candidate.method, raw: JSON.stringify(candidate.nutrition).slice(0, 20000) });
    }
    recipe.websiteImport.sources = sources.slice(0, 100);
    // Preserve one coherent source list, including its order and quantities.
    // Do not union competing lists or assume JSON-LD is necessarily complete.
    const ingredientCandidate = group.filter(c => c.ingredients.length).reduce<Candidate | undefined>((best, candidate) => !best || candidate.ingredients.length > best.ingredients.length ? candidate : best, undefined);
    const ingredientLines = ingredientCandidate?.ingredients ?? [];
    const grouped = group.flatMap(c => c.ingredients).filter(i => i.group);
    recipe.ingredients = ingredientLines.slice(0, 500).map(i => parseIngredient(i.text, i.group || grouped.find(g => normalize(g.text) === normalize(i.text))?.group || ''));
    recipe.websiteImport.method = ingredientCandidate?.method ?? primary.method;
    recipe.steps = ((ingredientCandidate?.steps.length ? ingredientCandidate.steps : group.find(c => c.steps.length)?.steps) ?? []).slice(0, 500).map(text => ({ id: randomUUID(), text: text.slice(0, 20000), provenance: 'source' }));
    const yields = [...new Map(group.flatMap(c => c.yields).map(raw => [normalize(raw.replace(/\.$/, '')), raw])).values()]; recipe.yieldText = yields.join(' · ').slice(0, 2000);
    const counts = [...new Set(yields.map(servingCount).filter((v): v is number => v !== null))];
    recipe.servings = counts.length === 1 ? counts[0] : null;
    if (counts.length > 1) recipe.websiteImport.conflicts.push({ id: randomUUID(), field: 'servings', message: 'Different serving counts were found. Choose a count or leave it unknown.', resolved: false, choices: counts.slice(0, 19).map(value => ({ label: `${value} servings`, value: String(value) })).concat({ label: 'Leave unknown', value: 'null' }) });
    const records = group.map(c => ({ candidate: c, parsed: c.nutrition ? parseNutrition(c.nutrition, recipe.servings) : null })).filter((v): v is { candidate: Candidate; parsed: SourceNutrition } => !!v.parsed);
    const nutrition = records[0]?.parsed ?? null;
    const conflictingNutrition = nutrition && records.some(r => !equalNutrition(nutrition, r.parsed));
    if (conflictingNutrition) {
      recipe.websiteImport.conflicts.push({ id: randomUUID(), field: 'nutrition', message: 'Published nutrition differs between sources. Select a record before using these values.', resolved: false, choices: records.slice(0, 19).map(r => ({ label: `${r.candidate.method}: ${r.parsed.values.calories ?? '?'} kcal (${r.parsed.basis})`, value: JSON.stringify(r.parsed) })).concat({ label: 'Leave unknown', value: 'null' }) });
    } else if (nutrition) {
      if (nutrition.basis === 'unknown') {
        const explicit = records.find(r => r.parsed.basis !== 'unknown' && (Object.keys(nutrition.values) as (keyof typeof nutrition.values)[]).some(key => nutrition.values[key] !== null && r.parsed.values[key] !== null));
        if (explicit) { nutrition.basis = explicit.parsed.basis; nutrition.servingSize = explicit.parsed.servingSize; nutrition.servingGrams = explicit.parsed.servingGrams; }
      }
      for (const { parsed } of records.slice(1)) {
        // Missing numbers can be filled only when both records explicitly share a basis.
        if (nutrition.basis !== 'unknown' && nutrition.basis === parsed.basis) for (const key of Object.keys(nutrition.values) as (keyof typeof nutrition.values)[]) nutrition.values[key] ??= parsed.values[key];
      }
      recipe.sourceNutrition = nutrition;
      if (nutrition.basis === 'unknown') recipe.warnings.push('Published nutrition has no clear basis. Confirm per serving, per 100 g, or whole recipe before converting.');
    }
    recipe.servingSize = (group.find(c => c.servingSize)?.servingSize || nutrition?.servingSize || '').slice(0, 1000);
    recipe.prepMinutes = duration(group.find(c => c.prep)?.prep ?? ''); recipe.cookMinutes = duration(group.find(c => c.cook)?.cook ?? ''); recipe.totalMinutes = duration(group.find(c => c.total)?.total ?? '');
    if (primary.method === 'Page text') recipe.warnings.push('Extracted from page text. Check the ingredient and instruction boundaries against the source.');
    if (!recipe.sourceNutrition && !conflictingNutrition) recipe.warnings.push('No usable published nutrition found. Optional USDA matches can provide a separate estimate.');
    if (ingredientCandidate && group.some(c => c.ingredients.length && c.ingredients.map(i => normalize(i.text)).join('|') !== ingredientCandidate.ingredients.map(i => normalize(i.text)).join('|'))) recipe.warnings.push('Ingredient lists differ between page representations. The list with the most ingredient lines was retained; compare the source records before marking it ready.');
    recipe.evidence = [evidence]; recipe.warnings.push(...reviewWarnings(recipe)); return recipe;
  });
  return { recipes, evidence, images };
}

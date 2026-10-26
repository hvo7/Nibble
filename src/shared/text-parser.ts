import { blankRecipe, emptyMacros, uid, type Evidence, type Ingredient, type Recipe, type SourceNutrition } from './model';
import { normalize, parseIngredient, reviewWarnings } from './recipe';

type SourceLine = { text: string; evidenceId: string; index: number };
type Section = 'unknown' | 'ingredients' | 'steps' | 'nutrition' | 'notes' | 'ignore';
const quantity = /^[\s•●▪◦*\-–□☐✓✔]*\s*(?:\d|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\.\d)/;
const action = /^(?:\d+[.)]\s*)?(?:first[, ]+|then[, ]+|next[, ]+)?(?:add|mix|stir|heat|cook|bake|roast|grill|simmer|boil|combine|whisk|chop|dice|slice|drain|rinse|place|put|pour|serve|season|preheat|blend|saute|sauté|fry|cover|marinate|refrigerate|let|leave|remove|transfer|fold|toss|bring|reduce|garnish|melt|set|prepare|spread|sprinkle|knead|roll|cut|peel|wash|cool|rest|divide)\b/i;
const nutritionLabel = /^(?:nutrition(?:al)?(?:\s+(?:facts|information|info|values))?|macros?|per\s+(?:serving|portion|100\s*g)|serving\s+size|calories|energy|protein|(?:total\s+)?(?:fat|carbohydrates?|carbs)|saturated\s+fat|sodium|cholesterol|fiber|fibre|sugars?|%\s*daily\s+value)\b/i;
const clutter = /^(?:jump to recipe|print(?: recipe)?|save(?: recipe)?|share|follow|subscribe|advertisement|read more|back to top|pin(?: recipe)?|like|reply|view all comments|\d[\d,.]*\s+(?:likes|views|comments)|https?:\/\/\S+|@\S+)\s*$/i;
const groupHeading = /^(?:for\s+(?:the\s+)?)?(?:sauce|dressing|marinade|garnish|topping|filling|dough|batter|crust|salad|soup|bowls?|base|to serve|to finish|assembly)s?\s*:?$/i;
const clean = (text: string) => text.replace(/\u00a0/g, ' ').replace(/[\u200b-\u200d\ufeff]/g, '').trim();
const stripBullet = (text: string) => text.replace(/^[•●▪◦*□☐✓✔]\s*|^[-–]\s+/, '').trim();

/** Section-aware extraction. All ambiguous content remains in the original evidence. */
export function parseRecipeSources(evidence: Evidence[], profileId: string): Recipe {
  const recipe = blankRecipe(profileId);
  recipe.evidence = evidence;
  recipe.sourceReview = { parser: 'sections-v2', confirmed: false };
  const lines: SourceLine[] = evidence.flatMap(source => source.text.split(/\r?\n/).flatMap((raw, index) => {
    // Explicit inline headings and semicolon lists are common in pasted captions.
    const prepared = raw.replace(/\s+(Ingredients?|Instructions?|Directions?|Nutrition(?: Facts)?):\s*/gi, '\n$1:\n');
    return prepared.split(/\n|;\s*(?=(?:[\d¼½¾]|[A-Z][a-z]+\s+to taste))/).map(text => ({ text: clean(text), evidenceId: source.id, index })).filter(line => line.text);
  }));
  let section: Section = 'unknown', group = '', previousSource = '';
  const nutrition: string[] = [], issues: string[] = [], counts: number[] = [];
  let pending: { line: SourceLine; refs: NonNullable<Ingredient['sourceRefs']> } | null = null;
  const addIngredient = (line: SourceLine, original: string, refs = [{ evidenceId: line.evidenceId, lineStart: line.index, lineEnd: line.index }]) => {
    const item = parseIngredient(stripBullet(original), group);
    if (!item.name || !/[\p{L}]/u.test(item.name)) { issues.push(`Unclear ingredient text: “${original}”. Check the source image or correct the extracted text.`); }
    item.sourceRefs = refs;
    // Merge exact overlap only across sources and within the same component.
    const overlap = recipe.ingredients.find(i => normalize(i.original) === normalize(item.original) && normalize(i.group) === normalize(item.group) && i.sourceRefs?.every(ref => ref.evidenceId !== line.evidenceId));
    if (overlap) overlap.sourceRefs = [...(overlap.sourceRefs ?? []), ...refs]; else recipe.ingredients.push(item);
  };
  const flush = () => { if (pending) { addIngredient(pending.line, pending.line.text, pending.refs); pending = null; } };
  const looksIngredient = (text: string) => quantity.test(text) || /\b(?:to taste|as needed|optional)\b/i.test(text) || /^[•●▪◦□☐✓✔*]\s*\p{L}/u.test(text);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index], text = stripBullet(line.text);
    const newSource = line.evidenceId !== previousSource;
    if (newSource) { flush(); previousSource = line.evidenceId; }
    if (clutter.test(text)) continue;
    if (/^(?:ingredients?|what you(?:'|’)ll need|you will need)(?:\s*\([^)]*\)|\s+for\s+\d+\s+servings?)?\s*:?$/i.test(text)) { flush(); section = 'ingredients'; group = ''; const count = text.match(/(?:for\s+|\()\s*(\d+)\s+servings?/i); if (count) counts.push(Number(count[1])); continue; }
    if (/^(?:instructions?|directions?|method|steps?|preparation|how to (?:make|cook)(?:.*)?)\s*:?$/i.test(text)) { flush(); section = 'steps'; continue; }
    const inline = text.match(/^(ingredients?|instructions?|directions?|method|nutrition(?: facts)?)\s*:\s*(.+)$/i);
    if (inline) {
      lines.splice(index + 1, 0, { ...line, text: inline[2] });
      flush(); section = /^ingredient/i.test(inline[1]) ? 'ingredients' : /^nutrition/i.test(inline[1]) ? 'nutrition' : 'steps'; continue;
    }
    if (/^(?:notes?|tips?|storage|variations?|substitutions?)\s*:?$/i.test(text)) { flush(); section = 'notes'; continue; }
    if (/^(?:comments?|reviews?|you may also like|related recipes|more recipes)\s*:?$/i.test(text)) { flush(); section = 'ignore'; continue; }
    if (nutritionLabel.test(text)) { flush(); section = 'nutrition'; nutrition.push(text); continue; }
    // Nutrition serving size/count describes a nutrition portion, never recipe yield.
    if (section === 'nutrition') { nutrition.push(text); continue; }
    if (section === 'ignore') continue;
    if (/^(?:servings|serves|yield|makes)\s*:?$/i.test(text) && lines[index + 1] && /^\d+(?:\.\d+)?\s*(?:servings?|people|persons?|portions?|bowls?)?$/i.test(lines[index + 1].text)) { lines[index + 1].text = text.replace(/:$/, '') + ': ' + lines[index + 1].text; continue; }
    const range = text.match(/^(?:serves|servings|yield|makes)\s*:?\s*(\d+(?:\.\d+)?)\s*(?:to|[-–—])\s*(\d+(?:\.\d+)?)\s*(?:servings?|people|persons?|portions?|bowls?)?[.!]?$/i);
    if (range) { flush(); recipe.yieldText ||= text; issues.push(`Recipe serves ${range[1]} to ${range[2]}. Choose a serving count before calculating per-serving nutrition.`); continue; }
    const servings = text.match(/^(?:serves|servings|yield|makes)\s*:?\s*(\d+(?:\.\d+)?)\s*(.*)$/i);
    if (servings && !/\d|[-–]/.test(servings[2])) {
      flush(); recipe.yieldText ||= text;
      if (!servings[2] || /^(?:servings?|people|persons?|portions?|bowls?)\b/i.test(servings[2])) counts.push(Number(servings[1]));
      continue;
    }
    if (/^(?:serves|servings|yield|makes)\b/i.test(text)) { flush(); recipe.yieldText ||= text; issues.push(`Check recipe yield: "${text}". It is not an ingredient.`); continue; }
    const time = text.match(/^(prep|cook|total)(?:\s*time)?\s*:?\s*(\d+)\s*(minutes?|mins?|hours?|hrs?)(?:\s*(\d+)\s*(?:minutes?|mins?))?$/i);
    if (time) { flush(); const minutes = Number(time[2]) * (/^h/i.test(time[3]) ? 60 : 1) + Number(time[4] ?? 0); recipe[time[1].toLowerCase() === 'prep' ? 'prepMinutes' : time[1].toLowerCase() === 'cook' ? 'cookMinutes' : 'totalMinutes'] = minutes; continue; }
    if (section === 'unknown' && recipe.title === 'Untitled recipe' && !looksIngredient(text) && !action.test(text) && !/^for (?:the )?/i.test(text)) { recipe.title = text.slice(0, 300); continue; }
    if (groupHeading.test(text) && section !== 'steps') { flush(); group = text.replace(/:$/, ''); section = 'ingredients'; continue; }
    if (section === 'notes') { recipe.notes += (recipe.notes ? '\n' : '') + text; continue; }
    if (action.test(text) || /^\d+[.)]\s+\p{L}/u.test(text)) {
      flush(); section = 'steps'; recipe.steps.push({ id: uid(), text: text.replace(/^\d+[.)]\s+/, ''), provenance: 'source' }); continue;
    }
    if (section === 'steps') {
      // A new screenshot that clearly starts another ingredient block can resume it.
      if (newSource && looksIngredient(text)) section = 'ingredients';
      else { if (recipe.steps.length) recipe.steps[recipe.steps.length - 1].text += ' ' + text; else recipe.steps.push({ id: uid(), text, provenance: 'source' }); continue; }
    }
    if (section === 'unknown' && recipe.title === 'Untitled recipe' && !looksIngredient(text)) { recipe.title = text.slice(0, 300); continue; }
    if (newSource && normalize(text) === normalize(recipe.title)) continue;
    if (section === 'ingredients' || looksIngredient(text)) {
      section = 'ingredients';
      const inlineList = text.split(/,\s*(?=(?:\d+(?:\s+\d+\/\d+|\/\d+|\.\d+)?|[¼½¾])\s*(?:g|kg|ml|oz|lb|cups?|tbsp|tsp|cloves?|cans?|eggs?)\b)/i);
      if (inlineList.length > 1) { lines.splice(index + 1, 0, ...inlineList.slice(1).map(value => ({ ...line, text: value }))); line.text = inlineList[0]; }
      if (text.endsWith(':') && !quantity.test(text)) { flush(); group = text.slice(0, -1); continue; }
      const previous = pending && parseIngredient(pending.line.text);
      const continuation = pending && pending.line.evidenceId === line.evidenceId && !looksIngredient(text) && (
        !previous?.name || /\b(?:extra virgin|all purpose|freshly|finely|roughly|ground|chopped|low sodium|unsalted|boneless|skinless)$/i.test(pending.line.text) ||
        /^(?:[,()]|and\b|or\b|divided\b|chopped\b|diced\b|sliced\b|drained\b|rinsed\b|optional\b|for serving\b|to taste\b)/i.test(text)
      );
      if (continuation && pending) { pending.line.text += ' ' + text; pending.refs.push({ evidenceId: line.evidenceId, lineStart: line.index, lineEnd: line.index }); continue; }
      flush(); pending = { line: { ...line, text: inlineList[0] }, refs: [{ evidenceId: line.evidenceId, lineStart: line.index, lineEnd: line.index }] }; continue;
    }
    recipe.description += (recipe.description ? '\n' : '') + text;
  }
  flush();
  const uniqueCounts = [...new Set(counts.filter(n => n > 0 && n <= 100000))];
  recipe.servings = uniqueCounts.length === 1 ? uniqueCounts[0] : null;
  if (uniqueCounts.length > 1) issues.push(`Conflicting recipe servings: ${uniqueCounts.join(' or ')}. The serving count is unknown until you confirm it.`);
  recipe.sourceNutrition = parsePublishedNutrition(nutrition.join('\n'), recipe.servings, issues);
  recipe.servingSize = recipe.sourceNutrition?.servingSize ?? '';
  for (const source of evidence) {
    if (source.ocr?.error) issues.push(`${source.label}: ${source.ocr.error}`);
    if (source.ocr && !source.text.trim()) issues.push(`No readable text found in ${source.label}. Try a sharper crop or paste its text.`);
    const uncertain = source.ocr?.lines.filter(line => line.confidence !== null && line.confidence < 75) ?? [];
    if (uncertain.length) issues.push(`${source.label}: ${uncertain.length} low-confidence OCR line${uncertain.length === 1 ? '' : 's'}. Compare fractions, amounts, and names with the image.`);
    if (source.ocr?.alternativeText) issues.push(`${source.label}: two OCR passes produced different readings. Compare the alternative reading with the original image.`);
    if (source.ocr?.numberChecks?.length) issues.push(`${source.label}: ${source.ocr.numberChecks.length} small quantities were read with focused OCR. Compare these readings with the image before confirming.`);
    if (source.ocr?.unresolvedNumbers?.length) issues.push(`${source.label}: unclear quantities need checking: ${source.ocr.unresolvedNumbers.join('; ')}`);
  }
  for (const step of recipe.steps) {
    const mention = step.text.match(/\b(?:garnish|top|finish|serve)\s+(?:(?:it|the dish|the bowls?)\s+)?with\s+([^.;]+)/i)?.[1];
    if (mention && mention.length < 90 && !recipe.ingredients.some(item => normalize(item.name).includes(normalize(mention)) || normalize(mention).includes(normalize(item.name)))) issues.push(`The method mentions “${mention}”. Check whether this needs an additional ingredient or accompaniment.`);
  }
  if (recipe.ingredients.some(i => /\b(?:1\s*\/\s*[1789]|[IlO]\s*(?:cup|tbsp|tsp|g|kg))\b/.test(i.original))) issues.push('An unusual fraction or letter-like amount needs checking against the image. It has not been corrected automatically.');
  recipe.warnings = [...new Set([...issues, ...reviewWarnings(recipe)])];
  return recipe;
}

export function parseBodyText(text: string, profileId: string): Recipe {
  return parseRecipeSources([{ id: uid(), kind: 'text', label: 'Original recipe text', text, assetId: null }], profileId);
}

function parsePublishedNutrition(text: string, servings: number | null, issues: string[]): SourceNutrition | null {
  if (!text.trim()) return null;
  const values = emptyMacros();
  const labels = { calories: '(?:calories|energy)', protein: 'protein', carbs: '(?:carbohydrates?|carbs)', fat: '(?:total\\s+)?fat' };
  for (const [key, label] of Object.entries(labels) as [keyof typeof values, string][]) {
    const matches = [...text.matchAll(new RegExp('(?:^|[\\n|;,])\\s*' + label + '\\s*:?\\s*(\\d+(?:\\.\\d+)?)\\s*(kcal|calories?|kj|mg|kg|g)?(?=\\s*(?:$|[\\n|;,]|\\d+\\s*%))', 'gim'))];
    const readings = matches.map(m => {
      const unit = (m[2] ?? '').toLowerCase(), value = Number(m[1]);
      return key === 'calories' ? unit === 'kj' ? value / 4.184 : /^(|kcal|calories?)$/.test(unit) ? value : null : unit === 'mg' ? value / 1000 : unit === 'kg' ? value * 1000 : /^(|g)$/.test(unit) ? value : null;
    });
    const unique = [...new Set(readings.filter((n): n is number => n !== null))];
    values[key] = unique.length === 1 ? unique[0] : null;
    if (unique.length > 1) issues.push(`Conflicting published ${key} values. Kept unknown; review the source text.`);
  }
  if (Object.values(values).every(value => value === null)) return null;
  const servingSize = text.match(/(?:^|\n)\s*serving size\s*:?\s*([^\n]+)/i)?.[1]?.trim() ?? '';
  const grams = servingSize.match(/(?:^|\()(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*(?:\)|$)/i);
  const is100 = /\bper\s*100\s*g\b/i.test(text), isRecipe = /\b(?:per|whole|entire)\s+(?:batch|recipe)\b/i.test(text), isServing = /\bper\s+(?:serving|portion)\b/i.test(text) || !!servingSize;
  const basis = [is100, isRecipe, isServing].filter(Boolean).length > 1 ? 'unknown' : is100 ? '100g' : isRecipe ? 'recipe' : isServing ? 'serving' : 'unknown';
  if (basis === 'unknown') issues.push('Published nutrition has no clear basis. Confirm whether it is per serving, per 100 g, or for the recipe.');
  return { values, basis, servings, servingSize, servingGrams: grams ? Number(grams[1]) : null, origin: 'source' };
}

export function assertSourceReview(recipe: Recipe) {
  if (recipe.deletedAt || recipe.status !== 'ready' || !recipe.sourceReview) return;
  if (!recipe.sourceReview.confirmed || !recipe.ingredients.length || !recipe.steps.length || recipe.ingredients.some(i => !i.name.trim()) || recipe.steps.some(s => !s.text.trim())) throw new Error('Check the extracted ingredients and instructions against the source before marking this recipe Ready to Cook. You can save it as Needs Review at any time.');
  if (reviewWarnings(recipe).some(w => w.startsWith('Repeated ingredients have differing amounts'))) throw new Error('Resolve differing amounts for the same ingredient, or put genuinely separate uses in their recipe groups, before marking Ready to Cook.');
  if (recipe.servings === null && recipe.warnings.some(w => w.startsWith('Conflicting recipe servings:'))) throw new Error('Confirm the conflicting recipe serving count before marking Ready to Cook.');
}

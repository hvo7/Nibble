import { useState } from 'react';
import type { Recipe } from '../shared/model';
import { pendingWebsiteConflicts, publishedNutrition, resolveWebsiteConflict } from '../shared/website-review';

/** Source values are deliberately separate from editable, ingredient-derived estimates. */
export function WebsiteReview({ recipe, onChange, onEstimate, hasUsdaKey }: { recipe: Recipe; onChange: (value: Recipe) => void; onEstimate: () => void; hasUsdaKey: boolean }) {
  const [basis, setBasis] = useState<'serving' | 'recipe'>('serving');
  if (!recipe.websiteImport) return null;
  const source = recipe.sourceNutrition;
  const shown = source ? publishedNutrition(source, basis) ?? publishedNutrition(source, source.basis === 'recipe' ? 'recipe' : 'serving') : null;
  const label = { serving: 'Per original serving', recipe: 'Whole original recipe', '100g': 'Per 100 g', unknown: 'Basis unknown — confirm before comparing' };
  return <section className="website-review" aria-label="Website import review">
    <div className="section-heading"><h2>Website recipe review</h2><span className="pill">{pendingWebsiteConflicts(recipe) ? 'Needs a decision' : 'Ready to review'}</span></div>
    <p className="small-copy muted">{recipe.sourceUrl}</p>
    <div className="website-review-grid">
      <div>
        <h3>Yield &amp; portions</h3>
        <dl className="website-portions"><div><dt>Servings</dt><dd>{recipe.servings ?? 'Unknown'}</dd></div><div><dt>Serving size</dt><dd>{recipe.servingSize || 'Not stated'}</dd></div></dl>
        {recipe.yieldText && <p className="small-copy muted">Published yield: {recipe.yieldText}</p>}
        {recipe.websiteImport.conflicts.map(conflict => <div className="review-note" key={conflict.id}>
          <strong>{conflict.field === 'servings' ? 'Serving count' : 'Nutrition'} {conflict.resolved ? 'reviewed' : 'needs review'}</strong>
          <p>{conflict.message}</p><div className="row wrap">{conflict.choices.map((choice, index) => <button type="button" className="small" key={index} onClick={() => onChange(resolveWebsiteConflict(recipe, conflict.id, choice.value))}>{choice.label}</button>)}</div>
        </div>)}
      </div>
      <div className="website-published">
        <h3>{source ? 'Nutrition from website' : 'Nutrition unavailable'}</h3>
        {source && (source.basis === 'serving' || source.basis === 'recipe') && <div className="row wrap website-basis">{(['serving', 'recipe'] as const).map(value => <button type="button" className="small" aria-pressed={shown?.basis === value} disabled={!publishedNutrition(source, value)} key={value} onClick={() => setBasis(value)}>{value === 'serving' ? 'Per serving' : 'Whole recipe'}</button>)}</div>}
        <div className="macro-grid">{(['calories', 'protein', 'carbs', 'fat'] as const).map(key => <div key={key}><strong>{shown?.values[key] == null ? '—' : Number(shown.values[key]!.toFixed(1))}<small>{key === 'calories' ? ' kcal' : ' g'}</small></strong><span>{key}</span></div>)}</div>
        <p className="small-copy muted">{shown ? label[shown.basis] : 'No selected published nutrition. Missing values stay unknown.'}{shown?.converted ? ` · Converted using ${source!.servings} original servings.` : ''}</p>
        {source?.servingSize && <p className="small-copy muted">Published serving size: {source.servingSize}</p>}
        <p className="small-copy muted">Published values stay tied to the original recipe when you edit or scale ingredients.</p>
        <button type="button" className="text-button" onClick={onEstimate}>{source ? 'Review ingredient-based estimate' : 'Estimate with USDA food matches'}</button>
        {!hasUsdaKey && <p className="small-copy muted">Optional estimates need your free USDA API key in Settings. Website extraction works without it.</p>}
      </div>
    </div>
    <details><summary>Compare extracted source records</summary>{recipe.websiteImport.sources.map((item, index) => <div className="website-source-record" key={index}><strong>{item.field} · {item.method}</strong><pre>{item.raw}</pre></div>)}</details>
  </section>;
}

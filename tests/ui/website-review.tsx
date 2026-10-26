import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RecipeEditor } from '../../src/components/RecipeEditor';
import { defaultSettings, recipeSchema, type Profile, type Recipe, type Snapshot } from '../../src/shared/model';
import '../../src/styles.css';
import type { NibbleApi } from '../../src/shared/api';

// Native/external actions are intentionally unavailable in the fixture-only preview.
window.nibble = new Proxy({} as NibbleApi, { get: () => async () => { throw new Error('Open desktop staging to use native actions or USDA. This preview contains synthetic data only.'); } });

const fixtures = JSON.parse(document.getElementById('test-fixtures')!.textContent!) as Record<string, Recipe>;
const noDirty = () => {};
function ReviewTest() {
  const [scenario, setScenario] = useState('Conflicting servings'); const [message, setMessage] = useState('');
  const recipe = fixtures[scenario];
  const profile: Profile = { id: recipe.profileId, name: 'Test kitchen', units: 'metric', avatar: '', createdAt: '' };
  const snapshot: Snapshot = { profiles: [profile], recipes: [], tags: [], groups: [], collections: [], jobs: [], settings: defaultSettings, hasUsdaKey: false };
  return <><div className="staging-banner">Component test preview · Synthetic data · Saves stay in this browser tab</div><div className="row wrap" style={{ padding: 16 }}>{Object.keys(fixtures).map(name => <button type="button" className="secondary" key={name} onClick={() => { setScenario(name); setMessage(''); }}>{name}</button>)}<span role="status">{message}</span></div><RecipeEditor key={scenario} initial={recipe} profile={profile} snapshot={snapshot} onDirty={noDirty} onError={error => setMessage(error instanceof Error ? error.message : String(error))} onClose={() => setMessage('This component preview does not open your library.')} onSupplement={async () => { setMessage('Adding evidence is available in the desktop staging app.'); }} onSave={async value => { const saved = recipeSchema.parse({ ...value, revision: value.revision + 1 }); setMessage('Validated and saved in this preview only.'); return saved; }}/></>;
}
createRoot(document.getElementById('root')!).render(<ReviewTest/>);

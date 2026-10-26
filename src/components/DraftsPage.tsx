import { useRef, useState } from 'react';
import type { ImportJob, Recipe } from '../shared/model';
import { pendingImportEntries } from '../shared/import-draft';
import { Empty, Icon } from './ui';
import { TrashRecipeDialog } from './TrashRecipeDialog';

export function DraftsPage({ jobs, recipes, targetJobId, onOpen, onSave, onImport, onError, onMessage }: {
  jobs: ImportJob[]; recipes: Recipe[]; targetJobId?: string;
  onOpen: (job: ImportJob, draft: Recipe) => void;
  onSave: (recipe: Recipe) => Promise<Recipe>; onImport: () => void;
  onError: (error: unknown) => void; onMessage: (message: string) => void;
}) {
  const [trash, setTrash] = useState<Recipe | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const actionLock = useRef(false);
  const run = async (id: string, action: () => Promise<unknown>) => {
    if (actionLock.current) return;
    actionLock.current = true; setPending(id);
    try { await action(); } catch (error) { onError(error); }
    finally { actionLock.current = false; setPending(null); }
  };
  const entries = pendingImportEntries(jobs, recipes);
  return <>
    {entries.map(({ job, recipe }) => {
      const running = job.status === 'running';
      const saved = recipe && recipes.some(item => item.id === recipe.id);
      return <section className="panel job-card import-card" key={job.id}>
        <div className="import-card-main" data-draft-id={recipe?.id}>
          <div className="grow"><h3>{running ? 'Preparing your recipe' : recipe?.title || 'Import needs attention'}</h3>
            <small>{running ? job.stage : recipe ? recipe.ingredients.length + ' ingredients · ' + recipe.steps.length + ' instructions' : job.stage}</small>
          </div>
          <span className={running ? 'pill processing' : 'pill'}>{running ? 'Processing' : saved ? 'Saved in library' : recipe ? 'Needs Review' : job.status}</span>
          {running ? <button className="secondary" disabled={!!pending} onClick={() => void run(job.id, () => window.nibble.cancelImport(job.id))}>Cancel import</button> : recipe && <>
            <button className="primary" onClick={() => onOpen(job,recipe)}>{targetJobId === job.id ? 'Add evidence & review' : saved ? 'Open saved recipe' : 'Review recipe'}</button>
            <button className="icon-button danger" aria-label={'Move ' + recipe.title + ' to Trash'} title="Move to Trash" onClick={() => setTrash(recipe)}><Icon name="trash"/></button>
          </>}
        </div>
        {job.error && <p className="notice">{job.error}</p>}
        <details className="import-details"><summary>Import details</summary>
          <p className="muted">{job.request.url || job.request.text.slice(0,100) || (job.request.assetIds.length + ' uploaded files')}</p>
          <small>{new Date(job.createdAt).toLocaleString()}</small>
          {!running && <div><button className="text-button" disabled={!!pending} onClick={() => void run(job.id, async () => { await window.nibble.startImport(job.request); onMessage('New import started.'); })}>{pending === job.id ? 'Starting…' : 'Retry as new draft'}</button></div>}
        </details>
      </section>;
    })}
    {!entries.length && <Empty title="No drafts to review." action={<button className="primary" onClick={onImport}>Import a recipe</button>}>Bring a link, screenshots, or recipe text to start a new draft.</Empty>}
    {trash && <TrashRecipeDialog recipe={trash} onClose={() => setTrash(null)} onSave={onSave} onError={onError} onTrashed={() => { setTrash(null); onMessage('Recipe moved to Trash.'); }}/>}
  </>;
}


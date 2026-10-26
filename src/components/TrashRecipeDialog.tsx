import { useRef, useState } from 'react';
import type { Recipe } from '../shared/model';
import { Modal } from './ui';

export function TrashRecipeDialog({ recipe, onClose, onSave, onTrashed, onError }: {
  recipe: Recipe; onClose: () => void; onSave: (recipe: Recipe) => Promise<Recipe>;
  onTrashed: (recipe: Recipe) => void; onError: (error: unknown) => void;
}) {
  const lock = useRef(false); const [busy,setBusy] = useState(false);
  const [failure,setFailure] = useState('');
  const title = recipe.title.trim() || 'Untitled recipe';
  return <Modal title={'Move “' + title + '” to Trash?'} onClose={() => { if (!lock.current) onClose(); }}>
    <p>You can restore this recipe from Trash. Its ingredients, notes, and source evidence will be kept.</p>
    {failure && <p className="notice" role="alert">{failure}</p>}
    <div className="dialog-footer"><button className="secondary" disabled={busy} onClick={onClose}>Keep recipe</button><button className="primary" disabled={busy} onClick={async () => {
      if (lock.current) return; lock.current = true; setBusy(true); setFailure('');
      try { const saved = await onSave({ ...recipe, title, deletedAt: new Date().toISOString() }); onTrashed(saved); }
      catch (error) { setFailure('Could not move this recipe to Trash. Your recipe is unchanged.'); onError(error); }
      finally { lock.current = false; setBusy(false); }
    }}>{busy ? 'Moving…' : 'Move to Trash'}</button></div>
  </Modal>;
}


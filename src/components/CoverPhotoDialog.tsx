import { useEffect, useRef, useState } from 'react';
import { Cover, Modal } from './ui';
import './cover-photo.css';

export function CoverPhotoDialog({ profileId, currentId, onClose, onUse, onBusy }: {
  profileId: string; currentId: string | null; onClose: () => void; onUse: (id: string) => void; onBusy: (busy: boolean) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), input = useRef<HTMLInputElement>(null), paste = useRef<HTMLDivElement>(null);
  useEffect(() => { paste.current?.focus(); }, []);
  const read = async (files: File[]) => {
    if (lock.current || !files.length) return;
    setError('');
    if (files.length !== 1) { setError('Choose or paste one photo at a time.'); return; }
    const file = files[0];
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setError('Choose a PNG, JPG, or WebP photo.'); return; }
    if (file.size > 8 * 1024 * 1024) { setError('Choose a photo smaller than 8 MB.'); return; }
    lock.current = true; setBusy(true); onBusy(true);
    try {
      const asset = await window.nibble.addImage(profileId, file.name || 'Pasted cover photo.png', await file.arrayBuffer(), true);
      setPending(asset.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'This photo could not be read. Try another image.');
    } finally { lock.current = false; setBusy(false); onBusy(false); if (input.current) input.current.value = ''; }
  };
  return <Modal title="Change cover photo" onClose={() => { if (!lock.current) onClose(); }}>
    <div className="cover-photo-dialog" onPaste={event => {
      event.stopPropagation();
      let files = Array.from(event.clipboardData.files);
      if (!files.length) files = Array.from(event.clipboardData.items).filter(item => item.kind === 'file').map(item => item.getAsFile()).filter((file): file is File => !!file);
      if (files.length) { event.preventDefault(); void read(files); }
      else { setError('Copy the image itself, then press Ctrl+V here. A copied link or text is not a photo.'); }
    }}>
      <div className="cover-photo-preview"><Cover id={pending ?? currentId}/></div>
      <div ref={paste} className="cover-photo-paste" tabIndex={0} role="region" aria-label="Paste cover photo" aria-busy={busy}>
        <strong>{busy ? 'Preparing your photo…' : 'Paste a photo with Ctrl+V'}</strong>
        <p>Copy the food image or a screenshot, then paste here.</p>
      </div>
      <input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp" aria-label="Cover photo file" disabled={busy} onChange={event => void read(Array.from(event.target.files ?? []))}/>
      <button type="button" className="secondary full" disabled={busy} onClick={() => input.current?.click()}>Choose image file</button>
      <p className="muted small-copy">PNG, JPG or WebP, up to 8 MB. Your current cover stays until you choose Use this photo and save the recipe.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {pending && !busy && <p role="status">Photo ready to use.</p>}
      <div className="dialog-footer"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={!pending || busy} onClick={() => pending && onUse(pending)}>Use this photo</button></div>
    </div>
  </Modal>;
}

import { useEffect, useRef, useState } from 'react';
import type { Asset, Settings } from '../shared/model';
import { Field, Icon, Modal, mediaUrl } from './ui';
import { BrowserImport } from './BrowserImport';
import type { BrowserCapture } from '../shared/browser-capture';

export function ImportDialog({ profileId, settings, initialFiles = [], onClose, onStarted, onError }: { profileId: string; settings: Settings; initialFiles?: File[]; onClose: () => void; onStarted: (id: string) => void; onError: (error: unknown) => void }) {
  const [url, setUrl] = useState(''); const [text, setText] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]); const [busy, setBusy] = useState(false);
  const [useAI, setUseAI] = useState(settings.useAI); const [editing, setEditing] = useState<Asset | null>(null);
  const [readImages, setReadImages] = useState(true);
  const [browserCapture, setBrowserCapture] = useState<BrowserCapture | null>(null);
  const [preparing, setPreparing] = useState(false); const [readingCapture, setReadingCapture] = useState(false);
  const prepareLock = useRef(false); const submitLock = useRef(false); const assetsRef = useRef(assets); assetsRef.current = assets;
  const blocked = busy || preparing || readingCapture;
  const append = (added: Asset[]) => { assetsRef.current = [...assetsRef.current, ...added]; setAssets(assetsRef.current); };
  const addFiles = async (files: File[]) => {
    if (!files.length || prepareLock.current || submitLock.current || readingCapture) return;
    prepareLock.current = true; setPreparing(true);
    const added: Asset[] = [];
    try {
      if (assetsRef.current.length + files.length > 20) throw new Error('Add up to 20 files per import.');
      for (const file of files) {
        if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('For videos, use Choose files. Drag-and-drop supports images.');
        if (file.size > 20 * 1024 * 1024) throw new Error('Images must be smaller than 20 MB.');
      }
      for (const file of files) {
        added.push(await window.nibble.addImage(profileId, file.name || 'Clipboard screenshot', await file.arrayBuffer()));
      }
      // Preserve each successfully prepared file even if a later file fails.
    } catch (error) { onError(error); }
    finally { if (added.length) append(added); prepareLock.current = false; setPreparing(false); }
  };
  const chooseFiles = async () => {
    if (prepareLock.current || submitLock.current || readingCapture) return;
    prepareLock.current = true; setPreparing(true);
    try {
      const selected = await window.nibble.selectMedia(profileId);
      if (assetsRef.current.length + selected.length > 20) throw new Error('Add up to 20 files per import. Choose fewer files; your existing files are still here.');
      append(selected);
    } catch (error) { onError(error); }
    finally { prepareLock.current = false; setPreparing(false); }
  };
  useEffect(() => {
    const paste = (event: ClipboardEvent) => { const files = Array.from(event.clipboardData?.files ?? []); if (files.length) { event.preventDefault(); void addFiles(files); } };
    document.addEventListener('paste', paste); return () => document.removeEventListener('paste', paste);
  });
  const move = (index: number, offset: number) => setAssets(current => { const next = [...current]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; return next; });
  useEffect(() => { if (initialFiles.length) void addFiles(initialFiles); }, []);
  const submit = async () => {
    if (submitLock.current || prepareLock.current || readingCapture || editing || (!browserCapture && !url.trim() && !text.trim() && !assets.length)) return;
    submitLock.current = true; setBusy(true);
    try { const id = await window.nibble.startImport({ profileId, url: browserCapture?.url ?? url, text, assetIds: assets.map(a => a.id), useAI, readImages, ...(browserCapture ? { browserCapture } : {}) }); onStarted(id); }
    catch (error) { onError(error); } finally { submitLock.current = false; setBusy(false); }
  };
  return <Modal title="A new recipe starts here" onClose={() => { if (!submitLock.current && !prepareLock.current && !readingCapture) onClose(); }} wide>
    <fieldset className="editor-fields" disabled={blocked}>
    <p className="muted">A link, a few screenshots, a caption. Bring them together in one recipe.</p>
    <BrowserImport capture={browserCapture} onChange={setBrowserCapture} onError={onError} busy={busy || preparing} onReadingChange={setReadingCapture}/>
    <div className="import-options">
      <section><div className="section-label"><Icon name="link"/>Paste a link</div><Field label="Recipe or social link"><input disabled={!!browserCapture} autoFocus type="url" placeholder="Paste a TikTok, Instagram, or recipe link..." value={browserCapture?.url ?? url} onChange={e => setUrl(e.target.value)}/></Field><small>{browserCapture ? 'The saved page supplies the source link. It will be parsed without a new website request.' : 'If a site rejects the link, use Import from browser above, or add text and screenshots.'}</small>{!browserCapture && url.trim() && <button type="button" className="text-button small-copy" onClick={() => window.nibble.openLink(url.trim()).catch(onError)}>Open website in browser</button>}</section>
      <section onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void addFiles(Array.from(e.dataTransfer.files)); }} className="upload-zone"><Icon name="upload" size={27}/><strong>Screenshots & videos</strong><p>Drop images here or paste with Ctrl+V.</p><button className="secondary" disabled={blocked} onClick={chooseFiles}>Choose files</button><small>JPG, PNG, WebP · MP4, MOV, WebM</small></section>
      <section><div className="section-label"><Icon name="text"/>Paste recipe text</div><Field label="Caption, ingredients, or instructions"><textarea rows={5} value={text} onChange={e => setText(e.target.value)} placeholder={'Grandma’s favorite soup\nIngredients\n200 g carrots\nInstructions\n1. Chop the carrots...'}/></Field></section>
    </div>
    {assets.length > 0 && <div className="media-strip">{assets.map((asset, index) => <div className="media-item" key={asset.id}>{asset.mime.startsWith('image/') ? <img src={mediaUrl(asset.id)} alt={asset.name}/> : <div className="video-tile"><Icon name="book"/></div>}<span title={asset.name}>{asset.name}</span><div className="row"><button className="small" disabled={index === 0} aria-label={`Move ${asset.name} earlier`} onClick={() => move(index, -1)}>←</button><button className="small" disabled={index === assets.length - 1} aria-label={`Move ${asset.name} later`} onClick={() => move(index, 1)}>→</button>{asset.mime.startsWith('image/') && <button className="small" onClick={() => setEditing(asset)}>Edit</button>}<button className="icon-button" aria-label={`Remove ${asset.name}`} onClick={() => setAssets(current => current.filter(a => a.id !== asset.id))}><Icon name="close" size={15}/></button></div></div>)}</div>}
    {!!assets.length && <><label className="setting-toggle"><input type="checkbox" checked={readImages} onChange={event => setReadImages(event.target.checked)}/><div><strong>Read screenshots and build the recipe</strong><p>Read English text locally, identify ingredients and instructions, and keep nutrition separate. First use prepares the free OCR language file. Clear screenshots work best; review the extracted amounts before cooking.</p></div></label>{!readImages && <p className="notice">Images will be attached only. Turn screenshot reading on to generate ingredients and instructions.</p>}</>}
    <div className="dialog-footer"><label className="check"><input type="checkbox" checked={useAI} disabled={!settings.useAI} onChange={e => setUseAI(e.target.checked)}/> Organize with local AI</label><button className="primary" disabled={blocked || !!editing || (!browserCapture && !url.trim() && !text.trim() && !assets.length)} onClick={submit}>{busy ? 'Starting…' : 'Create recipe draft'}<Icon name="arrow" size={17}/></button></div>
    {preparing && <p role="status">Preparing files. Please wait before creating the draft.</p>}
    </fieldset>
    {editing && <ImageEditor asset={editing} profileId={profileId} onClose={() => setEditing(null)} onError={onError} onSave={next => { setAssets(current => current.map(a => a.id === editing.id ? next : a)); setEditing(null); }}/ >}
  </Modal>;
}

function ImageEditor({ asset, profileId, onClose, onSave, onError }: { asset: Asset; profileId: string; onClose: () => void; onSave: (asset: Asset) => void; onError: (error: unknown) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null); const [rotation, setRotation] = useState(0);
  const [previewSize, setPreviewSize] = useState({ width: 400, height: 300 });
  const [crop, setCrop] = useState({ left: 0, top: 0, right: 0, bottom: 0 });
  useEffect(() => {
    let active = true;
    const image = new Image(); image.crossOrigin = 'anonymous'; image.src = mediaUrl(asset.id);
    image.onload = () => {
      const target = canvas.current; if (!target || !active) return;
      const swap = rotation % 180 !== 0; target.width = swap ? image.height : image.width; target.height = swap ? image.width : image.height;
      const context = target.getContext('2d')!; context.translate(target.width / 2, target.height / 2); context.rotate(rotation * Math.PI / 180); context.drawImage(image, -image.width / 2, -image.height / 2);
      const scale = Math.min(450 / target.width, 350 / target.height, 1);
      setPreviewSize({ width: target.width * scale, height: target.height * scale });
    };
    return () => { active = false; };
  }, [asset.id, rotation]);
  const save = async () => {
    try {
      const source = canvas.current!; const target = document.createElement('canvas');
      const x = source.width * crop.left / 100; const y = source.height * crop.top / 100;
      target.width = source.width * (100 - crop.left - crop.right) / 100; target.height = source.height * (100 - crop.top - crop.bottom) / 100;
      target.getContext('2d')!.drawImage(source, x, y, target.width, target.height, 0, 0, target.width, target.height);
      const blob = await new Promise<Blob>((resolve, reject) => target.toBlob(b => b ? resolve(b) : reject(new Error('Could not edit this image.')), 'image/png'));
      onSave(await window.nibble.addImage(profileId, asset.name, await blob.arrayBuffer()));
    } catch (error) { onError(error); }
  };
  return <Modal title="Prepare your screenshot" onClose={onClose}><div className="crop-preview" style={previewSize}><canvas ref={canvas} style={{ width: '100%', height: '100%' }}/><div className="crop-outline" style={{ left: crop.left + '%', top: crop.top + '%', right: crop.right + '%', bottom: crop.bottom + '%' }}/></div><button className="secondary" onClick={() => setRotation(value => (value + 90) % 360)}>Rotate 90°</button><p className="muted">Crop away navigation and unrelated comments.</p><div className="form-grid">{(['left', 'top', 'right', 'bottom'] as const).map(side => <Field key={side} label={`Crop ${side}: ${crop[side]}%`}><input type="range" min="0" max="45" value={crop[side]} onChange={e => setCrop(current => ({ ...current, [side]: Number(e.target.value) }))}/></Field>)}</div><div className="dialog-footer"><button className="primary" onClick={save}>Use edited image</button></div></Modal>;
}

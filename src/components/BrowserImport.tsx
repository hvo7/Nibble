import { useRef, useState } from 'react';
import { MAX_CAPTURE_BYTES, readBrowserCapture, type BrowserCapture } from '../shared/browser-capture';
import { Icon, Modal } from './ui';

export function ImportPrivacy() {
  return <div className="import-privacy"><h3>You choose what to import.</h3><p>The browser companion runs only when you click <strong>Read this recipe</strong>. It reads recipe metadata and the recipe area of the current page, excluding forms, editable fields, and common navigation and comment areas. Review the saved content before importing: website layouts vary.</p><p>It does not read cookies, passwords, browsing history, or other tabs. To include a food photo, it reads accessible image pixels already on the page or requests a same-site image without cookies or redirects. It sends no content to Nibble servers or a paid service. Your browser still connects to the website normally under that website's privacy policy.</p><p>The saved file contains the source link, title, capture date, recipe content, and the selected dish photo when available. Importing the saved file stays offline. Nibble stores imported content and drafts on this device. Copies in Downloads, backups, exports, or folders synced by your operating system remain until you remove them separately. Deleting a recipe moves it to Trash; it does not erase its import history.</p><p>Import pages you can access normally for your own recipe collection. The companion does not unlock restricted content or defeat access checks. Keep the creator and source attribution; importing does not grant rights to republish. Ingredient quantities and nutrition still need your review.</p><small>Browser import policy · October 21, 2026</small></div>;
}

export function BrowserImport({ capture, onChange, onError, busy, onReadingChange }: { capture: BrowserCapture | null; onChange: (value: BrowserCapture | null) => void; onError: (error: unknown) => void; busy: boolean; onReadingChange?: (reading: boolean) => void }) {
  const file = useRef<HTMLInputElement>(null); const readLock = useRef(false);
  const [guide, setGuide] = useState(false); const [privacy, setPrivacy] = useState(false); const [reading, setReading] = useState(false);
  const read = async (files: File[]) => {
    if (!files.length || busy || readLock.current) return;
    readLock.current = true; setReading(true); onReadingChange?.(true);
    try {
      if (files.length !== 1) throw new Error('Choose one saved recipe file at a time.');
      if (files[0].size > MAX_CAPTURE_BYTES) throw new Error('Choose a recipe file smaller than 6 MB.');
      const next = readBrowserCapture(await files[0].text()); onChange(next);
    } catch (error) { onError(error); }
    finally { readLock.current = false; setReading(false); onReadingChange?.(false); if (file.current) file.current.value = ''; }
  };
  return <section className="browser-import" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void read(Array.from(event.dataTransfer.files)); }}>
    <div className="section-label"><Icon name="link"/>Import from browser <span className="pill">Free</span></div>
    <p>Website rejecting the link? Open it in Chrome or Edge and save the recipe with the Nibble companion. Import that file here without downloading the page again.</p>
    <input ref={file} type="file" disabled={busy || reading} hidden accept=".nibble-recipe.json,application/json" aria-label="Saved browser recipe file" onChange={event => void read(Array.from(event.target.files ?? []))}/>
    <div className="row wrap"><button type="button" className="secondary" disabled={busy || reading} onClick={() => file.current?.click()}><Icon name="upload" size={17}/>{reading ? 'Reading file…' : 'Choose saved recipe'}</button><button type="button" className="text-button" onClick={() => setGuide(true)}>Set up browser companion</button></div>
    {capture && <div className="browser-capture-ready" role="status"><Icon name="check"/><div><strong>{capture.title || 'Saved browser recipe'}</strong><small>{capture.version === 2 && capture.coverPhoto ? 'Food photo included · ' : ''}{new URL(capture.url).hostname} · Ready to parse locally</small></div><button className="icon-button" disabled={busy || reading} aria-label="Remove saved browser recipe" onClick={() => onChange(null)}><Icon name="close" size={17}/></button></div>}
    <button type="button" className="text-button small-copy" onClick={() => setPrivacy(true)}>Privacy &amp; import policy</button>
    {guide && <Modal title="Set up browser imports" onClose={() => setGuide(false)}><p>One-time setup for Chrome or Edge. The companion is free and runs only on a page you choose.</p><ol className="browser-setup"><li><button className="secondary" onClick={() => window.nibble.openBrowserCompanion().catch(onError)}>Get browser companion</button><p>Desktop: opens the companion folder. Preview: downloads a ZIP; extract it first.</p></li><li>In Chrome open <code>chrome://extensions</code>, or in Edge open <code>edge://extensions</code>. Turn on <strong>Developer mode</strong>, choose <strong>Load unpacked</strong>, and select the folder containing <code>manifest.json</code>.</li><li>After an update, reload the companion on your browser’s Extensions page, or load the folder opened above. Older saved files still import but do not include photos.</li><li>Open your recipe website normally. Click the Nibble extension, choose <strong>Read this recipe</strong>, then <strong>Save recipe file</strong>.</li><li>Return here and choose <strong>Choose saved recipe</strong>, then <strong>Create recipe draft</strong>.</li></ol><p className="muted">No extension installed? Pasted recipe text and screenshots still work. A saved page cannot include content the website has not shown you.</p></Modal>}
    {privacy && <Modal title="Browser import privacy" onClose={() => setPrivacy(false)}><ImportPrivacy/></Modal>}
  </section>;
}

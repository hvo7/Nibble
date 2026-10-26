import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../../src/App';
import { Modal } from '../../src/components/ui';
import type { Recipe } from '../../src/shared/model';
import { createPreviewApi } from './preview-api';
import '../../src/styles.css';
import './full-app-preview.css';
const fixtures = JSON.parse(document.getElementById('test-fixtures')!.textContent!) as Record<string, Recipe>;
const preview = createPreviewApi(fixtures);
declare const __NIBBLE_OCR_READY__: boolean;
const ocrReady = typeof __NIBBLE_OCR_READY__ !== 'undefined' && __NIBBLE_OCR_READY__;
window.nibble = preview.api;
Object.assign(window, { __nibblePreviewMedia: preview.mediaUrl });
// The desktop profile preference is not used by this separate preview origin.
localStorage.setItem('nibble-profile', preview.profileId);

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <div className="startup"><h1>Reload the preview</h1><p>{this.state.error}</p><button className="primary" onClick={() => location.reload()}>Start again on Home</button></div> : this.props.children; }
}
function Preview() {
  const [dialog, setDialog] = useState<'guide' | 'reset' | 'ocr' | null>(null);
  return <>
    <header className="preview-toolbar" aria-label="Preview controls"><div><strong>Nibble preview</strong><span>Test recipes · resets on reload</span></div><nav aria-label="Preview tools">{!ocrReady && <button onClick={() => setDialog('ocr')}>Screenshot reader: setup needed</button>}<button onClick={() => setDialog('guide')}>What can I test?</button><button onClick={() => setDialog('reset')}>Restart preview</button></nav></header>
    <App/>
    {dialog === 'guide' && <Modal title="Explore the whole app" onClose={() => setDialog(null)}><p>This is Nibble's actual app interface with a separate, temporary test library. Start on Home and use every sidebar tab.</p><p><strong>Working here:</strong> search, filters, favorites, collections, tags, the profile panel, recipe editing and saving, serving controls, nutrition review, notes, trash and restore. Import saved browser recipe files, pasted text, or screenshots into an editable card. Screenshot OCR runs locally after the preview launcher prepares the free English language file. Recipe export downloads preview JSON.</p><p><strong>Desktop staging required:</strong> direct website downloads, video transcription, local AI, live USDA, installed-tool detection, printing, and desktop backups. Saved browser recipe files work here without contacting the source website. Do not enter a real API key in the preview.</p><p>Use <strong>Annotate</strong> in the conversation browser toolbar to mark a control or area and send feedback. Drafts is in the left navigation; Save recipe opens the full saved-recipe page.</p><p>Changes last until you reload or restart this preview. Your desktop recipes are separate.</p><button className="primary" onClick={() => setDialog(null)}>Start exploring</button></Modal>}
    {dialog === 'reset' && <Modal title="Restart the preview?" onClose={() => setDialog(null)}><p>This clears this visit’s test edits and opens Home with the original sample recipes.</p><div className="dialog-footer"><button className="secondary" onClick={() => setDialog(null)}>Keep exploring</button><button className="primary" onClick={() => location.reload()}>Restart on Home</button></div></Modal>}
    {dialog === 'ocr' && <Modal title="Prepare screenshot reading" onClose={() => setDialog(null)}><p>The screenshot reader needs its free English language file once. Your screenshots stay on this computer.</p><ol><li>Close the terminal running the preview.</li><li>Open <strong>Start-Nibble-Preview.cmd</strong> again while connected to the internet.</li><li>Wait for the language download and “preview ready” message, then refresh this page.</li></ol><p>If the download fails, run <code>npm run setup:ocr</code> in the project folder, then reopen the preview launcher. Pasted-text parsing is already available.</p><button className="primary" onClick={() => setDialog(null)}>Back to app</button></Modal>}
  </>;
}
createRoot(document.getElementById('root')!).render(<ErrorBoundary><Preview/></ErrorBoundary>);

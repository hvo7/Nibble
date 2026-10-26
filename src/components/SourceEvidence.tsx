import { useEffect, useRef, useState } from 'react';
import type { Evidence } from '../shared/model';
import { mediaUrl } from './ui';

export function SourceEvidence({ item, selected, onCover, onCorrect }: { item: Evidence; selected: boolean; onCover: () => void; onCorrect: (text: string) => void }) {
  const details = useRef<HTMLDetailsElement>(null);
  const [editing, setEditing] = useState(false), [text, setText] = useState(item.text);
  useEffect(() => { if (selected && details.current) { details.current.open = true; details.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }, [selected]);
  return <details ref={details} open={selected || !item.label.startsWith('Additional source record: ')} className={selected ? 'selected-source' : ''}><summary>{item.label}</summary>
    {item.assetId && item.kind === 'image' && <><img className="evidence-image" src={mediaUrl(item.assetId)} alt={item.label}/><button className="text-button small" onClick={onCover}>Use as cover</button></>}
    {item.ocr && <p className="small-copy">{item.ocr.error ? 'Reading failed · original preserved' : item.ocr.confidence === null ? 'OCR confidence unavailable' : `OCR confidence: ${Math.round(item.ocr.confidence)}% · not a verification score`}</p>}
    {item.ocr?.lines.some(line => line.confidence !== null && line.confidence < 75) && <details><summary>Check unclear lines</summary>{item.ocr.lines.filter(line => line.confidence !== null && line.confidence < 75).map((line, index) => <p className="review-note" key={index}>{line.text} <small>({Math.round(line.confidence!)}%)</small></p>)}</details>}
    <pre>{item.text || 'No readable text extracted. Try a sharper crop or paste the missing text below.'}</pre>
    {!!item.ocr?.numberChecks?.length && <details><summary>Focused quantity readings</summary>{item.ocr.numberChecks.map((check, index) => <p key={index}>{check}</p>)}<p>These are OCR readings, not user verification. Compare with the image.</p></details>}
    {!!item.ocr?.unresolvedNumbers?.length && <p className="notice">Check unclear quantities: {item.ocr.unresolvedNumbers.join('; ')}</p>}
    {item.originalText !== undefined && <details><summary>Original extracted text · before correction</summary><pre>{item.originalText}</pre></details>}
    {item.ocr?.alternativeText && <details><summary>Alternative OCR reading · compare before using</summary><pre>{item.ocr.alternativeText}</pre></details>}
    {item.kind !== 'website' && (editing ? <><label className="field"><span>Correct extracted text</span><textarea rows={12} value={text} onChange={event => setText(event.target.value)} maxLength={250000}/></label><p className="small-copy">Rebuilds the draft’s ingredients, instructions, servings, and published nutrition from the text and screenshot sources. Review any manual field edits afterward.</p><div className="row wrap"><button className="primary small" onClick={() => { onCorrect(text); setEditing(false); }}>Rebuild recipe from text</button><button className="text-button" onClick={() => { setText(item.text); setEditing(false); }}>Cancel correction</button></div></> : <button className="text-button" onClick={() => { setText(item.text); setEditing(true); }}>Correct text & reparse</button>)}
  </details>;
}

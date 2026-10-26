import { useEffect, useRef, type ReactNode } from 'react';

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/></>,
    book: <><path d="M12 5C7 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-4-2-9 1Z"/><path d="M12 5v15"/></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>,
    folder: <path d="M3 5h6l2 3h10v12H3Z"/>,
    tag: <><path d="M3 3h8l10 10-8 8L3 11Z"/><circle cx="7" cy="7" r="1"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></>,
    settings: <><circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/></>,
    plus: <path d="M12 4v16M4 12h16"/>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    list: <path d="M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1"/>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/></>,
    link: <><path d="m10 14 4-4m-5 7-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2-2 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/></>,
    text: <path d="M4 5h16M4 10h16M4 15h10M4 20h13"/>,
    trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></>,
    check: <path d="m4 12 5 5L20 6"/>,
    chef: <><path d="M6 14a5 5 0 0 1-2-9 5 5 0 0 1 8-2 5 5 0 0 1 8 2 5 5 0 0 1-2 9v7H6Z"/><path d="M6 17h12"/></>,
    leaf: <><path d="M20 3C4 1 1 13 7 18c5 4 14-1 13-15Z"/><path d="M4 21 16 8"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.book}</svg>;
}
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => { element.close(); }; }, []);
  return <dialog ref={dialog} className={`modal ${wide ? 'wide' : ''}`} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><header><h2>{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close"/></button></header>{children}</dialog>;
}
export function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty"><div className="empty-symbol"><Icon name="leaf" size={34}/></div><h2>{title}</h2><p>{children}</p>{action}</div>;
}
export const mediaUrl = (id: string) => `nibble://media/${id}`;
export function Cover({ id, className = '' }: { id: string | null; className?: string }) {
  return id ? <img className={`cover ${className}`} src={mediaUrl(id)} alt=""/> : <div className={`cover placeholder ${className}`}><Icon name="chef" size={44}/><span>A little inspiration</span></div>;
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function Notification({ text, error, onClose }: { text: string; error: boolean; onClose: () => void }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => { element.current?.showPopover(); }, [text]);
  return <div ref={element} popover="manual" className={`toast ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}><span>{text}</span><button className="icon-button" aria-label="Dismiss notification" onClick={onClose}><Icon name="close" size={17}/></button></div>;
}

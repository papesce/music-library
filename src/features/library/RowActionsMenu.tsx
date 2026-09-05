import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { copyThenOpenChosic } from '../../lib/chosic';

type Props = {
  trackTitle: string;
  trackArtist?: string;
  onSplit: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  onSetLoudness?: (v: 'quiet' | 'normal' | 'loud' | null) => void;
  loudness?: string | null;
};

export function RowActionsMenu({ trackTitle, trackArtist, onSplit, onEdit, onDelete, onSetLoudness, loudness }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const updateCoords = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const menuW = 168;
    const gap = 6;
    let left = r.right - menuW;
    let top = r.bottom + gap;
    // clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
    // if below viewport, flip above
    if (top + 140 > window.innerHeight) top = r.top - 140 - gap;
    setCoords({ top, left });
  };

  useLayoutEffect(() => {
    if (open) updateCoords();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onScrollOrResize = () => updateCoords();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  const closeAnd = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div className="row-actions-menu">
      <button
        ref={triggerRef}
        className="row-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${trackTitle}`}
        onClick={() => setOpen(v => !v)}
      >
        ⋯
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="glass row-menu-dropdown"
            style={{ position: 'fixed', top: coords.top, left: coords.left, right: 'auto' }}
          >
            <button role="menuitem" className="row-menu-item" onClick={() => closeAnd(onSplit)}>
              <span aria-hidden>✂</span> Split
            </button>
            <button role="menuitem" className="row-menu-item" onClick={() => closeAnd(() => { void copyThenOpenChosic(trackTitle, trackArtist); })}>
              <span aria-hidden>♪</span> Find similar (Chosic)
            </button>
            {onSetLoudness && (
              <>
                <div className="row-menu-separator" />
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', padding: '4px 8px 2px', textTransform: 'uppercase', letterSpacing: 0.04+'em' }}>Loudness</div>
                <button role="menuitem" className="row-menu-item" onClick={() => closeAnd(() => onSetLoudness('quiet'))} style={{ background: loudness === 'quiet' ? 'rgba(124,92,255,0.12)' : undefined }}>🔈 Quiet</button>
                <button role="menuitem" className="row-menu-item" onClick={() => closeAnd(() => onSetLoudness('normal'))} style={{ background: loudness === 'normal' ? 'rgba(124,92,255,0.12)' : undefined }}>🔉 Normal</button>
                <button role="menuitem" className="row-menu-item" onClick={() => closeAnd(() => onSetLoudness('loud'))} style={{ background: loudness === 'loud' ? 'rgba(124,92,255,0.12)' : undefined }}>🔊 Loud</button>
                {loudness && <button role="menuitem" className="row-menu-item" onClick={() => closeAnd(() => onSetLoudness(null))}>✕ Clear</button>}
              </>
            )}
            <div className="row-menu-separator" />
            <button role="menuitem" className="row-menu-item danger" onClick={() => closeAnd(onDelete)}>
              <span aria-hidden>🗑</span> Move to Trash
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}

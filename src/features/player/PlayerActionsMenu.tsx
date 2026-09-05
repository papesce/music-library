import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Track } from '../../types/api.d';
import { buildGoogleQuery, openGoogle } from '../../lib/googleQuery';
import { copyThenOpenChosic } from '../../lib/chosic';

type Props = {
  track: Track;
  onSplit?: () => void;
};

export function PlayerActionsMenu({ track, onSplit }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const query = buildGoogleQuery({
    title: track.title,
    artist: track.artist,
    album: track.album,
    genre: track.genre,
    year: track.year ?? null,
    filePath: track.filePath,
  });

  const updateCoords = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const menuW = 200;
    const gap = 6;
    let left = r.right - menuW;
    let top = r.bottom + gap;
    left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
    if (top + 160 > window.innerHeight) top = r.top - 160 - gap;
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
        className="btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More actions for ${track.title}`}
        title="More actions"
        onClick={() => setOpen(v => !v)}
        style={{ padding: '6px 10px' }}
      >
        ⋯
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="glass row-menu-dropdown"
            style={{ position: 'fixed', top: coords.top, left: coords.left, right: 'auto', minWidth: 200 }}
          >
            {onSplit && (
              <button role="menuitem" className="row-menu-item" onClick={() => closeAnd(onSplit)}>
                <span aria-hidden>✂</span> Split track…
              </button>
            )}
            <button
              role="menuitem"
              className="row-menu-item"
              title={query}
              onClick={() => closeAnd(() => openGoogle(query))}
            >
              <span aria-hidden>🔍</span> Google this song
            </button>
            <button
              role="menuitem"
              className="row-menu-item"
              onClick={() => closeAnd(() => { void copyThenOpenChosic(track.title, track.artist); })}
            >
              <span aria-hidden>♪</span> Find similar (Chosic)
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}

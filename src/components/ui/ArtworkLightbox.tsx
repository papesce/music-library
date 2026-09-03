import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Track } from '../../types/api.d';
import { coverUrl } from '../../lib/path';

type Props = {
  track: Track;
  onClose: () => void;
  onEdit?: () => void;
  onPlay?: () => void;
  isPlaying?: boolean;
};

export function ArtworkLightbox({ track, onClose, onEdit, onPlay, isPlaying }: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // lock scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return createPortal(
    <div
      className="artwork-lightbox-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Artwork for ${track.title}`}
    >
      <div className="artwork-lightbox" onClick={e => e.stopPropagation()}>
        <button className="artwork-lightbox-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="artwork-lightbox-img-wrap">
          {!failed ? (
            <img
              src={coverUrl(track.filePath)}
              alt={`${track.album} cover — ${track.artist} — ${track.title}`}
              onError={() => setFailed(true)}
            />
          ) : (
            <div className="artwork-lightbox-fallback">♪<span>No cover</span></div>
          )}
        </div>
        <div className="artwork-lightbox-meta">
          <b>{track.title}</b>
          <span className="muted">{track.artist} · {track.album}{track.year ? ` · ${track.year}` : ''}</span>
        </div>
        {(onPlay || onEdit) && (
          <div className="artwork-lightbox-actions">
            {onPlay && (
              <button className="btn btn-primary" onClick={() => { onPlay(); onClose(); }}>
                {isPlaying ? '⏸ Pause' : '▶ Play'}
              </button>
            )}
            {onEdit && (
              <button className="btn" onClick={() => { onClose(); onEdit(); }}>
                ✎ Edit song
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

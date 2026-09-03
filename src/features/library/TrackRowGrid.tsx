import { memo, useState, useEffect } from 'react';
import type { Track } from '../../types/api.d';
import { coverUrl, splitFile } from '../../lib/path';
import { formatDuration, truncateMiddle } from '../../lib/format';
import { RowActionsMenu } from './RowActionsMenu';

type Props = {
  track: Track;
  isPlaying: boolean;
  isPaused: boolean;
  isActive: boolean;
  onPlay: () => void;
  onSplit: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleReviewed?: (t: Track) => void;
  style?: React.CSSProperties;
  coverBust?: number;
};

export const TrackRowGrid = memo(function TrackRowGrid({ track, isPlaying, isPaused, isActive, onPlay, onSplit, onEdit, onDelete, onToggleReviewed, style, coverBust }: Props) {
  const { folder, file } = splitFile(track.filePath);
  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => { setCoverFailed(false); }, [track.filePath, coverBust]);

  return (
    <div
      role="row"
      aria-selected={isActive}
      title={track.filePath}
      style={{ ...style, opacity: track.reviewed ? 0.62 : undefined }}
      className={`track-row ${isActive ? 'playing' : ''} ${track.duplicateGroupId ? 'dup' : ''} ${track.reviewed ? 'reviewed' : ''}`}
    >
      <div role="gridcell" className="track-row-cell cell-play">
        {onToggleReviewed && (
          <button
            onClick={() => onToggleReviewed(track)}
            title={track.reviewed ? 'Mark as not reviewed' : 'Mark as reviewed / completed'}
            aria-label={track.reviewed ? 'Unmark reviewed' : 'Mark reviewed'}
            style={{
              width: 18,
              height: 18,
              borderRadius: 999,
              border: `1px solid ${track.reviewed ? 'rgba(46,204,113,0.8)' : 'var(--border-soft)'}`,
              background: track.reviewed ? 'rgba(46,204,113,0.22)' : 'rgba(255,255,255,0.06)',
              color: track.reviewed ? '#8ff5b8' : 'var(--muted)',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              fontSize: 11,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            {track.reviewed ? '✓' : '○'}
          </button>
        )}
      </div>

      <div role="gridcell" className="track-row-cell cell-track">
        <div className="track-cell">
          <button
            type="button"
            className={`thumb thumb-btn ${isActive ? 'thumb-btn-active' : ''}`}
            onClick={onPlay}
            aria-label={isPlaying ? `Pause ${track.title}` : isPaused ? `Resume ${track.title}` : `Play ${track.title}`}
            title={isPlaying ? 'Pause' : isPaused ? 'Resume' : 'Play'}
          >
            {!coverFailed ? (
              <img src={coverUrl(track.filePath, coverBust)} alt="" loading="lazy" onError={() => setCoverFailed(true)} />
            ) : null}
            <span className="thumb-fallback" style={{ display: coverFailed ? 'grid' : undefined }}>
              ♪
            </span>
            <span className="thumb-play-overlay" aria-hidden>{isPlaying ? '⏸' : '▶'}</span>
          </button>
          <div className="track-main">
            <span className="track-title">
              {track.title}
              {track.duplicateGroupId && <span className="dup-badge">dup</span>}
              {track.reviewed && <span className="dup-badge" style={{ background: 'rgba(46,204,113,0.9)', color: '#0a1a0f' }}>✓ done</span>}
            </span>
            <span className="track-file" title={track.filePath}>
              <span className="track-file-folder">{folder}/</span>
              <span className="track-file-name" title={file}>
                {truncateMiddle(file)}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div role="gridcell" className="track-row-cell cell-edit">
        <button
          type="button"
          className="row-edit-btn"
          title="Edit song"
          aria-label={`Edit ${track.title}`}
          onClick={e => { e.stopPropagation(); onEdit(); }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </div>

      <div role="gridcell" className="track-row-cell cell-artist">
        {track.artist}
      </div>
      <div role="gridcell" className="track-row-cell cell-album">
        {track.album}
      </div>
      <div role="gridcell" className="track-row-cell cell-genre muted">
        {track.genre || '—'}
      </div>
      <div role="gridcell" className="track-row-cell cell-duration muted">
        {formatDuration(track.duration)}
      </div>
      <div role="gridcell" className="track-row-cell cell-year muted">
        {track.year ?? '—'}
      </div>

      <div role="gridcell" className="track-row-cell cell-actions">
        <RowActionsMenu trackTitle={track.title} onSplit={onSplit} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  );
});

import { memo, useState } from 'react';
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
  style?: React.CSSProperties;
};

export const TrackRowGrid = memo(function TrackRowGrid({ track, isPlaying, isPaused, isActive, onPlay, onSplit, onEdit, onDelete, style }: Props) {
  const { folder, file } = splitFile(track.filePath);
  const [coverFailed, setCoverFailed] = useState(false);

  return (
    <div
      role="row"
      aria-selected={isActive}
      title={track.filePath}
      style={style}
      className={`track-row ${isActive ? 'playing' : ''} ${track.duplicateGroupId ? 'dup' : ''}`}
    >
      <div role="gridcell" className="track-row-cell cell-play">
        <button
          className={`play-btn ${isActive ? '' : 'ghost'}`}
          onClick={onPlay}
          aria-label={isPlaying ? `Pause ${track.title}` : isPaused ? `Resume ${track.title}` : `Play ${track.title}`}
          title={isPlaying ? 'Pause' : isPaused ? 'Resume' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
      </div>

      <div role="gridcell" className="track-row-cell cell-track">
        <div className="track-cell">
          <div className="thumb">
            {!coverFailed ? (
              <img src={coverUrl(track.filePath)} alt="" loading="lazy" onError={() => setCoverFailed(true)} />
            ) : null}
            <span className="thumb-fallback" style={{ display: coverFailed ? 'grid' : undefined }}>
              ♪
            </span>
          </div>
          <div className="track-main">
            <span className="track-title">
              {track.title}
              {track.duplicateGroupId && <span className="dup-badge">dup</span>}
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

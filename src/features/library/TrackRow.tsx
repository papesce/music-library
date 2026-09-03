import type { Track } from '../../types/api.d';
import { coverUrl, splitFile } from '../../lib/path';
import { formatDuration, truncateMiddle } from '../../lib/format';

export function TrackRow({
  track,
  isPlaying,
  isPaused,
  isActive,
  onPlay,
  onSplit,
  onEdit,
  onDelete,
}: {
  track: Track;
  isPlaying: boolean;
  isPaused: boolean;
  isActive: boolean;
  onPlay: () => void;
  onSplit: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { folder, file } = splitFile(track.filePath);
  return (
    <tr className={`${isActive ? 'playing' : ''} ${track.duplicateGroupId ? 'dup' : ''}`} title={track.filePath}>
      <td>
        <button
          className={`play-btn ${isActive ? '' : 'ghost'}`}
          onClick={onPlay}
          title={isPlaying ? 'Pause' : isPaused ? 'Resume' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
      </td>
      <td>
        <div className="track-cell">
          <div className="thumb">
            <img
              src={coverUrl(track.filePath)}
              alt=""
              loading="lazy"
              onLoad={e => {
                const fb = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                if (fb) fb.style.display = 'none';
              }}
              onError={e => {
                const img = e.target as HTMLImageElement;
                img.style.display = 'none';
                const fb = img.nextElementSibling as HTMLElement;
                if (fb) fb.style.display = 'grid';
              }}
            />
            <span className="thumb-fallback">♪</span>
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
      </td>
      <td style={{ color: 'var(--muted)' }}>{track.artist}</td>
      <td style={{ color: 'var(--muted)' }}>{track.album}</td>
      <td className="muted">{track.genre || '—'}</td>
      <td className="muted">{formatDuration(track.duration)}</td>
      <td className="muted">{track.year ?? '—'}</td>
      <td>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="edit-btn" onClick={onSplit} title={`Split: ${track.filePath}`} style={{ background: 'rgba(0,212,255,0.18)', borderColor: 'rgba(0,212,255,0.30)' }}>
            ✂
          </button>
          <button className="edit-btn" onClick={onEdit} title={`Edit tags: ${track.filePath}`}>
            ✎
          </button>
          <button className="delete-btn" onClick={onDelete} title={`Move to Trash: ${track.filePath}`}>
            🗑
          </button>
        </div>
      </td>
    </tr>
  );
}

import type { Track } from '../../types/api.d';
import { coverUrl } from '../../lib/path';
import { formatDuration } from '../../lib/format';

type Props = {
  tracks: Track[];
  playingId: string | null;
  isPaused: boolean;
  onPlay: (t: Track) => void;
  onClear: () => void;
  onRemove: (id: string) => void;
  coverBust?: Record<string, number>;
};

export function PlayHistory({ tracks, playingId, isPaused, onPlay, onClear, onRemove, coverBust }: Props) {
  if (tracks.length === 0) return null;

  return (
    <div className="glass history-wrap" aria-label="Recently played">
      <div className="history-head">
        <span className="history-title">Recently played <span className="history-count">· {tracks.length}</span></span>
        <button className="history-clear" onClick={onClear} title="Clear history">Clear</button>
      </div>
      <div className="history-scroll" role="list">
        {tracks.map(t => {
          const active = playingId === t.id;
          const playing = active && !isPaused;
          return (
            <div
              key={t.id}
              role="listitem"
              className={`history-card ${active ? 'active' : ''} ${playing ? 'playing' : ''}`}
              title={`${t.title} — ${t.artist}`}
            >
              <button
                className="history-main"
                onClick={() => onPlay(t)}
                aria-label={playing ? `Pause ${t.title}` : `Play ${t.title}`}
              >
                <span className="history-thumb" aria-hidden>
                  <img
                    src={coverUrl(t.filePath, coverBust?.[t.filePath])}
                    alt=""
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                  <span className="history-thumb-overlay">{playing ? '⏸' : '▶'}</span>
                </span>
                <span className="history-meta">
                  <span className="history-track-title">{t.title || t.filePath.split('/').pop()}</span>
                  <span className="history-track-artist">{t.artist || 'Unknown'} · {t.duration ? formatDuration(Math.floor(t.duration)) : '--:--'}</span>
                </span>
              </button>
              <button
                className="history-remove"
                onClick={e => { e.stopPropagation(); onRemove(t.id); }}
                aria-label={`Remove ${t.title} from history`}
                title="Remove"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

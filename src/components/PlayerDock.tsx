import { useState } from 'react';
import type { Track } from '../types/api.d';
import { coverUrl } from '../lib/path';
export function PlayerDock({
  track,
  isPaused,
  onToggle,
  onStop,
  onExpand,
}: {
  track: Track | null;
  isPaused: boolean;
  onToggle: () => void;
  onStop: () => void;
  onExpand?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  if (!track) return null;
  return (
    <div className="glass player-dock" onClick={onExpand} role={onExpand ? 'button' : undefined} style={onExpand ? { cursor: 'pointer' } : undefined}>
      <div className="player-art" style={{ overflow: 'hidden', padding: 0 }}>
        {!failed ? (
          <img src={coverUrl(track.filePath)} alt="" onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span>♪</span>
        )}
      </div>
      <div className="player-info">
        <b>{track.title}</b>
        <span>
          {track.artist} · {track.album}
        </span>
      </div>
      <div className="player-controls" onClick={e => e.stopPropagation()}>
        <button className="play-btn" onClick={onToggle} title={isPaused ? 'Resume' : 'Pause'}>
          {isPaused ? '▶' : '⏸'}
        </button>
        <button className="play-btn ghost" onClick={onStop} title="Stop">
          ⏹
        </button>
      </div>
    </div>
  );
}

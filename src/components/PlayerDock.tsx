import type { Track } from '../types/api.d';
export function PlayerDock({
  track,
  isPaused,
  onToggle,
  onStop,
}: {
  track: Track | null;
  isPaused: boolean;
  onToggle: () => void;
  onStop: () => void;
}) {
  if (!track) return null;
  return (
    <div className="glass player-dock">
      <div className="player-art">♪</div>
      <div className="player-info">
        <b>{track.title}</b>
        <span>
          {track.artist} · {track.album}
        </span>
      </div>
      <div className="player-controls">
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

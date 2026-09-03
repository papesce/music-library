import { useState, useRef, useEffect } from 'react';
import type { Track } from '../../types/api.d';
import { coverUrl } from '../../lib/path';
import { formatDuration } from '../../lib/format';
import { useLyrics } from './useLyrics';
import { ArtworkLightbox } from '../../components/ui/ArtworkLightbox';

type Props = {
  track: Track | null;
  isPaused: boolean;
  currentTime: number;
  duration: number;
  onToggle: () => void;
  onStop: () => void;
  onSeek: (sec: number) => void;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onEdit?: () => void;
};

function LyricsView({
  lyrics,
  synced,
  currentTime,
}: {
  lyrics: string | null;
  synced: { ms: number; text: string }[] | null;
  currentTime: number;
}) {
  const activeIdx = (() => {
    if (!synced) return -1;
    const ms = currentTime * 1000;
    let idx = -1;
    for (let i = 0; i < synced.length; i++) if (ms >= synced[i].ms) idx = i;
    else break;
    return idx;
  })();
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeIdx < 0) return;
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIdx]);

  if (!lyrics)
    return <div className="muted" style={{ padding: 24, textAlign: 'center' }}>No lyrics — add USLT tag or .lrc file</div>;

  if (synced && synced.length) {
    return (
      <div ref={listRef} className="lyrics-synced">
        {synced.map((s, i) => (
          <div key={i} data-idx={i} className={`lyric-line ${i === activeIdx ? 'active' : ''} ${i < activeIdx ? 'past' : ''}`}>
            {s.text || '♪'}
          </div>
        ))}
      </div>
    );
  }
  return <div className="lyrics-plain">{lyrics}</div>;
}

export function UnifiedPlayer({ track, isPaused, currentTime, duration, onToggle, onStop, onSeek, expanded, onExpand, onCollapse, onEdit }: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [artFailed, setArtFailed] = useState(false);
  const { lyrics, synced } = useLyrics(track?.filePath ?? null);

  useEffect(() => setArtFailed(false), [track?.filePath]);

  if (!track) return null;

  const pct = duration ? (currentTime / duration) * 100 : 0;
  const hasSynced = !!(synced && synced.length);

  // collapsed bar (always visible when track exists)
  const collapsed = (
    <div className="glass unified-collapsed" onClick={onExpand} role="button" tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onExpand()} aria-label="Expand player">
      <div className="unified-collapsed-art">
        {!artFailed ? (
          <img src={coverUrl(track.filePath)} alt="" onError={() => setArtFailed(true)} />
        ) : (
          <span>♪</span>
        )}
      </div>
      <div className="unified-collapsed-info">
        <b>{track.title}</b>
        <span>
          {track.artist} · {track.album}
          {hasSynced && <span className="lyrics-dot" title="Synced lyrics available"> ● LRC</span>}
        </span>
      </div>
      <div className="unified-collapsed-progress" aria-hidden>
        <div className="unified-collapsed-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="player-controls" onClick={e => e.stopPropagation()}>
        <span className="muted" style={{ fontSize: 11, minWidth: 36, textAlign: 'right' }}>
          {formatDuration(Math.floor(currentTime))} / {formatDuration(Math.floor(duration || track.duration || 0))}
        </span>
        <button className="play-btn" onClick={onToggle} aria-label={isPaused ? 'Play' : 'Pause'}>
          {isPaused ? '▶' : '⏸'}
        </button>
        <button className="play-btn ghost" onClick={onStop} aria-label="Stop">
          ⏹
        </button>
        <button className="btn" onClick={onExpand} aria-label="Expand" style={{ padding: '6px 10px' }}>
          {expanded ? '⌄' : '⌃'}
        </button>
      </div>
    </div>
  );

  if (!expanded) return <div className="unified-player-wrap">{collapsed}</div>;

  return (
    <div className="unified-player-wrap">
      <div className="drawer-backdrop" onClick={onCollapse} style={{ zIndex: 45 }} />
      <div className="glass unified-expanded">
        <div className="now-header">
          <div className="now-header-meta">
            <b>{track.title}</b>
            <span className="muted">
              {track.artist} · {track.album} {track.year ? `· ${track.year}` : ''} {hasSynced ? '· synced' : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onCollapse} aria-label="Collapse" style={{ padding: '6px 10px' }}>
              ⌄
            </button>
            <button className="btn" onClick={onStop} aria-label="Close player" style={{ padding: '6px 10px' }}>
              ✕
            </button>
          </div>
        </div>

        <div className="unified-expanded-body">
          <button
            type="button"
            className="now-artwork now-artwork-btn unified-artwork"
            onClick={() => setLightboxOpen(true)}
            aria-label={`Enlarge artwork for ${track.title}`}
            title="Click to enlarge"
            style={{ border: 'none', padding: 0, cursor: 'zoom-in' }}
          >
            {!artFailed ? (
              <img src={coverUrl(track.filePath)} alt={`${track.album} cover`} onError={() => setArtFailed(true)} />
            ) : (
              <div className="now-artwork-fallback">♪</div>
            )}
            <span className="now-artwork-zoom-hint" aria-hidden>
              ⤢
            </span>
          </button>

          <div className="unified-lyrics-pane">
            <div className="unified-lyrics-header">
              <span>Lyrics</span>
              {hasSynced && <span className="muted" style={{ fontSize: 11 }}>synced</span>}
            </div>
            <div className="unified-lyrics-body">
              <LyricsView lyrics={lyrics} synced={synced} currentTime={currentTime} />
            </div>
          </div>
        </div>

        <div className="now-transport">
          <div className="now-seek">
            <span className="muted" style={{ fontSize: 11, minWidth: 36 }}>
              {formatDuration(Math.floor(currentTime))}
            </span>
            <input
              type="range"
              min={0}
              max={duration || track.duration || 100}
              value={currentTime}
              step={0.5}
              onChange={e => onSeek(Number(e.target.value))}
              className="seek-range"
              aria-label="Seek"
            />
            <span className="muted" style={{ fontSize: 11, minWidth: 36, textAlign: 'right' }}>
              {formatDuration(Math.floor(duration || track.duration || 0))}
            </span>
          </div>
          <div className="now-controls">
            <button className="play-btn" onClick={onToggle} aria-label={isPaused ? 'Play' : 'Pause'}>
              {isPaused ? '▶' : '⏸'}
            </button>
            <button className="play-btn ghost" onClick={onStop} aria-label="Stop">
              ⏹
            </button>
          </div>
        </div>
      </div>

      {collapsed}

      {lightboxOpen && (
        <ArtworkLightbox track={track} onClose={() => setLightboxOpen(false)} onEdit={onEdit} onPlay={onToggle} isPlaying={!isPaused} />
      )}
    </div>
  );
}

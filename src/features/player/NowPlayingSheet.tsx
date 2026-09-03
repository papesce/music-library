import { useState, useRef, useEffect } from 'react';
import type { Track } from '../../types/api.d';
import { coverUrl } from '../../lib/path';
import { formatDuration } from '../../lib/format';
import { useLyrics } from './useLyrics';

type Props = {
  track: Track | null;
  isPaused: boolean;
  onToggle: () => void;
  onStop: () => void;
  onClose: () => void;
  currentTime: number;
  duration: number;
  onSeek: (sec: number) => void;
};

function ArtworkView({ track }: { track: Track }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [track.filePath]);
  return (
    <div className="now-artwork">
      {!failed ? (
        <img src={coverUrl(track.filePath)} alt={`${track.album} cover`} onError={() => setFailed(true)} />
      ) : (
        <div className="now-artwork-fallback">♪</div>
      )}
    </div>
  );
}

function LyricsView({ lyrics, synced, currentTime }: { lyrics: string | null; synced: { ms: number; text: string }[] | null; currentTime: number }) {
  const activeIdx = (() => {
    if (!synced) return -1;
    const ms = currentTime * 1000;
    let idx = -1;
    for (let i = 0; i < synced.length; i++) if (ms >= synced[i].ms) idx = i; else break;
    return idx;
  })();
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeIdx < 0) return;
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIdx]);

  if (!lyrics) return <div className="muted" style={{ padding: 24, textAlign: 'center' }}>No lyrics — add USLT tag or .lrc file</div>;

  if (synced && synced.length) {
    return (
      <div ref={listRef} className="lyrics-synced">
        {synced.map((s, i) => (
          <div key={i} data-idx={i} className={`lyric-line ${i === activeIdx ? 'active' : ''} ${i < activeIdx ? 'past' : ''}`}>
            {s.text}
          </div>
        ))}
      </div>
    );
  }
  return <div className="lyrics-plain">{lyrics}</div>;
}

export function NowPlayingSheet({ track, isPaused, onToggle, onStop, onClose, currentTime, duration, onSeek }: Props) {
  const [tab, setTab] = useState<'artwork' | 'lyrics'>('artwork');
  const { lyrics, synced } = useLyrics(track?.filePath ?? null);

  if (!track) return null;

  const pct = duration ? (currentTime / duration) * 100 : 0;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} style={{ zIndex: 45 }} />
      <div className="glass now-sheet">
        <div className="now-header">
          <div className="now-header-meta">
            <b>{track.title}</b>
            <span className="muted">
              {track.artist} · {track.album} {track.year ? `· ${track.year}` : ''}
            </span>
          </div>
          <button className="btn" onClick={onClose} style={{ padding: '6px 10px' }}>
            ✕
          </button>
        </div>

        <div className="glass segmented" style={{ alignSelf: 'center', marginBottom: 12 }}>
          <button className={tab === 'artwork' ? 'active' : ''} onClick={() => setTab('artwork')}>
            Artwork
          </button>
          <button className={tab === 'lyrics' ? 'active' : ''} onClick={() => setTab('lyrics')}>
            Lyrics
          </button>
        </div>

        <div className="now-body">
          {tab === 'artwork' ? <ArtworkView track={track} /> : <LyricsView lyrics={lyrics} synced={synced} currentTime={currentTime} />}
        </div>

        <div className="now-transport">
          <div className="now-seek">
            <span className="muted" style={{ fontSize: 11, minWidth: 36 }}>
              {formatDuration(Math.floor(currentTime))}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              step={0.5}
              onChange={e => onSeek(Number(e.target.value))}
              className="seek-range"
              aria-label="Seek"
            />
            <span className="muted" style={{ fontSize: 11, minWidth: 36, textAlign: 'right' }}>
              {formatDuration(Math.floor(duration))}
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
          <div className="seek-fill" style={{ width: `${pct}%` }} aria-hidden />
        </div>
      </div>
    </>
  );
}

import { useState, useRef, useEffect } from 'react';
import type { Track } from '../../types/api.d';
import { coverUrl } from '../../lib/path';
import { formatDuration } from '../../lib/format';
import { useLyrics } from './useLyrics';
import { ArtworkLightbox } from '../../components/ui/ArtworkLightbox';
import { PlayerActionsMenu } from './PlayerActionsMenu';
import { api } from '../../api';

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
  onSplit?: () => void;
  coverBust?: number;
  volume: number;
  muted: boolean;
  onVolumeChange: (v: number) => void;
  onMutedChange: (m: boolean) => void;
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

function VolumeControl({ volume, muted, onVolumeChange, onMutedChange, size = 'compact' }: { volume: number; muted: boolean; onVolumeChange: (v: number) => void; onMutedChange: (m: boolean) => void; size?: 'compact' | 'full' }) {
  const icon = muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊';
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
      <button className="btn" onClick={() => onMutedChange(!muted)} title={muted ? 'Unmute' : 'Mute'} aria-label={muted ? 'Unmute' : 'Mute'} style={{ padding: '6px 8px', minWidth: 32 }}>
        {icon}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onChange={e => onVolumeChange(Number(e.target.value))}
        aria-label="Volume"
        title={`Volume ${Math.round((muted ? 0 : volume) * 100)}%`}
        style={{ width: size === 'compact' ? 70 : 100, accentColor: 'var(--accent)', cursor: 'pointer' }}
      />
    </span>
  );
}

export function UnifiedPlayer({ track, isPaused, currentTime, duration, onToggle, onStop, onSeek, expanded, onExpand, onCollapse, onEdit, onSplit, coverBust, volume, muted, onVolumeChange, onMutedChange }: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [artFailed, setArtFailed] = useState(false);
  const { lyrics, synced, reload } = useLyrics(track?.filePath ?? null);
  const [detecting, setDetecting] = useState(false);
  const [preview, setPreview] = useState<{ lrc: string; source: string; synced: { ms: number; text: string }[] | null } | null>(null);
  const [previewText, setPreviewText] = useState('');
  const [detectError, setDetectError] = useState('');

  useEffect(() => setArtFailed(false), [track?.filePath, coverBust]);
  useEffect(() => { setPreview(null); setPreviewText(''); setDetectError(''); }, [track?.filePath]);

  const handleDetect = async (source: 'auto' | 'lrclib' | 'whisper' = 'auto') => {
    if (!track) return;
    setDetecting(true); setDetectError('');
    try {
      const r = await api.detectLyrics(track.filePath, { source, model: 'base' });
      setPreview({ lrc: r.lrc || r.syncedLyrics || r.plainLyrics || '', source: r.source, synced: r.synced });
      setPreviewText(r.lrc || r.syncedLyrics || r.plainLyrics || '');
    } catch (e: any) {
      setDetectError(e.message || String(e));
    } finally { setDetecting(false); }
  };
  const handleSave = async () => {
    if (!track || !previewText.trim()) return;
    setDetecting(true);
    try {
      await api.saveLyrics(track.filePath, previewText);
      setPreview(null); setPreviewText('');
      await reload();
    } catch (e: any) { setDetectError(e.message); }
    finally { setDetecting(false); }
  };

  if (!track) return null;

  const pct = duration ? (currentTime / duration) * 100 : 0;
  const hasSynced = !!(synced && synced.length);

  // collapsed bar (always visible when track exists)
  const collapsed = (
    <div className="glass unified-collapsed" onClick={onExpand} role="button" tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onExpand()} aria-label="Expand player">
      <div className="unified-collapsed-art">
        {!artFailed ? (
          <img src={coverUrl(track.filePath, coverBust)} alt="" onError={() => setArtFailed(true)} />
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
        <VolumeControl volume={volume} muted={muted} onVolumeChange={onVolumeChange} onMutedChange={onMutedChange} size="compact" />
        <span className="muted" style={{ fontSize: 11, minWidth: 36, textAlign: 'right' }}>
          {formatDuration(Math.floor(currentTime))} / {formatDuration(Math.floor(duration || track.duration || 0))}
        </span>
        <button className="play-btn" onClick={onToggle} aria-label={isPaused ? 'Play' : 'Pause'}>
          {isPaused ? '▶' : '⏸'}
        </button>
        <button className="play-btn ghost" onClick={onStop} aria-label="Stop">
          ⏹
        </button>
        {onEdit && (
          <button className="btn" onClick={onEdit} aria-label={`Edit ${track.title}`} title="Edit song" style={{ padding: '6px 10px' }}>
            ✎
          </button>
        )}
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
            <b>{track.title} {track.isCover ? <span className="dup-badge" style={{ background: 'rgba(124,92,255,0.95)', color: '#fff', verticalAlign: 'middle', marginLeft: 6 }}>cover</span> : null}</b>
            <span className="muted">
              {track.artist} · {track.album} {track.year ? `· ${track.year}` : ''} {hasSynced ? '· synced' : ''} {track.isCover ? '· cover' : '· orig'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {onEdit && (
              <button className="btn" onClick={onEdit} aria-label={`Edit ${track.title}`} title="Edit metadata, artwork and lyrics" style={{ padding: '6px 12px' }}>
                ✎ Edit
              </button>
            )}
            <PlayerActionsMenu track={track} onSplit={onSplit} />
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
              <img src={coverUrl(track.filePath, coverBust)} alt={`${track.album} cover`} onError={() => setArtFailed(true)} />
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
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {hasSynced && <span className="muted" style={{ fontSize: 11 }}>synced</span>}
                <button className="btn" style={{ padding: '4px 8px', fontSize: 11, borderRadius: 999 }} onClick={() => handleDetect('auto')} disabled={detecting} title="Auto: try LRClib then Whisper (base, local)">{detecting ? '…' : '✨ Detect'}</button>
              </span>
            </div>
            <div className="unified-lyrics-body">
              {preview ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>Preview · source: <b style={{ color: 'var(--text)' }}>{preview.source}</b> · synced: {preview.synced?.length ?? 0} lines — edit then Save</div>
                  <textarea value={previewText} onChange={e => setPreviewText(e.target.value)} rows={10} style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12, padding: 8, borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.06)', color: 'var(--text)', resize: 'vertical' }} placeholder="[00:12.00]Lyric line" />
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={handleSave} disabled={detecting || !previewText.trim()} style={{ padding: '6px 12px', fontSize: 12, borderRadius: 999 }}>Save to .lrc + USLT</button>
                    <button className="btn" onClick={() => { setPreview(null); setPreviewText(''); }} disabled={detecting} style={{ padding: '6px 12px', fontSize: 12, borderRadius: 999 }}>Discard</button>
                    <button className="btn" onClick={() => handleDetect('lrclib')} disabled={detecting} style={{ padding: '6px 12px', fontSize: 12, borderRadius: 999 }}>Try LRClib only</button>
                    <button className="btn" onClick={() => handleDetect('whisper')} disabled={detecting} style={{ padding: '6px 12px', fontSize: 12, borderRadius: 999 }}>Whisper base</button>
                  </div>
                  {detectError && <div style={{ fontSize: 11, color: 'var(--danger, #e53e3e)' }}>{detectError}</div>}
                </div>
              ) : (
                <>
                  <LyricsView lyrics={lyrics} synced={synced} currentTime={currentTime} />
                  {detectError && <div style={{ padding: 8, fontSize: 11, color: 'var(--danger, #e53e3e)', textAlign: 'center' }}>{detectError}</div>}
                  {!lyrics && (
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: '0 12px 12px', flexWrap: 'wrap' }}>
                      <button className="btn" onClick={() => handleDetect('lrclib')} disabled={detecting} style={{ padding: '6px 10px', fontSize: 12, borderRadius: 999 }}>Search LRClib</button>
                      <button className="btn" onClick={() => handleDetect('whisper')} disabled={detecting} style={{ padding: '6px 10px', fontSize: 12, borderRadius: 999 }}>Transcribe (Whisper base)</button>
                    </div>
                  )}
                </>
              )}
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
          <div className="now-controls" style={{ alignItems: 'center' }}>
            <button className="play-btn" onClick={onToggle} aria-label={isPaused ? 'Play' : 'Pause'}>
              {isPaused ? '▶' : '⏸'}
            </button>
            <button className="play-btn ghost" onClick={onStop} aria-label="Stop">
              ⏹
            </button>
            <VolumeControl volume={volume} muted={muted} onVolumeChange={onVolumeChange} onMutedChange={onMutedChange} size="full" />
          </div>
        </div>
      </div>

      {collapsed}

      {lightboxOpen && (
        <ArtworkLightbox track={track} coverBust={coverBust} onClose={() => setLightboxOpen(false)} onEdit={onEdit} onPlay={onToggle} isPlaying={!isPaused} />
      )}
    </div>
  );
}

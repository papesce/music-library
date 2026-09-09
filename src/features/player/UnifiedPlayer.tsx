import { useState, useEffect } from 'react';
import type { Track } from '../../types/api.d';
import { coverUrl } from '../../lib/path';
import { formatDuration } from '../../lib/format';
import { useLyrics } from './useLyrics';
import { ArtworkLightbox } from '../../components/ui/ArtworkLightbox';
import { PlayerActionsMenu } from './PlayerActionsMenu';
import { LyricsPreview } from '../../components/LyricsPreview';

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
  onPlayRandom?: () => void;
  autoplay?: boolean;
  onToggleAutoplay?: () => void;
  onPreviewChange?: (draft: { path: string; text: string; source: string } | null) => void;
  onToggleReviewed?: () => void;
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
  // keep hook-based synced but render via shared component (lrc string form)
  const lrc = synced?.length ? synced.map(s => `[${String(Math.floor(s.ms/60000)).padStart(2,'0')}:${String(Math.floor((s.ms%60000)/1000)).padStart(2,'0')}.${String(Math.floor((s.ms%1000)/10)).padStart(2,'0')}]${s.text}`).join('\n') : lyrics;
  return <LyricsPreview lrc={lrc} currentTimeSec={currentTime} />;
}

function VolumeControl({
  volume,
  muted,
  onVolumeChange,
  onMutedChange,
  size = 'compact',
}: {
  volume: number;
  muted: boolean;
  onVolumeChange: (v: number) => void;
  onMutedChange: (m: boolean) => void;
  size?: 'compact' | 'full';
}) {
  const isMuted = muted || volume === 0;
  const pct = Math.round((muted ? 0 : volume) * 100);
  // macOS-native style: filled speaker (SF Symbols-like) + stroke waves, renders crisp on Retina without emoji font variance
  const SpeakerIcon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: 'block' }}
    >
      <path d="M11 5 L6 9 H2.5 C2.22 9 2 9.22 2 9.5 V14.5 C2 14.78 2.22 15 2.5 15 H6 L11 19 Z" fill="currentColor" stroke="none" />
      {isMuted ? (
        <>
          {/* keyboard-style slash: white with dark outline so visible over filled speaker — matches image */}
          <line x1="2.5" y1="19.5" x2="21.2" y2="3.8" stroke="rgba(0,0,0,0.85)" strokeWidth="4.2" strokeLinecap="round" />
          <line x1="2.5" y1="19.5" x2="21.2" y2="3.8" stroke="#fff" strokeWidth="2.1" />
          {/* hide waves when muted — slash crosses speaker like keyboard F10 / image */}
        </>
      ) : volume < 0.5 ? (
        <path d="M14.8 8.8 A5 5 0 0 1 14.8 15.2" fill="none" />
      ) : (
        <>
          <path d="M14.8 8.8 A5 5 0 0 1 14.8 15.2" fill="none" />
          <path d="M17.8 6.5 A9 9 0 0 1 17.8 17.5" fill="none" />
        </>
      )}
    </svg>
  );
  return (
    <span
      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
      onClick={e => e.stopPropagation()}
    >
      <button
        className="btn"
        onClick={() => onMutedChange(!muted)}
        title={isMuted ? `Unmute (${pct}%)` : `Mute (${pct}%)`}
        aria-label={isMuted ? 'Unmute' : 'Mute'}
        aria-pressed={isMuted}
        style={{
          padding: '6px 8px',
          minWidth: 34,
          height: 30,
          borderRadius: 999,
          border: `1px solid ${isMuted ? 'rgba(255,77,109,0.35)' : 'var(--border)'}`,
          background: isMuted ? 'rgba(255,77,109,0.14)' : 'rgba(255,255,255,0.06)',
          color: isMuted ? '#ff8fa0' : undefined,
          transition: 'all 0.18s ease',
          display: 'grid',
          placeItems: 'center',
          position: 'relative',
        }}
      >
        <span
          style={{
            display: 'grid',
            placeItems: 'center',
            transition: 'transform 0.18s ease',
            transform: isMuted ? 'scale(1.05)' : 'scale(1)',
          }}
          aria-hidden
        >
          {SpeakerIcon}
        </span>
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onChange={e => onVolumeChange(Number(e.target.value))}
        aria-label="Volume"
        title={`Volume ${pct}%${isMuted ? ' — muted' : ''}`}
        style={{
          width: size === 'compact' ? 70 : 100,
          accentColor: isMuted ? '#ff6b8a' : 'var(--accent)',
          cursor: 'pointer',
          opacity: isMuted ? 0.55 : 1,
          transition: 'opacity 0.18s ease, accent-color 0.18s ease',
        }}
      />
      {size === 'full' && (
        <span
          className="muted"
          style={{
            fontSize: 11,
            minWidth: 34,
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
            opacity: isMuted ? 0.7 : 1,
            color: isMuted ? '#ff8fa0' : undefined,
          }}
          aria-hidden
        >
          {pct}%
        </span>
      )}
    </span>
  );
}

export function UnifiedPlayer({
  track,
  isPaused,
  currentTime,
  duration,
  onToggle,
  onStop,
  onSeek,
  expanded,
  onExpand,
  onCollapse,
  onEdit,
  onSplit,
  coverBust,
  volume,
  muted,
  onVolumeChange,
  onMutedChange,
  onPlayRandom,
  autoplay,
  onToggleAutoplay,
  onToggleReviewed,
  // kept for backwards compat — no longer used (detect removed from player)
  onPreviewChange: _onPreviewChange,
}: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [artFailed, setArtFailed] = useState(false);
  const { lyrics, synced } = useLyrics(track?.filePath ?? null);

  useEffect(() => setArtFailed(false), [track?.filePath, coverBust]);

  if (!track) return null;

  const pct = duration ? (currentTime / duration) * 100 : 0;
  const hasSynced = !!(synced && synced.length);

  // collapsed bar (always visible when track exists)
  const collapsed = (
    <div
      className="glass unified-collapsed"
      onClick={onExpand}
      role="button"
      tabIndex={0}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onExpand()}
      aria-label="Expand player"
    >
      <div className="unified-collapsed-art">
        {!artFailed ? (
          <img
            src={coverUrl(track.filePath, coverBust)}
            alt=""
            onError={() => setArtFailed(true)}
          />
        ) : (
          <span>♪</span>
        )}
      </div>
      <div className="unified-collapsed-info">
        <b
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: '1 1 auto',
            }}
          >
            {track.title}
          </span>
          {track.isCover ? (
            <span
              className="dup-badge dup-badge--sm"
              style={{
                background: 'rgba(124,92,255,0.95)',
                color: '#fff',
                flexShrink: 0,
                marginLeft: 0,
              }}
            >
              cover
            </span>
          ) : null}
          {track.reviewed ? (
            <span
              className="dup-badge dup-badge--sm"
              style={{
                background: 'rgba(46,204,113,0.9)',
                color: '#0a1a0f',
                flexShrink: 0,
                marginLeft: 0,
              }}
            >
              ✓ done
            </span>
          ) : null}
          {track.loudness ? (
            <span
              className="dup-badge dup-badge--sm"
              style={{
                background: track.loudness === 'loud' ? 'rgba(255,77,109,0.18)' : 'rgba(255,193,7,0.18)',
                color: track.loudness === 'loud' ? '#ff8fa0' : '#ffd08a',
                border: `1px solid ${track.loudness === 'loud' ? 'rgba(255,77,109,0.3)' : 'rgba(255,193,7,0.3)'}`,
                flexShrink: 0,
                marginLeft: 0,
              }}
            >
              {track.loudness === 'loud' ? '🔊 loud' : '🔉 normal'}
            </span>
          ) : null}
        </b>
        <span>
          {track.artist} · {track.album}
          {hasSynced && (
            <span className="lyrics-dot" title="Synced lyrics available">
              {' '}
              ● LRC
            </span>
          )}
        </span>
      </div>
      <div className="unified-collapsed-progress" aria-hidden>
        <div className="unified-collapsed-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="player-controls" onClick={e => e.stopPropagation()}>
        <VolumeControl
          volume={volume}
          muted={muted}
          onVolumeChange={onVolumeChange}
          onMutedChange={onMutedChange}
          size="compact"
        />
        <span className="muted" style={{ fontSize: 11, minWidth: 36, textAlign: 'right' }}>
          {formatDuration(Math.floor(currentTime))} /{' '}
          {formatDuration(Math.floor(duration || track.duration || 0))}
        </span>
        {onToggleReviewed && (
          <button
            className="btn"
            onClick={onToggleReviewed}
            aria-label={track.reviewed ? 'Mark as not done' : 'Mark as done'}
            title={track.reviewed ? 'Mark as not done' : 'Mark as done'}
            style={{
              padding: '6px 10px',
              background: track.reviewed ? 'rgba(46,204,113,0.22)' : undefined,
              borderColor: track.reviewed ? 'rgba(46,204,113,0.8)' : undefined,
              color: track.reviewed ? '#8ff5b8' : undefined,
            }}
          >
            {track.reviewed ? '✓ Done' : '○ Done'}
          </button>
        )}
        {onPlayRandom && (
          <button
            className="btn"
            onClick={onPlayRandom}
            aria-label="Play random"
            title="Play random track"
            style={{ padding: '6px 10px' }}
          >
            🔀
          </button>
        )}
        {onToggleAutoplay && (
          <button
            className="btn"
            onClick={onToggleAutoplay}
            aria-label={autoplay ? 'Disable autoplay' : 'Enable autoplay'}
            title={autoplay ? 'Autoplay on — continues with random track after each song' : 'Autoplay off'}
            aria-pressed={autoplay}
            style={{
              padding: '6px 10px',
              background: autoplay ? 'rgba(124,92,255,0.18)' : undefined,
              borderColor: autoplay ? 'rgba(124,92,255,0.45)' : undefined,
              color: autoplay ? '#c4b5ff' : undefined,
            }}
          >
            ∞
          </button>
        )}
        <button className="play-btn" onClick={onToggle} aria-label={isPaused ? 'Play' : 'Pause'}>
          {isPaused ? '▶' : '⏸'}
        </button>
        <button className="play-btn ghost" onClick={onStop} aria-label="Stop">
          ⏹
        </button>
        {onEdit && (
          <button
            className="btn"
            onClick={onEdit}
            aria-label={`Edit ${track.title}`}
            title="Edit song"
            style={{ padding: '6px 10px' }}
          >
            ✎
          </button>
        )}
        <button
          className="btn"
          onClick={onExpand}
          aria-label="Expand"
          style={{ padding: '6px 10px' }}
        >
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
            <b>
              {track.title}{' '}
              {track.isCover ? (
                <span
                  className="dup-badge"
                  style={{
                    background: 'rgba(124,92,255,0.95)',
                    color: '#fff',
                    verticalAlign: 'middle',
                    marginLeft: 6,
                  }}
                >
                  cover
                </span>
              ) : null}
              {track.reviewed ? (
                <span
                  className="dup-badge"
                  style={{
                    background: 'rgba(46,204,113,0.9)',
                    color: '#0a1a0f',
                    verticalAlign: 'middle',
                    marginLeft: 6,
                  }}
                >
                  ✓ done
                </span>
              ) : null}
              {track.loudness ? (
                <span
                  className="dup-badge"
                  style={{
                    background: track.loudness === 'loud' ? 'rgba(255,77,109,0.18)' : 'rgba(255,193,7,0.18)',
                    color: track.loudness === 'loud' ? '#ff8fa0' : '#ffd08a',
                    border: `1px solid ${track.loudness === 'loud' ? 'rgba(255,77,109,0.3)' : 'rgba(255,193,7,0.3)'}`,
                    verticalAlign: 'middle',
                    marginLeft: 6,
                  }}
                >
                  {track.loudness === 'loud' ? '🔊 loud' : '🔉 normal'}
                </span>
              ) : null}
            </b>
            <span className="muted">
              {track.artist} · {track.album} {track.year ? `· ${track.year}` : ''}{' '}
              {hasSynced ? '· synced' : ''} {track.isCover ? '· cover' : '· orig'}{' '}
              {track.reviewed ? '· done' : ''} {track.loudness ? `· ${track.loudness}` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {onToggleReviewed && (
              <button
                className="btn"
                onClick={onToggleReviewed}
                aria-label={track.reviewed ? 'Mark as not done' : 'Mark as done'}
                title={track.reviewed ? 'Mark as not done' : 'Mark as done'}
                style={{
                  padding: '6px 12px',
                  background: track.reviewed ? 'rgba(46,204,113,0.22)' : undefined,
                  borderColor: track.reviewed ? 'rgba(46,204,113,0.8)' : undefined,
                  color: track.reviewed ? '#8ff5b8' : undefined,
                }}
              >
                {track.reviewed ? '✓ Done' : '○ Done'}
              </button>
            )}
            {onPlayRandom && (
              <button
                className="btn"
                onClick={onPlayRandom}
                aria-label="Play random"
                title="Play random track (from current filter)"
                style={{ padding: '6px 12px' }}
              >
                🔀 Random
              </button>
            )}
            {onToggleAutoplay && (
              <button
                className="btn"
                onClick={onToggleAutoplay}
                aria-label={autoplay ? 'Disable autoplay' : 'Enable autoplay'}
                title={autoplay ? 'Autoplay on — continues with random track after each song' : 'Autoplay off'}
                aria-pressed={autoplay}
                style={{
                  padding: '6px 12px',
                  background: autoplay ? 'rgba(124,92,255,0.18)' : undefined,
                  borderColor: autoplay ? 'rgba(124,92,255,0.45)' : undefined,
                  color: autoplay ? '#c4b5ff' : undefined,
                }}
              >
                ∞ Autoplay
              </button>
            )}
            {onEdit && (
              <button
                className="btn"
                onClick={onEdit}
                aria-label={`Edit ${track.title}`}
                title="Edit metadata, artwork and lyrics"
                style={{ padding: '6px 12px' }}
              >
                ✎ Edit
              </button>
            )}
            <PlayerActionsMenu track={track} onSplit={onSplit} />
            <button
              className="btn"
              onClick={onCollapse}
              aria-label="Collapse"
              style={{ padding: '6px 10px' }}
            >
              ⌄
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
              <img
                src={coverUrl(track.filePath, coverBust)}
                alt={`${track.album} cover`}
                onError={() => setArtFailed(true)}
              />
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
              {hasSynced && (
                <span className="muted" style={{ fontSize: 11 }}>
                  synced
                </span>
              )}
            </div>
            <div className="unified-lyrics-body">
              {lyrics ? (
                <LyricsView lyrics={lyrics} synced={synced} currentTime={currentTime} />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    padding: '28px 16px',
                    textAlign: 'center',
                    color: 'var(--muted)',
                    fontSize: 13,
                    lineHeight: 1.5,
                    flex: 1,
                    minHeight: 0,
                  }}
                >
                  <span style={{ fontSize: 22, opacity: 0.9 }}>♪</span>
                  <span>No lyrics for this track.</span>
                  <span style={{ fontSize: 12, opacity: 0.85 }}>
                    Edit the track to add or detect lyrics.
                  </span>
                  {onEdit && (
                    <button
                      className="btn btn-primary"
                      onClick={onEdit}
                      style={{ padding: '6px 14px', fontSize: 12, borderRadius: 999, marginTop: 4 }}
                    >
                      ✎ Edit track
                    </button>
                  )}
                </div>
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
            <button
              className="play-btn"
              onClick={onToggle}
              aria-label={isPaused ? 'Play' : 'Pause'}
            >
              {isPaused ? '▶' : '⏸'}
            </button>
            <button className="play-btn ghost" onClick={onStop} aria-label="Stop">
              ⏹
            </button>
            <VolumeControl
              volume={volume}
              muted={muted}
              onVolumeChange={onVolumeChange}
              onMutedChange={onMutedChange}
              size="full"
            />
          </div>
        </div>
      </div>

      {collapsed}

      {lightboxOpen && (
        <ArtworkLightbox
          track={track}
          coverBust={coverBust}
          onClose={() => setLightboxOpen(false)}
          onEdit={onEdit}
          onPlay={onToggle}
          isPlaying={!isPaused}
        />
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import type { Track } from '../../types/api.d';
import { coverUrl } from '../../lib/path';
import { formatDuration } from '../../lib/format';
import { useLyrics } from './useLyrics';
import { ArtworkLightbox } from '../../components/ui/ArtworkLightbox';
import { PlayerActionsMenu } from './PlayerActionsMenu';
import { LyricsPreview } from '../../components/LyricsPreview';
import type { BassMeter } from './useBassBoost';

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
  bassDb?: number;
  onBassChange?: (v: number) => void;
  onBassPreview?: (v: number) => void;
  isBassPreviewOn?: boolean;
  onToggleBassPreview?: () => void;
  bassMeter?: BassMeter;
  subBassDb?: number;
  onSubBassChange?: (value: number) => void;
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

function BassResponseChart({ meter }: { meter: BassMeter }) {
  const left = 43;
  const right = 622;
  const top = 19;
  const bottom = 143;
  const xAt = (index: number) => left + (index / Math.max(1, meter.spectrumDb.length - 1)) * (right - left);
  const spectrumY = (db: number) => top + ((0 - Math.max(-90, Math.min(0, db))) / 90) * (bottom - top);
  const responseY = (db: number) => top + ((8 - Math.max(-12, Math.min(8, db))) / 20) * (bottom - top);
  const spectrumPoints = meter.spectrumDb.map((db, i) => `${xAt(i).toFixed(1)},${spectrumY(db).toFixed(1)}`).join(' ');
  const spectrumArea = `${left},${bottom} ${spectrumPoints} ${right},${bottom}`;
  const combinedPoints = meter.combinedDb.map((db, i) => `${xAt(i).toFixed(1)},${spectrumY(db).toFixed(1)}`).join(' ');
  const responsePoints = meter.responseDb.map((db, i) => `${xAt(i).toFixed(1)},${responseY(db).toFixed(1)}`).join(' ');
  const ticks = [
    { label: '20', ratio: 0 }, { label: '50', ratio: Math.log10(50 / 20) / 3 },
    { label: '100', ratio: Math.log10(100 / 20) / 3 }, { label: '200', ratio: Math.log10(200 / 20) / 3 },
    { label: '500', ratio: Math.log10(500 / 20) / 3 }, { label: '1k', ratio: Math.log10(1000 / 20) / 3 },
    { label: '5k', ratio: Math.log10(5000 / 20) / 3 }, { label: '20k', ratio: 1 },
  ];
  const zeroY = responseY(0);
  const bassEndX = left + (Math.log10(150 / 20) / 3) * (right - left);
  return (
    <section className={`bass-response-chart${meter.clipping ? ' is-clipping' : ''}`} aria-label="Song spectrum and bass EQ response">
      <div className="bass-response-heading">
        <div className="bass-response-title">
          <b>Song spectrum &amp; EQ effect</b>
        <span><i className="bass-legend-spectrum" /> Original <i className="bass-legend-response" /> EQ <i className="bass-legend-combined" /> Combined</span>
        </div>
        <div className="bass-chart-status">
          {meter.clipping && (
            <strong className="bass-clip-badge" role="status" title="The signal reached full scale before the limiter, which is catching the peak">CLIP RISK · limiter active</strong>
          )}
        </div>
      </div>
      <svg viewBox="0 0 640 174" role="img" aria-label={`Log-frequency chart from 20 hertz to 20 kilohertz. It shows the original song spectrum, the bass EQ response, and the predicted combined spectrum.${meter.clipping ? ' The limiter is catching peaks that reached full scale before it.' : ''}`}>
        <text x={left} y="11" className="bass-chart-axis-caption">Song level · dBFS</text>
        <text x={right} y="11" textAnchor="end" className="bass-chart-axis-caption">EQ change · dB</text>
        {meter.clipping && <rect x={left} y={top} width={bassEndX - left} height={bottom - top} className="bass-chart-clip-zone" />}
        {[-90, -60, -30, 0].map(db => {
          const y = spectrumY(db);
          return <g key={db}><line x1={left} x2={right} y1={y} y2={y} className="bass-chart-grid" /><text x={left - 5} y={y + 3} textAnchor="end" className="bass-chart-tick">{db}</text></g>;
        })}
        {ticks.map(tick => {
          const x = left + tick.ratio * (right - left);
          return <g key={tick.label}><line x1={x} x2={x} y1={top} y2={bottom} className="bass-chart-grid bass-chart-grid-vertical" /><text x={x} y="161" textAnchor="middle" className="bass-chart-tick">{tick.label}</text></g>;
        })}
        {[-10, -5, 0, 5].map(db => <text key={`eq-${db}`} x={right + 3} y={responseY(db) + 3} className="bass-chart-tick">{db > 0 ? `+${db}` : db}</text>)}
        <line x1={left} x2={right} y1={zeroY} y2={zeroY} className="bass-chart-zero" />
        <polygon points={spectrumArea} className="bass-chart-spectrum-area" />
        <polyline points={spectrumPoints} className="bass-chart-spectrum-line" />
        <polyline points={combinedPoints} className="bass-chart-combined-line" />
        <polyline points={responsePoints} className="bass-chart-response-line" />
      </svg>
    </section>
  );
}

function PeakHistoryChart({ meter, currentTime }: { meter: BassMeter; currentTime: number }) {
  const widthLeft = 43;
  const widthRight = 622;
  const top = 12;
  const bottom = 88;
  const end = Math.max(currentTime, meter.history[meter.history.length - 1]?.timeSec ?? 0);
  const start = Math.max(0, end - 30);
  const xAt = (timeSec: number) => widthRight - ((end - timeSec) / 30) * (widthRight - widthLeft);
  const yAt = (db: number) => top + ((0 - Math.max(-36, Math.min(0, db))) / 36) * (bottom - top);
  const points = meter.history.filter(point => point.timeSec >= start && point.timeSec <= end);
  const peakPath = points.map(point => `${xAt(point.timeSec).toFixed(1)},${yAt(point.peakDb).toFixed(1)}`).join(' ');
  const levelPath = points.map(point => `${xAt(point.timeSec).toFixed(1)},${yAt(point.levelDb).toFixed(1)}`).join(' ');
  const ticks = [0, 10, 20, 30];
  return (
    <section className="bass-history-chart" aria-label="Last 30 seconds of playback level and peak history">
      <div className="bass-history-heading">
        <b>Playback history · last 30 seconds</b>
        <span><i className="bass-history-level-legend" /> Level <i className="bass-history-peak-legend" /> Peak</span>
      </div>
      {points.length < 2 ? (
        <div className="bass-history-empty">Play this section to build its peak history.</div>
      ) : (
        <svg viewBox="0 0 640 112" role="img" aria-label="Pre-limiter short-term level and sample peaks over the last 30 seconds. The red dashed line marks digital full scale.">
          {[-30, -20, -10].map(db => <g key={db}><line x1={widthLeft} x2={widthRight} y1={yAt(db)} y2={yAt(db)} className="bass-history-grid" /><text x={widthLeft - 5} y={yAt(db) + 3} textAnchor="end" className="bass-chart-tick">{db}</text></g>)}
          <line x1={widthLeft} x2={widthRight} y1={yAt(0)} y2={yAt(0)} className="bass-history-clip-line" />
          <text x={widthLeft - 5} y={yAt(0) + 3} textAnchor="end" className="bass-chart-tick">0</text>
          {ticks.map(secondsAgo => {
            const x = widthRight - (secondsAgo / 30) * (widthRight - widthLeft);
            return <g key={secondsAgo}><line x1={x} x2={x} y1={top} y2={bottom} className="bass-history-grid bass-history-grid-vertical" /><text x={x} y="105" textAnchor="middle" className="bass-chart-tick">{secondsAgo === 0 ? 'now' : `−${secondsAgo}s`}</text></g>;
          })}
          <polyline points={levelPath} className="bass-history-level-line" />
          <polyline points={peakPath} className="bass-history-peak-line" />
          {points.filter(point => point.clipping).map((point, index) => <circle key={`${point.timeSec}-${index}`} cx={xAt(point.timeSec)} cy={yAt(point.peakDb)} r="2.5" className="bass-history-clip-point" />)}
        </svg>
      )}
    </section>
  );
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

function BassControl({
  bassDb,
  isPreviewOn,
  onBassChange,
  onTogglePreview,
  size = 'compact',
  subBassDb = 0,
  onSubBassChange,
  onBassPreview,
}: {
  bassDb: number;
  isPreviewOn: boolean;
  onBassChange: (v: number) => void;
  onTogglePreview: () => void;
  size?: 'compact' | 'full';
  subBassDb?: number;
  onSubBassChange?: (value: number) => void;
  onBassPreview?: (value: number) => void;
}) {
  const [draft, setDraft] = useState(bassDb);
  const [dragging, setDragging] = useState(false);
  const commitTimer = useState(() => ({ current: null as ReturnType<typeof setTimeout> | null }))[0];
  useEffect(() => { if (!dragging) setDraft(bassDb); }, [bassDb, dragging]);
  useEffect(() => { return () => { if (commitTimer.current) clearTimeout(commitTimer.current); }; }, []);
  const displayDb = dragging ? draft : bassDb;
  const displayActive = displayDb > 0 || subBassDb > 0;
  const displayPreview = displayActive && isPreviewOn;
  const totalBoostDb = displayDb + subBassDb;
  const commit = (v: number) => {
    setDragging(false);
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = null;
    onBassChange(v);
  };
  const handlePointerDown = () => setDragging(true);
  const handlePointerUp = () => {
    if (dragging) commit(draft);
  };
  const handleChange = (v: number) => {
    setDraft(v);
    onBassPreview?.(v);
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      if (dragging) commit(v);
    }, 400);
  };
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: size === 'compact' ? 6 : 8 }} onClick={e => e.stopPropagation()}>
      <button
        className="btn"
        onClick={onTogglePreview}
        disabled={!displayActive}
        title={!displayActive ? 'Raise bass to enable preview' : displayPreview ? `Bass +${totalBoostDb}dB — click to hear original` : `Original — click to hear bass +${totalBoostDb}dB`}
        aria-label={displayPreview ? 'Preview bass off' : 'Preview bass on'}
        aria-pressed={displayPreview}
        style={{
          padding: size === 'compact' ? '5px 8px' : '6px 10px',
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.02em',
          border: `1px solid ${displayPreview ? 'rgba(124,92,255,0.45)' : displayActive ? 'rgba(255,255,255,0.16)' : 'var(--border-soft)'}`,
          background: displayPreview ? 'rgba(124,92,255,0.22)' : displayActive ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
          color: displayPreview ? '#c4b5ff' : displayActive ? 'var(--text)' : 'var(--muted)',
          opacity: !displayActive ? 0.6 : 1,
          cursor: !displayActive ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {displayPreview ? `♬ +${totalBoostDb}dB` : displayActive ? '♬ Preview' : '♬ Off'}
      </button>
      <span className={size === 'full' ? 'bass-band-control' : undefined}>
        {size === 'full' && <label>Low shelf · 110 Hz</label>}
        <input
          type="range"
          min={0}
          max={6}
          step={1}
          value={dragging ? draft : bassDb}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onChange={e => handleChange(Number(e.target.value))}
          onKeyUp={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') commit(draft); }}
          onBlur={() => { if (dragging) commit(draft); }}
          aria-label="Low shelf boost"
          title={`Low shelf ${dragging ? draft : bassDb} dB — drag then release to apply`}
          style={{
            width: size === 'compact' ? 64 : 86,
            accentColor: displayPreview ? 'var(--accent)' : displayActive ? 'rgba(124,92,255,0.55)' : 'rgba(255,255,255,0.25)',
            cursor: 'pointer',
          }}
        />
        {size === 'full' && <b>+{dragging ? draft : bassDb} dB</b>}
      </span>
      {size === 'full' && (
        <>
          {onSubBassChange && (
            <span className="bass-band-control">
              <label htmlFor="sub-bass-boost">Sub bass · 48 Hz</label>
              <input id="sub-bass-boost" type="range" min={0} max={6} step={1} value={subBassDb} onChange={e => onSubBassChange(Number(e.target.value))} aria-label="Sub bass boost" />
              <b>+{subBassDb} dB</b>
            </span>
          )}
        </>
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
  bassDb = 0,
  onBassChange,
  isBassPreviewOn = false,
  onToggleBassPreview,
  bassMeter,
  subBassDb = 0,
  onSubBassChange,
  onBassPreview,
}: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [artFailed, setArtFailed] = useState(false);
  const [bassGraphsOpen, setBassGraphsOpen] = useState(false);
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
        {onBassChange && onToggleBassPreview && (
          <BassControl bassDb={bassDb!} isPreviewOn={isBassPreviewOn!} onBassChange={onBassChange} onBassPreview={onBassPreview} onTogglePreview={onToggleBassPreview} size="compact" subBassDb={subBassDb} onSubBassChange={onSubBassChange} />
        )}
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
      <div className={`glass unified-expanded${bassGraphsOpen ? ' has-bass-graphs-open' : ''}`}>
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
              {hasSynced && <span className="muted" style={{ fontSize: 11 }}>synced</span>}
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
          <div className="now-controls" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
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
            {onBassChange && onToggleBassPreview && (
              <BassControl bassDb={bassDb!} isPreviewOn={isBassPreviewOn!} onBassChange={onBassChange} onBassPreview={onBassPreview} onTogglePreview={onToggleBassPreview} size="full" subBassDb={subBassDb} onSubBassChange={onSubBassChange} />
            )}
          </div>
        </div>
        {bassMeter && (
          <section className={`bass-graphs${bassGraphsOpen ? '' : ' is-collapsed'}`} aria-label="Bass analysis graphs">
            <button
              className="bass-graphs-toggle"
              type="button"
              aria-expanded={bassGraphsOpen}
              onClick={() => setBassGraphsOpen(open => !open)}
            >
              <span><b>Bass analysis</b><small>Spectrum, EQ effect &amp; playback peaks</small></span>
              <span className="bass-graphs-chevron" aria-hidden="true">{bassGraphsOpen ? '▾' : '▸'}</span>
            </button>
            {bassGraphsOpen && (
              <div className="bass-graphs-content">
                <BassResponseChart meter={bassMeter} />
                <PeakHistoryChart meter={bassMeter} currentTime={currentTime} />
              </div>
            )}
          </section>
        )}
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

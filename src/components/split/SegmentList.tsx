import { useState, useEffect } from 'react';
import { formatMs } from '../../lib/format';
import type { WaveformHandle } from '../../hooks/useWaveSurfer';
import type { Track } from '../../types/api';
import { CircularPlayButton } from '../ui/CircularPlayButton';

type Props = {
  splitPoints: number[];
  segmentTitles: string[];
  setSegmentTitles: React.Dispatch<React.SetStateAction<string[]>>;
  waveformRef: React.RefObject<WaveformHandle | null>;
  onRemove: (idx: number) => void;
  focusedIndex?: number | null;
  onFocus?: (idx: number) => void;
  onExitFocus?: () => void;
  onStepFocus?: (delta: 1 | -1) => void;
  libraryTracks?: Track[];
  skipped?: Set<number>;
  onToggleSkip?: (idx: number) => void;
  sourceTrack?: Track | null;
  playingIndex?: number | null;
  activeIndex?: number | null;
  isPlaying?: boolean;
  cursorMs?: number | null;
};

export function SegmentList({
  splitPoints,
  segmentTitles,
  setSegmentTitles,
  waveformRef,
  onRemove,
  focusedIndex = null,
  onFocus,
  onExitFocus,
  onStepFocus,
  libraryTracks = [],
  skipped = new Set<number>(),
  onToggleSkip,
  sourceTrack = null,
  playingIndex = null,
  activeIndex = null,
  isPlaying = false,
  cursorMs = null,
}: Props) {
  const isFocused = focusedIndex !== null;
  const trackCount = splitPoints.length - 1;
  const indices = isFocused ? [focusedIndex as number] : splitPoints.slice(0, -1).map((_, i) => i);

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  const findDupes = (query: string): Track[] => {
    const q = normalize(query);
    if (q.length < 2) return [];
    // exclude the source file itself
    const sourcePath = sourceTrack?.filePath ? String(sourceTrack.filePath) : '';
    const candidates: { t: Track; score: number }[] = [];
    for (const t of libraryTracks) {
      if (sourcePath && t.filePath === sourcePath) continue;
      const titleN = normalize(t.title);
      const artistN = normalize(t.artist);
      const combined = `${artistN} ${titleN}`;
      let score = -1;
      if (titleN === q) score = 100;
      else if (combined === q) score = 99;
      else if (titleN.includes(q) || q.includes(titleN))
        score = 80 - Math.abs(titleN.length - q.length) * 0.5;
      else if (combined.includes(q) || q.includes(combined))
        score = 70 - Math.abs(combined.length - q.length) * 0.5;
      else {
        // token overlap
        const qTokens = new Set(q.split(' ').filter(Boolean));
        const tTokens = new Set(titleN.split(' ').filter(Boolean));
        let overlap = 0;
        for (const tok of qTokens) if (tTokens.has(tok)) overlap++;
        if (overlap >= 2 || (overlap >= 1 && q.length >= 5)) score = 50 + overlap * 10;
      }
      if (score >= 0) candidates.push({ t, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, 3).map(c => c.t);
  };

  const [dismissed, setDismissed] = useState<Map<number, string>>(() => new Map());
  const isDismissed = (i: number, title: string) => dismissed.get(i) === normalize(title);
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  useEffect(() => {
    if (openMenu === null) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.segment-row-menu')) setOpenMenu(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [openMenu]);
  const hasAnyDupes =
    !isFocused &&
    indices.some(i => {
      const t = segmentTitles[i] ?? '';
      return normalize(t).length >= 2 && findDupes(t).length > 0 && !isDismissed(i, t);
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      {isFocused && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            Track {(focusedIndex as number) + 1} / {trackCount}{' '}
            <span className="muted" style={{ fontWeight: 400 }}>
              focused
            </span>
          </span>
        </div>
      )}
      {!isFocused && trackCount > 0 && (
        <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>
          Click <span style={{ fontWeight: 600 }}>Focus</span> to edit a single track isolated
          {trackCount > 1 && ' · Esc to exit focus'}
        </div>
      )}
      {hasAnyDupes && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '6px 10px',
            borderRadius: 10,
            background: 'rgba(255,193,7,0.12)',
            border: '1px solid rgba(255,193,7,0.30)',
            fontSize: 11,
          }}
        >
          <span style={{ color: '#ffca28', fontWeight: 600 }}>
            {
              indices.filter(i => {
                const t = segmentTitles[i] ?? '';
                return !isDismissed(i, t) && findDupes(t).length > 0;
              }).length
            }{' '}
            possible duplicate
            {indices.filter(i => {
              const t = segmentTitles[i] ?? '';
              return !isDismissed(i, t) && findDupes(t).length > 0;
            }).length > 1
              ? 's'
              : ''}{' '}
            — not duplicates?
          </span>
          <button
            className="btn"
            style={{ padding: '4px 10px', fontSize: 11 }}
            onClick={() => {
              const next = new Map(dismissed);
              for (const idx of indices) {
                const t = segmentTitles[idx] ?? '';
                if (findDupes(t).length > 0) next.set(idx, normalize(t));
              }
              setDismissed(next);
            }}
          >
            Confirm none are duplicates
          </button>
        </div>
      )}
      {indices.map(i => {
        const start = splitPoints[i]!;
        const end = splitPoints[i + 1]!;
        const isSkipped = skipped.has(i);
        const isActive = playingIndex === i && isPlaying;
        const isCursor = activeIndex === i;
        const title = segmentTitles[i] ?? '';
        const rawDupes = findDupes(title);
        const dupes = isDismissed(i, title) ? [] : rawDupes;
        return (
          <div
            key={i}
            className={`glass-soft segment-row${isSkipped ? ' segment-row--skipped' : ''}${isCursor ? ' segment-row--playing' : ''}${isActive ? ' is-active' : ''}`}
            onClick={e => {
              if (isFocused) return;
              const target = e.target as HTMLElement;
              if (target.closest('input, button, label')) return;
              onFocus?.(i);
            }}
            title={!isFocused ? 'Click to focus and edit' : undefined}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: '10px 12px',
              borderRadius: 12,
              opacity: isSkipped ? 0.55 : 1,
              border: isSkipped ? '1px dashed rgba(255,193,7,0.5)' : undefined,
              cursor: !isFocused ? 'pointer' : undefined,
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
              <label
                title={isSkipped ? 'Skipped — will not be exported' : 'Export this segment'}
                onClick={e => e.stopPropagation()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 22,
                  height: 22,
                  flexShrink: 0,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={!isSkipped}
                  onChange={() => onToggleSkip?.(i)}
                  title={isSkipped ? 'Enable export' : 'Skip export'}
                  style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
              </label>
              {(() => {
                const dur = Math.max(1, end - start);
                const pct =
                  cursorMs == null
                    ? 0
                    : cursorMs < start
                      ? 0
                      : cursorMs >= end
                        ? 0
                        : (cursorMs - start) / dur;
                const state: 'playing' | 'idle' = isActive ? 'playing' : 'idle';
                const shouldShowProgress = pct > 0 && cursorMs != null && cursorMs >= start && cursorMs < end;
                return (
                  <CircularPlayButton
                    state={state}
                    progress={shouldShowProgress ? pct : isActive ? pct : 0}
                    size={30}
                    onClick={e => {
                      e.stopPropagation();
                      if (isActive) {
                        waveformRef.current?.pause();
                        return;
                      }
                      if (
                        cursorMs != null &&
                        cursorMs >= start &&
                        cursorMs < end - 200 &&
                        !isPlaying
                      ) {
                        waveformRef.current?.playFrom(cursorMs, end);
                      } else {
                        waveformRef.current?.playFrom(start, end);
                      }
                    }}
                    title={
                      isActive
                        ? 'Pause'
                        : cursorMs != null && cursorMs >= start && cursorMs < end - 200 && !isPlaying
                          ? 'Resume segment'
                          : 'Play segment'
                    }
                    ariaLabel={
                      isActive
                        ? 'Pause segment'
                        : cursorMs != null && cursorMs >= start && cursorMs < end - 200 && !isPlaying
                          ? 'Resume segment'
                          : 'Play segment'
                    }
                  />
                );
              })()}
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  minWidth: 28,
                  textAlign: 'center',
                  background: i % 2 === 0 ? 'rgba(124,92,255,0.2)' : 'rgba(0,212,255,0.15)',
                  borderRadius: 6,
                  padding: '4px 0',
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </span>
              <span
                className="muted"
                style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}
              >
                {formatMs(start)} – {formatMs(end)} ({formatMs(end - start)})
              </span>
              <input
                placeholder={`Title for part ${i + 1} (optional)`}
                value={segmentTitles[i] ?? ''}
                onChange={e =>
                  setSegmentTitles(prev => {
                    const n = [...prev];
                    n[i] = e.target.value;
                    return n;
                  })
                }
                onClick={e => e.stopPropagation()}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '7px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'rgba(255,255,255,0.06)',
                  color: 'var(--text)',
                  fontSize: 12,
                }}
              />
              <div className="segment-row-menu" style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  className="segment-row-menu-trigger"
                  aria-label="Segment actions"
                  aria-expanded={openMenu === i}
                  aria-haspopup="menu"
                  onClick={e => {
                    e.stopPropagation();
                    setOpenMenu(openMenu === i ? null : i);
                  }}
                  title="More actions"
                >
                  ⋮
                </button>
                {openMenu === i && (
                  <div
                    className="glass segment-row-menu-dropdown"
                    role="menu"
                    onClick={e => e.stopPropagation()}
                    onMouseLeave={() => setOpenMenu(null)}
                  >
                    <button
                      role="menuitem"
                      className="row-menu-item danger"
                      onClick={() => {
                        setOpenMenu(null);
                        onRemove(i);
                      }}
                      disabled={splitPoints.length <= 2}
                      title={splitPoints.length <= 2 ? 'At least one segment required' : 'Remove split after this'}
                    >
                      ✕ Remove split
                    </button>
                    {!isFocused && (
                      <button
                        role="menuitem"
                        className="row-menu-item"
                        onClick={() => {
                          setOpenMenu(null);
                          onFocus?.(i);
                        }}
                      >
                        ◎ Focus track
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            {dupes.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: '6px 8px',
                  borderRadius: 8,
                  background: 'rgba(255,193,7,0.10)',
                  border: '1px solid rgba(255,193,7,0.22)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#ffca28' }}>
                    Possible duplicate{dupes.length > 1 ? 's' : ''} in library:
                  </span>
                  <button
                    className="btn"
                    style={{ padding: '2px 8px', fontSize: 11 }}
                    onClick={() =>
                      setDismissed(prev => {
                        const next = new Map(prev);
                        next.set(i, normalize(title));
                        return next;
                      })
                    }
                    title="Hide warning for this title"
                  >
                    Not duplicate
                  </button>
                </div>
                {dupes.map(d => (
                  <div
                    key={d.filePath}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      alignItems: 'center',
                      fontSize: 11,
                    }}
                  >
                    <span
                      style={{
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--text)',
                      }}
                      title={`${d.artist} — ${d.title} · ${d.album} · ${d.filePath}`}
                    >
                      <strong>{d.artist}</strong> — {d.title}{' '}
                      <span className="muted">· {d.album}</span>
                    </span>
                    <button
                      className="btn"
                      style={{ padding: '2px 8px', fontSize: 11, flexShrink: 0 }}
                      onClick={() => onToggleSkip?.(i)}
                      title={isSkipped ? 'Unskip' : 'Mark as duplicate and skip export'}
                    >
                      {isSkipped ? 'Unskip' : 'Skip export'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {isSkipped && dupes.length === 0 && (
              <span style={{ fontSize: 11, color: '#ffca28' }}>Will be skipped on export</span>
            )}
          </div>
        );
      })}
      {isFocused && (
        <p className="muted" style={{ fontSize: 11, marginTop: 2 }}>
          Focused waveform is zoomed to this track · drag markers or press <strong>S</strong> at
          cursor to add splits. Esc exits focus.
        </p>
      )}
    </div>
  );
}

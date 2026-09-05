import { useState } from 'react';
import { formatMs } from '../../lib/format';
import type { WaveformHandle } from '../../hooks/useWaveSurfer';
import type { Track } from '../../types/api';

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
      else if (titleN.includes(q) || q.includes(titleN)) score = 80 - Math.abs(titleN.length - q.length) * 0.5;
      else if (combined.includes(q) || q.includes(combined)) score = 70 - Math.abs(combined.length - q.length) * 0.5;
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
  const hasAnyDupes = !isFocused && indices.some(i => {
    const t = segmentTitles[i] ?? '';
    return normalize(t).length >= 2 && findDupes(t).length > 0 && !isDismissed(i, t);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      {isFocused && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            Track {(focusedIndex as number) + 1} / {trackCount} <span className="muted" style={{ fontWeight: 400 }}>focused</span>
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              className="btn"
              onClick={() => onStepFocus?.(-1)}
              disabled={focusedIndex === 0}
              title="Previous track"
              style={{ padding: '6px 10px', fontSize: 12 }}
            >
              ◀ Prev
            </button>
            <button
              className="btn"
              onClick={() => onStepFocus?.(1)}
              disabled={focusedIndex === trackCount - 1}
              title="Next track"
              style={{ padding: '6px 10px', fontSize: 12 }}
            >
              Next ▶
            </button>
            <button className="btn" onClick={onExitFocus} style={{ padding: '6px 10px', fontSize: 12 }}>
              ← Back to all
            </button>
          </div>
        </div>
      )}
      {!isFocused && trackCount > 0 && (
        <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>
          Click <span style={{ fontWeight: 600 }}>Focus</span> to edit a single track isolated
          {trackCount > 1 && ' · Esc to exit focus'}
        </div>
      )}
      {hasAnyDupes && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 10px', borderRadius: 10, background: 'rgba(255,193,7,0.12)', border: '1px solid rgba(255,193,7,0.30)', fontSize: 11 }}>
          <span style={{ color: '#ffca28', fontWeight: 600 }}>{indices.filter(i => { const t = segmentTitles[i] ?? ''; return !isDismissed(i, t) && findDupes(t).length > 0; }).length} possible duplicate{indices.filter(i => { const t = segmentTitles[i] ?? ''; return !isDismissed(i, t) && findDupes(t).length > 0; }).length > 1 ? 's' : ''} — not duplicates?</span>
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
        const title = segmentTitles[i] ?? '';
        const rawDupes = findDupes(title);
        const dupes = isDismissed(i, title) ? [] : rawDupes;
        return (
          <div
            key={i}
            className="glass-soft"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: '10px 12px',
              borderRadius: 12,
              opacity: isSkipped ? 0.55 : 1,
              border: isSkipped ? '1px dashed rgba(255,193,7,0.5)' : undefined,
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>

            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                minWidth: 28,
                textAlign: 'center',
                background: i % 2 === 0 ? 'rgba(124,92,255,0.2)' : 'rgba(0,212,255,0.15)',
                borderRadius: 6,
                padding: '4px 0',
              }}
            >
              {i + 1}
            </span>
            <span className="muted" style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>
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
              style={{
                flex: 1,
                padding: '7px 10px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.06)',
                color: 'var(--text)',
                fontSize: 12,
              }}
            />
            <button className="btn" onClick={() => waveformRef.current?.playFrom(start, end)} title="Play segment" style={{ padding: '6px 10px', fontSize: 12 }}>
              ▶
            </button>
            {!isFocused && (
              <button className="btn" onClick={() => onFocus?.(i)} title="Focus this track (zoom, edit solo)" style={{ padding: '6px 10px', fontSize: 12 }}>
                ◎ Focus
              </button>
            )}
            <button className="btn" onClick={() => onRemove(i)} disabled={splitPoints.length <= 2} title="Remove split after this" style={{ padding: '6px 10px', fontSize: 12 }}>
              ✕
            </button>
            <label
              title={isSkipped ? 'Will be exported again' : 'Skip export — already in library'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                cursor: 'pointer',
                userSelect: 'none',
                color: isSkipped ? '#ffca28' : 'var(--muted)',
                border: isSkipped ? '1px solid rgba(255,193,7,0.5)' : '1px solid var(--border-soft)',
                background: isSkipped ? 'rgba(255,193,7,0.12)' : 'rgba(255,255,255,0.04)',
                borderRadius: 999,
                padding: '4px 8px',
                whiteSpace: 'nowrap',
              }}
            >
              <input
                type="checkbox"
                checked={isSkipped}
                onChange={() => onToggleSkip?.(i)}
                style={{ accentColor: '#ffca28' }}
              />
              {isSkipped ? 'Skipped' : 'Skip'}
            </label>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#ffca28' }}>
                    Possible duplicate{ dupes.length > 1 ? 's' : ''} in library:
                  </span>
                  <button
                    className="btn"
                    style={{ padding: '2px 8px', fontSize: 11 }}
                    onClick={() => setDismissed(prev => { const next = new Map(prev); next.set(i, normalize(title)); return next; })}
                    title="Hide warning for this title"
                  >
                    Not duplicate
                  </button>
                </div>
                {dupes.map(d => (
                  <div key={d.filePath} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', fontSize: 11 }}>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }} title={`${d.artist} — ${d.title} · ${d.album} · ${d.filePath}`}>
                      <strong>{d.artist}</strong> — {d.title} <span className="muted">· {d.album}</span>
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
          Focused waveform is zoomed to this track · drag markers or press <strong>S</strong> at cursor to add splits.
          Esc exits focus.
        </p>
      )}
    </div>
  );
}

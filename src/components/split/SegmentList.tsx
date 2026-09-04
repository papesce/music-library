import { formatMs } from '../../lib/format';
import type { WaveformHandle } from '../../hooks/useWaveSurfer';

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
}: Props) {
  const isFocused = focusedIndex !== null;
  const trackCount = splitPoints.length - 1;
  const indices = isFocused ? [focusedIndex as number] : splitPoints.slice(0, -1).map((_, i) => i);

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
      {indices.map(i => {
        const start = splitPoints[i]!;
        const end = splitPoints[i + 1]!;
        return (
          <div
            key={i}
            className="glass-soft"
            style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', borderRadius: 12 }}
          >
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
            <button className="btn" onClick={() => {
              console.log('[SegmentList] click', { i, start, end, isFocused, ref: !!waveformRef.current, ready: waveformRef.current?.isReady?.() });
              waveformRef.current?.playFrom(start, end);
            }} title="Play segment" style={{ padding: '6px 10px', fontSize: 12 }}>
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

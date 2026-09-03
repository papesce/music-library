import { formatMs } from '../../lib/format';
import type { WaveformHandle } from '../../hooks/useWaveSurfer';

type Props = {
  splitPoints: number[];
  segmentTitles: string[];
  setSegmentTitles: React.Dispatch<React.SetStateAction<string[]>>;
  waveformRef: React.RefObject<WaveformHandle | null>;
  onRemove: (idx: number) => void;
};

export function SegmentList({ splitPoints, segmentTitles, setSegmentTitles, waveformRef, onRemove }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      {splitPoints.slice(0, -1).map((start, i) => {
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
            <button className="btn" onClick={() => waveformRef.current?.playFrom(start, end)} title="Play segment" style={{ padding: '6px 10px', fontSize: 12 }}>
              ▶
            </button>
            <button className="btn" onClick={() => onRemove(i)} disabled={splitPoints.length <= 2} title="Remove split after this" style={{ padding: '6px 10px', fontSize: 12 }}>
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

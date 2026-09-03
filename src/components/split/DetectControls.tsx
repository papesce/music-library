type Props = {
  minSilenceMs: number;
  setMinSilenceMs: (v: number) => void;
  threshDb: number;
  setThreshDb: (v: number) => void;
  detecting: boolean;
  onDetect: () => void;
  segmentCount: number;
  waveReady: boolean;
};

export function DetectControls({ minSilenceMs, setMinSilenceMs, threshDb, setThreshDb, detecting, onDetect, segmentCount, waveReady }: Props) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
      <span className="muted" style={{ fontSize: 12 }}>
        Silence:
      </span>
      <label className="muted" style={{ fontSize: 11 }}>
        min{' '}
        <input
          type="number"
          value={minSilenceMs}
          onChange={e => setMinSilenceMs(Number(e.target.value) || 0)}
          style={{ width: 70, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.06)', color: 'var(--text)' }}
        />{' '}
        ms
      </label>
      <label className="muted" style={{ fontSize: 11 }}>
        thresh{' '}
        <input
          type="number"
          value={threshDb}
          onChange={e => setThreshDb(Number(e.target.value) || 0)}
          style={{ width: 60, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.06)', color: 'var(--text)' }}
        />{' '}
        dB
      </label>
      <button className="btn btn-primary" onClick={onDetect} disabled={detecting} style={{ padding: '7px 12px', fontSize: 12 }}>
        {detecting ? 'Detecting…' : 'Auto-detect'}
      </button>
      <span className="muted" style={{ fontSize: 11 }}>
        {segmentCount} segments · drag red markers, click waveform to place cursor, S to split
      </span>
      {!waveReady && <span className="muted" style={{ fontSize: 11 }}>Loading waveform…</span>}
    </div>
  );
}

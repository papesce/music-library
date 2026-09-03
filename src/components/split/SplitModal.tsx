import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track } from '../../types/api';
import { Waveform, type WaveformHandle } from './Waveform';
import { SegmentList } from './SegmentList';
import { DetectControls } from './DetectControls';
import { api } from '../../api';
import { formatMs } from '../../lib/format';

export function SplitModal({
  track,
  onClose,
  onExported,
}: {
  track: Track;
  onClose: () => void;
  onExported: () => void;
}) {
  const audioUrl = `/api/stream?path=${encodeURIComponent(track.filePath)}`;
  const durationMs = (track.duration ?? 0) * 1000;
  const [splitPoints, setSplitPoints] = useState<number[]>([0, durationMs || 60000]);
  const [detecting, setDetecting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [minSilenceMs, setMinSilenceMs] = useState(700);
  const [threshDb, setThreshDb] = useState(-50);
  const [error, setError] = useState('');
  const [segmentTitles, setSegmentTitles] = useState<string[]>([]);
  const waveformRef = useRef<WaveformHandle>(null);
  const [waveReady, setWaveReady] = useState(false);

  // init points when duration known; if track.duration missing, we get duration from detect result
  useEffect(() => {
    if (durationMs) setSplitPoints([0, durationMs]);
  }, [durationMs]);

  const handleDetect = useCallback(async () => {
    setDetecting(true);
    setError('');
    try {
      const res = await api.detectSplit(track.filePath, minSilenceMs, threshDb);
      if (res.split_points_ms?.length >= 2) {
        setSplitPoints(res.split_points_ms);
        if (res.duration_ms)
          setSegmentTitles(prev => {
            const n = res.split_points_ms.length - 1;
            if (prev.length === n) return prev;
            return Array.from({ length: n }, (_, i) => prev[i] ?? '');
          });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDetecting(false);
    }
  }, [track.filePath, minSilenceMs, threshDb]);

  useEffect(() => {
    const n = splitPoints.length - 1;
    setSegmentTitles(prev => {
      if (prev.length === n) return prev;
      if (prev.length < n) return [...prev, ...Array.from({ length: n - prev.length }, () => '')];
      return prev.slice(0, n);
    });
  }, [splitPoints.length]);

  const handleAddSplit = useCallback((posMs: number) => {
    setSplitPoints(prev => [...prev, posMs].sort((a, b) => a - b));
  }, []);
  const handleRemove = (idx: number) => {
    // idx is segment index to delete? we delete boundary after idx
    // simpler: remove point at position idx+1 (except first/last)
    if (splitPoints.length <= 2) return;
    setSplitPoints(prev => {
      const next = [...prev];
      next.splice(idx + 1, 1);
      return next;
    });
  };
  const handleExport = async () => {
    if (splitPoints.length < 2) return;
    setExporting(true);
    setError('');
    try {
      const segs = segmentTitles.map(t => (t.trim() ? { title: t.trim() } : {}));
      const res = await api.applySplit(track.filePath, splitPoints, segs);
      setError('');
      onExported();
      onClose();
      if (res.files?.length) console.log('[split] created', res.files);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} style={{ zIndex: 70 }} />
      <div
        className="glass modal"
        style={{
          zIndex: 71,
          width: 'min(920px, calc(100% - 24px))',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 20,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Split — {track.title}</h3>
            <p
              className="muted"
              style={{
                fontSize: 11,
                fontFamily: 'ui-monospace, monospace',
                wordBreak: 'break-all',
              }}
            >
              {track.filePath} · {track.duration ? formatMs(track.duration * 1000) : '—'}
            </p>
          </div>
          <button className="btn" onClick={onClose} style={{ padding: '6px 10px' }}>
            ✕
          </button>
        </div>

        {error && (
          <div className="toast" style={{ marginBottom: 12 }}>
            <span>{error}</span>
            <button onClick={() => setError('')}>✕</button>
          </div>
        )}

        <div
          style={{
            borderRadius: 16,
            background: 'rgba(0,0,0,0.35)',
            padding: 12,
            marginBottom: 12,
          }}
        >
          <Waveform
            audioUrl={audioUrl}
            splitPoints={splitPoints}
            durationMs={splitPoints[splitPoints.length - 1] ?? durationMs ?? 60000}
            onSplitPointsChange={setSplitPoints}
            onAddSplit={handleAddSplit}
            ref={waveformRef}
            onReadyChange={setWaveReady}
          />
        </div>

        <DetectControls
          minSilenceMs={minSilenceMs}
          setMinSilenceMs={setMinSilenceMs}
          threshDb={threshDb}
          setThreshDb={setThreshDb}
          detecting={detecting}
          onDetect={handleDetect}
          segmentCount={splitPoints.length - 1}
          waveReady={waveReady}
        />

        <SegmentList
          splitPoints={splitPoints}
          segmentTitles={segmentTitles}
          setSegmentTitles={setSegmentTitles}
          waveformRef={waveformRef}
          onRemove={handleRemove}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn" onClick={onClose} disabled={exporting}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={exporting || splitPoints.length < 2}
          >
            {exporting ? 'Exporting…' : `Export ${splitPoints.length - 1} files`}
          </button>
        </div>
        <p className="muted" style={{ marginTop: 8, fontSize: 11 }}>
          Slices are written next to the original as “{track.title} - part 01.mp3” etc., then appear
          in your library after export (no re-upload).
        </p>
      </div>
    </>
  );
}

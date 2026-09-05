import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track } from '../../types/api';
import { Waveform, type WaveformHandle } from './Waveform';
import { SegmentList } from './SegmentList';
import { DetectControls } from './DetectControls';
import { api } from '../../api';
import { formatMs } from '../../lib/format';
import { usePersistedState } from '../../lib/persist';

export function SplitModal({
  track,
  onClose,
  onExported,
  libraryTracks,
}: {
  track: Track;
  onClose: () => void;
  onExported: () => void;
  libraryTracks?: Track[];
}) {
  const audioUrl = `/api/stream?path=${encodeURIComponent(track.filePath)}`;
  const durationMs = (track.duration ?? 0) * 1000;
  const [splitPoints, setSplitPoints] = useState<number[]>([0, durationMs || 60000]);
  const [detecting, setDetecting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [minSilenceMs, setMinSilenceMs] = usePersistedState<number>('split:minSilenceMs', 700);
  const [threshDb, setThreshDb] = usePersistedState<number>('split:threshDb', -50);
  const [error, setError] = useState('');
  const [segmentTitles, setSegmentTitles] = useState<string[]>([]);
  const waveformRef = useRef<WaveformHandle>(null);
  const [waveReady, setWaveReady] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());

  // restore persisted draft on open (survives server restart); fallback to [0, duration]
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { draft } = await api.getSplitDraft(track.filePath);
        if (cancelled || !draft) return;
        const pts = (draft.splitPoints ?? []).map(Number).filter(n => !isNaN(n) && n >= 0).sort((a,b)=>a-b);
        if (pts.length >= 2) {
          setSplitPoints(pts);
          setSegmentTitles(draft.segmentTitles ?? pts.slice(0, -1).map(() => ''));
          setDraftRestored(true);
        }
      } catch {}
      finally { if (!cancelled) setDraftLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [track.filePath]);

  // init points when duration known (only if no draft was restored and draft fetch finished)
  useEffect(() => {
    if (!draftLoaded || draftRestored) return;
    if (durationMs) setSplitPoints([0, durationMs]);
  }, [durationMs, draftLoaded, draftRestored]);

  // auto-save draft debounced (server persists across restarts)
  useEffect(() => {
    if (!draftLoaded) return;
    if (splitPoints.length < 2) return;
    const t = setTimeout(async () => {
      setDraftSaving(true);
      try { await api.saveSplitDraft(track.filePath, splitPoints, segmentTitles); } catch {}
      finally { setDraftSaving(false); }
    }, 600);
    return () => clearTimeout(t);
  }, [splitPoints, segmentTitles, draftLoaded, track.filePath]);

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

  // keep focus valid when track count shrinks
  useEffect(() => {
    if (focusedIndex !== null && focusedIndex >= splitPoints.length - 1) setFocusedIndex(null);
  }, [splitPoints, focusedIndex]);

  // keep skipped valid when track count shrinks
  useEffect(() => {
    setSkipped(prev => {
      const next = new Set<number>();
      for (const idx of prev) if (idx < splitPoints.length - 1) next.add(idx);
      return next;
    });
  }, [splitPoints.length]);

  // focus isolation is now handled by Waveform itself (it loads a sliced audio URL for the focused segment)
  // no zoomTo/resetZoom needed — waveform remounts with isolated audio

  // Esc to exit focus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && focusedIndex !== null) {
        e.preventDefault();
        setFocusedIndex(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusedIndex]);

  const handleAddSplit = useCallback((posMs: number) => {
    setSplitPoints(prev => [...prev, posMs].sort((a, b) => a - b));
  }, []);
  const handleEnterFocus = useCallback((idx: number) => setFocusedIndex(idx), []);
  const handleExitFocus = useCallback(() => {
    setFocusedIndex(null);
  }, []);
  const handleStepFocus = useCallback(
    (delta: 1 | -1) => {
      if (focusedIndex === null) return;
      const next = focusedIndex + delta;
      if (next < 0 || next >= splitPoints.length - 1) return;
      setFocusedIndex(next);
    },
    [focusedIndex, splitPoints]
  );

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
  const handleClearDraft = async () => {
    if (!confirm('Clear saved split and start over? This removes the persisted draft.')) return;
    try { await api.deleteSplitDraft(track.filePath); } catch {}
    setSegmentTitles([]);
    setSplitPoints(durationMs ? [0, durationMs] : [0, 60000]);
    setDraftRestored(false);
    setFocusedIndex(null);
  };
  const handleExport = async () => {
    if (splitPoints.length < 2) return;
    const skipArr = [...skipped].sort((a,b)=>a-b);
    const toExportCount = splitPoints.length - 1 - skipArr.length;
    if (toExportCount <= 0) { setError('All tracks marked as skipped — nothing to export'); return; }
    setExporting(true);
    setError('');
    try {
      const segs = segmentTitles.map(t => (t.trim() ? { title: t.trim() } : {}));
      const res = await api.applySplit(track.filePath, splitPoints, segs, skipArr);
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
          overflow: 'hidden',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
            flexShrink: 0,
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
          <div className="toast" style={{ marginBottom: 12, flexShrink: 0 }}>
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
            flexShrink: 0,
          }}
        >
          <Waveform
            audioUrl={audioUrl}
            splitPoints={splitPoints}
            durationMs={durationMs || splitPoints[splitPoints.length - 1] || 60000}
            onSplitPointsChange={setSplitPoints}
            onAddSplit={handleAddSplit}
            ref={waveformRef}
            focusedIndex={focusedIndex}
            onReadyChange={setWaveReady}
          />
        </div>

        <div style={{ flexShrink: 0, marginBottom: 12 }}>
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
        </div>

        <div
          style={{
            flex: 1,
            overflow: 'auto',
            minHeight: 120,
            marginBottom: 12,
            paddingRight: 4,
            scrollbarGutter: 'stable',
          }}
        >
          <SegmentList
            splitPoints={splitPoints}
            segmentTitles={segmentTitles}
            setSegmentTitles={setSegmentTitles}
            waveformRef={waveformRef}
            onRemove={handleRemove}
            focusedIndex={focusedIndex}
            onFocus={handleEnterFocus}
            onExitFocus={handleExitFocus}
            onStepFocus={handleStepFocus}
            libraryTracks={libraryTracks ?? []}
            skipped={skipped}
            onToggleSkip={(idx) => setSkipped(prev => {
              const next = new Set(prev);
              if (next.has(idx)) next.delete(idx);
              else next.add(idx);
              return next;
            })}
            sourceTrack={track}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginTop: 4, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn" onClick={handleClearDraft} disabled={exporting} title="Delete persisted draft and reset to single segment">
              ↺ Clear & start over
            </button>
            <span className="muted" style={{ fontSize: 11 }}>
              {!draftLoaded ? 'Loading draft…' : draftSaving ? 'Saving…' : draftRestored ? 'Draft restored · auto-saved' : 'Auto-saved'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={onClose} disabled={exporting}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleExport}
              disabled={exporting || splitPoints.length - 1 - skipped.size < 1}
              title={skipped.size ? `${skipped.size} skipped — will export ${splitPoints.length - 1 - skipped.size}` : undefined}
            >
              {exporting ? 'Exporting…' : `Export ${splitPoints.length - 1 - skipped.size} files${skipped.size ? ` (${skipped.size} skipped)` : ''}`}
            </button>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 8, fontSize: 11, flexShrink: 0 }}>
          Slices are written next to the original as “{track.title} - part 01.mp3” etc., then appear
          in your library after export (no re-upload).
        </p>
      </div>
    </>
  );
}

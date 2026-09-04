import { useEffect, useRef, useState } from 'react';
import { useWaveSurfer, type WaveformHandle } from '../../hooks/useWaveSurfer';
import { useWaveformRegions } from '../../hooks/useWaveformRegions';
import { useWaveformHotkey } from '../../hooks/useWaveformHotkey';
export type { WaveformHandle };
interface Props {
  audioUrl: string;
  splitPoints: number[];
  durationMs: number;
  onSplitPointsChange: (pts: number[]) => void;
  onRegionClick?: (i: number) => void;
  onAddSplit?: (posMs: number) => void;
  ref?: React.Ref<WaveformHandle>;
  focusedIndex?: number | null;
  onWaveStateChange?: (
    playing: boolean,
    reason: import('../../hooks/useWaveSurfer').WaveStateReason
  ) => void;
  onReadyChange?: (ready: boolean) => void;
  onTogglePlay?: () => void;
  onSeekPause?: () => void;
}
export function Waveform({
  audioUrl,
  splitPoints,
  durationMs,
  onSplitPointsChange,
  onRegionClick,
  onAddSplit,
  ref,
  focusedIndex,
  onWaveStateChange,
  onReadyChange,
  onTogglePlay,
  onSeekPause,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    wsRef,
    regionsRef,
    ready,
    error,
    playing,
    zoom,
    cursorMs,
    setCursorMs,
    applyZoom,
    autoScroll,
    setAutoScroll,
  } = useWaveSurfer({
    audioUrl,
    containerRef,
    durationMs,
    ref: ref as React.Ref<WaveformHandle>,
    onStateChange: onWaveStateChange,
    onReadyChange,
  });
  useWaveformRegions({
    wsRef,
    regionsRef,
    splitPoints,
    durationMs,
    ready,
    focusedIndex,
    onSplitPointsChange,
    onRegionClick,
  });
  useWaveformHotkey({ onAddSplit, cursorMs, ready, focusedIndex, durationMs, splitPoints });
  // NOTE: removed auto applyZoom(1) on focusedIndex change — parent SplitModal now drives zoomTo/resetZoom for focus mode
  useEffect(() => {
    if (wsRef.current)
      (wsRef.current as unknown as { _focused?: boolean })._focused =
        focusedIndex !== null && focusedIndex !== undefined;
  }, [focusedIndex, wsRef]);

  // viewport time preview while horizontal scrolling (zoomed)
  const [viewportMs, setViewportMs] = useState<{ left: number; right: number } | null>(null);
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !ready) return;
    const update = () => {
      const z = zoom || 1; // pxPerSec
      if (z <= 1) {
        setViewportMs(null);
        return;
      }
      const left = Math.max(0, Math.round((el.scrollLeft / z) * 1000));
      const right = Math.min(durationMs, Math.round(((el.scrollLeft + el.clientWidth) / z) * 1000));
      setViewportMs({ left, right });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // update after zoom changes layout
    const id = requestAnimationFrame(update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      cancelAnimationFrame(id);
    };
  }, [ready, zoom, durationMs]);

  // Ctrl/Cmd + wheel to zoom (horizontal-zoom friendly)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !ready) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.85 : 1.18;
      const next = Math.max(1, Math.min(800, Math.round((zoom || 1) * delta)));
      applyZoom(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ready, zoom, applyZoom]);
  function fmt(ms: number) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  const canSplit = (() => {
    if (!ready || cursorMs === null || !onAddSplit) return false;
    if (cursorMs <= 350 || cursorMs >= durationMs - 350) return false;
    const s = focusedIndex != null ? (splitPoints[focusedIndex] ?? 0) : 0;
    const g = focusedIndex != null ? s + cursorMs : cursorMs;
    return splitPoints.every(p => Math.abs(p - g) > 350);
  })();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ position: 'relative', width: '100%' }}>
        <div
          ref={containerRef}
          onMouseMove={e => {
            if (!ready || zoom <= 1) {
              setHoverMs(null);
              return;
            }
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const x = e.clientX - rect.left + (e.currentTarget as HTMLDivElement).scrollLeft;
            const ms = Math.max(0, Math.min(durationMs, Math.round((x / (zoom || 1)) * 1000)));
            setHoverMs(ms);
          }}
          onMouseLeave={() => setHoverMs(null)}
          style={{
            width: '100%',
            borderRadius: 12,
            overflow: focusedIndex != null ? 'hidden' : 'auto hidden',
            background: '#18181b',
            cursor: 'pointer',
          }}
          title="Click to position cursor · Drag red markers to adjust · Ctrl+scroll to zoom"
        />
        {ready && viewportMs && zoom > 1 && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              zIndex: 2,
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              pointerEvents: 'none',
              fontSize: 11,
              fontFamily: 'ui-monospace, monospace',
              background: 'rgba(0,0,0,0.75)',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 8,
              padding: '4px 8px',
              color: '#e4e4e7',
              backdropFilter: 'blur(6px)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
            title={`Visible window · total ${fmt(durationMs)}`}
          >
            <span style={{ color: '#a1a1aa' }}>{fmt(viewportMs.left)}</span>
            <span style={{ opacity: 0.6 }}>→</span>
            <span>{fmt(viewportMs.right)}</span>
            <span style={{ opacity: 0.5, marginLeft: 4 }}>/ {fmt(durationMs)}</span>
            {hoverMs !== null && (
              <span style={{ marginLeft: 6, color: '#7c5cff', fontWeight: 600 }}>· hover {fmt(hoverMs)}</span>
            )}
          </div>
        )}
      </div>
      {error && (
        <div
          style={{
            fontSize: 12,
            color: '#ff4d6d',
            background: 'rgba(255,77,92,0.12)',
            border: '1px solid rgba(255,77,92,0.25)',
            borderRadius: 8,
            padding: '8px 10px',
          }}
        >
          Waveform failed: {error}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <button
          onClick={() => {
            const ws = wsRef.current;
            if (!ws) return;
            const cur = ws.getCurrentTime();
            const next = Math.max(0, cur - 5);
            ws.seekTo(next / ((durationMs || 1) / 1000));
            try {
              ws.pause();
            } catch {}
            setCursorMs(Math.round(next * 1000));
            onSeekPause?.();
          }}
          disabled={!ready}
          className="btn"
          style={{ padding: '6px 10px', fontSize: 12 }}
        >
          ◀ 5s
        </button>
        <button
          onClick={() => {
            if (onTogglePlay) onTogglePlay();
            else
              try {
                wsRef.current?.playPause();
              } catch {}
          }}
          disabled={!ready}
          className="btn btn-primary"
          style={{ padding: '6px 14px', fontSize: 12 }}
        >
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <button
          onClick={() => {
            const ws = wsRef.current;
            if (!ws) return;
            const dur = (durationMs || 1) / 1000;
            const cur = ws.getCurrentTime();
            const next = Math.min(dur, cur + 5);
            ws.seekTo(Math.min(1, next / dur));
            try {
              ws.pause();
            } catch {}
            setCursorMs(Math.round(next * 1000));
            onSeekPause?.();
          }}
          disabled={!ready}
          className="btn"
          style={{ padding: '6px 10px', fontSize: 12 }}
        >
          5s ▶
        </button>
        {ready && onAddSplit && (
          <button
            disabled={!canSplit}
            onClick={() => {
              if (cursorMs === null) return;
              const s = focusedIndex != null ? (splitPoints[focusedIndex] ?? 0) : 0;
              const g = focusedIndex != null ? s + cursorMs : cursorMs;
              onAddSplit(g);
            }}
            className="btn"
            style={{
              background: canSplit ? 'rgba(239,68,68,0.9)' : undefined,
              color: canSplit ? 'white' : undefined,
              padding: '6px 10px',
              fontSize: 12,
            }}
          >
            ✂ Split at {cursorMs !== null ? fmt(cursorMs) : '—:—'}
          </button>
        )}
        {ready && (
          <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>
            {splitPoints.length - 1} segments
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 6, border: '1px solid var(--border)', borderRadius: 8, padding: 2 }}>
          <button
            onClick={() => applyZoom(Math.max(1, Math.round((zoom || 1) * 0.6)))}
            disabled={!ready || zoom <= 1}
            className="btn"
            title="Zoom out (or Ctrl+scroll)"
            style={{ padding: '4px 8px', fontSize: 12, minWidth: 28 }}
          >
            −
          </button>
          <span className="muted" style={{ fontSize: 11, minWidth: 44, textAlign: 'center' }}>
            {zoom > 1 ? `${zoom}×` : '1×'}
          </span>
          <button
            onClick={() => applyZoom(Math.min(800, Math.round(Math.max(20, (zoom || 1) * 1.6))))}
            disabled={!ready}
            className="btn"
            title="Zoom in (or Ctrl+scroll)"
            style={{ padding: '4px 8px', fontSize: 12, minWidth: 28 }}
          >
            +
          </button>
          <button
            onClick={() => applyZoom(1)}
            disabled={!ready || zoom <= 1}
            className="btn"
            title="Reset to fit"
            style={{ padding: '4px 8px', fontSize: 11 }}
          >
            Reset
          </button>
        </div>
        <span className="muted" style={{ fontSize: 11, marginLeft: 4, display: ready ? undefined : 'none' }}>
          {zoom > 1 ? 'scroll →' : 'Ctrl+scroll to zoom'}
        </span>
        <button
          onClick={() => setAutoScroll((v: boolean) => !v)}
          className="btn"
          style={{ padding: '4px 8px', fontSize: 11, marginLeft: 'auto' }}
        >
          {autoScroll ? 'Follow ON' : 'Follow OFF'}
        </button>
      </div>
    </div>
  );
}

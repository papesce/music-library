import { useEffect, useRef } from 'react';
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
  useEffect(() => {
    if (ready) applyZoom(1);
  }, [focusedIndex, ready, applyZoom]);
  useEffect(() => {
    if (wsRef.current)
      (wsRef.current as unknown as { _focused?: boolean })._focused =
        focusedIndex !== null && focusedIndex !== undefined;
  }, [focusedIndex, wsRef]);
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
      <div
        ref={containerRef}
        style={{
          width: '100%',
          borderRadius: 12,
          overflow: 'hidden',
          background: '#18181b',
          cursor: 'pointer',
        }}
        title="Click to position cursor · Drag red markers to adjust"
      />
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
        {ready && zoom > 1 && (
          <button
            onClick={() => applyZoom(1)}
            className="btn"
            style={{ padding: '4px 8px', fontSize: 11 }}
          >
            Reset zoom
          </button>
        )}
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

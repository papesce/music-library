import { useRef, useState, useCallback } from 'react';

type Props = {
  durationMs: number;
  splitPoints: number[];
  focusedIndex?: number | null;
  viewportMs: { left: number; right: number } | null;
  cursorMs?: number | null;
  onSeek?: (ms: number) => void;
  onPan?: (leftMs: number) => void;
};

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function WaveformMinimap({ durationMs, splitPoints, focusedIndex, viewportMs, cursorMs, onSeek, onPan }: Props) {
  if (!durationMs) return null;
  const total = durationMs;
  const trackCount = splitPoints.length - 1;

  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverPct, setHoverPct] = useState<number | null>(null);
  const [hoverMs, setHoverMs] = useState<number | null>(null);

  const focused = focusedIndex !== null && focusedIndex !== undefined;
  const vpLeftPct = viewportMs ? (viewportMs.left / total) * 100 : null;
  const vpWidthPct = viewportMs ? ((viewportMs.right - viewportMs.left) / total) * 100 : null;
  const cursorPct = cursorMs !== null && cursorMs !== undefined ? (cursorMs / total) * 100 : null;
  const isFullView = viewportMs ? viewportMs.left === 0 && viewportMs.right >= total - 50 : false;

  const msFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      return Math.round((x / rect.width) * total);
    },
    [total]
  );

  const handlePointerMove = (e: React.PointerEvent) => {
    const ms = msFromClientX(e.clientX);
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setHoverPct(Math.max(0, Math.min(100, pct)));
    setHoverMs(ms);
  };

  const handlePointerLeave = () => {
    setHoverPct(null);
    setHoverMs(null);
  };

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    // if clicking on viewport rect, let viewport handler take over
    if ((e.target as HTMLElement).closest('[data-viewport]')) return;
    const ms = msFromClientX(e.clientX);
    onSeek(Math.max(0, Math.min(total, ms)));
    const handleMove = (ev: PointerEvent) => {
      const m = msFromClientX(ev.clientX);
      onSeek(Math.max(0, Math.min(total, m)));
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const handleViewportPointerDown = (e: React.PointerEvent) => {
    if (!onPan || !viewportMs || isFullView || focused) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startLeft = viewportMs.left;
    const vpDur = viewportMs.right - viewportMs.left;

    const onMove = (ev: PointerEvent) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dx = ev.clientX - startX;
      const dMs = (dx / rect.width) * total;
      let nextLeft = startLeft + dMs;
      // clamp so viewport stays inside [0,total]
      nextLeft = Math.max(0, Math.min(total - vpDur, nextLeft));
      onPan(nextLeft);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!onSeek || cursorPct === null || cursorMs === null || cursorMs === undefined) return;
    const step = e.shiftKey ? 5000 : 1000;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onSeek(Math.max(0, (cursorMs as number) - step));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onSeek(Math.min(total, (cursorMs as number) + step));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onSeek(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      onSeek(total - 1);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={onSeek ? 0 : -1}
        aria-label="Track overview minimap"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={cursorMs ?? 0}
        aria-valuetext={cursorMs !== null && cursorMs !== undefined ? fmt(cursorMs) : undefined}
        onKeyDown={handleKeyDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handleTrackPointerDown}
        title={
          focused
            ? 'Minimap · click/drag to seek inside focused track · viewport is locked'
            : 'Minimap · click/drag to seek · drag viewport to pan when zoomed'
        }
        style={{
          position: 'relative',
          height: 32,
          borderRadius: 10,
          background: '#0f0f12',
          border: '1px solid rgba(255,255,255,0.08)',
          overflow: 'hidden',
          cursor: onSeek ? 'pointer' : 'default',
          display: 'flex',
          outline: 'none',
        }}
      >
        {splitPoints.slice(0, -1).map((s, i) => {
          const e = splitPoints[i + 1]!;
          const wPct = ((e - s) / total) * 100;
          const isFocused = focused && i === focusedIndex;
          const bg = isFocused
            ? 'linear-gradient(135deg, #7c5cff, #5b3bff)'
            : i % 2 === 0
              ? 'rgba(124,92,255,0.20)'
              : 'rgba(0,212,255,0.14)';
          return (
            <div
              key={i}
              title={`${fmt(s)} → ${fmt(e)} · track ${i + 1}${isFocused ? ' (focused)' : ''}`}
              style={{
                width: `${wPct}%`,
                background: bg,
                borderRight: i < trackCount - 1 ? '1px solid rgba(0,0,0,0.35)' : undefined,
                opacity: focused && !isFocused ? 0.45 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 700,
                color: isFocused ? 'white' : 'rgba(255,255,255,0.7)',
                minWidth: 2,
                flexShrink: 0,
                position: 'relative',
              }}
            >
              {wPct > 6 ? String(i + 1) : wPct > 2.5 ? '·' : ''}
              {isFocused && (
                <span
                  style={{
                    position: 'absolute',
                    inset: 0,
                    border: '2px solid rgba(255,255,255,0.85)',
                    borderRadius: 2,
                    pointerEvents: 'none',
                    boxShadow: '0 0 8px rgba(124,92,255,0.5)',
                  }}
                />
              )}
            </div>
          );
        })}
        {/* hover preview line */}
        {hoverPct !== null && hoverMs !== null && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${hoverPct}%`,
              width: 1,
              background: 'rgba(255,255,255,0.35)',
              pointerEvents: 'none',
            }}
          />
        )}
        {/* viewport rect — draggable when zoomed */}
        {viewportMs && vpLeftPct !== null && vpWidthPct !== null && (
          <div
            data-viewport
            onPointerDown={handleViewportPointerDown}
            style={{
              position: 'absolute',
              top: 2,
              bottom: 2,
              left: `${vpLeftPct}%`,
              width: `${Math.max(1.2, vpWidthPct as number)}%`,
              border: isFullView ? '1px dashed rgba(124,92,255,0.35)' : '2px solid #7c5cff',
              background: isFullView ? 'rgba(124,92,255,0.06)' : 'rgba(124,92,255,0.14)',
              borderRadius: 6,
              pointerEvents: focused || isFullView ? 'none' : 'auto',
              cursor: focused || isFullView ? 'default' : 'grab',
              boxShadow: isFullView ? 'none' : '0 1px 6px rgba(0,0,0,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={
              focused
                ? 'Focused viewport (locked)'
                : isFullView
                  ? 'Full view — zoom in to drag viewport'
                  : 'Drag to pan · click outside to seek'
            }
          >
            {!isFullView && !focused && vpWidthPct !== null && vpWidthPct > 12 && (
              <span style={{ width: 10, height: 10, borderRadius: 99, background: 'rgba(124,92,255,0.9)', boxShadow: '0 1px 4px rgba(0,0,0,0.5)', pointerEvents: 'none' }} />
            )}
          </div>
        )}
        {/* playhead */}
        {cursorPct !== null && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${Math.max(0, Math.min(100, cursorPct))}%`,
              width: 2,
              background: '#fff',
              boxShadow: '0 0 6px rgba(124,92,255,0.9), 0 0 0 1px rgba(0,0,0,0.6)',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: -1,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 8,
                height: 8,
                borderRadius: 99,
                background: '#fff',
                border: '2px solid #7c5cff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
              }}
            />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'ui-monospace, monospace', color: 'rgba(238,241,255,0.55)' }}>
        <span>
          {focused && focusedIndex !== null
            ? `Track ${focusedIndex + 1}/${trackCount} · ${fmt(splitPoints[focusedIndex] ?? 0)} → ${fmt(splitPoints[focusedIndex + 1] ?? total)}`
            : `Full track · ${trackCount} segments`}
          {viewportMs && !isFullView && ` · view ${fmt(viewportMs.left)} → ${fmt(viewportMs.right)}`}
          {isFullView && ` · full view`}
          {hoverMs !== null && <span style={{ color: 'rgba(255,255,255,0.85)', marginLeft: 6 }}>· hover {fmt(hoverMs)}</span>}
          {cursorMs !== null && cursorMs !== undefined && <span style={{ color: '#a78bfa', marginLeft: 6 }}>· cursor {fmt(cursorMs)}</span>}
        </span>
        <span>{fmt(total)} total</span>
      </div>
    </div>
  );
}

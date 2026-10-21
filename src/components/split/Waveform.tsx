import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useWaveSurfer, type WaveformHandle } from '../../hooks/useWaveSurfer';
import { useWaveformRegions } from '../../hooks/useWaveformRegions';
import { useWaveformHotkey } from '../../hooks/useWaveformHotkey';
import { WaveformMinimap } from './WaveformMinimap';
import { usePersistedState } from '../../lib/persist';
import { useSplitSync, getCurrentIndex } from './useSplitSync';
export type { WaveformHandle };
interface Props {
  audioUrl: string;
  splitPoints: number[];
  durationMs: number;
  onSplitPointsChange: (pts: number[]) => void;
  onRegionClick?: (i: number) => void;
  onAddSplit?: (posMs: number) => void;
  focusedIndex?: number | null;
  onWaveStateChange?: (
    playing: boolean,
    reason: import('../../hooks/useWaveSurfer').WaveStateReason
  ) => void;
  onReadyChange?: (ready: boolean) => void;
  onTogglePlay?: () => void;
  onSeekPause?: () => void;
  onExitFocus?: () => void;
  onCursorChange?: (ms: number | null) => void;
  onStepFocus?: (delta: 1 | -1) => void;
  // silence detect (moved from DetectControls into waveform toolbar)
  minSilenceMs?: number;
  setMinSilenceMs?: (v: number) => void;
  threshDb?: number;
  setThreshDb?: (v: number) => void;
  detecting?: boolean;
  onDetect?: () => void;
}
export const Waveform = forwardRef<WaveformHandle, Props>(function Waveform(
  {
    audioUrl,
    splitPoints,
    durationMs,
    onSplitPointsChange,
    onRegionClick,
    onAddSplit,
    focusedIndex,
    onWaveStateChange,
    onReadyChange,
    onTogglePlay,
    onSeekPause,
    onExitFocus,
    onCursorChange,
    onStepFocus,
    minSilenceMs,
    setMinSilenceMs,
    threshDb,
    setThreshDb,
    detecting,
    onDetect,
  }: Props,
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);

  const isFocused = focusedIndex !== null && focusedIndex !== undefined;
  const focusStart = isFocused ? (splitPoints[focusedIndex as number] ?? 0) : 0;
  const focusEnd = isFocused
    ? (splitPoints[(focusedIndex as number) + 1] ?? durationMs)
    : durationMs;
  const isolatedDuration = isFocused ? Math.max(200, focusEnd - focusStart) : durationMs;
  // Memoized: useWaveformRegions rebuilds every region when this identity changes,
  // and Waveform re-renders on each audioprocess tick.
  const isolatedSplitPoints = useMemo(
    () =>
      isFocused
        ? splitPoints.filter(p => p >= focusStart && p <= focusEnd).map(p => p - focusStart)
        : splitPoints,
    [isFocused, splitPoints, focusStart, focusEnd]
  );
  const isolatedAudioUrl = isFocused
    ? `${audioUrl}${audioUrl.includes('?') ? '&' : '?'}start_ms=${focusStart}&end_ms=${focusEnd}`
    : audioUrl;

  // map isolated split changes back to global coordinates
  const handleIsolatedSplitChange = useCallback(
    (pts: number[]) => {
      if (!isFocused) {
        onSplitPointsChange(pts);
        return;
      }
      const before = splitPoints.filter(p => p < focusStart);
      const after = splitPoints.filter(p => p > focusEnd);
      const mapped = pts.map(p => focusStart + p);
      // dedupe + sort (pts already includes 0 and isolatedDuration which map to s/e)
      const merged = [...before, ...mapped, ...after];
      const uniq = [...new Set(merged)].sort((a, b) => a - b);
      onSplitPointsChange(uniq);
    },
    [isFocused, focusStart, focusEnd, splitPoints, onSplitPointsChange]
  );

  const handleIsolatedRegionClick = useCallback(
    (idx: number) => {
      if (!onRegionClick) return;
      if (!isFocused) onRegionClick(idx);
      else onRegionClick((focusedIndex as number) + idx);
    },
    [isFocused, focusedIndex, onRegionClick]
  );

  const handleIsolatedAddSplit = useCallback(
    (posMs: number) => {
      if (!onAddSplit) return;
      if (!isFocused) onAddSplit(posMs);
      else onAddSplit(focusStart + posMs);
    },
    [isFocused, focusStart, onAddSplit]
  );

  const innerWaveRef = useRef<WaveformHandle>(null);
  const {
    wsRef,
    regionsRef,
    ready,
    error,
    loadingPct,
    playing,
    zoom,
    cursorMs,
    setCursorMs,
    applyZoom,
    autoScroll,
    setAutoScroll,
  } = useWaveSurfer({
    audioUrl: isolatedAudioUrl,
    containerRef,
    durationMs: isolatedDuration,
    ref: innerWaveRef as React.Ref<WaveformHandle>,
    onStateChange: onWaveStateChange,
    onReadyChange,
  });

  // persist follow toggle if not hard
  const [persistedFollow] = usePersistedState<boolean>('split:autoScroll', true);
  useEffect(() => {
    // restore persisted on mount
    setAutoScroll(persistedFollow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('split:autoScroll', JSON.stringify(autoScroll));
    } catch {}
  }, [autoScroll]);

  // centralized seek/step/ensureVisible — re-enables follow on any programmatic seek
  const sync = useSplitSync({
    splitPoints,
    durationMs,
    wsRef: wsRef as unknown as React.RefObject<import('wavesurfer.js').default | null>,
    containerRef,
    zoom: zoom || 1,
    cursorMs: isFocused && cursorMs !== null ? focusStart + cursorMs : cursorMs,
    setCursorMs: (v: number | null) => {
      if (v === null) setCursorMs(null);
      else if (isFocused) setCursorMs(Math.max(0, Math.min(isolatedDuration, v - focusStart)));
      else setCursorMs(v);
    },
    autoScroll,
    setAutoScroll,
    onSeekPause,
    isolated: { focusStart, isolatedDuration, isFocused },
  });

  useEffect(() => {
    if (!onCursorChange) return;
    const abs = cursorMs === null ? null : isFocused ? focusStart + cursorMs : cursorMs;
    onCursorChange(abs);
  }, [cursorMs, isFocused, focusStart, onCursorChange]);

  // Expose a translated handle: callers (SegmentList) pass global ms, but isolated waveform uses 0..isolatedDuration
  useImperativeHandle(
    ref,
    () => ({
      playFrom: (startMs: number, endMs?: number) => {
        const h = innerWaveRef.current;
        if (!h) return Promise.resolve(false);
        if (isFocused) {
          const s = Math.max(0, Math.min(isolatedDuration, startMs - focusStart));
          const e =
            endMs !== undefined
              ? Math.max(0, Math.min(isolatedDuration, endMs - focusStart))
              : undefined;
          return h.playFrom(s, e);
        }
        return h.playFrom(startMs, endMs);
      },
      pause: () => innerWaveRef.current?.pause(),
      stop: () => innerWaveRef.current?.stop(),
      zoomTo: (s: number, e: number) => {
        const h = innerWaveRef.current;
        if (!h) return;
        if (isFocused)
          h.zoomTo(Math.max(0, s - focusStart), Math.min(isolatedDuration, e - focusStart));
        else h.zoomTo(s, e);
      },
      resetZoom: () => innerWaveRef.current?.resetZoom(),
      getCursorMs: () => {
        const c = innerWaveRef.current?.getCursorMs() ?? null;
        if (c === null) return null;
        return isFocused ? focusStart + c : c;
      },
      isReady: () => !!innerWaveRef.current?.isReady(),
      isPlaying: () => !!innerWaveRef.current?.isPlaying(),
    }),
    [isFocused, focusStart, isolatedDuration]
  );

  // in isolated mode the waveform itself is not "focused" — it's a single-segment view
  useWaveformRegions({
    wsRef,
    regionsRef,
    splitPoints: isolatedSplitPoints,
    durationMs: isolatedDuration,
    ready,
    focusedIndex: null,
    onSplitPointsChange: handleIsolatedSplitChange,
    onRegionClick: handleIsolatedRegionClick,
  });
  useWaveformHotkey({
    onAddSplit: handleIsolatedAddSplit,
    cursorMs,
    ready,
    focusedIndex: null,
    durationMs: isolatedDuration,
    splitPoints: isolatedSplitPoints,
  });
  useEffect(() => {
    if (wsRef.current) (wsRef.current as unknown as { _focused?: boolean })._focused = isFocused;
  }, [isFocused, wsRef]);

  const [viewportMs, setViewportMs] = useState<{ left: number; right: number } | null>(null);
  const lastHoverLogAt = useRef(0);
  // refs for auto-disable check inside scroll handler (avoid stale closure)
  const autoScrollRef = useRef(autoScroll);
  useEffect(() => {
    autoScrollRef.current = autoScroll;
  }, [autoScroll]);
  const cursorMsRefForFollow = useRef(cursorMs);
  useEffect(() => {
    cursorMsRefForFollow.current = cursorMs;
  }, [cursorMs]);
  // minimap is now focused-aware: when isolated, viewport is the visible window
  // *inside* the isolated track (0..isolatedDuration), not the locked global segment.
  // At 1× we show full-width viewport so minimap isn't empty.
  // NOTE: WaveSurfer renders inside a shadowRoot (.scroll element), so containerRef
  // light-DOM querySelector never sees the real scroll container. Use WaveSurfer's
  // scroll API (getScroll/setScroll + 'scroll' event) plus shadowRoot fallback.
  useEffect(() => {
    if (!ready) return;
    const activeTotal = isFocused ? isolatedDuration : durationMs;
    if (activeTotal <= 0) {
      setViewportMs(null);
      return;
    }
    const el = containerRef.current;
    const ws = wsRef.current as unknown as {
      getScroll?: () => number;
      on?: (ev: string, cb: (...a: unknown[]) => void) => () => void;
    } | null;
    if (!el || !ws) return;

    const getScrollLeft = (fallback?: number) => {
      if (fallback !== undefined && Number.isFinite(fallback)) return fallback;
      try {
        const v = ws.getScroll?.();
        if (Number.isFinite(v)) return v as number;
      } catch {}
      // shadowRoot fallback - query fresh each time (shadow attaches async)
      try {
        const sr = (el as unknown as { shadowRoot?: ShadowRoot }).shadowRoot;
        const sc = sr?.querySelector('.scroll') as HTMLElement | null;
        if (sc) return sc.scrollLeft;
      } catch {}
      return 0;
    };

    let disableTimer: number | null = null;
    const scheduleDisableIfOutside = (left: number, right: number) => {
      if (!autoScrollRef.current) return;
      const cur = cursorMsRefForFollow.current;
      if (cur === null) return;
      const outside = cur < left || cur > right;
      if (!outside) {
        if (disableTimer !== null) {
          clearTimeout(disableTimer);
          disableTimer = null;
        }
        return;
      }
      if (disableTimer !== null) return; // already scheduled
      disableTimer = window.setTimeout(() => {
        disableTimer = null;
        // re-check still outside (autoScroll may have caught up via playback)
        const c = cursorMsRefForFollow.current;
        if (c === null || !autoScrollRef.current) return;
        // need current viewport - use latest computed left/right via closure would be stale,
        // so check via fresh getScrollLeft
        try {
          const z = (ws as unknown as { options?: { minPxPerSec?: number } }) ? zoom || 1 : 1;
          if (z <= 1) return;
          const sl = getScrollLeft();
          const w = el.clientWidth || 1;
          const l = Math.max(0, Math.round((sl / z) * 1000));
          const r = Math.min(activeTotal, Math.round(((sl + w) / z) * 1000));
          if (c < l || c > r) setAutoScroll(false);
        } catch {
          setAutoScroll(false);
        }
      }, 150);
    };

    const update = (scrollLeftOverride?: number) => {
      const z = zoom || 1;
      if (z <= 1) {
        setViewportMs({ left: 0, right: activeTotal });
        if (disableTimer !== null) {
          clearTimeout(disableTimer);
          disableTimer = null;
        }
        return;
      }
      const scrollLeft = getScrollLeft(scrollLeftOverride);
      const w = el.clientWidth || 1;
      const left = Math.max(0, Math.round((scrollLeft / z) * 1000));
      const right = Math.min(activeTotal, Math.round(((scrollLeft + w) / z) * 1000));
      setViewportMs({ left, right });
      scheduleDisableIfOutside(left, right);
    };

    update();
    // WaveSurfer emits 'scroll' with (startX,endX,scrollLeft,scrollRight) on every scroll
    let unsub: (() => void) | undefined;
    try {
      unsub = (
        ws as unknown as { on?: (ev: string, fn: (...a: unknown[]) => void) => () => void }
      ).on?.('scroll', (...a: unknown[]) => update((a[2] as number | undefined) ?? 0));
    } catch {}

    // also listen directly to the shadow .scroll element for drag/scroll that doesn't emit
    // shadow attaches async, so retry query + attach via interval/MutationObserver
    let shadowScrollEl: HTMLElement | null = null;
    const attachShadowScroll = () => {
      try {
        const sr = (el as unknown as { shadowRoot?: ShadowRoot }).shadowRoot;
        const sc = sr?.querySelector('.scroll') as HTMLElement | null;
        if (sc && sc !== shadowScrollEl) {
          if (shadowScrollEl) shadowScrollEl.removeEventListener('scroll', onShadowScroll);
          shadowScrollEl = sc;
          shadowScrollEl.addEventListener('scroll', onShadowScroll, { passive: true });
        }
      } catch {}
    };
    const onShadowScroll = () => update(shadowScrollEl?.scrollLeft);
    attachShadowScroll();
    const shadowAttachInterval = window.setInterval(attachShadowScroll, 500);

    // fallback light-DOM listeners (older WaveSurfer or before shadow attaches)
    const onElScroll = () => update();
    el.addEventListener('scroll', onElScroll, { passive: true });
    window.addEventListener('resize', onElScroll);
    const id = requestAnimationFrame(() => update());
    // polling fallback ensures manual scroll is detected even if events missed
    const pollId = window.setInterval(() => update(), 200);

    return () => {
      try {
        unsub?.();
      } catch {}
      if (shadowScrollEl) shadowScrollEl.removeEventListener('scroll', onShadowScroll);
      el.removeEventListener('scroll', onElScroll);
      window.removeEventListener('resize', onElScroll);
      cancelAnimationFrame(id);
      clearInterval(shadowAttachInterval);
      clearInterval(pollId);
      if (disableTimer !== null) clearTimeout(disableTimer);
    };
  }, [ready, zoom, durationMs, isolatedDuration, isFocused]);

  const handleMinimapSeek = useCallback(
    (ms: number) => {
      if (!ready) return;
      // minimap is focused-aware: when isolated, ms is 0..isolatedDuration -> convert to global
      const globalMs = isFocused ? focusStart + ms : ms;
      sync.seekTo(globalMs, { follow: true });
    },
    [ready, isFocused, focusStart, sync]
  );

  const handleMinimapPan = useCallback(
    (leftMs: number) => {
      if (!ready) return;
      const el = containerRef.current;
      const ws = wsRef.current as unknown as { setScroll?: (px: number) => void } | null;
      if (!el) return;
      const z = zoom || 1;
      if (z <= 1) return;
      // leftMs is in minimap's duration coords (isolated when focused)
      const globalLeft = isFocused ? focusStart + leftMs : leftMs;
      // clamp and scroll to globalLeft (sync ensures follow handling)
      const activeTotal = isFocused ? isolatedDuration : durationMs;
      const maxLeft = Math.max(0, activeTotal - Math.round((el.clientWidth / z) * 1000));
      const clampedLocal = Math.max(0, Math.min(maxLeft, Math.round(leftMs)));
      const target = (clampedLocal / 1000) * z;
      try {
        if (ws?.setScroll) {
          ws.setScroll(target);
          return;
        }
      } catch {}
      try {
        const sr = (el as unknown as { shadowRoot?: ShadowRoot }).shadowRoot;
        const sc = sr?.querySelector('.scroll') as HTMLElement | null;
        if (sc) {
          sc.scrollLeft = target;
          return;
        }
      } catch {}
      const scrollEl = (el.querySelector('div') as HTMLElement | null) ?? el;
      scrollEl.scrollLeft = target;
      if (scrollEl !== el) el.scrollLeft = target;
      // pan is user manual scroll; don't re-enable follow - let disable timer handle
      void globalLeft;
    },
    [ready, zoom, durationMs, isolatedDuration, isFocused, focusStart]
  );

  // absolute cursor for minimap playhead (focused cursor is track-relative)
  const absCursorMs = (() => {
    if (cursorMs === null) return null;
    if (isFocused) return focusStart + cursorMs;
    return cursorMs;
  })();

  // Ctrl/Cmd + wheel to zoom — enabled even in focus now that waveform is isolated
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
    const activeDur = isolatedDuration;
    if (cursorMs <= 350 || cursorMs >= activeDur - 350) return false;
    const g = isFocused ? focusStart + cursorMs : cursorMs;
    return splitPoints.every(p => Math.abs(p - g) > 350);
  })();
  const showLoading = !ready && !error;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {isFocused && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            borderRadius: 8,
            background: 'rgba(124,92,255,0.12)',
            border: '1px solid rgba(124,92,255,0.25)',
            fontSize: 11,
            color: '#e4e4e7',
          }}
        >
          <span style={{ fontWeight: 700, color: '#a78bfa' }}>Isolated</span>
          <span>
            Track {(focusedIndex as number) + 1} · {fmt(focusStart)} → {fmt(focusEnd)} ·{' '}
            {fmt(isolatedDuration)} only — other tracks hidden
          </span>
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 10 }}>
            Esc to exit
          </span>
        </div>
      )}
      <div style={{ position: 'relative', width: '100%' }}>
        <div
          ref={containerRef}
          onMouseMove={e => {
            if (!ready) {
              return;
            }
            const activeDur = isolatedDuration;
            const host = e.currentTarget as HTMLDivElement;
            // Use the rendered waveform's actual width. At fit-to-width, the
            // effective pixels-per-second differs from the zoom state (often 1).
            const wrapper = wsRef.current?.getWrapper();
            const rect = wrapper?.getBoundingClientRect() ?? host.getBoundingClientRect();
            // WaveSurfer computes click time from this exact bounding rect and width.
            const width = rect.width;
            const ratio = width > 0 ? (e.clientX - rect.left) / width : 0;
            const ms = Math.max(0, Math.min(activeDur, Math.round(ratio * activeDur)));
            const now = performance.now();
            if (now - lastHoverLogAt.current >= 500) {
              lastHoverLogAt.current = now;
              console.debug('[split-waveform] hover geometry', {
                isolated: isFocused,
                ready,
                clientX: e.clientX,
                hostRect: (() => {
                  const r = host.getBoundingClientRect();
                  return { left: r.left, width: r.width };
                })(),
                wrapperRect: { left: rect.left, width: rect.width },
                wrapperOffsetWidth: wrapper?.offsetWidth ?? null,
                scrollLeft: wsRef.current?.getScroll() ?? null,
                activeDurationMs: activeDur,
                zoom,
                ratio,
                hoverMs: ms,
              });
            }
          }}
          style={{
            width: '100%',
            minHeight: 110,
            borderRadius: 12,
            overflow: 'auto hidden',
            background: '#18181b',
            cursor: showLoading ? 'wait' : 'pointer',
            opacity: showLoading ? 0.0 : 1,
            transition: 'opacity 0.25s ease',
          }}
        />
        {showLoading && (
          <div className="wave-loading-wrap" aria-busy="true" aria-label="Generating waveform">
            <div className="wave-loading-shimmer" />
            <div className="wave-loading-bars" aria-hidden="true">
              {Array.from({ length: 48 }).map((_, i) => {
                const h = 18 + Math.abs(Math.sin(i * 0.9 + 1) * 52) + (i % 3) * 6;
                return (
                  <div
                    key={i}
                    className="wave-loading-bar"
                    style={{
                      height: h,
                      animationDelay: `${(i % 8) * 0.08}s`,
                      opacity: 0.9 - (i % 5) * 0.08,
                    }}
                  />
                );
              })}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                position: 'relative',
                zIndex: 1,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  border: '2px solid rgba(124,92,255,0.3)',
                  borderTopColor: '#7c5cff',
                  display: 'inline-block',
                  animation: 'wave-spin 0.7s linear infinite',
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#e4e4e7',
                  fontFamily: 'ui-monospace, monospace',
                }}
              >
                Generating waveform… {loadingPct > 0 ? `${loadingPct}%` : ''}
              </span>
              <span className="muted" style={{ fontSize: 11, marginLeft: 'auto' }}>
                {isFocused
                  ? `${fmt(isolatedDuration)} isolated`
                  : durationMs
                    ? `${Math.round(durationMs / 1000)}s`
                    : ''}
              </span>
            </div>
            <div className="wave-loading-progress" aria-hidden="true">
              <div
                className="wave-loading-progress-fill"
                style={{ width: `${Math.max(6, loadingPct)}%` }}
              />
            </div>
          </div>
        )}
      </div>
      {ready ? (
        <WaveformMinimap
          durationMs={isFocused ? isolatedDuration : durationMs}
          splitPoints={isFocused ? isolatedSplitPoints : splitPoints}
          focusedIndex={null}
          viewportMs={viewportMs}
          cursorMs={isFocused ? cursorMs : absCursorMs}
          onSeek={handleMinimapSeek}
          onPan={handleMinimapPan}
        />
      ) : !error ? (
        <div
          style={{
            height: 32,
            borderRadius: 10,
            background: '#0f0f12',
            border: '1px solid rgba(255,255,255,0.08)',
            overflow: 'hidden',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 0,
            padding: 4,
          }}
          aria-busy="true"
        >
          <div className="wave-loading-shimmer" style={{ borderRadius: 10 }} />
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 18,
                margin: '0 3px',
                borderRadius: 6,
                background: i === 0 ? 'rgba(124,92,255,0.18)' : 'rgba(255,255,255,0.06)',
                animation: 'wave-pulse 1.1s ease-in-out infinite',
                animationDelay: `${i * 0.12}s`,
              }}
            />
          ))}
        </div>
      ) : null}
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
        {(() => {
          const trackCount = Math.max(0, splitPoints.length - 1);
          const globalCursor = (() => {
            if (isFocused) {
              if (cursorMs !== null) return focusStart + cursorMs;
              try {
                return focusStart + Math.round((wsRef.current?.getCurrentTime() ?? 0) * 1000);
              } catch {
                return focusStart;
              }
            }
            if (cursorMs !== null) return cursorMs;
            try {
              return Math.round((wsRef.current?.getCurrentTime() ?? 0) * 1000);
            } catch {
              return splitPoints[0] ?? 0;
            }
          })();
          const curIdx = getCurrentIndex(splitPoints, globalCursor, durationMs);
          const atFirst = curIdx === 0;
          const atLast = curIdx === trackCount - 1;
          const multi = trackCount > 1;
          if (multi) {
            const handlePrev = () => {
              if (!ready) return;
              if (isFocused && onStepFocus) {
                onStepFocus(-1);
                return;
              }
              sync.step(-1);
            };
            const handleNext = () => {
              if (!ready) return;
              if (isFocused && onStepFocus) {
                onStepFocus(1);
                return;
              }
              sync.step(1);
            };
            const disablePrev = !ready || (!isFocused && atFirst && globalCursor - (splitPoints[curIdx] ?? 0) <= 700);
            const disableNext = !ready || (!isFocused && atLast);
            return (
              <>
                <button
                  onClick={handlePrev}
                  disabled={disablePrev}
                  className="btn"
                  aria-label="Previous segment"
                  title="Previous segment"
                  style={{ padding: '6px 10px', fontSize: 12 }}
                >
                  ◀
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
                  aria-label={playing ? 'Pause' : 'Play'}
                  title={playing ? 'Pause' : 'Play'}
                  style={{ padding: '6px 14px', fontSize: 12 }}
                >
                  {playing ? '⏸' : '▶'}
                </button>
                <button
                  onClick={handleNext}
                  disabled={disableNext}
                  className="btn"
                  aria-label="Next segment"
                  title="Next segment"
                  style={{ padding: '6px 10px', fontSize: 12 }}
                >
                  ▶
                </button>
              </>
            );
          }
          return (
            <>
              <button
                onClick={() => {
                  if (!ready) return;
                  const curGlobal = (() => {
                    if (cursorMs !== null) return isFocused ? focusStart + cursorMs : cursorMs;
                    try {
                      const c = wsRef.current?.getCurrentTime() ?? 0;
                      return isFocused ? focusStart + Math.round(c * 1000) : Math.round(c * 1000);
                    } catch {
                      return isFocused ? focusStart : 0;
                    }
                  })();
                  sync.seekTo(Math.max(0, curGlobal - 5000), { follow: true });
                }}
                disabled={!ready}
                className="btn"
                aria-label="Back 5 seconds"
                title="Back 5s"
                style={{ padding: '6px 10px', fontSize: 12 }}
              >
                ◀
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
                aria-label={playing ? 'Pause' : 'Play'}
                title={playing ? 'Pause' : 'Play'}
                style={{ padding: '6px 14px', fontSize: 12 }}
              >
                {playing ? '⏸' : '▶'}
              </button>
              <button
                onClick={() => {
                  if (!ready) return;
                  const curGlobal = (() => {
                    if (cursorMs !== null) return isFocused ? focusStart + cursorMs : cursorMs;
                    try {
                      const c = wsRef.current?.getCurrentTime() ?? 0;
                      return isFocused ? focusStart + Math.round(c * 1000) : Math.round(c * 1000);
                    } catch {
                      return isFocused ? focusStart : 0;
                    }
                  })();
                  sync.seekTo(Math.min(durationMs, curGlobal + 5000), { follow: true });
                }}
                disabled={!ready}
                className="btn"
                aria-label="Forward 5 seconds"
                title="Forward 5s"
                style={{ padding: '6px 10px', fontSize: 12 }}
              >
                ▶
              </button>
            </>
          );
        })()}
        {ready && onAddSplit && (
          <button
            disabled={!canSplit}
            onClick={() => {
              if (cursorMs === null) return;
              const g = isFocused ? focusStart + cursorMs : cursorMs;
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
            {isFocused
              ? `${isolatedSplitPoints.length - 1} in focus · ${splitPoints.length - 1} total`
              : `${splitPoints.length - 1} segments`}
          </span>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginLeft: 6,
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 2,
          }}
        >
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
            onClick={() => {
              const w = containerRef.current?.clientWidth ?? 0;
              const durSec = (isolatedDuration || durationMs) / 1000 || 1;
              const fit = w > 0 ? w / durSec : 1;
              const target = Math.max(0.05, Math.min(1, fit));
              applyZoom(target >= 1 ? 1 : target);
            }}
            disabled={!ready || zoom <= 1}
            className="btn"
            title="Reset to fit"
            style={{ padding: '4px 8px', fontSize: 11 }}
          >
            Reset
          </button>
        </div>
        <span
          className="muted"
          style={{ fontSize: 11, marginLeft: 4, display: ready ? undefined : 'none' }}
        >
          {zoom > 1 ? 'scroll →' : 'Ctrl+scroll to zoom'}
        </span>
        {onDetect && (
          <WaveformDetectSlot
            minSilenceMs={minSilenceMs ?? 700}
            setMinSilenceMs={setMinSilenceMs ?? (() => {})}
            threshDb={threshDb ?? -50}
            setThreshDb={setThreshDb ?? (() => {})}
            detecting={!!detecting}
            onDetect={onDetect}
            disabled={!ready}
          />
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
});

function WaveformDetectSlot({
  minSilenceMs,
  setMinSilenceMs,
  threshDb,
  setThreshDb,
  detecting,
  onDetect,
  disabled,
}: {
  minSilenceMs: number;
  setMinSilenceMs: (v: number) => void;
  threshDb: number;
  setThreshDb: (v: number) => void;
  detecting: boolean;
  onDetect: () => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', marginLeft: 8 }}>
      <button
        className="btn btn-primary"
        onClick={() => setOpen(v => !v)}
        disabled={disabled && !open}
        title="Auto-select via silence detection"
        aria-expanded={open}
        aria-haspopup="dialog"
        style={{ padding: '4px 10px', fontSize: 11, opacity: disabled && !open ? 0.6 : 1 }}
      >
        {detecting ? 'Detecting…' : '✨ Auto-select'}
      </button>
      {open && (
        <div
          className="glass"
          role="dialog"
          aria-label="Auto-select settings"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            right: 0,
            padding: 12,
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            minWidth: 240,
            zIndex: 5,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700 }}>Auto-select</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Min silence
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="number"
                  value={minSilenceMs}
                  onChange={e => setMinSilenceMs(Number(e.target.value) || 0)}
                  style={{ flex: 1, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.06)', color: 'var(--text)', fontSize: 12 }}
                />
                <span style={{ fontSize: 11, textTransform: 'none', fontWeight: 400 }}>ms</span>
              </span>
            </label>
            <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Thresh
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="number"
                  value={threshDb}
                  onChange={e => setThreshDb(Number(e.target.value) || 0)}
                  style={{ flex: 1, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.06)', color: 'var(--text)', fontSize: 12 }}
                />
                <span style={{ fontSize: 11, textTransform: 'none', fontWeight: 400 }}>dB</span>
              </span>
            </label>
          </div>
          <span className="muted" style={{ fontSize: 10, lineHeight: 1.4 }}>Detects silences to create splits. Drag red markers to fine-tune.</span>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setOpen(false)} style={{ padding: '6px 12px', fontSize: 11 }}>
              Close
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setOpen(false);
                onDetect();
              }}
              disabled={disabled || detecting}
              style={{ padding: '6px 12px', fontSize: 11 }}
            >
              {detecting ? 'Detecting…' : 'Run auto-select'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

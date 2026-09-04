import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';

export type WaveStateReason = 'play' | 'pause' | 'finish' | 'stopAt' | 'seek' | 'stop';
export interface WaveformHandle {
  playFrom(startMs: number, endMs?: number): Promise<boolean>;
  pause(): void;
  stop(): void;
  zoomTo(startMs: number, endMs: number): void;
  resetZoom(): void;
  getCursorMs(): number | null;
  isReady(): boolean;
  isPlaying(): boolean;
}
export function useWaveSurfer({
  audioUrl,
  containerRef,
  durationMs,
  ref,
  onStateChange,
  onReadyChange,
}: {
  audioUrl: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  durationMs: number;
  ref?: React.Ref<WaveformHandle>;
  onStateChange?: (playing: boolean, reason: WaveStateReason) => void;
  onReadyChange?: (ready: boolean) => void;
}) {
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingPct, setLoadingPct] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [cursorMs, setCursorMs] = useState<number | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const cursorMsRef = useRef<number | null>(null);
  cursorMsRef.current = cursorMs;
  const stopAtRef = useRef<number | null>(null);
  const pendingPlayRef = useRef<{ startMs: number; endMs?: number } | null>(null);

  const onAudioProcess = useCallback(
    (currentTimeSec: number) => {
      if (stopAtRef.current !== null && currentTimeSec >= stopAtRef.current) {
        wsRef.current?.pause();
        stopAtRef.current = null;
        onStateChange?.(false, 'stopAt');
      }
      if (cursorMsRef.current !== null || wsRef.current?.isPlaying())
        setCursorMs(Math.round(currentTimeSec * 1000));
    },
    [onStateChange]
  );

  const applyZoom = useCallback((pxPerSec: number) => {
    const ws = wsRef.current;
    if (!ws) return;
    try {
      const c = Math.max(0.05, pxPerSec);
      ws.zoom(c);
      setZoom(c);
      // when going back to ~1× fit, reset scroll to start so waveform actually fits
      if (c <= 1) {
        const resetScroll = () => {
          try {
            (ws as unknown as { setScroll: (px: number) => void }).setScroll(0);
          } catch {}
          try {
            const host = containerRef.current as unknown as { shadowRoot?: ShadowRoot } | null;
            const sc = host?.shadowRoot?.querySelector('.scroll') as HTMLElement | null;
            if (sc) sc.scrollLeft = 0;
            else if (containerRef.current) containerRef.current.scrollLeft = 0;
          } catch {}
        };
        resetScroll();
        // WaveSurfer's reRender is async and may restore scrollLeft; force again
        requestAnimationFrame(() => {
          resetScroll();
          requestAnimationFrame(resetScroll);
        });
        setTimeout(resetScroll, 60);
        setTimeout(resetScroll, 180);
        try {
          const onRedraw = () => {
            try { (ws as unknown as { un: (e: string, cb: unknown) => void }).un('redraw', onRedraw); } catch {}
            resetScroll();
          };
          (ws as unknown as { on: (e: string, cb: unknown) => void }).on('redraw', onRedraw);
        } catch {}
      }
    } catch (err) {
      console.warn('[Waveform] zoom ignored', err);
    }
  }, []);
  const computeZoomForWindow = useCallback(
    (startMs: number, endMs: number): number => {
      const w = (containerRef.current?.clientWidth ?? 800) - 16;
      const segDurSec = (endMs - startMs) / 1000;
      if (segDurSec <= 0) return 1;
      return Math.max(20, Math.min(800, Math.round(w / segDurSec)));
    },
    [containerRef]
  );

  useImperativeHandle(
    ref,
    () => ({
      async playFrom(startMs: number, endMs?: number): Promise<boolean> {
        console.log('[useWaveSurfer] inner playFrom', { startMs, endMs, ready, zoom, dur: (() => { try { return wsRef.current?.getDuration(); } catch { return 'err'; } })(), durationMs });
        const ws = wsRef.current;
        if (!ws) return false;
        if (!ready) {
          pendingPlayRef.current = endMs !== undefined ? { startMs, endMs } : { startMs };
          return false;
        }
        try {
          stopAtRef.current = endMs !== undefined ? endMs / 1000 : null;
          ws.pause();
          const dur = ws.getDuration() || durationMs / 1000 || 1;
          ws.seekTo(startMs / 1000 / dur);
          setCursorMs(startMs);
          // make segment visible when zoomed — scroll minimap window to start
          try {
            const z = zoom || 1;
            if (z > 1) {
              const target = (startMs / 1000) * z;
              (ws as unknown as { setScroll: (px: number) => void }).setScroll(target);
              try {
                const host = containerRef.current as unknown as { shadowRoot?: ShadowRoot } | null;
                const sc = host?.shadowRoot?.querySelector('.scroll') as HTMLElement | null;
                if (sc) sc.scrollLeft = target;
              } catch {}
            }
          } catch {}
          const p = ws.play();
          if (p && typeof (p as Promise<void>).catch === 'function')
            await (p as Promise<void>).catch(err => {
              if (err instanceof Error && err.name === 'AbortError') return;
              throw err;
            });
          return true;
        } catch (err) {
          console.error('[Waveform] playFrom', err);
          return false;
        }
      },
      pause() {
        stopAtRef.current = null;
        pendingPlayRef.current = null;
        try {
          wsRef.current?.pause();
        } catch {}
      },
      stop() {
        stopAtRef.current = null;
        pendingPlayRef.current = null;
        try {
          wsRef.current?.pause();
          wsRef.current?.seekTo(0);
        } catch {}
        setCursorMs(0);
        onStateChange?.(false, 'stop');
      },
      zoomTo(startMs: number, endMs: number) {
        const ws = wsRef.current;
        if (!ws || !ready) return;
        try {
          const z = computeZoomForWindow(startMs, endMs);
          applyZoom(z);
          const dur = ws.getDuration() || durationMs / 1000 || 1;
          ws.seekTo(startMs / 1000 / dur);
          setCursorMs(startMs);
          const container = containerRef.current;
          if (container) {
            // ws.zoom triggers async redraw; double rAF + fallback redraw listener
            const doScroll = () => {
              try {
                const wrapper = container.querySelector('div') as HTMLElement | null;
                const scrollEl = wrapper ?? container;
                const target = Math.round((startMs / 1000) * z);
                const maxScroll = scrollEl.scrollWidth - scrollEl.clientWidth;
                scrollEl.scrollLeft = Math.max(0, Math.min(maxScroll, target));
              } catch {}
            };
            const onRedraw = () => {
              try { ws.un('redraw' as unknown as Parameters<typeof ws.on>[0], onRedraw as unknown as Parameters<typeof ws.on>[1]); } catch {}
              requestAnimationFrame(doScroll);
            };
            try { ws.on('redraw' as unknown as Parameters<typeof ws.on>[0], onRedraw as unknown as Parameters<typeof ws.on>[1]); } catch {}
            requestAnimationFrame(() => requestAnimationFrame(doScroll));
            setTimeout(doScroll, 120);
          }
        } catch {}
      },
      resetZoom() {
        if (!ready) return;
        // fit-to-width, not hardcoded 1px/sec (which stays scrollable for long files)
        const w = containerRef.current?.clientWidth ?? 0;
        const durSec = durationMs / 1000 || 1;
        const fit = w > 0 ? w / durSec : 1;
        // WaveSurfer uses fillParent when minPxPerSec is very small; use fit clamped to at least 0.05
        const target = Math.max(0.05, Math.min(1, fit));
        // if fit >=1, true 1× is already fit; otherwise use fit to actually fit
        applyZoom(target >= 1 ? 1 : target);
      },
      getCursorMs() {
        if (cursorMsRef.current !== null) return cursorMsRef.current;
        try {
          return Math.round((wsRef.current?.getCurrentTime() ?? 0) * 1000);
        } catch {
          return null;
        }
      },
      isReady() {
        return ready;
      },
      isPlaying() {
        try {
          return !!wsRef.current?.isPlaying();
        } catch {
          return false;
        }
      },
    }),
    [durationMs, applyZoom, computeZoomForWindow, ready, onStateChange, zoom]
  );

  useEffect(() => {
    if (!containerRef.current) return;
    setPlaying(false);
    setReady(false);
    onReadyChange?.(false);
    setCursorMs(null);
    stopAtRef.current = null;
    pendingPlayRef.current = null;
    onStateChange?.(false, 'stop');
    const regions = RegionsPlugin.create();
    regionsRef.current = regions;
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#a1a1aa',
      progressColor: '#7c5cff',
      height: 110,
      normalize: false,
      autoScroll,
      autoCenter: false,
      plugins: [regions],
    } as any);
    setError(null);
    setLoadingPct(5);
    ws.on('loading', (pct: number) => {
      setLoadingPct(Math.round(pct));
    });
    ws.load(audioUrl).catch((err: unknown) => {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
    });
    ws.on('ready', () => {
      setLoadingPct(100);
      setReady(true);
      onReadyChange?.(true);
      setError(null);
      if (pendingPlayRef.current) {
        const { startMs, endMs } = pendingPlayRef.current;
        pendingPlayRef.current = null;
        try {
          stopAtRef.current = endMs !== undefined ? endMs / 1000 : null;
          const dur = ws.getDuration() || durationMs / 1000 || 1;
          ws.seekTo(startMs / 1000 / dur);
          setCursorMs(startMs);
          const p = ws.play();
          if (p && typeof (p as Promise<void>).catch === 'function')
            (p as Promise<void>).catch(err => {
              if (err instanceof Error && err.name === 'AbortError') return;
              onStateChange?.(false, 'pause');
            });
        } catch {}
      }
    });
    ws.on('error', (err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    ws.on('play', () => {
      setPlaying(true);
      onStateChange?.(true, 'play');
    });
    ws.on('pause', () => {
      setPlaying(false);
      onStateChange?.(false, 'pause');
    });
    ws.on('finish', () => {
      setPlaying(false);
      stopAtRef.current = null;
      onStateChange?.(false, 'finish');
    });
    ws.on('audioprocess', onAudioProcess);
    ws.on('timeupdate', onAudioProcess);
    const containerEl = containerRef.current as HTMLElement | null;
    const onPointerDown = (e: PointerEvent) => {
      (ws as unknown as { _pointerDownTarget?: EventTarget | null })._pointerDownTarget = e.target;
    };
    containerEl?.addEventListener('pointerdown', onPointerDown);
    ws.on('interaction', (newTimeSec: number) => {
      if ((ws as unknown as { _regionClickBlocked?: boolean })._regionClickBlocked) {
        (ws as unknown as { _regionClickBlocked?: boolean })._regionClickBlocked = false;
        return;
      }
      const target = (ws as unknown as { _pointerDownTarget?: EventTarget | null })
        ._pointerDownTarget as HTMLElement | null;
      if (target?.closest?.('[data-marker="true"]')) return;
      const ms = Math.round(newTimeSec * 1000);
      try {
        ws.seekTo(newTimeSec / (ws.getDuration() || 1));
        ws.pause();
        stopAtRef.current = null;
        pendingPlayRef.current = null;
        setCursorMs(ms);
        onStateChange?.(false, 'seek');
      } catch {}
    });
    wsRef.current = ws;
    return () => {
      containerEl?.removeEventListener('pointerdown', onPointerDown);
      ws.destroy();
      setPlaying(false);
      setReady(false);
      onReadyChange?.(false);
    };
  }, [audioUrl, containerRef, durationMs, onReadyChange, onStateChange, onAudioProcess]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    ws.un('audioprocess', onAudioProcess);
    ws.on('audioprocess', onAudioProcess);
  }, [onAudioProcess]);
  useEffect(() => {
    wsRef.current?.setOptions({ autoScroll } as unknown as Record<string, unknown>);
  }, [autoScroll]);
  return {
    wsRef,
    regionsRef,
    ready,
    error,
    loadingPct,
    playing,
    zoom,
    cursorMs,
    setCursorMs,
    cursorMsRef,
    stopAtRef,
    applyZoom,
    computeZoomForWindow,
    setReady,
    autoScroll,
    setAutoScroll,
  };
}

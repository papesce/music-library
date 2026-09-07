import { useCallback, useRef, useEffect } from 'react';
import type WaveSurfer from 'wavesurfer.js';

/**
 * Centralized sync for split editor.
 * Owns: cursor -> activeIndex, seek/step/ensureVisible, follow re-enable.
 * All programmatic seeks go through seekTo() so viewport + follow stay consistent.
 */
export function getCurrentIndex(splitPoints: number[], cursorMs: number, durationMs: number): number {
  const n = splitPoints.length - 1;
  if (n <= 0) return 0;
  let idx = splitPoints.findIndex(
    (_, i) => i < splitPoints.length - 1 && cursorMs >= splitPoints[i]! && cursorMs < splitPoints[i + 1]!
  );
  if (idx === -1) {
    const last = splitPoints[splitPoints.length - 1] ?? durationMs;
    if (cursorMs >= last) idx = n - 1;
    else if (cursorMs < (splitPoints[0] ?? 0)) idx = 0;
    else idx = 0;
  }
  return Math.max(0, Math.min(n - 1, idx));
}

export function useSplitSync(opts: {
  splitPoints: number[];
  durationMs: number;
  wsRef: React.RefObject<WaveSurfer | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  cursorMs: number | null;
  setCursorMs: (v: number | null) => void;
  autoScroll: boolean;
  setAutoScroll: (v: boolean | ((prev: boolean) => boolean)) => void;
  onSeekPause?: () => void;
  isolated?: { focusStart: number; isolatedDuration: number; isFocused: boolean };
}) {
  const {
    splitPoints,
    durationMs,
    wsRef,
    containerRef,
    zoom,
    cursorMs,
    setCursorMs,
    autoScroll,
    setAutoScroll,
    onSeekPause,
    isolated,
  } = opts;

  const isFocused = isolated?.isFocused ?? false;
  const focusStart = isolated?.focusStart ?? 0;
  const activeDuration = isFocused ? (isolated?.isolatedDuration ?? durationMs) : durationMs;

  const autoScrollRef = useRef(autoScroll);
  useEffect(() => {
    autoScrollRef.current = autoScroll;
  }, [autoScroll]);

  const cursorMsRef = useRef(cursorMs);
  useEffect(() => {
    cursorMsRef.current = cursorMs;
  }, [cursorMs]);

  const ensureVisible = useCallback(
    (globalMs: number) => {
      const ws = wsRef.current;
      const el = containerRef.current;
      if (!ws || !el) return;
      const z = zoom || 1;
      if (z <= 1) return;
      // globalMs is absolute. In isolated mode, translate to isolated coord for scroll.
      const localMs = isFocused ? globalMs - focusStart : globalMs;
      const clampedLocal = Math.max(0, Math.min(activeDuration, localMs));
      const target = (clampedLocal / 1000) * z;
      try {
        (ws as unknown as { setScroll: (px: number) => void }).setScroll(target);
      } catch {}
      try {
        const host = el as unknown as { shadowRoot?: ShadowRoot };
        const sc = host.shadowRoot?.querySelector('.scroll') as HTMLElement | null;
        if (sc) sc.scrollLeft = target;
        else {
          const scrollEl = (el.querySelector('div') as HTMLElement | null) ?? el;
          scrollEl.scrollLeft = target;
          if (scrollEl !== el) el.scrollLeft = target;
        }
      } catch {}
    },
    [wsRef, containerRef, zoom, isFocused, focusStart, activeDuration]
  );

  const seekTo = useCallback(
    (globalMs: number, cfg?: { pause?: boolean; play?: boolean; endMs?: number; follow?: boolean }) => {
      const ws = wsRef.current;
      if (!ws) return;
      const durSec = (() => {
        try {
          const d = ws.getDuration();
          if (Number.isFinite(d) && d > 0) return d;
        } catch {}
        return (activeDuration || durationMs || 1) / 1000;
      })();
      const clampedGlobal = Math.max(0, Math.min(durationMs, globalMs));
      const localMs = isFocused ? clampedGlobal - focusStart : clampedGlobal;
      const _clampedLocal = Math.max(0, Math.min(activeDuration, localMs));
      // re-enable follow on any programmatic seek (user requested)
      if (cfg?.follow !== false) setAutoScroll(true);
      try {
        ws.seekTo(clampedGlobal !== 0 || !isFocused ? clampedGlobal / 1000 / durSec : 0);
      } catch {}
      // When isolated, WaveSurfer duration is isolatedDuration, but seekTo above used global fraction -
      // for isolated mode, ws duration is isolated, so recompute correctly:
      if (isFocused) {
        try {
          const isoDurSec = activeDuration / 1000 || 1;
          ws.seekTo(Math.max(0, Math.min(1, _clampedLocal / 1000 / isoDurSec)));
        } catch {}
      }
      if (cfg?.pause !== false) {
        try {
          ws.pause();
        } catch {}
      }
      setCursorMs(clampedGlobal);
      // force viewport to show position immediately, don't wait for polling
      ensureVisible(clampedGlobal);
      if (cfg?.pause !== false) onSeekPause?.();
    },
    [wsRef, activeDuration, durationMs, isFocused, focusStart, setCursorMs, ensureVisible, setAutoScroll, onSeekPause]
  );

  const getGlobalCursor = useCallback((): number => {
    if (cursorMsRef.current !== null) return cursorMsRef.current;
    try {
      const ws = wsRef.current;
      if (!ws) return splitPoints[0] ?? 0;
      const curSec = ws.getCurrentTime() ?? 0;
      if (isFocused) return focusStart + Math.round(curSec * 1000);
      return Math.round(curSec * 1000);
    } catch {
      return isFocused ? focusStart : (splitPoints[0] ?? 0);
    }
  }, [wsRef, splitPoints, isFocused, focusStart]);

  const seekToSegment = useCallback(
    (idx: number, cfg?: { play?: boolean; follow?: boolean }) => {
      const n = splitPoints.length - 1;
      if (n <= 0) return;
      const clamped = Math.max(0, Math.min(n - 1, idx));
      const target = splitPoints[clamped] ?? 0;
      if (cfg?.play) {
        // use playFrom via wsRef if available elsewhere; here just seek
        seekTo(target, { follow: cfg.follow });
        // caller can trigger playFrom
      } else {
        seekTo(target, { follow: cfg?.follow });
      }
    },
    [splitPoints, seekTo]
  );

  const step = useCallback(
    (delta: 1 | -1): number | null => {
      const n = splitPoints.length - 1;
      if (n <= 0) return null;
      const cur = getGlobalCursor();
      const curIdx = getCurrentIndex(splitPoints, cur, durationMs);
      const segStart = splitPoints[curIdx] ?? 0;
      let targetIdx: number;
      if (delta === -1) {
        // if >700ms inside segment, stay, else previous
        targetIdx = cur - segStart > 700 ? curIdx : Math.max(0, curIdx - 1);
      } else {
        targetIdx = Math.min(n - 1, curIdx + 1);
        // if already at last and not >700 inside, stay
        if (curIdx === n - 1 && targetIdx === curIdx) {
          // still seek to start of last (ensures visible)
        }
      }
      seekTo(splitPoints[targetIdx] ?? 0, { follow: true });
      return targetIdx;
    },
    [splitPoints, durationMs, getGlobalCursor, seekTo]
  );

  const stepFocus = useCallback(
    (delta: 1 | -1, focusedIndex: number | null, setFocusedIndex: (n: number | null) => void): number | null => {
      if (focusedIndex === null || focusedIndex === undefined) {
        // not focused -> use global step
        return step(delta);
      }
      const n = splitPoints.length - 1;
      const next = focusedIndex + delta;
      if (next < 0 || next >= n) return null;
      setFocusedIndex(next);
      // seek will happen after remount; also do immediate global seek for minimap highlight
      // The Waveform will remount with isolated audio; we also set cursor to next segment start immediately
      const targetGlobal = splitPoints[next] ?? 0;
      // Don't call ws seek now because ws will be destroyed/recreated; just update cursor + follow
      setCursorMs(targetGlobal);
      setAutoScroll(true);
      // ensureVisible will be called after new waveform mounts via effect in Waveform; but we set cursor now for list highlight
      return next;
    },
    [splitPoints, step, setCursorMs, setAutoScroll]
  );

  return { getGlobalCursor, getCurrentIndex: (cur: number) => getCurrentIndex(splitPoints, cur, durationMs), seekTo, seekToSegment, step, stepFocus, ensureVisible };
}

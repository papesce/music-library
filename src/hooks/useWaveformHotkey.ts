import { useEffect } from 'react';

export function useWaveformHotkey({
  onAddSplit,
  cursorMs,
  ready,
  focusedIndex,
  durationMs,
  splitPoints,
}: {
  onAddSplit?: (posMs: number) => void;
  cursorMs: number | null;
  ready: boolean;
  focusedIndex?: number | null;
  durationMs: number;
  splitPoints: number[];
}) {
  useEffect(() => {
    if (!onAddSplit) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code !== 'KeyS' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (cursorMs === null || !ready) return;
      const minGap = 350;
      if (cursorMs <= minGap || cursorMs >= durationMs - minGap) return;
      const isFocused = focusedIndex !== null && focusedIndex !== undefined;
      const s = isFocused ? (splitPoints[focusedIndex as number] ?? 0) : 0;
      const globalCursor = isFocused ? s + cursorMs : cursorMs;
      if (splitPoints.some(p => Math.abs(p - globalCursor) <= minGap)) return;
      e.preventDefault();
      onAddSplit(globalCursor);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onAddSplit, cursorMs, ready, focusedIndex, durationMs, splitPoints]);
}

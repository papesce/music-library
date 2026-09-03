import { useEffect, useRef } from 'react';
import type WaveSurfer from 'wavesurfer.js';
import type RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';

export function useWaveformRegions({
  wsRef,
  regionsRef,
  splitPoints,
  durationMs,
  ready,
  focusedIndex,
  onSplitPointsChange,
  onRegionClick,
}: {
  wsRef: React.RefObject<WaveSurfer | null>;
  regionsRef: React.RefObject<ReturnType<typeof RegionsPlugin.create> | null>;
  splitPoints: number[];
  durationMs: number;
  ready: boolean;
  focusedIndex: number | null | undefined;
  onSplitPointsChange: (pts: number[]) => void;
  onRegionClick?: (idx: number) => void;
}) {
  const bandRegionIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const regions = regionsRef.current;
    const ws = wsRef.current;
    if (!regions || !ws || durationMs === 0 || !ready) return;
    regions.clearRegions();
    bandRegionIds.current.clear();
    const isFocused = focusedIndex !== null && focusedIndex !== undefined;
    if (isFocused) return;
    const colours: [string, string] = ['rgba(124,92,255,0.10)', 'rgba(0,212,255,0.10)'];
    const boundaries = splitPoints.slice(1, -1);
    splitPoints.forEach((pt, i) => {
      const next = splitPoints[i + 1];
      if (next === undefined) return;
      const r = regions.addRegion({
        start: pt / 1000,
        end: next / 1000,
        color: colours[(i % 2) as 0 | 1],
        drag: false,
        resize: false,
      });
      bandRegionIds.current.add(r.id);
      r.on('click', () => {
        (ws as unknown as { _regionClickBlocked?: boolean })._regionClickBlocked = true;
        onRegionClick?.(i);
      });
    });
    boundaries.forEach(ptMs => {
      const markerRegion = regions.addRegion({
        start: ptMs / 1000,
        end: ptMs / 1000 + 0.02,
        color: 'rgba(239,68,68,0.95)',
        drag: true,
        resize: false,
      });
      const el = markerRegion.element as HTMLElement | null;
      if (el) {
        el.dataset['marker'] = 'true';
        el.classList.add('wave-marker');
        const trackNumber = splitPoints.indexOf(ptMs) + 1;
        const badge = document.createElement('span');
        badge.className = 'wave-marker-badge';
        badge.textContent = String(trackNumber);
        badge.title = `Track ${trackNumber} starts here`;
        badge.setAttribute('aria-label', `Track ${trackNumber}`);
        el.appendChild(badge);
      }
      markerRegion.on('update-end', () => {
        const newPtMs = Math.round(markerRegion.start * 1000);
        const updated = splitPoints.map(p => (p === ptMs ? newPtMs : p));
        onSplitPointsChange([...updated].sort((a, b) => a - b));
      });
    });
  }, [
    splitPoints,
    durationMs,
    onSplitPointsChange,
    onRegionClick,
    focusedIndex,
    ready,
    regionsRef,
    wsRef,
  ]);
}

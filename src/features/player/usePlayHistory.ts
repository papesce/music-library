import { useCallback, useMemo } from 'react';
import type { Track } from '../../types/api.d';
import { usePersistedState } from '../../lib/persist';

const KEY = 'app:playHistory';
const MAX = 20;

export function usePlayHistory(tracks: Track[]) {
  const [historyIds, setHistoryIds] = usePersistedState<string[]>(KEY, []);

  const push = useCallback((id: string) => {
    setHistoryIds(prev => {
      const next = [id, ...prev.filter(x => x !== id)];
      return next.slice(0, MAX);
    });
  }, [setHistoryIds]);

  const clear = useCallback(() => setHistoryIds([]), [setHistoryIds]);

  const remove = useCallback((id: string) => {
    setHistoryIds(prev => prev.filter(x => x !== id));
  }, [setHistoryIds]);

  // map ids to tracks, filter missing (deleted/renamed)
  const historyTracks = useMemo(() => {
    const byId = new Map(tracks.map(t => [t.id, t]));
    // also handle legacy ids stored as filePath before — fallback search by filePath
    const result: Track[] = [];
    for (const id of historyIds) {
      const t = byId.get(id) ?? tracks.find(tr => tr.filePath === id);
      if (t) result.push(t);
    }
    return result;
  }, [tracks, historyIds]);

  // prune stale ids when tracks change (e.g. after scan/rename)
  // keep ids that still resolve; don't wipe if tracks empty during initial load
  // pruning is lazy via historyTracks; explicit cleanup can be done on demand

  return { historyIds, historyTracks, push, clear, remove };
}

import { useMemo } from 'react';
import type { Track } from '../../types/api.d';
import { usePersistedState } from '../../lib/persist';

export type SortKey = 'artist' | 'album' | 'title' | 'year' | 'duration';
export type SortDir = 'asc' | 'desc';

const VALID_KEYS: SortKey[] = ['artist', 'album', 'title', 'year', 'duration'];

export function useLibrary(tracks: Track[]) {
  const [search, setSearch] = usePersistedState<string>('lib:search', '');
  const [sortKeyRaw, setSortKey] = usePersistedState<SortKey>('lib:sortKey', 'artist');
  const [sortDirRaw, setSortDir] = usePersistedState<SortDir>('lib:sortDir', 'asc');
  const [showDupesOnly, setShowDupesOnly] = usePersistedState<boolean>('lib:showDupesOnly', false);
  const [hideReviewed, setHideReviewed] = usePersistedState<boolean>('lib:hideReviewed', false);
  const sortKey = VALID_KEYS.includes(sortKeyRaw) ? sortKeyRaw : 'artist';
  const sortDir: SortDir = sortDirRaw === 'desc' ? 'desc' : 'asc';

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filteredSorted = useMemo(() => {
    const q = search.toLowerCase();
    const arr = tracks.filter(t => {
      if (hideReviewed && t.reviewed) return false;
      if (showDupesOnly && !t.duplicateGroupId) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
      );
    });
    return [...arr].sort((a, b) => {
      if (sortKey === 'duration') {
        const av = a.duration ?? -1;
        const bv = b.duration ?? -1;
        const cmp = av - bv;
        return sortDir === 'asc' ? cmp : -cmp;
      }
      const av = (a[sortKey] ?? '') as string | number;
      const bv = (b[sortKey] ?? '') as string | number;
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [tracks, search, sortKey, sortDir, showDupesOnly, hideReviewed]);

  const dupeCount = useMemo(() => tracks.filter(t => t.duplicateGroupId).length, [tracks]);
  const reviewedCount = useMemo(() => tracks.filter(t => t.reviewed).length, [tracks]);

  return { search, setSearch, sortKey, sortDir, toggleSort, showDupesOnly, setShowDupesOnly, hideReviewed, setHideReviewed, filteredSorted, dupeCount, reviewedCount };
}

import { useMemo, useState } from 'react';
import type { Track } from '../../types/api.d';

export type SortKey = 'artist' | 'album' | 'title' | 'year';
export type SortDir = 'asc' | 'desc';

export function useLibrary(tracks: Track[]) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('artist');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showDupesOnly, setShowDupesOnly] = useState(false);
  const [hideReviewed, setHideReviewed] = useState(false);

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
      const av = (a[sortKey] ?? '') as string | number;
      const bv = (b[sortKey] ?? '') as string | number;
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [tracks, search, sortKey, sortDir, showDupesOnly]);

  const dupeCount = useMemo(() => tracks.filter(t => t.duplicateGroupId).length, [tracks]);
  const reviewedCount = useMemo(() => tracks.filter(t => t.reviewed).length, [tracks]);

  return { search, setSearch, sortKey, sortDir, toggleSort, showDupesOnly, setShowDupesOnly, hideReviewed, setHideReviewed, filteredSorted, dupeCount, reviewedCount };
}

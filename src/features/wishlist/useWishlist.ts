import { useMemo, useState } from 'react';
import type { WishlistItem } from '../../types/api.d';
import { api } from '../../api';
import { usePersistedState } from '../../lib/persist';

export function useWishlist(initial: WishlistItem[] = []) {
  const [wishlist, setWishlist] = useState<WishlistItem[]>(initial);
  const [wName, setWName] = useState('');
  const [wArtist, setWArtist] = useState('');
  const [wPriority, setWPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editPriority, setEditPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const [sortByDate, setSortByDate] = usePersistedState<boolean>('wishlist:sortByDate', false);

  const sortedByPriority = useMemo(() => {
    const order = { High: 0, Medium: 1, Low: 2 };
    return [...wishlist].sort((a, b) => {
      const pa = order[a.priority], pb = order[b.priority];
      if (pa !== pb) return pa - pb;
      return new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime();
    });
  }, [wishlist]);

  const displayed = useMemo(
    () =>
      sortByDate
        ? [...wishlist].sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime())
        : sortedByPriority,
    [wishlist, sortByDate, sortedByPriority]
  );

  const add = async (setError: (m: string) => void) => {
    if (!wName.trim()) return;
    try {
      const item = await api.addWishlistItem({ name: wName.trim(), artist: wArtist.trim() || undefined, priority: wPriority });
      setWishlist(prev => [...prev, item]);
      setWName('');
      setWArtist('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const startEdit = (it: WishlistItem) => {
    setEditingId(it.id);
    setEditName(it.name);
    setEditArtist(it.artist ?? '');
    setEditPriority(it.priority);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const updated = await api.updateWishlistItem(editingId, { name: editName, artist: editArtist || undefined, priority: editPriority });
    setWishlist(prev => prev.map(x => (x.id === editingId ? updated : x)));
    setEditingId(null);
  };

  const del = async (id: string) => {
    await api.deleteWishlistItem(id);
    setWishlist(prev => prev.filter(x => x.id !== id));
  };

  return { wishlist, setWishlist, wName, setWName, wArtist, setWArtist, wPriority, setWPriority, editingId, setEditingId, editName, setEditName, editArtist, setEditArtist, editPriority, setEditPriority, sortByDate, setSortByDate, displayed, add, startEdit, saveEdit, del };
}

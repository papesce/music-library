import type { Track, WishlistItem } from './types/api';

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  pickFolder: () => req<{ path: string | null; message?: string }>('/api/pick-folder'),
  getConfig: () => req<{ folders?: string[]; lastFolder?: string }>('/api/config'),
  setConfig: (folders: string[]) => req<{ folders: string[] }>('/api/config', { method: 'POST', body: JSON.stringify({ folders }) }),
  getLibrary: () => req<Track[]>('/api/library'),
  getDuplicates: () => req<{ count: number; groups: Record<string, Track[]> }>('/api/library/duplicates'),
  validateLibrary: () => req<Track[]>('/api/library/validate', { method: 'POST' }),
  scanFolders: (folders: string[]) => req<Track[]>('/api/scan', { method: 'POST', body: JSON.stringify({ folders }) }),
  // backward compat single
  scanFolder: (folder: string) => req<Track[]>('/api/scan', { method: 'POST', body: JSON.stringify({ folder }) }),
  getWishlist: () => req<WishlistItem[]>('/api/wishlist'),
  addWishlistItem: (item: { name: string; artist?: string; priority: 'High' | 'Medium' | 'Low' }) =>
    req<WishlistItem>('/api/wishlist', { method: 'POST', body: JSON.stringify(item) }),
  updateWishlistItem: (id: string, patch: Partial<Omit<WishlistItem, 'id'>>) =>
    req<WishlistItem>(`/api/wishlist/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteWishlistItem: (id: string) => req<{ ok: boolean }>(`/api/wishlist/${id}`, { method: 'DELETE' }),
};

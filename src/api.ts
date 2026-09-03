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
  setConfig: (folders: string[]) =>
    req<{ folders: string[] }>('/api/config', {
      method: 'POST',
      body: JSON.stringify({ folders }),
    }),
  getLibrary: () => req<Track[]>('/api/library'),
  getDuplicates: () =>
    req<{ count: number; groups: Record<string, Track[]> }>('/api/library/duplicates'),
  validateLibrary: () => req<Track[]>('/api/library/validate', { method: 'POST' }),
  scanFolders: (folders: string[]) =>
    req<Track[]>('/api/scan', { method: 'POST', body: JSON.stringify({ folders }) }),
  // backward compat single
  scanFolder: (folder: string) =>
    req<Track[]>('/api/scan', { method: 'POST', body: JSON.stringify({ folder }) }),
  getWishlist: () => req<WishlistItem[]>('/api/wishlist'),
  addWishlistItem: (item: { name: string; artist?: string; priority: 'High' | 'Medium' | 'Low' }) =>
    req<WishlistItem>('/api/wishlist', { method: 'POST', body: JSON.stringify(item) }),
  updateWishlistItem: (id: string, patch: Partial<Omit<WishlistItem, 'id'>>) =>
    req<WishlistItem>(`/api/wishlist/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteWishlistItem: (id: string) =>
    req<{ ok: boolean }>(`/api/wishlist/${id}`, { method: 'DELETE' }),
  deleteTrack: (filePath: string) =>
    req<{ ok: boolean; deleted?: boolean }>(`/api/tracks?path=${encodeURIComponent(filePath)}`, {
      method: 'DELETE',
    }),
  updateTrack: (
    filePath: string,
    patch: Partial<Pick<Track, 'title' | 'artist' | 'album' | 'genre'>> & { year?: number | null }
  ) =>
    req<Track>('/api/tracks', {
      method: 'PUT',
      body: JSON.stringify({ path: filePath, ...patch }),
    }),
  renameTrack: (filePath: string, filename: string) =>
    req<Track>('/api/tracks/rename', {
      method: 'PUT',
      body: JSON.stringify({ path: filePath, filename }),
    }),
  setReviewed: (filePath: string, reviewed: boolean) =>
    req<Track>('/api/tracks/reviewed', {
      method: 'PUT',
      body: JSON.stringify({ path: filePath, reviewed }),
    }),
  detectSplit: (filePath: string, minSilenceMs = 700, silenceThreshDb = -50) =>
    req<{ path: string; split_points_ms: number[]; duration_ms: number }>('/api/split/detect', {
      method: 'POST',
      body: JSON.stringify({
        path: filePath,
        min_silence_ms: minSilenceMs,
        silence_thresh_db: silenceThreshDb,
      }),
    }),
  applySplit: (
    filePath: string,
    splitPoints: number[],
    segments?: { title?: string; artist?: string; album?: string; year?: string; genre?: string }[]
  ) =>
    req<{ ok: boolean; files: string[]; count: number }>('/api/split/apply', {
      method: 'POST',
      body: JSON.stringify({ path: filePath, split_points_ms: splitPoints, segments }),
    }),
  getLyrics: (filePath: string) =>
    req<{ lyrics: string | null; synced: { ms: number; text: string }[] | null }>(
      `/api/lyrics?path=${encodeURIComponent(filePath)}`
    ),
  lookupLyrics: (filePath: string) =>
    req<{ plainLyrics: string; syncedLyrics: string; synced: { ms: number; text: string }[] | null; source: string; trackName: string; artistName: string }>(
      `/api/lyrics/lookup?path=${encodeURIComponent(filePath)}`
    ),
  detectLyrics: (filePath: string, opts?: { source?: 'auto' | 'lrclib' | 'whisper'; model?: string; language?: string; artist?: string; title?: string; album?: string }) =>
    req<{ source: string; plainLyrics: string; syncedLyrics: string; lrc: string; synced: { ms: number; text: string }[] | null; model?: string }>(
      '/api/lyrics/detect',
      { method: 'POST', body: JSON.stringify({ path: filePath, source: opts?.source || 'auto', model: opts?.model || 'base', ...opts }) }
    ),
  saveLyrics: (filePath: string, lrc: string) =>
    req<{ ok: boolean; lrcPath: string; synced: { ms: number; text: string }[] | null }>(
      '/api/lyrics',
      { method: 'POST', body: JSON.stringify({ path: filePath, lrc }) }
    ),
  batchDetectLyrics: (opts?: { source?: string; model?: string; limit?: number; overwrite?: boolean }) =>
    req<{ count: number; results: { path: string; status: string; source?: string; lrc?: string; synced?: { ms: number; text: string }[] | null; plainLyrics?: string; error?: string; needsConfirm?: boolean }[] }>(
      '/api/lyrics/batch',
      { method: 'POST', body: JSON.stringify(opts || {}) }
    ),
  batchSaveLyrics: (items: { path: string; lrc: string }[]) =>
    req<{ count: number; results: { path: string; ok: boolean; error?: string }[] }>('/api/lyrics/batch/save', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
  setCover: (filePath: string, imageDataUrl: string) =>
    req<Track>('/api/tracks/cover', {
      method: 'PUT',
      body: JSON.stringify({ path: filePath, image: imageDataUrl }),
    }),
  removeCover: (filePath: string) =>
    req<Track>('/api/tracks/cover', {
      method: 'PUT',
      body: JSON.stringify({ path: filePath, remove: true }),
    }),
};

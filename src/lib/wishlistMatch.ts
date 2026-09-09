import type { Track, WishlistItem } from '../types/api.d';

export function normalizeForMatch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const prev = Array.from({ length: bl + 1 }, (_, i) => i);
  const cur = new Array(bl + 1).fill(0);
  for (let i = 1; i <= al; i++) {
    cur[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j <= bl; j++) prev[j] = cur[j]!;
  }
  return prev[bl]!;
}

export function isWishlistMatch(wishlistName: string, trackTitle: string): boolean {
  const nw = normalizeForMatch(wishlistName);
  const nt = normalizeForMatch(trackTitle);
  if (!nw || !nt) return false;
  if (nt === nw) return true;
  if (nt.includes(nw) || nw.includes(nt)) return true;
  const wTokens = new Set(nw.split(' '));
  const tTokens = new Set(nt.split(' '));
  let inter = 0;
  for (const tok of wTokens) if (tTokens.has(tok)) inter++;
  const smaller = Math.min(wTokens.size, tTokens.size);
  if (smaller >= 2 && inter / smaller >= 0.75) return true;
  if (smaller >= 1 && wTokens.size <= 2 && tTokens.size <= 4 && inter === wTokens.size) return true;
  const maxLen = Math.max(nw.length, nt.length);
  if (maxLen >= 4) {
    const dist = levenshtein(nw, nt);
    if (1 - dist / maxLen >= 0.8) return true;
  }
  if (nw.length >= 6 && nt.length >= 6) {
    if (nw.slice(0, 30) === nt.slice(0, 30)) return true;
  }
  return false;
}

export type EnrichedWishlistItem = WishlistItem & {
  inLibrary: boolean;
  matches: Pick<Track, 'filePath' | 'title' | 'artist' | 'album'>[];
  matchCount: number;
};

export function enrichWishlist(items: WishlistItem[], tracks: Track[]): EnrichedWishlistItem[] {
  return items.map(it => {
    const matches = tracks.filter(t => isWishlistMatch(it.name, t.title));
    return {
      ...it,
      inLibrary: matches.length > 0,
      matches: matches.slice(0, 3).map(t => ({ filePath: t.filePath, title: t.title, artist: t.artist, album: t.album })),
      matchCount: matches.length,
    };
  });
}

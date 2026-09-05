export function buildGoogleQuery(opts: {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  year?: string | number | null;
  filePath?: string;
}): string {
  const t = (opts.title ?? '').trim();
  const a = (opts.artist ?? '').trim();
  const al = (opts.album ?? '').trim();
  const g = (opts.genre ?? '').trim();
  const y = String(opts.year ?? '').trim();
  const isUnknown = (v: string) => !v || v.toLowerCase() === 'unknown';
  const parts: string[] = [];
  if (!isUnknown(a)) parts.push(a);
  if (!isUnknown(t)) parts.push(t);
  if (!isUnknown(al)) parts.push(`album ${al}`);
  if (!isUnknown(g)) parts.push(g);
  if (y) parts.push(y);
  if (parts.length === 0) {
    const fp = opts.filePath ?? '';
    const filename = fp.split('/').pop()?.split('\\').pop() ?? fp;
    return filename.replace(/\.mp3$/i, '');
  }
  return parts.join(' ');
}

export function openGoogle(query: string) {
  window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
}

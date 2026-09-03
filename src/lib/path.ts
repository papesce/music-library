export function shortFolder(p: string): string {
  const normalized = p.replace(/\/+$/, '');
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 2) return normalized;
  return parts.slice(-2).join('/');
}

export function splitFile(p: string): { folder: string; file: string } {
  const normalized = p.replace(/\/+$/, '');
  const parts = normalized.split(/[\\/]/);
  const file = parts.pop() || '';
  const folder = parts.slice(-2).join('/');
  return { folder, file };
}

export function streamUrl(filePath: string): string {
  return `/api/stream?path=${encodeURIComponent(filePath)}`;
}

export function coverUrl(filePath: string, bust?: number | string): string {
  const base = `/api/cover?path=${encodeURIComponent(filePath)}`;
  return bust != null ? `${base}&t=${encodeURIComponent(String(bust))}` : base;
}

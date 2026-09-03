export function formatDuration(s?: number): string {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function truncateMiddle(name: string, max = 32): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const keep = max - ext.length - 1;
  if (keep <= 4) return name.slice(0, max - 1) + '…';
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return stem.slice(0, head) + '…' + stem.slice(-tail) + ext;
}

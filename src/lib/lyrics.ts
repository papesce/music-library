export type SyncedLine = { ms: number; text: string };

export function parseLrc(lrc: string | null | undefined): SyncedLine[] | null {
  if (!lrc) return null;
  const out: SyncedLine[] = [];
  for (const line of lrc.split('\n')) {
    const m = line.match(/\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\](.*)/);
    if (m) {
      const min = Number(m[1]), sec = Number(m[2]), msPart = m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) : 0;
      const ms = (min * 60 + sec) * 1000 + msPart;
      const text = (m[4] ?? '').trim();
      if (text) out.push({ ms, text });
    }
  }
  return out.length ? out.sort((a, b) => a.ms - b.ms) : null;
}

export function hasSyncedTimestamp(s: string): boolean {
  return /\[\d{1,3}:\d{2}/.test(s);
}

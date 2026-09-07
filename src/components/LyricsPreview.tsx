import { useEffect, useRef } from 'react';
import { parseLrc, type SyncedLine } from '../lib/lyrics';

type Props = {
  lrc: string | null;
  currentTimeSec: number;
  className?: string;
  maxHeight?: number | string;
};

export function LyricsPreview({ lrc, currentTimeSec, className, maxHeight = 180 }: Props) {
  const synced: SyncedLine[] | null = parseLrc(lrc);
  const activeIdx = (() => {
    if (!synced) return -1;
    const ms = currentTimeSec * 1000;
    let idx = -1;
    for (let i = 0; i < synced.length; i++) if (ms >= synced[i].ms) idx = i; else break;
    return idx;
  })();
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeIdx < 0) return;
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIdx]);

  if (!lrc?.trim()) {
    return <div className="muted" style={{ padding: 12, textAlign: 'center', fontSize: 11 }}>No lyrics — add text or Detect</div>;
  }
  if (synced && synced.length) {
    return (
      <div ref={listRef} className={className ?? 'lyrics-synced'} style={{ maxHeight, overflow: 'auto' }}>
        {synced.map((s, i) => (
          <div key={i} data-idx={i} className={`lyric-line ${i === activeIdx ? 'active' : ''} ${i < activeIdx ? 'past' : ''}`}>
            {s.text || '♪'}
          </div>
        ))}
      </div>
    );
  }
  return <div className="lyrics-plain" style={{ maxHeight, overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap' }}>{lrc}</div>;
}

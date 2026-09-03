import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Track } from '../../types/api.d';
import type { SortKey, SortDir } from './useLibrary';
import { TrackRowGrid } from './TrackRowGrid';
import { TrackListHeader } from './TrackListHeader';

type Props = {
  tracks: Track[];
  playingId: string | null;
  isPaused: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
  toggleSort: (k: SortKey) => void;
  onPlay: (t: Track) => void;
  onSplit: (t: Track) => void;
  onEdit: (t: Track) => void;
  onDelete: (t: Track) => void;
  onToggleReviewed?: (t: Track) => void;
  showDupesOnly: boolean;
};

const ROW_HEIGHT = 64;

export function TrackList({ tracks, playingId, isPaused, sortKey, sortDir, toggleSort, onPlay, onSplit, onEdit, onDelete, onToggleReviewed, showDupesOnly }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  if (tracks.length === 0) {
    return (
      <div className="glass track-list">
        <TrackListHeader sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort} />
        <div className="empty" style={{ border: 'none', margin: 16 }}>
          <b>{showDupesOnly ? 'No duplicates' : 'No tracks yet'}</b>
          <span>{showDupesOnly ? 'Your library is clean.' : 'Add a folder in settings and hit Scan.'}</span>
        </div>
      </div>
    );
  }

  const items = virtualizer.getVirtualItems();

  return (
    <div className="glass track-list" role="grid" aria-rowcount={tracks.length} aria-colcount={9}>
      <TrackListHeader sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort} />
      <div ref={parentRef} className="track-list-body">
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
          {items.map(virtualRow => {
            const t = tracks[virtualRow.index]!;
            return (
              <TrackRowGrid
                key={t.id}
                track={t}
                isPlaying={playingId === t.id && !isPaused}
                isPaused={playingId === t.id && isPaused}
                isActive={playingId === t.id}
                onPlay={() => onPlay(t)}
                onSplit={() => onSplit(t)}
                onEdit={() => onEdit(t)}
                onDelete={() => onDelete(t)}
                onToggleReviewed={onToggleReviewed}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                  height: `${ROW_HEIGHT}px`,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

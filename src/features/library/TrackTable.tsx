import type { Track } from '../../types/api.d';
import type { SortKey, SortDir } from './useLibrary';
import { TrackRow } from './TrackRow';

export function TrackTable({
  tracks,
  playingId,
  isPaused,
  sortKey,
  sortDir,
  toggleSort,
  onPlay,
  onSplit,
  onEdit,
  onDelete,
  showDupesOnly,
}: {
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
  showDupesOnly: boolean;
}) {
  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');
  return (
    <div className="glass table-wrap">
      <table>
        <thead>
          <tr>
            <th style={{ width: 56 }}></th>
            <th onClick={() => toggleSort('title')}>Track{arrow('title')}</th>
            <th onClick={() => toggleSort('artist')}>Artist{arrow('artist')}</th>
            <th onClick={() => toggleSort('album')}>Album{arrow('album')}</th>
            <th>Genre</th>
            <th>Duration</th>
            <th onClick={() => toggleSort('year')}>Year{arrow('year')}</th>
            <th style={{ width: 104 }}></th>
          </tr>
        </thead>
        <tbody>
          {tracks.map(t => (
            <TrackRow
              key={t.id}
              track={t}
              isPlaying={playingId === t.id && !isPaused}
              isPaused={playingId === t.id && isPaused}
              isActive={playingId === t.id}
              onPlay={() => onPlay(t)}
              onSplit={() => onSplit(t)}
              onEdit={() => onEdit(t)}
              onDelete={() => onDelete(t)}
            />
          ))}
          {tracks.length === 0 && (
            <tr>
              <td colSpan={8}>
                <div className="empty" style={{ border: 'none' }}>
                  <b>{showDupesOnly ? 'No duplicates' : 'No tracks yet'}</b>
                  <span>{showDupesOnly ? 'Your library is clean.' : 'Add a folder in settings and hit Scan.'}</span>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

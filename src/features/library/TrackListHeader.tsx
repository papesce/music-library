import type { SortKey, SortDir } from './useLibrary';

type Props = {
  sortKey: SortKey;
  sortDir: SortDir;
  toggleSort: (k: SortKey) => void;
};

function SortButton({ active, dir, onClick, children }: { active: boolean; dir: SortDir; onClick: () => void; children: string }) {
  return (
    <button
      className="sort-btn"
      onClick={onClick}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      aria-label={`Sort by ${children}${active ? `, currently ${dir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
    >
      {children}
      <span aria-hidden="true" className={`sort-arrow ${active ? 'active' : ''}`}>
        {active ? (dir === 'asc' ? ' ▲' : ' ▼') : ' ↕'}
      </span>
    </button>
  );
}

export function TrackListHeader({ sortKey, sortDir, toggleSort }: Props) {
  return (
    <div role="row" className="track-list-header">
      <div role="columnheader" className="header-cell cell-play" aria-label="Play" />
      <div role="columnheader" className="header-cell cell-track">
        <SortButton active={sortKey === 'title'} dir={sortDir} onClick={() => toggleSort('title')}>
          Track
        </SortButton>
      </div>
      <div role="columnheader" className="header-cell cell-artist">
        <SortButton active={sortKey === 'artist'} dir={sortDir} onClick={() => toggleSort('artist')}>
          Artist
        </SortButton>
      </div>
      <div role="columnheader" className="header-cell cell-album">
        <SortButton active={sortKey === 'album'} dir={sortDir} onClick={() => toggleSort('album')}>
          Album
        </SortButton>
      </div>
      <div role="columnheader" className="header-cell cell-genre">
        Genre
      </div>
      <div role="columnheader" className="header-cell cell-duration">
        Duration
      </div>
      <div role="columnheader" className="header-cell cell-year">
        <SortButton active={sortKey === 'year'} dir={sortDir} onClick={() => toggleSort('year')}>
          Year
        </SortButton>
      </div>
      <div role="columnheader" className="header-cell cell-actions" aria-label="Actions" />
    </div>
  );
}

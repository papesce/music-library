export function LibraryHero({
  search,
  setSearch,
  showDupesOnly,
  setShowDupesOnly,
  dupeCount,
  filteredCount,
  totalCount,
  scanning,
  onScan,
  onRefresh,
  playing,
  onStop,
}: {
  search: string;
  setSearch: (v: string) => void;
  showDupesOnly: boolean;
  setShowDupesOnly: (v: boolean) => void;
  dupeCount: number;
  filteredCount: number;
  totalCount: number;
  scanning: boolean;
  onScan: () => void;
  onRefresh: () => void;
  playing: boolean;
  onStop: () => void;
}) {
  return (
    <>
      <div className="hero">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="glass search-pill" style={{ minWidth: 260 }}>
            <span>⌕</span>
            <input placeholder="Search title, artist, album…" value={search} onChange={e => setSearch(e.target.value)} />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                ✕
              </button>
            )}
          </div>
          <div className="glass segmented">
            <button className={!showDupesOnly ? 'active' : ''} onClick={() => setShowDupesOnly(false)}>
              All
            </button>
            <button className={showDupesOnly ? 'active' : ''} onClick={() => setShowDupesOnly(true)}>
              Dupes {dupeCount > 0 ? `· ${dupeCount}` : ''}
            </button>
          </div>
          <button className="btn btn-primary" onClick={onScan} disabled={scanning}>
            {scanning ? 'Scanning…' : 'Scan'}
          </button>
          <button className="btn glass-soft" onClick={onRefresh} disabled={scanning}>
            Re-scan
          </button>
        </div>
        <div className="meta-row">
          <span className="muted">
            {filteredCount} tracks {search && `(from ${totalCount})`}
          </span>
          {dupeCount > 0 && <span className="muted">· duplicates by artist+title+album</span>}
          {playing && (
            <button className="btn glass-soft" style={{ marginLeft: 'auto' }} onClick={onStop}>
              ⏹ Stop
            </button>
          )}
        </div>
      </div>
      <div className="stats">
        <div className="glass stat">
          <b>{totalCount}</b>
          <span>total</span>
        </div>
        <div className="glass stat">
          <b>{filteredCount}</b>
          <span>shown</span>
        </div>
        {dupeCount > 0 && (
          <div className="glass stat" style={{ borderColor: 'rgba(255,193,7,0.25)' }}>
            <b>{dupeCount}</b>
            <span>dupes</span>
          </div>
        )}
      </div>
    </>
  );
}

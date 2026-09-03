export function LibraryHero({
  search,
  setSearch,
  showDupesOnly,
  setShowDupesOnly,
  hideReviewed,
  setHideReviewed,
  dupeCount,
  reviewedCount,
  filteredCount,
  totalCount,
  scanning,
  onScan,
  onRefresh,
  playing,
  onStop,
  onBatchLyrics,
  batchRunning,
}: {
  search: string;
  setSearch: (v: string) => void;
  showDupesOnly: boolean;
  setShowDupesOnly: (v: boolean) => void;
  hideReviewed: boolean;
  setHideReviewed: (v: boolean) => void;
  dupeCount: number;
  reviewedCount: number;
  filteredCount: number;
  totalCount: number;
  scanning: boolean;
  onScan: () => void;
  onRefresh: () => void;
  playing: boolean;
  onStop: () => void;
  onBatchLyrics?: () => void;
  batchRunning?: boolean;
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
          <button
            className={`pill ${hideReviewed ? 'active' : ''}`}
            onClick={() => setHideReviewed(!hideReviewed)}
            title={hideReviewed ? 'Showing unreviewed only' : 'Hide completed/reviewed songs'}
            style={{ borderColor: hideReviewed ? 'rgba(46,204,113,0.35)' : undefined, background: hideReviewed ? 'rgba(46,204,113,0.14)' : undefined }}
          >
            {hideReviewed ? '✓ Unreviewed only' : `Hide done ${reviewedCount > 0 ? `· ${reviewedCount}` : ''}`}
          </button>
          <button className="btn btn-primary" onClick={onScan} disabled={scanning}>
            {scanning ? 'Scanning…' : 'Scan'}
          </button>
          <button className="btn glass-soft" onClick={onRefresh} disabled={scanning}>
            Re-scan
          </button>
          {onBatchLyrics && (
            <button className="btn glass-soft" onClick={onBatchLyrics} disabled={!!batchRunning} title="Auto-detect lyrics for tracks missing .lrc/USLT (LRClib→Whisper base), preview then batch-save">
              {batchRunning ? 'Lyrics…' : '✨ Batch lyrics'}
            </button>
          )}
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
        {reviewedCount > 0 && (
          <div className="glass stat" style={{ borderColor: 'rgba(46,204,113,0.3)', background: 'rgba(46,204,113,0.08)' }}>
            <b>{reviewedCount}</b>
            <span>done</span>
          </div>
        )}
        {reviewedCount > 0 && filteredCount !== totalCount - (hideReviewed ? reviewedCount : 0) && (
          <div className="glass stat">
            <b>{totalCount - reviewedCount}</b>
            <span>pending</span>
          </div>
        )}
      </div>
    </>
  );
}

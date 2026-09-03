import { useState } from 'react';
import { api } from '../../api';

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
  onExported,
  setError,
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
  onExported?: () => void;
  setError?: (msg: string) => void;
}) {
  const [exportDest, setExportDest] = useState(() => localStorage.getItem('exportDest') || '');
  const [exportMode, setExportMode] = useState<'copy' | 'move' | 'm3u'>(() => (localStorage.getItem('exportMode') as any) || 'copy');
  const [exporting, setExporting] = useState(false);
  const [showExport, setShowExport] = useState(false);
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
        {reviewedCount > 0 && (
          <button className="btn glass-soft" style={{ marginLeft: 'auto', borderColor: showExport ? 'rgba(46,204,113,0.4)' : undefined }} onClick={() => setShowExport(v => !v)} title="Export completed songs to playlist folder">
            {showExport ? '✕ Close export' : `↗ Export done · ${reviewedCount}`}
          </button>
        )}
      </div>
      {showExport && reviewedCount > 0 && (
        <div className="glass" style={{ marginBottom: 16, padding: 12, borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            Export completed — saves done songs to a playlist folder
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              placeholder="Playlist folder (absolute path, e.g. /Users/you/Music/Playlist)"
              value={exportDest}
              onChange={e => { setExportDest(e.target.value); localStorage.setItem('exportDest', e.target.value); }}
              style={{ flex: 1, minWidth: 260, padding: '9px 12px', borderRadius: 999, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.06)', color: 'var(--text)', outline: 'none', fontSize: 13 }}
            />
            <button
              className="btn glass-soft"
              onClick={async () => {
                try {
                  const r = await api.pickFolder();
                  if (r.path) { setExportDest(r.path); localStorage.setItem('exportDest', r.path); }
                  else if (r.message) setError?.(r.message);
                } catch (e: any) { setError?.(e.message); }
              }}
            >
              Browse…
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="glass segmented">
              <button className={exportMode === 'copy' ? 'active' : ''} onClick={() => { setExportMode('copy'); localStorage.setItem('exportMode', 'copy'); }} title="Keep originals, copy to folder">Copy</button>
              <button className={exportMode === 'move' ? 'active' : ''} onClick={() => { setExportMode('move'); localStorage.setItem('exportMode', 'move'); }} title="Move files — updates library paths">Move</button>
              <button className={exportMode === 'm3u' ? 'active' : ''} onClick={() => { setExportMode('m3u'); localStorage.setItem('exportMode', 'm3u'); }} title="Write Completed.m3u8 playlist (no duplication)">M3U</button>
            </div>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              {exportMode === 'copy' && 'Copies done songs (incl. .lrc) — safe, idempotent.'}
              {exportMode === 'move' && 'Moves files & updates library — frees source folder.'}
              {exportMode === 'm3u' && 'Creates Completed.m3u8 in folder — no duplication, ideal for players.'}
            </span>
            <button
              className="btn btn-primary"
              disabled={exporting}
              onClick={async () => {
                setExporting(true);
                try {
                  const r = await api.exportReviewed({ destination: exportDest || undefined, mode: exportMode, overwrite: true });
                  setError?.('');
                  // toast via setError with success? use alert via setError empty then show info
                  const msg = r.mode === 'm3u'
                    ? `Playlist created: ${r.playlist} · ${r.count} tracks`
                    : `${r.mode === 'move' ? 'Moved' : 'Copied'} ${r.exported}/${r.count} to ${r.destination}`;
                  setError?.(msg);
                  // trigger refresh if move (paths changed)
                  if (r.mode === 'move') onExported?.();
                } catch (e: any) { setError?.(e.message); }
                finally { setExporting(false); }
              }}
              style={{ marginLeft: 'auto' }}
            >
              {exporting ? 'Exporting…' : exportMode === 'm3u' ? 'Generate M3U' : exportMode === 'move' ? `Move ${reviewedCount}` : `Copy ${reviewedCount}`}
            </button>
          </div>
          {!exportDest && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Leave empty for default: <code>data/playlist</code> in project folder.</span>}
        </div>
      )}
    </>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Track, WishlistItem } from './types/api';
import { api } from './api';

type Tab = 'library' | 'wishlist';
type SortKey = 'artist' | 'album' | 'title' | 'year';
type SortDir = 'asc' | 'desc';

function formatDuration(s?: number) {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function shortFolder(p: string) {
  const normalized = p.replace(/\/+$/, '');
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 2) return normalized;
  return parts.slice(-2).join('/');
}

function shortFile(p: string) {
  const normalized = p.replace(/\/+$/, '');
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 3) return normalized;
  return parts.slice(-3).join('/');
}

export default function App() {
  const [tab, setTab] = useState<Tab>('library');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [newFolder, setNewFolder] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('artist');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [scanning, setScanning] = useState(false);
  const [showDupesOnly, setShowDupesOnly] = useState(false);
  const [error, setError] = useState('');

  // playback
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [wName, setWName] = useState('');
  const [wArtist, setWArtist] = useState('');
  const [wPriority, setWPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editPriority, setEditPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const [wishlistSortByDate, setWishlistSortByDate] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.getConfig();
        const fs = cfg.folders ?? (cfg.lastFolder ? [cfg.lastFolder] : []);
        setFolders(fs);
        setTracks(await api.getLibrary());
        setWishlist(await api.getWishlist());
      } catch (e: any) { setError(e.message); }
    })();
  }, []);

  const addFolder = () => {
    const f = newFolder.trim();
    if (!f) return;
    if (folders.includes(f)) { setNewFolder(''); return; }
    const next = [...folders, f];
    setFolders(next);
    setNewFolder('');
    api.setConfig(next).catch(e => setError(e.message));
  };
  const removeFolder = (idx: number) => {
    const next = folders.filter((_, i) => i !== idx);
    setFolders(next);
    api.setConfig(next).catch(e => setError(e.message));
  };
  const browseFolder = async () => {
    try {
      const res = await api.pickFolder();
      if (res.path) {
        if (folders.includes(res.path)) { setError(`Folder already added: ${res.path}`); return; }
        const next = [...folders, res.path];
        setFolders(next);
        await api.setConfig(next);
      } else if (res.message) {
        setError(res.message);
      }
    } catch (e: any) { setError(e.message); }
  };

  const doScan = async () => {
    if (folders.length === 0) { setError('Add at least one folder'); return; }
    setError(''); setScanning(true);
    try { setTracks(await api.scanFolders(folders)); }
    catch (e: any) { setError(e.message); }
    finally { setScanning(false); }
  };
  const refresh = async () => {
    try {
      if (folders.length) setTracks(await api.scanFolders(folders));
      else setTracks(await api.validateLibrary());
    } catch (e: any) { setError(e.message); }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };
  const filteredSorted = useMemo(() => {
    const q = search.toLowerCase();
    let arr = tracks.filter(t => {
      if (showDupesOnly && !t.duplicateGroupId) return false;
      if (!q) return true;
      return t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q);
    });
    return [...arr].sort((a, b) => {
      const av = (a[sortKey] ?? '') as string | number;
      const bv = (b[sortKey] ?? '') as string | number;
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [tracks, search, sortKey, sortDir, showDupesOnly]);

  const dupeCount = useMemo(() => tracks.filter(t => t.duplicateGroupId).length, [tracks]);

  // playback helpers
  const streamUrl = (t: Track) => `/api/stream?path=${encodeURIComponent(t.filePath)}`;
  const handlePlay = (t: Track) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === t.id) {
      if (isPaused) { audio.play(); setIsPaused(false); }
      else { audio.pause(); setIsPaused(true); }
      return;
    }
    audio.src = streamUrl(t);
    audio.play().then(() => { setPlayingId(t.id); setIsPaused(false); }).catch(e => setError(e.message));
  };
  const handleStop = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio.removeAttribute('src');
    audio.load();
    setPlayingId(null);
    setIsPaused(false);
  };

  const addWishlist = async () => {
    if (!wName.trim()) return;
    try {
      const item = await api.addWishlistItem({ name: wName.trim(), artist: wArtist.trim() || undefined, priority: wPriority });
      setWishlist(prev => [...prev, item]); setWName(''); setWArtist('');
    } catch (e: any) { setError(e.message); }
  };
  const sortedWishlist = useMemo(() => {
    const order = { High: 0, Medium: 1, Low: 2 };
    return [...wishlist].sort((a, b) => {
      const pa = order[a.priority], pb = order[b.priority];
      if (pa !== pb) return pa - pb;
      return new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime();
    });
  }, [wishlist]);
  const displayedWishlist = wishlistSortByDate ? [...wishlist].sort((a,b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()) : sortedWishlist;

  const startEdit = (it: WishlistItem) => { setEditingId(it.id); setEditName(it.name); setEditArtist(it.artist ?? ''); setEditPriority(it.priority); };
  const saveEdit = async () => {
    if (!editingId) return;
    const updated = await api.updateWishlistItem(editingId, { name: editName, artist: editArtist || undefined, priority: editPriority });
    setWishlist(prev => prev.map(x => x.id === editingId ? updated : x)); setEditingId(null);
  };
  const del = async (id: string) => { await api.deleteWishlistItem(id); setWishlist(prev => prev.filter(x => x.id !== id)); };
  const arrow = (k: SortKey) => sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  return (
    <div className="app">
      <h1 style={{ marginBottom: 12 }}>Music Library</h1>
      <div className="tabs">
        <button className={`tab ${tab === 'library' ? 'active' : ''}`} onClick={() => setTab('library')}>Library</button>
        <button className={`tab ${tab === 'wishlist' ? 'active' : ''}`} onClick={() => setTab('wishlist')}>Wishlist</button>
      </div>
      {error && <p style={{ color: '#c00', marginBottom: 8 }}>{error}</p>}
      {/* hidden global audio element with native controls for seek/volume */}
      <audio
        ref={audioRef}
        controls
        style={{ width: '100%', marginBottom: 8, display: playingId ? 'block' : 'none' }}
        onEnded={() => { setPlayingId(null); setIsPaused(false); }}
        onPause={() => { if (playingId) setIsPaused(true); }}
        onPlay={() => { if (playingId) setIsPaused(false); }}
      />

      {tab === 'library' && (
        <>
          <div style={{ background: '#fff', padding: 12, borderRadius: 8, marginBottom: 12, border: '1px solid #e0e0e0' }}>
            <strong>Folders ({folders.length})</strong>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <input type="text" value={newFolder} onChange={e => setNewFolder(e.target.value)} onKeyDown={e => e.key === 'Enter' && addFolder()} placeholder="/absolute/path/to/Music  (or Browse…)" style={{ flex: 1, minWidth: 260, padding: 8, border: '1px solid #ccc', borderRadius: 6 }} />
              <button onClick={addFolder}>Add</button>
              <button onClick={browseFolder} title="Open native OS folder picker (macOS/Linux/Windows)">Browse…</button>
              <button className="primary" onClick={doScan} disabled={scanning}>{scanning ? 'Scanning…' : 'Scan all'}</button>
              <button onClick={refresh} disabled={scanning}>Re-scan</button>
            </div>
            {folders.length > 0 && <ul style={{ marginTop: 8, paddingLeft: 18 }}>{folders.map((f,i) => <li key={f} style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ flex: 1, wordBreak: 'break-all' }} title={f}>{shortFolder(f)}</span><button onClick={() => removeFolder(i)} style={{ padding: '2px 8px' }}>Remove</button></li>)}</ul>}
            {folders.length === 0 && <p className="muted" style={{ marginTop: 8 }}>Add one or more absolute folder paths — scan merges all MP3s.</p>}
          </div>

          <div className="toolbar">
            <input type="text" placeholder="Search title or artist…" value={search} onChange={e => setSearch(e.target.value)} />
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={showDupesOnly} onChange={e => setShowDupesOnly(e.target.checked)} /> Duplicates only {dupeCount > 0 && `(${dupeCount})`}</label>
            {playingId && <button onClick={handleStop}>Stop</button>}
          </div>
          <p className="muted" style={{ marginBottom: 8 }}>{filteredSorted.length} tracks {search && `(filtered from ${tracks.length})`} {dupeCount > 0 && `— ${dupeCount} duplicates detected (by artist+title+album)`}</p>
          <table>
            <thead><tr>
              <th>Play</th>
              <th onClick={() => toggleSort('title')}>Title{arrow('title')}</th>
              <th onClick={() => toggleSort('artist')}>Artist{arrow('artist')}</th>
              <th onClick={() => toggleSort('album')}>Album{arrow('album')}</th>
              <th>Genre</th><th>Duration</th>
              <th onClick={() => toggleSort('year')}>Year{arrow('year')}</th>
              <th>File</th>
            </tr></thead>
            <tbody>
              {filteredSorted.map(t => {
                const isThisPlaying = playingId === t.id && !isPaused;
                const isThisPaused = playingId === t.id && isPaused;
                return (
                <tr key={t.id} style={t.duplicateGroupId ? { background: '#fff3cd' } : undefined} title={t.duplicateGroupId ? `Duplicate: ${t.duplicateGroupId}` : t.filePath}>
                  <td>
                    <button onClick={() => handlePlay(t)} title={isThisPlaying ? 'Pause' : isThisPaused ? 'Resume' : 'Play'} style={{ padding: '4px 10px' }}>
                      {isThisPlaying ? '⏸' : isThisPaused ? '▶' : '▶'}
                    </button>
                    {playingId === t.id && <button onClick={handleStop} style={{ marginLeft: 4, padding: '4px 8px' }} title="Stop">⏹</button>}
                  </td>
                  <td>{t.title} {t.duplicateGroupId && <span style={{ fontSize: 11, background: '#ffc107', padding: '1px 6px', borderRadius: 8 }}>dup</span>}</td>
                  <td>{t.artist}</td><td>{t.album}</td><td>{t.genre}</td><td>{formatDuration(t.duration)}</td><td>{t.year ?? '—'}</td><td className="muted" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.filePath}>{shortFile(t.filePath)}</td>
                </tr>
                );
              })}
              {filteredSorted.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 20 }}>{showDupesOnly ? 'No duplicates found.' : 'No tracks. Add folders and hit Scan all.'}</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {tab === 'wishlist' && (
        <>
          <div className="wishlist-form">
            <label>Name*<input value={wName} onChange={e => setWName(e.target.value)} placeholder="Song name" /></label>
            <label>Artist<input value={wArtist} onChange={e => setWArtist(e.target.value)} placeholder="Optional" /></label>
            <label>Priority<select value={wPriority} onChange={e => setWPriority(e.target.value as any)}><option>High</option><option>Medium</option><option>Low</option></select></label>
            <button className="primary" onClick={addWishlist}>Add to wishlist</button>
            <label style={{ flexDirection: 'row', alignItems: 'center' }}><input type="checkbox" checked={wishlistSortByDate} onChange={e => setWishlistSortByDate(e.target.checked)} /> Sort by date</label>
          </div>
          <p className="muted" style={{ marginBottom: 8 }}>Sorted by priority (High → Medium → Low), then date added within each tier.</p>
          <table>
            <thead><tr><th>Name</th><th>Artist</th><th>Priority</th><th>Date added</th><th>Actions</th></tr></thead>
            <tbody>
              {displayedWishlist.map(it => (
                <tr key={it.id}>
                  <td>{editingId === it.id ? <input value={editName} onChange={e => setEditName(e.target.value)} /> : it.name}</td>
                  <td>{editingId === it.id ? <input value={editArtist} onChange={e => setEditArtist(e.target.value)} /> : (it.artist ?? '—')}</td>
                  <td>{editingId === it.id ? <select value={editPriority} onChange={e => setEditPriority(e.target.value as any)}><option>High</option><option>Medium</option><option>Low</option></select> : <span className={`badge ${it.priority}`}>{it.priority}</span>}</td>
                  <td>{new Date(it.dateAdded).toLocaleDateString()}</td>
                  <td><div className="row-actions">
                    {editingId === it.id ? <><button onClick={saveEdit}>Save</button><button onClick={() => setEditingId(null)}>Cancel</button></> : <><button onClick={() => startEdit(it)}>Edit</button><button onClick={() => del(it.id)}>Delete</button></>}
                  </div></td>
                </tr>
              ))}
              {displayedWishlist.length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 20 }}>No wishlist items yet.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

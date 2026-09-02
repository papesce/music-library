import { useEffect, useMemo, useRef, useState } from 'react';
import type { Track, WishlistItem } from './types/api.d';
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
  const [drawerOpen, setDrawerOpen] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const playingTrack = useMemo(() => tracks.find(t => t.id === playingId) ?? null, [tracks, playingId]);

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
    setFolders(next); setNewFolder('');
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
        setFolders(next); await api.setConfig(next);
      } else if (res.message) setError(res.message);
    } catch (e: any) { setError(e.message); }
  };
  const doScan = async () => {
    if (folders.length === 0) { setError('Add a folder in settings first'); setDrawerOpen(true); return; }
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
      return t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.album.toLowerCase().includes(q);
    });
    return [...arr].sort((a, b) => {
      const av = (a[sortKey] ?? '') as string | number;
      const bv = (b[sortKey] ?? '') as string | number;
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [tracks, search, sortKey, sortDir, showDupesOnly]);

  const dupeCount = useMemo(() => tracks.filter(t => t.duplicateGroupId).length, [tracks]);

  const streamUrl = (t: Track) => `/api/stream?path=${encodeURIComponent(t.filePath)}`;
  const handlePlay = (t: Track) => {
    const audio = audioRef.current; if (!audio) return;
    if (playingId === t.id) {
      if (isPaused) { audio.play(); setIsPaused(false); }
      else { audio.pause(); setIsPaused(true); }
      return;
    }
    audio.src = streamUrl(t);
    audio.play().then(() => { setPlayingId(t.id); setIsPaused(false); }).catch(e => setError(e.message));
  };
  const handleStop = () => {
    const audio = audioRef.current; if (!audio) return;
    audio.pause(); audio.currentTime = 0; audio.removeAttribute('src'); audio.load();
    setPlayingId(null); setIsPaused(false);
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
      {/* Header */}
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">♪</div>
          <div>
            <h1>Music Library</h1>
            <p>{tracks.length} tracks {dupeCount > 0 ? `· ${dupeCount} dupes` : ''} · {folders.length} folders</p>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <div className="glass nav-pill">
            <button className={tab==='library'?'active':''} onClick={() => setTab('library')}>Library</button>
            <button className={tab==='wishlist'?'active':''} onClick={() => setTab('wishlist')}>Wishlist</button>
          </div>
          <button className="glass icon-btn" onClick={() => setDrawerOpen(true)} title="Folders & scan">⚙</button>
        </div>
      </header>

      {error && <div className="toast"><span>{error}</span><button onClick={() => setError('')}>✕</button></div>}

      {tab === 'library' && (
        <>
          <div className="hero">
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
              <div className="glass search-pill" style={{ minWidth:260 }}>
                <span>⌕</span>
                <input placeholder="Search title, artist, album…" value={search} onChange={e => setSearch(e.target.value)} />
                {search && <button onClick={() => setSearch('')} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer' }}>✕</button>}
              </div>
              <div className="glass segmented">
                <button className={!showDupesOnly?'active':''} onClick={() => setShowDupesOnly(false)}>All</button>
                <button className={showDupesOnly?'active':''} onClick={() => setShowDupesOnly(true)}>Dupes {dupeCount>0?`· ${dupeCount}`:''}</button>
              </div>
              <button className="btn btn-primary" onClick={doScan} disabled={scanning}>{scanning ? 'Scanning…' : 'Scan'}</button>
              <button className="btn glass-soft" onClick={refresh} disabled={scanning}>Re-scan</button>
            </div>
            <div className="meta-row">
              <span className="muted">{filteredSorted.length} tracks {search && `(from ${tracks.length})`}</span>
              {dupeCount>0 && <span className="muted">· duplicates by artist+title+album</span>}
              {playingId && <button className="btn glass-soft" style={{ marginLeft:'auto' }} onClick={handleStop}>⏹ Stop</button>}
            </div>
          </div>

          {/* quick stats */}
          <div className="stats">
            <div className="glass stat"><b>{tracks.length}</b><span>total</span></div>
            <div className="glass stat"><b>{filteredSorted.length}</b><span>shown</span></div>
            {dupeCount>0 && <div className="glass stat" style={{ borderColor:'rgba(255,193,7,0.25)' }}><b>{dupeCount}</b><span>dupes</span></div>}
          </div>

          <div className="glass table-wrap">
            <table>
              <thead><tr>
                <th style={{ width:56 }}></th>
                <th onClick={() => toggleSort('title')}>Title{arrow('title')}</th>
                <th onClick={() => toggleSort('artist')}>Artist{arrow('artist')}</th>
                <th onClick={() => toggleSort('album')}>Album{arrow('album')}</th>
                <th>Genre</th><th>Duration</th>
                <th onClick={() => toggleSort('year')}>Year{arrow('year')}</th>
                <th>File</th>
              </tr></thead>
              <tbody>
                {filteredSorted.map(t => {
                  const isPlaying = playingId===t.id && !isPaused;
                  const isPausedThis = playingId===t.id && isPaused;
                  return (
                    <tr key={t.id} className={`${playingId===t.id?'playing':''} ${t.duplicateGroupId?'dup':''}`} title={t.filePath}>
                      <td>
                        <button className={`play-btn ${playingId===t.id?'':'ghost'}`} onClick={() => handlePlay(t)} title={isPlaying?'Pause':isPausedThis?'Resume':'Play'}>
                          {isPlaying ? '⏸' : '▶'}
                        </button>
                      </td>
                      <td><span style={{ fontWeight:600 }}>{t.title}</span>{t.duplicateGroupId && <span className="dup-badge">dup</span>}</td>
                      <td style={{ color:'var(--muted)' }}>{t.artist}</td>
                      <td style={{ color:'var(--muted)' }}>{t.album}</td>
                      <td className="muted">{t.genre || '—'}</td>
                      <td className="muted">{formatDuration(t.duration)}</td>
                      <td className="muted">{t.year ?? '—'}</td>
                      <td className="muted cell-ellipsis" title={t.filePath}>{shortFile(t.filePath)}</td>
                    </tr>
                  );
                })}
                {filteredSorted.length===0 && (
                  <tr><td colSpan={8}><div className="empty" style={{ border:'none' }}>
                    <b>{showDupesOnly ? 'No duplicates' : 'No tracks yet'}</b>
                    <span>{showDupesOnly ? 'Your library is clean.' : 'Add a folder in settings and hit Scan.'}</span>
                  </div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'wishlist' && (
        <>
          <div className="glass form-pill">
            <label>Name*<input value={wName} onChange={e => setWName(e.target.value)} placeholder="Song name" /></label>
            <label>Artist<input value={wArtist} onChange={e => setWArtist(e.target.value)} placeholder="Optional" /></label>
            <label>Priority<select value={wPriority} onChange={e => setWPriority(e.target.value as any)}><option>High</option><option>Medium</option><option>Low</option></select></label>
            <button className="btn btn-primary" onClick={addWishlist}>Add</button>
            <div className="glass segmented" style={{ marginLeft:'auto' }}>
              <button className={!wishlistSortByDate?'active':''} onClick={() => setWishlistSortByDate(false)}>By priority</button>
              <button className={wishlistSortByDate?'active':''} onClick={() => setWishlistSortByDate(true)}>By date</button>
            </div>
          </div>
          <p className="muted" style={{ marginBottom:12 }}>
            {displayedWishlist.length} items · Sorted by {wishlistSortByDate ? 'newest first' : 'priority → date'}
          </p>
          {displayedWishlist.length===0 ? (
            <div className="empty glass"><b>No wishlist yet</b>Add the tracks you're hunting for.</div>
          ) : (
            <div className="wishlist-grid">
              {displayedWishlist.map(it => (
                <div key={it.id} className={`glass wish-card ${it.priority}`}>
                  <div className="wish-top">
                    <div style={{ flex:1, minWidth:0 }}>
                      {editingId===it.id ? (
                        <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name" style={{ width:'100%', padding:'8px 10px', borderRadius:10, border:'1px solid var(--border)', background:'rgba(255,255,255,0.06)', color:'var(--text)' }} />
                      ) : (
                        <b style={{ display:'block', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{it.name}</b>
                      )}
                      {editingId===it.id ? (
                        <input value={editArtist} onChange={e => setEditArtist(e.target.value)} placeholder="Artist" style={{ width:'100%', marginTop:6, padding:'8px 10px', borderRadius:10, border:'1px solid var(--border)', background:'rgba(255,255,255,0.06)', color:'var(--text)' }} />
                      ) : (
                        <span className="muted" style={{ fontSize:12 }}>{it.artist ?? '—'}</span>
                      )}
                    </div>
                    {editingId===it.id ? (
                      <select value={editPriority} onChange={e => setEditPriority(e.target.value as any)} style={{ padding:'6px 8px', borderRadius:999, background:'rgba(255,255,255,0.08)', color:'var(--text)', border:'1px solid var(--border)' }}>
                        <option>High</option><option>Medium</option><option>Low</option>
                      </select>
                    ) : (
                      <span className={`badge ${it.priority}`}>{it.priority}</span>
                    )}
                  </div>
                  <span className="muted" style={{ fontSize:12 }}>{new Date(it.dateAdded).toLocaleDateString()}</span>
                  <div className="row-actions">
                    {editingId===it.id ? (
                      <><button className="btn btn-primary" onClick={saveEdit} style={{ padding:'6px 12px' }}>Save</button><button className="btn" onClick={() => setEditingId(null)} style={{ padding:'6px 12px' }}>Cancel</button></>
                    ) : (
                      <><button className="btn" onClick={() => startEdit(it)} style={{ padding:'6px 12px' }}>Edit</button><button className="btn" onClick={() => del(it.id)} style={{ padding:'6px 12px' }}>Delete</button></>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Settings Drawer */}
      {drawerOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <div className="glass drawer">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <h3>Folders</h3>
              <button className="btn" onClick={() => setDrawerOpen(false)} style={{ padding:'6px 10px' }}>✕</button>
            </div>
            <p className="muted">Manage scan locations. Scanning merges all MP3s. Path stays local.</p>
            <div className="folder-input">
              <input value={newFolder} onChange={e => setNewFolder(e.target.value)} onKeyDown={e => e.key==='Enter' && addFolder()} placeholder="/absolute/path/to/Music" />
              <button className="btn" onClick={addFolder}>Add</button>
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:14 }}>
              <button className="btn glass-soft" onClick={browseFolder}>Browse…</button>
              <button className="btn btn-primary" onClick={doScan} disabled={scanning}>{scanning?'Scanning…':'Scan all'}</button>
            </div>
            {folders.length>0 ? (
              <ul className="folder-list">
                {folders.map((f,i) => (
                  <li key={f} className="glass-soft folder-item">
                    <span title={f}>{shortFolder(f)}</span>
                    <button className="btn" style={{ padding:'4px 10px', fontSize:12 }} onClick={() => removeFolder(i)}>Remove</button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty" style={{ padding:20 }}><b>No folders</b>Add one above or use Browse…</div>
            )}
            <p className="muted" style={{ marginTop:12, fontSize:11 }}>Tip: Use an absolute path. You can add multiple folders — they’re merged on scan.</p>
          </div>
        </>
      )}

      {/* Bottom Player Dock */}
      {playingTrack && (
        <div className="glass player-dock">
          <div className="player-art">♪</div>
          <div className="player-info">
            <b>{playingTrack.title}</b>
            <span>{playingTrack.artist} · {playingTrack.album}</span>
          </div>
          <div className="player-controls">
            <button className="play-btn" onClick={() => playingTrack && handlePlay(playingTrack)} title={isPaused?'Resume':'Pause'}>{isPaused?'▶':'⏸'}</button>
            <button className="play-btn ghost" onClick={handleStop} title="Stop">⏹</button>
          </div>
          <audio
            ref={audioRef}
            controls
            onEnded={() => { setPlayingId(null); setIsPaused(false); }}
            onPause={() => { if (playingId) setIsPaused(true); }}
            onPlay={() => { if (playingId) setIsPaused(false); }}
          />
        </div>
      )}
      {/* hidden audio when nothing playing to keep ref alive */}
      {!playingTrack && (
        <audio
          ref={audioRef}
          style={{ display:'none' }}
          onEnded={() => { setPlayingId(null); setIsPaused(false); }}
          onPause={() => { if (playingId) setIsPaused(true); }}
          onPlay={() => { if (playingId) setIsPaused(false); }}
        />
      )}
    </div>
  );
}

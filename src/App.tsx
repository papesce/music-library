import { useEffect, useState } from 'react';
import type { Track } from './types/api.d';
import { api } from './api';
import { SplitModal } from './components/split/SplitModal';
import { FolderDrawer } from './components/FolderDrawer';
import { Toast } from './components/ui/Toast';
import { LibraryHero } from './features/library/LibraryHero';
import { TrackList } from './features/library/TrackList';
import { DeleteTrackModal } from './features/library/DeleteTrackModal';
import { EditTrackModal } from './features/library/EditTrackModal';
import { WishlistTab } from './features/wishlist/WishlistTab';
import { AudioElement } from './features/player/AudioElement';
import { UnifiedPlayer } from './features/player/UnifiedPlayer';
import { useFolders } from './features/settings/useFolders';
import { useLibrary } from './features/library/useLibrary';
import { usePlayer } from './features/player/usePlayer';
import { useWishlist } from './features/wishlist/useWishlist';
import { useToast } from './hooks/useToast';

type Tab = 'library' | 'wishlist';

export default function App() {
  const [tab, setTab] = useState<Tab>('library');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [scanning, setScanning] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmTrack, setConfirmTrack] = useState<Track | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editTrack, setEditTrack] = useState<Track | null>(null);
  const [splitTrack, setSplitTrack] = useState<Track | null>(null);
  const [nowOpen, setNowOpen] = useState(true);
  const [batchResults, setBatchResults] = useState<{ path: string; status: string; source?: string; lrc?: string; error?: string }[] | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);

  const { error, setError, dismiss } = useToast();
  const foldersCtl = useFolders(setError);
  const player = usePlayer(tracks, setError);

  // auto-expand unified player when a new track starts (0 clicks to lyrics)
  useEffect(() => {
    if (player.playingTrack) setNowOpen(true);
  }, [player.playingTrack?.id]);
  useEffect(() => {
    if (!player.playingTrack) setNowOpen(false);
  }, [player.playingTrack]);
  const lib = useLibrary(tracks);
  const wishlistCtl = useWishlist();

  // initial load
  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.getConfig();
        const fs = cfg.folders ?? (cfg.lastFolder ? [cfg.lastFolder] : []);
        foldersCtl.setFolders(fs);
        setTracks(await api.getLibrary());
        const wl = await api.getWishlist();
        wishlistCtl.setWishlist(wl);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doScan = async () => {
    if (foldersCtl.folders.length === 0) {
      setError('Add a folder in settings first');
      setDrawerOpen(true);
      return;
    }
    setError('');
    setScanning(true);
    try {
      setTracks(await api.scanFolders(foldersCtl.folders));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const refresh = async () => {
    try {
      if (foldersCtl.folders.length) setTracks(await api.scanFolders(foldersCtl.folders));
      else setTracks(await api.validateLibrary());
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const confirmDeleteTrack = async () => {
    if (!confirmTrack) return;
    setDeleting(true);
    setError('');
    try {
      await api.deleteTrack(confirmTrack.filePath);
      setTracks(prev => prev.filter(t => t.filePath !== confirmTrack.filePath));
      if (player.playingId === confirmTrack.id) player.handleStop();
      setConfirmTrack(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const toggleReviewed = async (t: Track) => {
    try {
      const updated = await api.setReviewed(t.filePath, !t.reviewed);
      setTracks(prev => prev.map(x => (x.filePath === t.filePath ? updated : x)));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const runBatchLyrics = async () => {
    setBatchRunning(true); setError('');
    try {
      const r = await api.batchDetectLyrics({ source: 'auto', model: 'base', limit: 30 });
      setBatchResults(r.results);
      if (!r.results.length) setError('No tracks missing lyrics found (or all have .lrc/USLT)');
    } catch (e: any) { setError(e.message); }
    finally { setBatchRunning(false); }
  };
  const confirmBatchSave = async () => {
    if (!batchResults) return;
    const items = batchResults.filter(r => r.status === 'preview' && r.lrc).map(r => ({ path: r.path, lrc: r.lrc! }));
    if (!items.length) { setError('No previews to save'); return; }
    setBatchRunning(true);
    try {
      const r = await api.batchSaveLyrics(items);
      const ok = r.results.filter(x => x.ok).length;
      setError(`Saved ${ok}/${items.length} .lrc files + USLT`);
      setBatchResults(null);
    } catch (e: any) { setError(e.message); }
    finally { setBatchRunning(false); }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">♪</div>
          <div>
            <h1>Music Library</h1>
            <p>
              {tracks.length} tracks {lib.dupeCount > 0 ? `· ${lib.dupeCount} dupes` : ''} · {foldersCtl.folders.length} folders
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="glass nav-pill">
            <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}>
              Library
            </button>
            <button className={tab === 'wishlist' ? 'active' : ''} onClick={() => setTab('wishlist')}>
              Wishlist
            </button>
          </div>
          <button className="glass icon-btn" onClick={() => setDrawerOpen(true)} title="Folders & scan">
            ⚙
          </button>
        </div>
      </header>

      <Toast message={error} onDismiss={dismiss} />

      {tab === 'library' && (
        <>
          <LibraryHero
            search={lib.search}
            setSearch={lib.setSearch}
            showDupesOnly={lib.showDupesOnly}
            setShowDupesOnly={lib.setShowDupesOnly}
            hideReviewed={lib.hideReviewed}
            setHideReviewed={lib.setHideReviewed}
            dupeCount={lib.dupeCount}
            reviewedCount={lib.reviewedCount}
            filteredCount={lib.filteredSorted.length}
            totalCount={tracks.length}
            scanning={scanning}
            onScan={doScan}
            onRefresh={refresh}
            playing={!!player.playingId}
            onStop={player.handleStop}
            onBatchLyrics={runBatchLyrics}
            batchRunning={batchRunning}
          />
          {batchResults && (
            <div className="glass" style={{ margin: '12px 0', padding: 12, borderRadius: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <b style={{ fontSize: 13 }}>Batch lyrics preview · {batchResults.length} candidates</b>
                <button className="btn" onClick={() => setBatchResults(null)}>✕ Close</button>
              </div>
              <div style={{ maxHeight: 260, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {batchResults.map(r => (
                  <div key={r.path} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, fontFamily: 'ui-monospace, monospace', padding: '6px 8px', borderRadius: 8, background: r.status === 'preview' ? 'rgba(46,204,113,0.08)' : r.status === 'not_found' ? 'rgba(255,255,255,0.04)' : 'rgba(255,80,80,0.08)', border: '1px solid var(--border)' }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.path.split('/').pop()}</span>
                    <span style={{ fontSize: 11, opacity: 0.8 }}>{r.status}{r.source ? ` · ${r.source}` : ''}</span>
                    {r.error && <span style={{ color: 'var(--danger)' }}>{r.error.slice(0, 80)}</span>}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={confirmBatchSave} disabled={batchRunning || !batchResults.some(r => r.status === 'preview')}>Save all previews ({batchResults.filter(r => r.status === 'preview').length})</button>
                <span style={{ fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>Saves .lrc + USLT for each preview. Review in player before/after.</span>
              </div>
            </div>
          )}
          <TrackList
            tracks={lib.filteredSorted}
            playingId={player.playingId}
            isPaused={player.isPaused}
            sortKey={lib.sortKey}
            sortDir={lib.sortDir}
            toggleSort={lib.toggleSort}
            onPlay={t => {
              player.handlePlay(t);
              setNowOpen(true);
            }}
            onSplit={setSplitTrack}
            onEdit={setEditTrack}
            onDelete={setConfirmTrack}
            onToggleReviewed={toggleReviewed}
            showDupesOnly={lib.showDupesOnly}
          />
        </>
      )}

      {tab === 'wishlist' && (
        <WishlistTab
          wName={wishlistCtl.wName}
          setWName={wishlistCtl.setWName}
          wArtist={wishlistCtl.wArtist}
          setWArtist={wishlistCtl.setWArtist}
          wPriority={wishlistCtl.wPriority}
          setWPriority={wishlistCtl.setWPriority}
          sortByDate={wishlistCtl.sortByDate}
          setSortByDate={wishlistCtl.setSortByDate}
          displayed={wishlistCtl.displayed}
          onAdd={() => wishlistCtl.add(setError)}
          editingId={wishlistCtl.editingId}
          setEditingId={wishlistCtl.setEditingId}
          editName={wishlistCtl.editName}
          setEditName={wishlistCtl.setEditName}
          editArtist={wishlistCtl.editArtist}
          setEditArtist={wishlistCtl.setEditArtist}
          editPriority={wishlistCtl.editPriority}
          setEditPriority={wishlistCtl.setEditPriority}
          onStartEdit={wishlistCtl.startEdit}
          onSaveEdit={wishlistCtl.saveEdit}
          onDelete={wishlistCtl.del}
        />
      )}

      <FolderDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        folders={foldersCtl.folders}
        newFolder={foldersCtl.newFolder}
        setNewFolder={foldersCtl.setNewFolder}
        onAdd={foldersCtl.addFolder}
        onRemove={foldersCtl.removeFolder}
        onBrowse={foldersCtl.browseFolder}
        onScan={doScan}
        scanning={scanning}
      />

      {confirmTrack && <DeleteTrackModal track={confirmTrack} deleting={deleting} onCancel={() => setConfirmTrack(null)} onConfirm={confirmDeleteTrack} />}

      {editTrack && <EditTrackModal track={editTrack} onClose={() => setEditTrack(null)} onUpdated={(t, oldFilePath) => { setTracks(prev => prev.map(x => (x.filePath === (oldFilePath ?? t.filePath) ? t : x))); if (oldFilePath && player.playingId === oldFilePath) player.setPlayingId(t.id); }} setError={setError} />}

      <UnifiedPlayer
        track={player.playingTrack}
        isPaused={player.isPaused}
        currentTime={player.currentTime}
        duration={player.duration || player.playingTrack?.duration || 0}
        onToggle={() => player.playingTrack && player.handlePlay(player.playingTrack)}
        onStop={() => {
          player.handleStop();
          setNowOpen(false);
        }}
        onSeek={player.seek}
        expanded={nowOpen}
        onExpand={() => setNowOpen(true)}
        onCollapse={() => setNowOpen(false)}
        onEdit={player.playingTrack ? () => setEditTrack(player.playingTrack!) : undefined}
      />

      {splitTrack && (
        <SplitModal
          track={splitTrack}
          onClose={() => setSplitTrack(null)}
          onExported={async () => {
            try {
              const cfg = await api.getConfig();
              const fs = cfg.folders ?? [];
              if (fs.length) setTracks(await api.scanFolders(fs));
              else setTracks(await api.getLibrary());
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      )}

      <AudioElement audioRef={player.audioRef} playingId={player.playingId} setPlayingId={player.setPlayingId} setIsPaused={player.setIsPaused} setError={setError} />
    </div>
  );
}

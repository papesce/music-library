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
  const [coverBust, setCoverBust] = useState<Record<string, number>>({});

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
            onExported={refresh}
            setError={setError}
          />
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
            coverBust={coverBust}
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

      {editTrack && <EditTrackModal track={editTrack} onClose={() => setEditTrack(null)} onUpdated={(t, oldFilePath) => { setTracks(prev => prev.map(x => (x.filePath === (oldFilePath ?? t.filePath) ? t : x))); setCoverBust(prev => ({ ...prev, [t.filePath]: Date.now() })); if (oldFilePath && oldFilePath !== t.filePath) setCoverBust(prev => { const { [oldFilePath]: _, ...rest } = prev; return rest; }); if (oldFilePath && player.playingId === oldFilePath) player.setPlayingId(t.id); }} setError={setError} />}

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
        coverBust={player.playingTrack ? coverBust[player.playingTrack.filePath] : undefined}
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

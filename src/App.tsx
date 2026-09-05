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
import { usePlayHistory } from './features/player/usePlayHistory';
import { PlayHistory } from './features/player/PlayHistory';
import { useWishlist } from './features/wishlist/useWishlist';
import { useToast } from './hooks/useToast';
import { usePersistedState } from './lib/persist';

type Tab = 'library' | 'wishlist';

export default function App() {
  const [tabRaw, setTab] = usePersistedState<Tab>('app:tab', 'library');
  const tab: Tab = tabRaw === 'wishlist' ? 'wishlist' : 'library';
  const [tracks, setTracks] = useState<Track[]>([]);
  const [scanning, setScanning] = useState(false);
  const [drawerOpen, setDrawerOpen] = usePersistedState<boolean>('app:drawerOpen', false);
  const [confirmTrack, setConfirmTrack] = useState<Track | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editTrack, setEditTrack] = useState<Track | null>(null);
  const [splitTrackPath, setSplitTrackPath] = usePersistedState<string | null>('app:splitTrackPath', null);
  const [nowOpen, setNowOpen] = usePersistedState<boolean>('app:nowOpen', true);
  const [revealId, setRevealId] = useState<string | null>(null);
  const [coverBust, setCoverBust] = useState<Record<string, number>>({});
  const splitTrack = splitTrackPath ? (tracks.find(t => t.filePath === splitTrackPath) ?? null) : null;
  const setSplitTrack = (t: Track | null) => setSplitTrackPath(t?.filePath ?? null);

  const { error, setError, dismiss } = useToast();
  const foldersCtl = useFolders(setError);
  const player = usePlayer(tracks, setError);
  const history = usePlayHistory(tracks);

  // record history when a track actually starts playing (not on pause toggle)
  useEffect(() => {
    if (player.playingTrack && !player.isPaused) {
      history.push(player.playingTrack.id);
    }
  }, [player.playingTrack?.id, player.isPaused]);

  // auto-expand unified player when a new track starts (0 clicks to lyrics)
  useEffect(() => {
    if (player.playingTrack) setNowOpen(true);
  }, [player.playingTrack?.id]);
  useEffect(() => {
    if (!player.playingTrack) setNowOpen(false);
  }, [player.playingTrack]);
  // clear stale persisted split path if track no longer exists
  useEffect(() => {
    if (splitTrackPath && tracks.length > 0 && !tracks.some(t => t.filePath === splitTrackPath)) {
      setSplitTrackPath(null);
    }
  }, [tracks, splitTrackPath]);
  // pause preview player when entering split (avoids overlapping playback with SplitModal's waveform)
  useEffect(() => {
    if (splitTrackPath && player.playingId && !player.isPaused) {
      player.audioRef.current?.pause();
      player.setIsPaused(true);
    }
  }, [splitTrackPath]);

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

  const setLoudness = async (t: Track, v: 'normal' | 'loud' | null) => {
    try {
      const updated = await api.setLoudness(t.filePath, v);
      setTracks(prev => prev.map(x => (x.filePath === t.filePath ? updated : x)));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const playRandom = () => {
    const pool = lib.filteredSorted;
    if (pool.length === 0) { setError('No tracks match current filters'); return; }
    const pick = pool[Math.floor(Math.random() * pool.length)]!;
    // reveal row first so it stays in view when player collapses
    setRevealId(pick.id);
    // let TrackList scroll before opening the player
    requestAnimationFrame(() => {
      player.handlePlay(pick);
      setNowOpen(true);
    });
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
          <button className="glass icon-btn" onClick={() => window.open('https://y2mate.gs', '_blank', 'noopener,noreferrer')} title="Open y2mate.gs" aria-label="Open y2mate.gs" style={{ padding: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="8 8 62 62" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ display: 'block' }}>
              <path d="M49.6762 62.0383C50.6511 63.0132 50.6511 64.5956 49.6762 65.5705L48.7932 66.4536C43.924 71.3227 36.0013 71.3227 31.1321 66.4536L13.471 48.7925C8.60187 43.9234 8.60187 36.0006 13.471 31.1314L17.8863 26.7162C18.8612 25.7413 20.4436 25.7413 21.4185 26.7162C22.3934 27.6911 22.3934 29.2735 21.4185 30.2484L17.0032 34.6637C14.0812 37.5857 14.0812 42.3383 17.0032 45.2603L34.6643 62.9214C37.5863 65.8434 42.3389 65.8434 45.261 62.9214L46.144 62.0383C47.1189 61.0634 48.7013 61.0634 49.6762 62.0383Z" fill="#D62828"/>
              <path d="M66.4543 31.1314C71.3234 36.0006 71.3234 43.9233 66.4543 48.7925L62.039 53.2078C61.0641 54.1827 59.4817 54.1827 58.5068 53.2078C57.5319 52.2329 57.5319 50.6505 58.5068 49.6756L62.922 45.2603C65.8441 42.3383 65.8441 37.5857 62.922 34.6636L45.261 17.0026C42.3389 14.0806 37.5863 14.0806 34.6643 17.0026L33.7813 17.8856C32.8064 18.8605 31.2239 18.8605 30.2491 17.8856C29.2742 16.9107 29.2742 15.3283 30.2491 14.3534L31.1321 13.4704C36.0013 8.60121 43.924 8.60121 48.7932 13.4704L66.4543 31.1314Z" fill="#D62828"/>
              <path d="M55.945 57.3802C54.9931 57.5533 54.1612 56.7215 54.3352 55.7704L56.2611 45.2029C56.4598 44.1035 57.8118 43.6823 58.6012 44.4717L67.2437 53.1142C68.0331 53.9036 67.611 55.2547 66.5134 55.4552L55.945 57.3802Z" fill="#D62828"/>
              <path d="M23.9803 22.5437C24.9322 22.3707 25.764 23.2025 25.5901 24.1535L23.6641 34.721C23.4655 35.8204 22.1135 36.2417 21.3241 35.4522L12.6825 26.8106C11.893 26.0212 12.3151 24.6701 13.4128 24.4697L23.9803 22.5437Z" fill="#D62828"/>
              <path d="M31.5355 43.9781C29.5829 42.0255 29.5829 38.8597 31.5355 36.9071L36.9446 31.498C38.8972 29.5454 42.063 29.5454 44.0157 31.498L49.4247 36.9071C51.3774 38.8597 51.3774 42.0255 49.4247 43.9781L44.0157 49.3872C42.063 51.3398 38.8972 51.3398 36.9446 49.3872L31.5355 43.9781Z" fill="#D62828"/>
            </svg>
          </button>
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
            playing={!!player.playingId}
            onStop={player.handleStop}
            onPlayRandom={playRandom}
            onExported={refresh}
            setError={setError}
            loudnessFilter={lib.loudnessFilter}
            setLoudnessFilter={lib.setLoudnessFilter}
            loudnessCount={lib.loudnessCount}
          />
          <PlayHistory
            tracks={history.historyTracks}
            playingId={player.playingId}
            isPaused={player.isPaused}
            onPlay={t => {
              setRevealId(t.id);
              player.handlePlay(t);
              setNowOpen(true);
            }}
            onClear={history.clear}
            onRemove={history.remove}
            coverBust={coverBust}
          />
          <TrackList
            tracks={lib.filteredSorted}
            playingId={player.playingId}
            isPaused={player.isPaused}
            sortKey={lib.sortKey}
            sortDir={lib.sortDir}
            toggleSort={lib.toggleSort}
            revealId={revealId}
            searchQuery={lib.search}
            onPlay={t => {
              setRevealId(t.id);
              player.handlePlay(t);
              setNowOpen(true);
            }}
            onSplit={t => {
              if (player.playingId && !player.isPaused) {
                player.audioRef.current?.pause();
                player.setIsPaused(true);
              }
              setSplitTrack(t);
            }}
            onEdit={setEditTrack}
            onDelete={setConfirmTrack}
            onToggleReviewed={toggleReviewed}
            onSetLoudness={setLoudness}
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
        onStateImported={(libTracks, wl) => { setTracks(libTracks); foldersCtl.setFolders(libTracks.length ? foldersCtl.folders : []); wishlistCtl.setWishlist(wl); }}
        setError={setError}
      />

      {confirmTrack && <DeleteTrackModal track={confirmTrack} deleting={deleting} onCancel={() => setConfirmTrack(null)} onConfirm={confirmDeleteTrack} />}

      {editTrack && <EditTrackModal track={editTrack} onClose={() => setEditTrack(null)} onUpdated={(t, oldFilePath) => { setTracks(prev => prev.map(x => (x.filePath === (oldFilePath ?? t.filePath) ? t : x))); setCoverBust(prev => ({ ...prev, [t.filePath]: Date.now() })); if (oldFilePath && oldFilePath !== t.filePath) setCoverBust(prev => { const { [oldFilePath]: _, ...rest } = prev; return rest; }); if (oldFilePath && player.playingId === oldFilePath) player.setPlayingId(t.id); }} setError={setError} playback={{ isActive: player.playingId === editTrack.id, isPaused: player.isPaused, onToggle: () => player.handlePlay(editTrack) }} />}

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
        onSplit={
          player.playingTrack
            ? () => {
                if (!player.isPaused) {
                  player.audioRef.current?.pause();
                  player.setIsPaused(true);
                }
                setSplitTrack(player.playingTrack!);
              }
            : undefined
        }
        coverBust={player.playingTrack ? coverBust[player.playingTrack.filePath] : undefined}
        volume={player.volume}
        muted={player.muted}
        onVolumeChange={player.setVolume}
        onMutedChange={player.setMuted}
        onPlayRandom={playRandom}
      />

      {splitTrack && (
        <SplitModal
          track={splitTrack}
          libraryTracks={tracks}
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

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

  const playRandom = () => {
    const pool = lib.filteredSorted;
    if (pool.length === 0) { setError('No tracks match current filters'); return; }
    const pick = pool[Math.floor(Math.random() * pool.length)]!;
    player.handlePlay(pick);
    setNowOpen(true);
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
          <button className="glass icon-btn" onClick={() => window.open('https://y2mate.gs', '_blank', 'noopener,noreferrer')} title="Open y2mate.gs" aria-label="Open y2mate.gs" style={{ padding: '6px 10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="78" height="18" viewBox="0 0 257 62" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ display: 'block' }}>
              <g transform="translate(-9,-9)">
                <path d="M253.41 59.4449C250.712 59.4449 248.414 58.8954 246.516 57.7964C244.651 56.6642 243.219 55.0823 242.22 53.0509C241.221 50.9862 240.722 48.5884 240.722 45.8576C240.722 43.027 241.221 40.5793 242.22 38.5146C243.219 36.4165 244.651 34.8014 246.516 33.6691C248.381 32.5368 250.596 31.9707 253.16 31.9707C256.091 31.9707 258.488 32.6201 260.353 33.9189C262.251 35.1843 263.617 36.9494 264.449 39.2139C265.195 41.2409 265.5 43.5348 265.364 46.0955C265.337 46.612 264.903 47.0066 264.385 47.0066H247.816C247.264 47.0066 246.811 47.455 246.849 48.006C246.935 49.2743 247.19 50.3731 247.615 51.3025C248.181 52.4348 248.947 53.3007 249.913 53.9001C250.912 54.4662 252.078 54.7493 253.41 54.7493C254.975 54.7493 256.24 54.4163 257.206 53.7502C257.986 53.2302 258.563 52.5782 258.937 51.7942C259.127 51.3965 259.506 51.1027 259.946 51.1027H263.933C264.546 51.1027 265.019 51.6514 264.857 52.2423C264.511 53.5006 263.925 54.6193 263.101 55.5985C262.035 56.8307 260.67 57.7798 259.004 58.4458C257.339 59.1119 255.474 59.4449 253.41 59.4449ZM246.835 43.1918C246.825 43.3549 246.619 43.427 246.514 43.3023C246.416 43.187 246.498 43.0103 246.649 43.0103H259.408C259.563 43.0103 259.647 43.1929 259.546 43.311C259.434 43.4422 259.215 43.3574 259.216 43.1845C259.22 41.7898 259 40.6328 258.555 39.7134C258.055 38.6811 257.339 37.9151 256.407 37.4156C255.474 36.9161 254.392 36.6663 253.16 36.6663C251.895 36.6663 250.796 36.9327 249.863 37.4655C248.931 37.9984 248.198 38.7976 247.665 39.8633C247.189 40.7864 246.912 41.8959 246.835 43.1918Z" fill="white"/>
                <path d="M232.187 58.9953C230.055 58.9953 228.457 58.4958 227.391 57.4967C226.359 56.4643 225.843 54.8325 225.843 52.6013V38.4655C225.843 37.9132 225.395 37.4655 224.843 37.4655H221.947C221.395 37.4655 220.947 37.0178 220.947 36.4655V33.4203C220.947 32.868 221.395 32.4203 221.947 32.4203H224.843C225.395 32.4203 225.843 31.9726 225.843 31.4203V25.8287C225.843 25.3165 226.23 24.8871 226.739 24.8341L230.983 24.3927C231.573 24.3313 232.087 24.7941 232.087 25.3873V31.4203C232.087 31.9726 232.535 32.4203 233.087 32.4203H236.682C237.234 32.4203 237.682 32.868 237.682 33.4203V36.4655C237.682 37.0178 237.234 37.4655 236.682 37.4655H233.087C232.535 37.4655 232.087 37.9132 232.087 38.4655V51.4524C232.087 52.3515 232.287 52.9843 232.686 53.3506C233.119 53.6836 233.735 53.8501 234.534 53.8501H236.731C237.284 53.8501 237.731 54.2978 237.731 54.8501V57.9953C237.731 58.5476 237.284 58.9953 236.731 58.9953H232.187Z" fill="white"/>
                <path d="M201.568 59.4449C199.936 59.4449 198.454 59.1452 197.122 58.5457C195.79 57.913 194.641 57.0138 193.675 55.8483C192.71 54.6494 191.96 53.2007 191.427 51.5023C190.928 49.7706 190.678 47.8391 190.678 45.7078C190.678 42.8105 191.128 40.3295 192.027 38.2648C192.959 36.2001 194.241 34.6349 195.873 33.5692C197.505 32.4702 199.403 31.9207 201.568 31.9207C202.967 31.9207 204.232 32.1372 205.364 32.5701C206.53 33.0031 207.512 33.6192 208.312 34.4184C209.108 35.183 209.706 36.0696 210.107 37.0781C210.139 37.1606 210.219 37.2158 210.307 37.2158C210.421 37.2158 210.514 37.1271 210.52 37.0139L210.71 33.3683C210.738 32.8369 211.176 32.4203 211.709 32.4203H215.654C216.206 32.4203 216.654 32.868 216.654 33.4203V57.9953C216.654 58.5476 216.206 58.9953 215.654 58.9953H211.709C211.177 58.9953 210.738 58.5784 210.71 58.0468L210.52 54.3501C210.514 54.2379 210.421 54.1499 210.309 54.1499C210.22 54.1499 210.14 54.2063 210.109 54.29C209.532 55.8235 208.5 57.0589 207.013 57.9962C205.481 58.962 203.666 59.4449 201.568 59.4449ZM203.766 54.3497C205.231 54.3497 206.447 54.0333 207.412 53.4006C208.411 52.7345 209.161 51.852 209.66 50.753C210.16 49.6541 210.41 48.4386 210.41 47.1065V44.2592C210.41 42.8938 210.143 41.6616 209.61 40.5626C209.111 39.4637 208.361 38.5978 207.362 37.9651C206.397 37.3323 205.248 37.016 203.916 37.016C202.417 37.016 201.152 37.3656 200.119 38.065C199.12 38.731 198.354 39.7134 197.821 41.0122C197.289 42.311 197.022 43.8762 197.022 45.7078C197.022 47.4728 197.272 49.0047 197.771 50.3035C198.304 51.6022 199.07 52.6013 200.069 53.3007C201.068 54 202.301 54.3497 203.766 54.3497Z" fill="white"/>
                <path d="M148.009 58.9953C147.457 58.9953 147.009 58.5476 147.009 57.9953V23.5795C147.009 23.0272 147.457 22.5795 148.009 22.5795H156.726C157.158 22.5795 157.541 22.8565 157.676 23.2665L163.394 40.6126L165.797 49.7348C165.823 49.8344 165.913 49.9038 166.016 49.9038C166.119 49.9038 166.209 49.8344 166.236 49.7348L168.639 40.6126L174.308 23.2688C174.442 22.8577 174.826 22.5795 175.258 22.5795H183.973C184.526 22.5795 184.973 23.0272 184.973 23.5795V57.9953C184.973 58.5476 184.526 58.9953 183.973 58.9953H179.579C179.027 58.9953 178.579 58.5476 178.579 57.9953V41.3619L178.776 28.9546C178.778 28.8277 178.675 28.7238 178.548 28.7238C178.448 28.7238 178.36 28.7894 178.331 28.8853L174.833 40.4627L169.062 58.3031C168.929 58.7157 168.545 58.9953 168.111 58.9953H163.923C163.489 58.9953 163.104 58.7146 162.971 58.3007L157.249 40.4627L153.702 28.8847C153.673 28.7891 153.584 28.7238 153.484 28.7238C153.357 28.7238 153.255 28.8279 153.257 28.955L153.453 41.3619V57.9953C153.453 58.5476 153.005 58.9953 152.453 58.9953H148.009Z" fill="white"/>
                <path d="M87.9284 22.9624C88.6109 22.9624 89.2402 23.3336 89.57 23.9312L94.3112 32.5279L94.3151 32.5357L97.0993 37.69L99.9245 32.5308L99.9294 32.522L104.763 23.9185C105.095 23.328 105.721 22.9624 106.398 22.9624H111.251C112.712 22.9626 113.611 24.5613 112.851 25.8101L101.123 45.0874V57.0884C101.122 58.1232 100.283 58.9623 99.2477 58.9624H94.943C93.9082 58.9622 93.0683 58.1232 93.068 57.0884V45.0855L81.4235 25.8062C80.6691 24.5573 81.5681 22.9629 83.027 22.9624H87.9284Z" fill="white"/>
                <path d="M49.6762 62.0383C50.6511 63.0132 50.6511 64.5956 49.6762 65.5705L48.7932 66.4536C43.924 71.3227 36.0013 71.3227 31.1321 66.4536L13.471 48.7925C8.60187 43.9234 8.60187 36.0006 13.471 31.1314L17.8863 26.7162C18.8612 25.7413 20.4436 25.7413 21.4185 26.7162C22.3934 27.6911 22.3934 29.2735 21.4185 30.2484L17.0032 34.6637C14.0812 37.5857 14.0812 42.3383 17.0032 45.2603L34.6643 62.9214C37.5863 65.8434 42.3389 65.8434 45.261 62.9214L46.144 62.0383C47.1189 61.0634 48.7013 61.0634 49.6762 62.0383Z" fill="#D62828"/>
                <path d="M66.4543 31.1314C71.3234 36.0006 71.3234 43.9233 66.4543 48.7925L62.039 53.2078C61.0641 54.1827 59.4817 54.1827 58.5068 53.2078C57.5319 52.2329 57.5319 50.6505 58.5068 49.6756L62.922 45.2603C65.8441 42.3383 65.8441 37.5857 62.922 34.6636L45.261 17.0026C42.3389 14.0806 37.5863 14.0806 34.6643 17.0026L33.7813 17.8856C32.8064 18.8605 31.2239 18.8605 30.2491 17.8856C29.2742 16.9107 29.2742 15.3283 30.2491 14.3534L31.1321 13.4704C36.0013 8.60121 43.924 8.60121 48.7932 13.4704L66.4543 31.1314Z" fill="#D62828"/>
                <path d="M55.945 57.3802C54.9931 57.5533 54.1612 56.7215 54.3352 55.7704L56.2611 45.2029C56.4598 44.1035 57.8118 43.6823 58.6012 44.4717L67.2437 53.1142C68.0331 53.9036 67.611 55.2547 66.5134 55.4552L55.945 57.3802Z" fill="#D62828"/>
                <path d="M23.9803 22.5437C24.9322 22.3707 25.764 23.2025 25.5901 24.1535L23.6641 34.721C23.4655 35.8204 22.1135 36.2417 21.3241 35.4522L12.6825 26.8106C11.893 26.0212 12.3151 24.6701 13.4128 24.4697L23.9803 22.5437Z" fill="#D62828"/>
                <path d="M31.5355 43.9781C29.5829 42.0255 29.5829 38.8597 31.5355 36.9071L36.9446 31.498C38.8972 29.5454 42.063 29.5454 44.0157 31.498L49.4247 36.9071C51.3774 38.8597 51.3774 42.0255 49.4247 43.9781L44.0157 49.3872C42.063 51.3398 38.8972 51.3398 36.9446 49.3872L31.5355 43.9781Z" fill="#D62828"/>
              </g>
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
        volume={player.volume}
        muted={player.muted}
        onVolumeChange={player.setVolume}
        onMutedChange={player.setMuted}
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

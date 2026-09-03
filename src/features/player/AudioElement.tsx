import type { Track } from '../../types/api.d';

export function AudioElement({
  audioRef,
  playingTrack,
  playingId,
  setPlayingId,
  setIsPaused,
  setError,
}: {
  audioRef: React.RefObject<HTMLAudioElement>;
  playingTrack: Track | null;
  playingId: string | null;
  setPlayingId: (v: string | null) => void;
  setIsPaused: (v: boolean) => void;
  setError: (m: string) => void;
}) {
  return (
    <audio
      ref={audioRef}
      controls
      style={{
        position: 'fixed',
        bottom: playingTrack ? 88 : -100,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(720px, calc(100% - 32px))',
        zIndex: 49,
        borderRadius: 12,
        opacity: playingTrack ? 1 : 0,
        pointerEvents: playingTrack ? 'auto' : 'none',
      }}
      onEnded={() => {
        setPlayingId(null);
        setIsPaused(false);
      }}
      onPause={() => {
        if (playingId) setIsPaused(true);
      }}
      onPlay={() => {
        if (playingId) setIsPaused(false);
      }}
      onError={() => setError('Failed to play — file may be missing or format unsupported')}
    />
  );
}

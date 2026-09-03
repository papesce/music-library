import type { Track } from '../../types/api.d';

export function AudioElement({
  audioRef,
  playingId,
  setPlayingId,
  setIsPaused,
  setError,
}: {
  audioRef: React.RefObject<HTMLAudioElement>;
  playingId: string | null;
  setPlayingId: (v: string | null) => void;
  setIsPaused: (v: boolean) => void;
  setError: (m: string) => void;
}) {
  return (
    <audio
      ref={audioRef}
      hidden
      preload="metadata"
      style={{ display: 'none' }}
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

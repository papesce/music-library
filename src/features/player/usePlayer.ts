import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Track } from '../../types/api.d';
import { streamUrl } from '../../lib/path';

export function usePlayer(tracks: Track[], setError: (m: string) => void) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const playingTrack = useMemo(
    () => tracks.find(t => t.id === playingId) ?? null,
    [tracks, playingId]
  );

  const handlePlay = useCallback(
    (t: Track) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (playingId === t.id) {
        if (isPaused) {
          audio
            .play()
            .then(() => setIsPaused(false))
            .catch(e => setError((e as Error).message));
        } else {
          audio.pause();
          setIsPaused(true);
        }
        return;
      }
      audio.src = streamUrl(t.filePath);
      audio.load();
      setPlayingId(t.id);
      setIsPaused(false);
      setError('');
      audio.play().catch(e => {
        setError(`Playback failed: ${(e as Error).message} — check file exists and /api/stream is reachable`);
        setPlayingId(null);
      });
    },
    [playingId, isPaused, setError]
  );

  const handleStop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio.removeAttribute('src');
    audio.load();
    setPlayingId(null);
    setIsPaused(false);
  }, []);

  const seek = useCallback((sec: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = sec;
    setCurrentTime(sec);
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrentTime(a.currentTime);
    const onDur = () => setDuration(a.duration || 0);
    const onEnded = () => {
      setPlayingId(null);
      setIsPaused(false);
    };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onDur);
    a.addEventListener('ended', onEnded);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onDur);
      a.removeEventListener('ended', onEnded);
    };
  }, []);

  return { audioRef, playingId, isPaused, playingTrack, handlePlay, handleStop, setPlayingId, setIsPaused, currentTime, duration, seek };
}

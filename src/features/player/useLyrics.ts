import { useEffect, useState } from 'react';
import { api } from '../../api';

export function useLyrics(filePath: string | null) {
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [synced, setSynced] = useState<{ ms: number; text: string }[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!filePath) {
      setLyrics(null);
      setSynced(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .getLyrics(filePath)
      .then(r => {
        if (cancelled) return;
        setLyrics(r.lyrics);
        setSynced(r.synced);
      })
      .catch(() => {
        if (!cancelled) {
          setLyrics(null);
          setSynced(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  return { lyrics, synced, loading };
}

import { useCallback, useState } from 'react';
import { api } from '../../api';

export function useFolders(setError: (m: string) => void) {
  const [folders, setFolders] = useState<string[]>([]);
  const [newFolder, setNewFolder] = useState('');

  const addFolder = useCallback(() => {
    const f = newFolder.trim();
    if (!f) return;
    if (folders.includes(f)) {
      setNewFolder('');
      return;
    }
    const next = [...folders, f];
    setFolders(next);
    setNewFolder('');
    api.setConfig(next).catch(e => setError((e as Error).message));
  }, [folders, newFolder, setError]);

  const removeFolder = useCallback(
    (idx: number) => {
      const next = folders.filter((_, i) => i !== idx);
      setFolders(next);
      api.setConfig(next).catch(e => setError((e as Error).message));
    },
    [folders, setError]
  );

  const browseFolder = useCallback(async () => {
    try {
      const res = await api.pickFolder();
      if (res.path) {
        if (folders.includes(res.path)) {
          setError(`Folder already added: ${res.path}`);
          return;
        }
        const next = [...folders, res.path];
        setFolders(next);
        await api.setConfig(next);
      } else if (res.message) setError(res.message);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [folders, setError]);

  return { folders, setFolders, newFolder, setNewFolder, addFolder, removeFolder, browseFolder };
}

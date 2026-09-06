import { useRef, useState } from 'react';
import { api } from '../api';

export function FolderDrawer({
  open,
  onClose,
  folders,
  newFolder,
  setNewFolder,
  onAdd,
  onRemove,
  onBrowse,
  onScan,
  scanning,
  onStateImported,
  setError,
  setSuccess,
}: {
  open: boolean;
  onClose: () => void;
  folders: string[];
  newFolder: string;
  setNewFolder: (v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onBrowse: () => void;
  onScan: () => void;
  scanning: boolean;
  onStateImported?: (tracks: import('../types/api.d').Track[], wishlist: import('../types/api.d').WishlistItem[]) => void;
  setError?: (m: string) => void;
  setSuccess?: (m: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const short = (p: string) => {
    const n = p.replace(/\/+$/, '');
    const ps = n.split(/[\\/]/).filter(Boolean);
    return ps.length <= 2 ? n : ps.slice(-2).join('/');
  };
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="glass drawer">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
          }}
        >
          <h3>Folders</h3>
          <button className="btn" onClick={onClose} style={{ padding: '6px 10px' }}>
            ✕
          </button>
        </div>
        <p className="muted">Manage scan locations.</p>
        <div className="folder-input">
          <input
            value={newFolder}
            onChange={e => setNewFolder(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onAdd()}
            placeholder="/absolute/path/to/Music"
          />
          <button className="btn" onClick={onAdd}>
            Add
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button className="btn glass-soft" onClick={onBrowse}>
            Browse…
          </button>
          <button className="btn btn-primary" onClick={onScan} disabled={scanning}>
            {scanning ? 'Scanning…' : 'Scan all'}
          </button>
        </div>
        {folders.length > 0 ? (
          <ul className="folder-list">
            {folders.map((f, i) => (
              <li key={f} className="glass-soft folder-item">
                <span title={f}>{short(f)}</span>
                <button
                  className="btn"
                  style={{ padding: '4px 10px', fontSize: 12 }}
                  onClick={() => onRemove(i)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty" style={{ padding: 20 }}>
            <b>No folders</b>Add one above
          </div>
        )}

        {/* App state export/import (non-derived) */}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border-soft)' }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>App state</h4>
          <p className="muted" style={{ fontSize: 11, marginBottom: 10, lineHeight: 1.4 }}>
            Exports folders, reviewed / cover / loudness marks, wishlist and split drafts. File metadata stays on disk.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn glass-soft"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const data = await api.exportState();
                  // include local history (client-only)
                  let history: string[] | null = null;
                  try { const raw = localStorage.getItem('app:playHistory'); if (raw) history = JSON.parse(raw); } catch {}
                  const payload = { ...data, playHistory: history };
                  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `music-library-state-${new Date().toISOString().slice(0,10)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch (e: any) { setError?.(e.message); }
                finally { setBusy(false); }
              }}
              title="Download JSON with app state"
            >
              ⤓ Export
            </button>
            <button className="btn glass-soft" disabled={busy} onClick={() => fileRef.current?.click()} title="Restore from exported JSON">
              ⤒ Import
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={async e => {
                const f = e.target.files?.[0];
                if (!f) return;
                setBusy(true);
                try {
                  const text = await f.text();
                  const json = JSON.parse(text);
                  // server part
                  const res = await api.importState({ folders: json.folders, tracks: json.tracks, wishlist: json.wishlist, splitDrafts: json.splitDrafts, mode: 'merge' });
                  // local history restore (merge, dedup, cap 20)
                  if (Array.isArray(json.playHistory)) {
                    try {
                      const incoming: string[] = json.playHistory.filter((x: any) => typeof x === 'string');
                      const existing: string[] = JSON.parse(localStorage.getItem('app:playHistory') || '[]');
                      const merged = [...incoming, ...existing].filter((v,i,a) => a.indexOf(v)===i).slice(0,20);
                      localStorage.setItem('app:playHistory', JSON.stringify(merged));
                    } catch {}
                  }
                  onStateImported?.(res.library, res.wishlistItems);
                  (setSuccess ?? setError)?.(`Imported: ${res.tracks} tracks, ${res.wishlist} wishlist, ${res.splitDrafts} drafts`);
                } catch (err: any) { setError?.(err.message); }
                finally { setBusy(false); e.target.value=''; }
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}

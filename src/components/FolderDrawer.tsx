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
}) {
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
      </div>
    </>
  );
}

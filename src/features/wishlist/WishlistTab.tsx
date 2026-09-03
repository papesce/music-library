import type { WishlistItem } from '../../types/api.d';

export function WishlistTab({
  wName, setWName, wArtist, setWArtist, wPriority, setWPriority,
  sortByDate, setSortByDate, displayed, onAdd,
  editingId, setEditingId, editName, setEditName, editArtist, setEditArtist, editPriority, setEditPriority,
  onStartEdit, onSaveEdit, onDelete,
}: {
  wName: string; setWName: (v: string) => void; wArtist: string; setWArtist: (v: string) => void; wPriority: WishlistItem['priority']; setWPriority: (v: WishlistItem['priority']) => void;
  sortByDate: boolean; setSortByDate: (v: boolean) => void; displayed: WishlistItem[]; onAdd: () => void;
  editingId: string | null; setEditingId: (v: string | null) => void; editName: string; setEditName: (v: string) => void; editArtist: string; setEditArtist: (v: string) => void; editPriority: WishlistItem['priority']; setEditPriority: (v: WishlistItem['priority']) => void;
  onStartEdit: (it: WishlistItem) => void; onSaveEdit: () => void; onDelete: (id: string) => void;
}) {
  return (
    <>
      <div className="glass form-pill">
        <label>Name*<input value={wName} onChange={e => setWName(e.target.value)} placeholder="Song name" /></label>
        <label>Artist<input value={wArtist} onChange={e => setWArtist(e.target.value)} placeholder="Optional" /></label>
        <label>Priority<select value={wPriority} onChange={e => setWPriority(e.target.value as WishlistItem['priority'])}><option>High</option><option>Medium</option><option>Low</option></select></label>
        <button className="btn btn-primary" onClick={onAdd}>Add</button>
        <div className="glass segmented" style={{ marginLeft: 'auto' }}>
          <button className={!sortByDate ? 'active' : ''} onClick={() => setSortByDate(false)}>By priority</button>
          <button className={sortByDate ? 'active' : ''} onClick={() => setSortByDate(true)}>By date</button>
        </div>
      </div>
      <p className="muted" style={{ marginBottom: 12 }}>{displayed.length} items · Sorted by {sortByDate ? 'newest first' : 'priority → date'}</p>
      {displayed.length === 0 ? (
        <div className="empty glass"><b>No wishlist yet</b>Add the tracks you&apos;re hunting for.</div>
      ) : (
        <div className="wishlist-grid">
          {displayed.map(it => (
            <div key={it.id} className={`glass wish-card ${it.priority}`}>
              <div className="wish-top">
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingId === it.id ? (
                    <>
                      <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name" style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.06)', color: 'var(--text)' }} />
                      <input value={editArtist} onChange={e => setEditArtist(e.target.value)} placeholder="Artist" style={{ width: '100%', marginTop: 6, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.06)', color: 'var(--text)' }} />
                    </>
                  ) : (
                    <>
                      <b style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</b>
                      <span className="muted" style={{ fontSize: 12 }}>{it.artist ?? '—'}</span>
                    </>
                  )}
                </div>
                {editingId === it.id ? (
                  <select value={editPriority} onChange={e => setEditPriority(e.target.value as WishlistItem['priority'])} style={{ padding: '6px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', color: 'var(--text)', border: '1px solid var(--border)' }}><option>High</option><option>Medium</option><option>Low</option></select>
                ) : (
                  <span className={`badge ${it.priority}`}>{it.priority}</span>
                )}
              </div>
              <span className="muted" style={{ fontSize: 12 }}>{new Date(it.dateAdded).toLocaleDateString()}</span>
              <div className="row-actions">
                {editingId === it.id ? (
                  <>
                    <button className="btn btn-primary" onClick={onSaveEdit} style={{ padding: '6px 12px' }}>Save</button>
                    <button className="btn" onClick={() => setEditingId(null)} style={{ padding: '6px 12px' }}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="btn" onClick={() => onStartEdit(it)} style={{ padding: '6px 12px' }}>Edit</button>
                    <button className="btn" onClick={() => onDelete(it.id)} style={{ padding: '6px 12px' }}>Delete</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

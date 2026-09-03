import type { Track } from '../../types/api.d';
import { Modal } from '../../components/ui/Modal';

export function DeleteTrackModal({ track, deleting, onCancel, onConfirm }: { track: Track; deleting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal onClose={() => !deleting && onCancel()} width="min(480px, calc(100% - 32px))">
      <h3 style={{ marginBottom: 8 }}>Move to Trash?</h3>
      <p className="muted" style={{ marginBottom: 12, lineHeight: 1.5 }}>
        This will move the file to the system <b style={{ color: '#ffd08a' }}>Trash</b> and remove it from your library.
      </p>
      <div className="glass-soft" style={{ padding: '10px 12px', borderRadius: 12, marginBottom: 16, wordBreak: 'break-all', fontSize: 13 }}>
        <div style={{ fontWeight: 600 }}>
          {track.artist} — {track.title}
        </div>
        <div className="muted" style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>
          {track.filePath}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onCancel} disabled={deleting}>
          Cancel
        </button>
        <button className="btn btn-danger" onClick={onConfirm} disabled={deleting}>
          {deleting ? 'Moving…' : 'Move to Trash'}
        </button>
      </div>
    </Modal>
  );
}

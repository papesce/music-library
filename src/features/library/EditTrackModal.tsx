import { useState, useEffect } from 'react';
import type { Track } from '../../types/api.d';
import { Modal } from '../../components/ui/Modal';
import { api } from '../../api';

type TrackPatch = Partial<Pick<Track, 'title' | 'artist' | 'album' | 'genre'>> & { year?: number | null };

function Field({ label, value, onChange, placeholder, inputMode }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'] }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
      {label}
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        style={{ padding: '9px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.06)', color: 'var(--text)', outline: 'none' }}
      />
    </label>
  );
}

export function EditTrackModal({ track, onClose, onUpdated, setError }: { track: Track; onClose: () => void; onUpdated: (t: Track) => void; setError: (m: string) => void }) {
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist);
  const [album, setAlbum] = useState(track.album);
  const [genre, setGenre] = useState(track.genre);
  const [year, setYear] = useState(track.year ? String(track.year) : '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(track.title);
    setArtist(track.artist);
    setAlbum(track.album);
    setGenre(track.genre);
    setYear(track.year ? String(track.year) : '');
  }, [track]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const patch: TrackPatch = {};
      if (title.trim() !== track.title) patch.title = title.trim();
      if (artist.trim() !== track.artist) patch.artist = artist.trim();
      if (album.trim() !== track.album) patch.album = album.trim();
      if (genre.trim() !== track.genre) patch.genre = genre.trim();
      if (year.trim() !== (track.year ? String(track.year) : '')) patch.year = year.trim() ? Number(year.trim()) : null;
      if (Object.keys(patch).length === 0) {
        onClose();
        return;
      }
      const updated = await api.updateTrack(track.filePath, patch);
      onUpdated(updated);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={() => !saving && onClose()} width="min(520px, calc(100% - 32px))">
      <h3 style={{ marginBottom: 4 }}>Edit song</h3>
      <p className="muted" style={{ marginBottom: 14, fontSize: 12, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>
        {track.filePath}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Title" value={title} onChange={setTitle} placeholder="Title" />
        <Field label="Artist" value={artist} onChange={setArtist} placeholder="Artist" />
        <Field label="Album" value={album} onChange={setAlbum} placeholder="Album" />
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field label="Genre" value={genre} onChange={setGenre} placeholder="Genre" />
          </div>
          <div style={{ width: 120 }}>
            <Field label="Year" value={year} onChange={setYear} placeholder="2024" inputMode="numeric" />
          </div>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 10, fontSize: 11 }}>Writes ID3v2 tags to the file and updates library. Persists across re-scans.</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}

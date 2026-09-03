import { useState, useEffect, useRef } from 'react';
import type { Track } from '../../types/api.d';
import { Modal } from '../../components/ui/Modal';
import { api } from '../../api';
import { coverUrl } from '../../lib/path';

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

export function EditTrackModal({ track, onClose, onUpdated, setError }: { track: Track; onClose: () => void; onUpdated: (t: Track, oldFilePath?: string) => void; setError: (m: string) => void }) {
  const getFilename = (p: string) => p.split('/').pop()?.split('\\').pop() ?? p;
  const getDir = (p: string) => {
    const f = getFilename(p);
    return p.slice(0, -f.length).replace(/\/$/, '');
  };
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist);
  const [album, setAlbum] = useState(track.album);
  const [genre, setGenre] = useState(track.genre);
  const [year, setYear] = useState(track.year ? String(track.year) : '');
  const [filename, setFilename] = useState(getFilename(track.filePath));
  const [filenameError, setFilenameError] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reviewed, setReviewed] = useState(!!track.reviewed);
  // artwork state
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverMime, setCoverMime] = useState<string | null>(null);
  const [coverError, setCoverError] = useState('');
  const [coverRemove, setCoverRemove] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const coverKey = useRef(0);

  useEffect(() => {
    setTitle(track.title);
    setArtist(track.artist);
    setAlbum(track.album);
    setGenre(track.genre);
    setYear(track.year ? String(track.year) : '');
    setFilename(getFilename(track.filePath));
    setFilenameError('');
    setReviewed(!!track.reviewed);
    setCoverPreview(null);
    setCoverMime(null);
    setCoverError('');
    setCoverRemove(false);
    setCoverFailed(false);
    coverKey.current += 1;
  }, [track]);

  const validateFilename = (v: string): string | null => {
    const t = v.trim();
    if (!t) return 'Filename cannot be empty';
    if (t.includes('/') || t.includes('\\')) return 'Filename must not contain / or \\';
    if (!t.toLowerCase().endsWith('.mp3')) return 'Filename must end with .mp3';
    if (t.length > 255) return 'Filename too long';
    if (t.slice(0, -4).trim() === '') return 'Filename without extension cannot be empty';
    return null;
  };

  const handleCoverFile = (file: File) => {
    setCoverError('');
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      setCoverError('Unsupported format — use JPEG, PNG, WebP or GIF');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setCoverError('Image too large (max 8MB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setCoverPreview(dataUrl);
      setCoverMime(file.type);
      setCoverRemove(false);
      setCoverFailed(false);
    };
    reader.onerror = () => setCoverError('Failed to read image');
    reader.readAsDataURL(file);
  };

  const buildGoogleQuery = () => {
    const t = title.trim();
    const a = artist.trim();
    const al = album.trim();
    const g = genre.trim();
    const y = year.trim();
    // Quote artist/title/album for exact-phrase matching; append genre/year as keywords.
    // Omit placeholder values like "Unknown".
    const isUnknown = (v: string) => !v || v.toLowerCase() === 'unknown';
    const parts: string[] = [];
    if (!isUnknown(a)) parts.push(`"${a}"`);
    if (!isUnknown(t)) parts.push(`"${t}"`);
    if (!isUnknown(al)) parts.push(`album "${al}"`);
    if (!isUnknown(g)) parts.push(g);
    if (y) parts.push(y);
    // fallback to filename if everything is Unknown
    if (parts.length === 0) return getFilename(track.filePath).replace(/\.mp3$/i, '');
    return parts.join(' ');
  };

  const copyGoogleQuery = async () => {
    const q = buildGoogleQuery();
    try {
      await navigator.clipboard.writeText(q);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = q;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const openGoogle = () => {
    const q = buildGoogleQuery();
    window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, '_blank');
  };

  const save = async () => {
    const filenameTrimmed = filename.trim();
    const originalFilename = getFilename(track.filePath);
    const filenameChanged = filenameTrimmed !== originalFilename;
    const reviewedChanged = reviewed !== !!track.reviewed;
    const coverChanged = !!coverPreview || coverRemove;
    if (filenameChanged) {
      const err = validateFilename(filenameTrimmed);
      if (err) {
        setFilenameError(err);
        return;
      }
    } else {
      setFilenameError('');
    }
    setSaving(true);
    setError('');
    try {
      let currentTrack = track;
      let oldPath = track.filePath;
      let didRename = false;
      if (filenameChanged) {
        const renamed = await api.renameTrack(track.filePath, filenameTrimmed);
        currentTrack = renamed;
        oldPath = track.filePath;
        didRename = true;
      }
      const patch: TrackPatch = {};
      if (title.trim() !== track.title) patch.title = title.trim();
      if (artist.trim() !== track.artist) patch.artist = artist.trim();
      if (album.trim() !== track.album) patch.album = album.trim();
      if (genre.trim() !== track.genre) patch.genre = genre.trim();
      if (year.trim() !== (track.year ? String(track.year) : '')) patch.year = year.trim() ? Number(year.trim()) : null;
      const hasPatch = Object.keys(patch).length > 0;
      if (hasPatch) {
        const targetPath = didRename ? currentTrack.filePath : track.filePath;
        currentTrack = await api.updateTrack(targetPath, patch);
      }
      if (coverChanged) {
        const targetPath = currentTrack.filePath;
        if (coverRemove) {
          currentTrack = await api.removeCover(targetPath);
        } else if (coverPreview) {
          currentTrack = await api.setCover(targetPath, coverPreview);
        }
      }
      if (reviewedChanged) {
        // use latest filePath (after rename)
        currentTrack = await api.setReviewed(currentTrack.filePath, reviewed);
      }
      if (!hasPatch && !reviewedChanged && !didRename && !coverChanged) {
        onClose();
        return;
      }
      onUpdated(currentTrack, didRename ? oldPath : undefined);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const dir = getDir(track.filePath);
  return (
    <Modal onClose={() => !saving && onClose()} width="min(520px, calc(100% - 32px))">
      <h3 style={{ marginBottom: 4 }}>Edit song</h3>
      <p className="muted" style={{ marginBottom: 14, fontSize: 12, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>
        {track.filePath}
      </p>
      {/* Artwork */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14, padding: '12px', borderRadius: 14, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)' }}>
        <div style={{ width: 96, height: 96, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-soft)', display: 'grid', placeItems: 'center', position: 'relative' }}>
          {coverRemove ? (
            <span style={{ fontSize: 28, opacity: 0.6 }}>♪</span>
          ) : coverPreview ? (
            <img src={coverPreview} alt="New cover preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : !coverFailed ? (
            <img
              key={coverKey.current}
              src={`${coverUrl(track.filePath)}&t=${coverKey.current}`}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={() => setCoverFailed(true)}
            />
          ) : null}
          {coverFailed && !coverPreview && !coverRemove && (
            <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 28, opacity: 0.6 }}>♪</span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
            Artwork {coverPreview ? <span style={{ color: '#8ff5b8', fontWeight: 400 }}>· new image ready</span> : coverRemove ? <span style={{ color: '#ffb3b8', fontWeight: 400 }}>· will be removed</span> : null}
          </span>
          <span style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.3 }}>
            {coverFailed && !coverPreview && !coverRemove ? 'No cover embedded — add one.' : 'JPEG, PNG, WebP or GIF · max 8MB · saved to ID3 APIC.'}
          </span>
          {coverError && <span style={{ fontSize: 11, color: 'var(--danger, #e53e3e)' }}>{coverError}</span>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverFile(f); e.target.value = ''; }} />
            <button className="btn" style={{ padding: '6px 12px', fontSize: 12, borderRadius: 999 }} onClick={() => fileRef.current?.click()} disabled={saving}>Replace</button>
            {!coverRemove ? (
              <button className="btn" style={{ padding: '6px 12px', fontSize: 12, borderRadius: 999 }} onClick={() => { setCoverRemove(true); setCoverPreview(null); setCoverMime(null); setCoverError(''); }} disabled={saving}>Remove</button>
            ) : (
              <button className="btn" style={{ padding: '6px 12px', fontSize: 12, borderRadius: 999 }} onClick={() => { setCoverRemove(false); setCoverFailed(false); coverKey.current += 1; }} disabled={saving}>Undo remove</button>
            )}
            {(coverPreview || coverRemove) && (
              <button className="btn" style={{ padding: '6px 12px', fontSize: 12, borderRadius: 999 }} onClick={() => { setCoverPreview(null); setCoverMime(null); setCoverRemove(false); setCoverError(''); setCoverFailed(false); coverKey.current += 1; }} disabled={saving}>Reset</button>
            )}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
          Filename (in {dir || '/'})
          <input
            value={filename}
            onChange={e => {
              setFilename(e.target.value);
              if (filenameError) setFilenameError(validateFilename(e.target.value) ?? '');
            }}
            onBlur={() => {
              const err = filename.trim() !== getFilename(track.filePath) ? validateFilename(filename) : null;
              setFilenameError(err ?? '');
            }}
            placeholder="Artist - Title.mp3"
            style={{ padding: '9px 12px', borderRadius: 12, border: `1px solid ${filenameError ? 'var(--danger, #e53e3e)' : 'var(--border)'}`, background: 'rgba(255,255,255,0.06)', color: 'var(--text)', outline: 'none', fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
          />
          {filenameError ? <span style={{ color: 'var(--danger, #e53e3e)', fontSize: 11 }}>{filenameError}</span> : <span style={{ fontSize: 11, opacity: 0.7 }}>Renames the file on disk. Must end with .mp3 and stay in the same folder.</span>}
        </label>
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
      <label style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, border: `1px solid ${reviewed ? 'rgba(46,204,113,0.35)' : 'var(--border)'}`, background: reviewed ? 'rgba(46,204,113,0.10)' : 'rgba(255,255,255,0.04)', cursor: 'pointer' }}>
        <input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} style={{ accentColor: '#2ecc71', width: 16, height: 16 }} />
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: reviewed ? '#8ff5b8' : 'var(--text)' }}>{reviewed ? '✓ Marked as reviewed / completed' : 'Mark as reviewed / completed'}</span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{reviewed ? 'Hidden when "Hide done" is active. Uncheck to inspect again.' : "You won't need to inspect this song again."}</span>
        </span>
      </label>
      <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.3, color: 'var(--muted)', textTransform: 'uppercase' }}>Google validation</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn" onClick={copyGoogleQuery} title="Copy search query to clipboard" style={{ padding: '5px 10px', fontSize: 12, borderRadius: 8 }}>
              {copied ? '✓ Copied' : '⧉ Copy'}
            </button>
            <button className="btn" onClick={openGoogle} title="Open Google search" style={{ padding: '5px 10px', fontSize: 12, borderRadius: 8 }}>
              ↗ Google
            </button>
          </div>
        </div>
        <div style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', color: 'var(--text)', opacity: 0.85, wordBreak: 'break-word', lineHeight: 1.4, userSelect: 'all' }}>
          {buildGoogleQuery()}
        </div>
        <span style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.3 }}>Copy &amp; paste into Google to verify artist / title / album / genre / year. Uses current field values; quotes improve exact matches.</span>
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

import { useState, useEffect, useRef } from 'react';
import type { Track } from '../../types/api.d';
import { Modal } from '../../components/ui/Modal';
import { api } from '../../api';
import { coverUrl } from '../../lib/path';

type TrackPatch = Partial<Pick<Track, 'title' | 'artist' | 'album' | 'genre'>> & { year?: number | null };
type Tab = 'details' | 'artwork' | 'lyrics' | 'file';
const TAB_ORDER: Tab[] = ['details', 'artwork', 'lyrics', 'file'];
const WHISPER_MODELS = ['tiny', 'base', 'small', 'medium', 'large'] as const;
type WhisperModel = typeof WHISPER_MODELS[number];

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
  const [activeTab, setActiveTab] = useState<Tab>('details');
  // artwork state
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverMime, setCoverMime] = useState<string | null>(null);
  const [coverError, setCoverError] = useState('');
  const [coverRemove, setCoverRemove] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const coverKey = useRef(0);
  // lyrics auto-detect state
  const [lyricsText, setLyricsText] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsDetecting, setLyricsDetecting] = useState(false);
  const [lyricsPreview, setLyricsPreview] = useState<string>('');
  const [lyricsSource, setLyricsSource] = useState<string>('');
  const [lyricsError, setLyricsError] = useState('');
  const [lyricsSaved, setLyricsSaved] = useState(false);
  const [whisperModel, setWhisperModel] = useState<WhisperModel>('base');

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
    setActiveTab('details');
    // load current lyrics
    setLyricsText(null); setLyricsPreview(''); setLyricsSource(''); setLyricsError(''); setLyricsSaved(false);
    setLyricsLoading(true);
    api.getLyrics(track.filePath).then(r => {
      if (r.lyrics) { setLyricsText(r.lyrics); setLyricsPreview(r.lyrics); }
    }).catch(() => {}).finally(() => setLyricsLoading(false));
  }, [track.filePath]);

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
    const isUnknown = (v: string) => !v || v.toLowerCase() === 'unknown';
    const parts: string[] = [];
    if (!isUnknown(a)) parts.push(`"${a}"`);
    if (!isUnknown(t)) parts.push(`"${t}"`);
    if (!isUnknown(al)) parts.push(`album "${al}"`);
    if (!isUnknown(g)) parts.push(g);
    if (y) parts.push(y);
    if (parts.length === 0) return getFilename(track.filePath).replace(/\.mp3$/i, '');
    return parts.join(' ');
  };

  const copyGoogleQuery = async () => {
    const q = buildGoogleQuery();
    try {
      await navigator.clipboard.writeText(q);
    } catch {
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
  const detectLyrics = async (source: 'auto' | 'lrclib' | 'whisper' = 'auto') => {
    setLyricsDetecting(true); setLyricsError(''); setLyricsSaved(false);
    try {
      const model = source === 'whisper' || source === 'auto' ? whisperModel : 'base';
      const r = await api.detectLyrics(track.filePath, { source, model, artist: artist.trim(), title: title.trim(), album: album.trim() });
      setLyricsPreview(r.lrc || r.syncedLyrics || r.plainLyrics || '');
      setLyricsSource(r.source);
    } catch (e: any) { setLyricsError(e.message); }
    finally { setLyricsDetecting(false); }
  };
  const saveLyrics = async () => {
    if (!lyricsPreview.trim()) { setLyricsError('Lyrics empty'); return; }
    setLyricsDetecting(true); setLyricsError('');
    try {
      await api.saveLyrics(track.filePath, lyricsPreview);
      setLyricsText(lyricsPreview); setLyricsSaved(true);
      setTimeout(() => setLyricsSaved(false), 2000);
    } catch (e: any) { setLyricsError(e.message); }
    finally { setLyricsDetecting(false); }
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
        setActiveTab('file');
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
  const hasCoverChange = !!coverPreview || coverRemove;
  const hasLyrics = !!lyricsText;
  const lyricsLines = lyricsText ? lyricsText.split('\n').length : 0;
  const isSynced = lyricsText ? /\[\d{1,3}:\d{2}/.test(lyricsText) : false;

  // per-tab dirty
  const detailsDirty = title.trim() !== track.title || artist.trim() !== track.artist || album.trim() !== track.album || genre.trim() !== track.genre || year.trim() !== (track.year ? String(track.year) : '') || reviewed !== !!track.reviewed;
  const fileDirty = filename.trim() !== getFilename(track.filePath);
  const lyricsDirty = lyricsPreview !== (lyricsText ?? '') && lyricsPreview.trim() !== '';

  const tabBadges: Record<Tab, string | undefined> = {
    details: filenameError ? undefined : detailsDirty ? '•' : undefined,
    artwork: hasCoverChange ? '•' : coverFailed && !coverPreview ? '!' : undefined,
    lyrics: lyricsLoading ? '…' : lyricsDirty ? '•' : hasLyrics ? `${lyricsLines}` : undefined,
    file: filenameError ? '!' : fileDirty ? '•' : undefined,
  };
  const tabs: { id: Tab; label: string; badge?: string }[] = [
    { id: 'details', label: 'Details', badge: tabBadges.details },
    { id: 'artwork', label: 'Artwork', badge: tabBadges.artwork },
    { id: 'lyrics', label: 'Lyrics', badge: tabBadges.lyrics },
    { id: 'file', label: 'File', badge: tabBadges.file },
  ];

  // keyboard nav for tabs
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ details: null, artwork: null, lyrics: null, file: null });
  const onTabKeyDown = (e: React.KeyboardEvent) => {
    const idx = TAB_ORDER.indexOf(activeTab);
    let next: Tab | null = null;
    if (e.key === 'ArrowRight') next = TAB_ORDER[(idx + 1) % TAB_ORDER.length];
    else if (e.key === 'ArrowLeft') next = TAB_ORDER[(idx - 1 + TAB_ORDER.length) % TAB_ORDER.length];
    else if (e.key === 'Home') next = TAB_ORDER[0];
    else if (e.key === 'End') next = TAB_ORDER[TAB_ORDER.length - 1];
    if (next) {
      e.preventDefault();
      setActiveTab(next);
      tabRefs.current[next]?.focus();
    }
  };

  return (
    <Modal onClose={() => !saving && onClose()} width="min(640px, calc(100% - 32px))">
      {/* Header — always visible */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ width: 48, height: 48, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-soft)', display: 'grid', placeItems: 'center' }}>
          {coverRemove ? <span style={{ fontSize: 20, opacity: 0.6 }}>♪</span>
            : coverPreview ? <img src={coverPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : !coverFailed ? <img key={coverKey.current} src={`${coverUrl(track.filePath)}&t=${coverKey.current}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setCoverFailed(true)} />
            : <span style={{ fontSize: 20, opacity: 0.6 }}>♪</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 15, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.title || getFilename(track.filePath)}</h3>
          <p style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.artist} {track.album ? `· ${track.album}` : ''}</p>
          <p className="muted" style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all', opacity: 0.7, marginTop: 2 }}>{track.filePath}</p>
        </div>
      </div>

      {/* Tab bar — keyboard: ArrowLeft/Right, Home/End */}
      <div role="tablist" aria-label="Edit sections" onKeyDown={onTabKeyDown} style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 999, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-soft)', marginBottom: 14 }}>
        {tabs.map(t => {
          const isActive = activeTab === t.id;
          const isDirty = t.badge === '•';
          return (
            <button
              key={t.id}
              ref={el => { tabRefs.current[t.id] = el; }}
              role="tab"
              id={`edit-tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`edit-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(t.id)}
              title={isDirty ? 'Unsaved changes' : undefined}
              style={{
                flex: 1, padding: '7px 10px', borderRadius: 999, border: 'none',
                background: isActive ? 'rgba(255,255,255,0.95)' : 'transparent',
                color: isActive ? '#0a0a14' : 'var(--muted)',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: isActive ? '0 2px 10px rgba(0,0,0,0.2)' : 'none', transition: 'all 0.15s',
                outline: 'none',
                position: 'relative',
              }}
              onFocus={e => { e.currentTarget.style.boxShadow = isActive ? '0 2px 10px rgba(0,0,0,0.2), 0 0 0 2px var(--accent)' : '0 0 0 2px var(--accent)'; }}
              onBlur={e => { e.currentTarget.style.boxShadow = isActive ? '0 2px 10px rgba(0,0,0,0.2)' : 'none'; }}
            >
              {isDirty && <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: '#2ecc71', flexShrink: 0 }} />}
              {t.label}
              {t.badge && t.badge !== '•' && <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999,
                background: t.badge === '!' ? '#ff4d6d' : 'rgba(0,0,0,0.08)',
                color: t.badge === '!' ? '#fff' : 'inherit',
              }}>{t.badge}</span>}
            </button>
          );
        })}
      </div>

      {/* Tab bodies — fixed height, internal scroll */}
      <div style={{ minHeight: 280, maxHeight: '52vh', overflow: 'auto', paddingRight: 2 }}>
        {activeTab === 'details' && (
          <div role="tabpanel" id="edit-panel-details" aria-labelledby="edit-tab-details" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label="Title" value={title} onChange={setTitle} placeholder="Title" />
            <Field label="Artist" value={artist} onChange={setArtist} placeholder="Artist" />
            <Field label="Album" value={album} onChange={setAlbum} placeholder="Album" />
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><Field label="Genre" value={genre} onChange={setGenre} placeholder="Genre" /></div>
              <div style={{ width: 120 }}><Field label="Year" value={year} onChange={setYear} placeholder="2024" inputMode="numeric" /></div>
            </div>

            {/* Reviewed — compact toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, border: `1px solid ${reviewed ? 'rgba(46,204,113,0.35)' : 'var(--border)'}`, background: reviewed ? 'rgba(46,204,113,0.10)' : 'rgba(255,255,255,0.04)', cursor: 'pointer' }}>
              <input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} style={{ accentColor: '#2ecc71', width: 16, height: 16 }} />
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: reviewed ? '#8ff5b8' : 'var(--text)' }}>{reviewed ? '✓ Reviewed' : 'Mark as reviewed'}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{reviewed ? 'Hidden when "Hide done" is active.' : "Won't need inspection again."}</span>
              </span>
            </label>

            {/* Google validation — inline, not a big card */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-soft)' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1, fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={buildGoogleQuery()}>{buildGoogleQuery()}</span>
              <button className="btn" onClick={copyGoogleQuery} style={{ padding: '5px 10px', fontSize: 11, borderRadius: 8, flexShrink: 0 }}>{copied ? '✓ Copied' : 'Copy'}</button>
              <button className="btn" onClick={openGoogle} style={{ padding: '5px 10px', fontSize: 11, borderRadius: 8, flexShrink: 0 }}>Google ↗</button>
            </div>
            <p className="muted" style={{ fontSize: 10, lineHeight: 1.3 }}>Writes ID3v2 tags. Google query uses current field values with quoted exact phrases.</p>
          </div>
        )}

        {activeTab === 'artwork' && (
          <div role="tabpanel" id="edit-panel-artwork" aria-labelledby="edit-tab-artwork" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 160, height: 160, borderRadius: 14, overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-soft)', display: 'grid', placeItems: 'center', position: 'relative' }}>
                {coverRemove ? <span style={{ fontSize: 36, opacity: 0.5 }}>♪</span>
                  : coverPreview ? <img src={coverPreview} alt="New cover preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : !coverFailed ? <img key={coverKey.current} src={`${coverUrl(track.filePath)}&t=${coverKey.current}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setCoverFailed(true)} />
                  : null}
                {coverFailed && !coverPreview && !coverRemove && <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 36, opacity: 0.5 }}>♪</span>}
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {coverPreview ? <span style={{ color: '#8ff5b8' }}>New image ready</span> : coverRemove ? <span style={{ color: '#ffb3b8' }}>Will be removed on save</span> : coverFailed ? 'No cover embedded' : 'Current cover'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>JPEG, PNG, WebP or GIF · max 8 MB · saved to ID3 APIC and used for thumbnails/player.</span>
                {coverError && <span style={{ fontSize: 11, color: '#ff6b6b' }}>{coverError}</span>}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverFile(f); e.target.value = ''; }} />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  <button className="btn btn-primary" style={{ padding: '7px 14px', fontSize: 12, borderRadius: 999 }} onClick={() => fileRef.current?.click()} disabled={saving}>Choose image…</button>
                  {!coverRemove
                    ? <button className="btn" style={{ padding: '7px 12px', fontSize: 12, borderRadius: 999 }} onClick={() => { setCoverRemove(true); setCoverPreview(null); setCoverMime(null); setCoverError(''); }} disabled={saving}>Remove</button>
                    : <button className="btn" style={{ padding: '7px 12px', fontSize: 12, borderRadius: 999 }} onClick={() => { setCoverRemove(false); setCoverFailed(false); coverKey.current += 1; }} disabled={saving}>Undo remove</button>}
                  {(coverPreview || coverRemove) && <button className="btn" style={{ padding: '7px 12px', fontSize: 12, borderRadius: 999 }} onClick={() => { setCoverPreview(null); setCoverMime(null); setCoverRemove(false); setCoverError(''); setCoverFailed(false); coverKey.current += 1; }} disabled={saving}>Reset</button>}
                </div>
              </div>
            </div>
            {hasCoverChange && <p style={{ fontSize: 11, color: '#8ff5b8' }}>Change will be applied when you click Save.</p>}
          </div>
        )}

        {activeTab === 'lyrics' && (
          <div role="tabpanel" id="edit-panel-lyrics" aria-labelledby="edit-tab-lyrics" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.3, color: 'var(--muted)', textTransform: 'uppercase' }}>
                Lyrics {lyricsSource ? `· ${lyricsSource}` : hasLyrics ? '· saved' : ''} {lyricsSaved ? '· ✓ saved' : ''}
              </span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{lyricsLoading ? 'loading…' : hasLyrics ? `${lyricsLines} lines${isSynced ? ' · synced' : ''}` : 'no lyrics yet'}</span>
            </div>
            <textarea
              value={lyricsPreview}
              onChange={e => { setLyricsPreview(e.target.value); setLyricsSaved(false); }}
              placeholder="[00:12.00]Lyric line — or plain lyrics&#10;Edit before saving. Supports LRC synced format."
              rows={10}
              style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.06)', color: 'var(--text)', resize: 'vertical', outline: 'none', minHeight: 160 }}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn" onClick={() => detectLyrics('auto')} disabled={lyricsDetecting} style={{ padding: '6px 12px', fontSize: 12, borderRadius: 999 }}>{lyricsDetecting ? '…' : '✨ Detect (auto)'}</button>
              <button className="btn" onClick={() => detectLyrics('lrclib')} disabled={lyricsDetecting} style={{ padding: '6px 10px', fontSize: 12, borderRadius: 999 }}>LRClib</button>
              <button className="btn" onClick={() => detectLyrics('whisper')} disabled={lyricsDetecting} style={{ padding: '6px 10px', fontSize: 12, borderRadius: 999 }}>Whisper</button>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
                model
                <select
                  value={whisperModel}
                  onChange={e => setWhisperModel(e.target.value as WhisperModel)}
                  disabled={lyricsDetecting}
                  style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.06)', color: 'var(--text)', fontSize: 11, outline: 'none' }}
                >
                  {WHISPER_MODELS.map(m => <option key={m} value={m}>{m}{m === 'base' ? ' (default)' : ''}</option>)}
                </select>
              </label>
              <span style={{ flex: 1 }} />
              <button className="btn btn-primary" onClick={saveLyrics} disabled={lyricsDetecting || !lyricsPreview.trim()} style={{ padding: '6px 14px', fontSize: 12, borderRadius: 999 }}>Save to .lrc + USLT</button>
            </div>
            {lyricsError && <span style={{ fontSize: 11, color: '#ff6b6b' }}>{lyricsError}</span>}
            <span style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.4 }}>Auto tries LRClib (synced) → fallback Whisper {whisperModel} (local, first run downloads model ~{whisperModel === 'tiny' ? 40 : whisperModel === 'base' ? 140 : whisperModel === 'small' ? 460 : whisperModel === 'medium' ? 1500 : 2900} MB). Edits here are not persisted until you click "Save to .lrc + USLT" — the dialog's Save writes only tags/cover/file.</span>
          </div>
        )}

        {activeTab === 'file' && (
          <div role="tabpanel" id="edit-panel-file" aria-labelledby="edit-tab-file" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Filename <span style={{ fontSize: 11, opacity: 0.7 }}>in {dir || '/'}</span>
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
                style={{ padding: '9px 12px', borderRadius: 12, border: `1px solid ${filenameError ? '#ff6b6b' : 'var(--border)'}`, background: 'rgba(255,255,255,0.06)', color: 'var(--text)', outline: 'none', fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
              />
              {filenameError ? <span style={{ color: '#ff6b6b', fontSize: 11 }}>{filenameError}</span> : <span style={{ fontSize: 11, opacity: 0.6 }}>Renames the file on disk. Must end with .mp3 and stay in the same folder.</span>}
            </label>
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-soft)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>Full path</div>
              <div style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', color: 'var(--text)', wordBreak: 'break-all', opacity: 0.85 }}>{track.filePath}</div>
            </div>
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-soft)' }}>
        <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </Modal>
  );
}

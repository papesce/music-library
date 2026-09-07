import { useState, useRef } from 'react';
import { api } from '../../api';
import { buildGoogleQuery, openGoogle } from '../../lib/googleQuery';
import { copyThenOpenChosic } from '../../lib/chosic';

export type SegmentMeta = {
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: string;
  lyrics: string;
  lyricsSource: string;
};

const WHISPER_MODELS = ['tiny', 'base', 'small', 'medium', 'large'] as const;
type WhisperModel = (typeof WHISPER_MODELS)[number];

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const isUnknown = value.trim().toLowerCase() === 'unknown';
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
      {label}
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          padding: '7px 10px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'rgba(255,255,255,0.06)',
          color: isUnknown ? 'var(--muted)' : 'var(--text)',
          fontStyle: isUnknown ? 'italic' : 'normal',
          outline: 'none',
          fontSize: 12,
        }}
      />
    </label>
  );
}

export function SplitSegmentEditor({
  index,
  meta,
  onChange,
  sourceFilePath,
  startMs,
  endMs,
  onLyricsChange,
}: {
  index: number;
  meta: SegmentMeta;
  onChange: (next: SegmentMeta) => void;
  sourceFilePath: string;
  startMs?: number;
  endMs?: number;
  onLyricsChange?: (lyrics: string, source: string) => void;
}) {
  const [lyricsDetecting, setLyricsDetecting] = useState(false);
  const [lyricsError, setLyricsError] = useState('');
  const [lyricsCopied, setLyricsCopied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [whisperModel, setWhisperModel] = useState<WhisperModel>('base');
  const [selection, setSelection] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const googleQuery = buildGoogleQuery({
    title: meta.title,
    artist: meta.artist,
    album: meta.album,
    genre: meta.genre,
    year: meta.year,
    filePath: sourceFilePath,
  });
  const googleQueryForSearch = `${googleQuery} metadata`;

  const copyGoogle = async () => {
    try {
      await navigator.clipboard.writeText(googleQueryForSearch);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = googleQueryForSearch;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const updateSelection = () => {
    const el = textareaRef.current;
    if (!el) return;
    const raw = el.value.slice(el.selectionStart, el.selectionEnd);
    const cleaned = raw
      .split('\n')
      .map(l => l.replace(/(\[\d{1,3}:\d{2}(?:\.\d{1,3})?\])+/g, '').trim())
      .join('\n')
      .replace(/\s+/g, ' ')
      .trim();
    setSelection(cleaned);
  };

  const handleLyricsGoogle = async () => {
    if (!selection) return;
    const maxChars = 480;
    let snippet = selection;
    if (snippet.length > maxChars) {
      const cut = snippet.slice(0, maxChars);
      const lastSpace = cut.lastIndexOf(' ');
      snippet = (lastSpace > maxChars * 0.7 ? cut.slice(0, lastSpace) : cut).trim();
    }
    try {
      await navigator.clipboard.writeText(snippet);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = snippet;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setLyricsCopied(true);
    setTimeout(() => setLyricsCopied(false), 1800);
    openGoogle(snippet);
  };

  const detectLyrics = async (source: 'auto' | 'lrclib' | 'whisper' = 'auto') => {
    setLyricsDetecting(true);
    setLyricsError('');
    try {
      const model = source === 'whisper' || source === 'auto' ? whisperModel : 'base';
      const isSlice = Number.isFinite(startMs) && Number.isFinite(endMs);
      const r = await api.detectLyrics(sourceFilePath, {
        source,
        model,
        artist: meta.artist.trim(),
        title: meta.title.trim(),
        album: meta.album.trim(),
        ...(isSlice ? { start_ms: startMs, end_ms: endMs } : {}),
      });
      const text = r.lrc || r.syncedLyrics || r.plainLyrics || '';
      onChange({ ...meta, lyrics: text, lyricsSource: r.source });
      onLyricsChange?.(text, r.source);
    } catch (e: any) {
      setLyricsError(e.message);
    } finally {
      setLyricsDetecting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-soft)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Editing segment {index + 1}</span>
        <span className="muted" style={{ fontSize: 11 }}>Draft — applied on export</span>
      </div>

      <Field label="Title" value={meta.title} onChange={v => onChange({ ...meta, title: v })} placeholder={`Title for part ${index + 1}`} />
      <Field label="Artist" value={meta.artist} onChange={v => onChange({ ...meta, artist: v })} placeholder="Artist" />
      <Field label="Album" value={meta.album} onChange={v => onChange({ ...meta, album: v })} placeholder="Album" />
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Genre" value={meta.genre} onChange={v => onChange({ ...meta, genre: v })} placeholder="Genre" /></div>
        <div style={{ width: 110 }}><Field label="Year" value={meta.year} onChange={v => onChange({ ...meta, year: v })} placeholder="2024" /></div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-soft)' }}>
        <span className="muted" style={{ fontSize: 11, flex: 1, fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={googleQueryForSearch}>{googleQueryForSearch}</span>
        <button className="btn" onClick={copyGoogle} style={{ padding: '4px 8px', fontSize: 11 }}>{copied ? '✓ Copied' : 'Copy'}</button>
        <button className="btn" onClick={() => openGoogle(googleQueryForSearch)} style={{ padding: '4px 8px', fontSize: 11 }}>Google ↗</button>
        <button className="btn" onClick={() => void copyThenOpenChosic(meta.title, meta.artist)} style={{ padding: '4px 8px', fontSize: 11 }}>Chosic ↗</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.3, color: 'var(--muted)', textTransform: 'uppercase' }}>Lyrics {meta.lyricsSource ? `· ${meta.lyricsSource}` : ''}</span>
          <span className="muted" style={{ fontSize: 11 }}>{meta.lyrics ? `${meta.lyrics.split('\n').length} lines` : 'no lyrics'}</span>
        </div>
        <textarea
          ref={textareaRef}
          value={meta.lyrics}
          onChange={e => onChange({ ...meta, lyrics: e.target.value })}
          onSelect={updateSelection}
          onKeyUp={updateSelection}
          onMouseUp={updateSelection}
          placeholder="[00:12.00]Lyric line — edit before export, will be written as .lrc + USLT"
          rows={8}
          style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.06)', color: 'var(--text)', resize: 'vertical', minHeight: 120 }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn" onClick={() => detectLyrics('auto')} disabled={lyricsDetecting} style={{ padding: '5px 10px', fontSize: 11, borderRadius: 999 }}>{lyricsDetecting ? 'Detecting…' : '✨ Detect (auto)'}</button>
          <button className="btn" onClick={() => detectLyrics('lrclib')} disabled={lyricsDetecting} style={{ padding: '5px 10px', fontSize: 11, borderRadius: 999 }}>LRClib</button>
          <button className="btn" onClick={() => detectLyrics('whisper')} disabled={lyricsDetecting} style={{ padding: '5px 10px', fontSize: 11, borderRadius: 999 }}>Whisper</button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)' }}>model
            <select value={whisperModel} onChange={e => setWhisperModel(e.target.value as WhisperModel)} disabled={lyricsDetecting} style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.06)', color: 'var(--text)', fontSize: 11 }}>
              {WHISPER_MODELS.map(m => <option key={m} value={m}>{m}{m === 'base' ? ' (default)' : ''}</option>)}
            </select>
          </label>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={handleLyricsGoogle} disabled={!selection} style={{ padding: '4px 8px', fontSize: 11 }}>{lyricsCopied ? '✓ Copied' : 'Google lyrics ↗'}</button>
        </div>
        {lyricsError && <span style={{ fontSize: 11, color: '#ff6b6b' }}>{lyricsError}</span>}
        <span className="muted" style={{ fontSize: 10, lineHeight: 1.3 }}>Lyrics are stored per-segment draft and written on export as <code>.lrc</code> next to the sliced file + USLT. Whisper is slice-aware {Number.isFinite(startMs) ? `(${Math.round((startMs as number)/1000)}s→${Math.round((endMs as number)/1000)}s)` : ''}.</span>
      </div>
    </div>
  );
}

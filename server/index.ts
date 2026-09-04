import { createServer } from 'http';
import { join, resolve, dirname, basename, extname } from 'path';
import { existsSync, promises as fs, createReadStream, statSync } from 'fs';
// ensure local whisper venv is on PATH (created by ./start.sh --setup)
try {
  const venvBin = join(process.cwd(), '.whisper-venv', 'bin');
  if (existsSync(join(venvBin, 'whisper')) && !String(process.env.PATH || '').split(':').includes(venvBin)) {
    process.env.PATH = `${venvBin}:${process.env.PATH || ''}`;
  }
} catch {}
import { parseFile } from 'music-metadata';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  getDb,
  getFolders,
  setFolders as dbSetFolders,
  getTracks,
  setTracks,
  getWishlist,
  addWishlistItem,
  updateWishlistItem,
  deleteWishlistItem,
  deleteTrackByPath,
  updateTrackByPath,
  getTrackByPath,
  renameTrackPath,
  setTrackReviewed,
  setTrackIsCover,
  getSplitDraft,
  setSplitDraft,
  deleteSplitDraft,
  renameSplitDraft,
} from './db.js';
const execFileAsync = promisify(execFile);

// Ensure DB initialized (creates file + migrates JSON if needed)
getDb();

type Track = {
  id: string;
  filePath: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  year?: number;
  duration?: number;
  duplicateGroupId?: string;
  hasCover?: boolean;
  reviewed?: boolean;
  reviewedAt?: string;
  isCover?: boolean;
};
type WishlistItem = {
  id: string;
  name: string;
  artist?: string;
  priority: 'High' | 'Medium' | 'Low';
  dateAdded: string;
};
type Config = { folders?: string[]; lastFolder?: string };

const PORT = Number(process.env.PORT || 3055);

async function walkMp3(dir: string, out: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name.startsWith('.')) continue;
      await walkMp3(full, out);
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.mp3')) {
      out.push(full);
    }
  }
  return out;
}
function fallbackFromFilename(filePath: string) {
  const base = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath;
  const withoutExt = base.replace(/\.mp3$/i, '');
  const parts = withoutExt.split(' - ');
  if (parts.length >= 2)
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  return { artist: 'Unknown', title: withoutExt.trim() || 'Unknown' };
}
function normalizeKey(t: Track): string {
  return `${t.artist.trim().toLowerCase()}|${t.title.trim().toLowerCase()}|${t.album.trim().toLowerCase()}`;
}
function markDuplicates(tracks: Track[]): Track[] {
  const groups = new Map<string, Track[]>();
  for (const t of tracks) {
    const k = normalizeKey(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }
  for (const [, arr] of groups) {
    if (arr.length > 1) {
      const gid = arr[0].artist + ' - ' + arr[0].title;
      for (const t of arr) t.duplicateGroupId = gid;
    }
  }
  return tracks;
}

async function scanFolders(folders: string[]): Promise<Track[]> {
  const uniqFolders = [...new Set(folders.map(f => resolve(f)).filter(f => f))];
  const allFiles = new Set<string>();
  for (const f of uniqFolders) {
    if (!existsSync(f)) continue;
    const files = await walkMp3(f);
    for (const fp of files) allFiles.add(resolve(fp));
  }
  // preserve reviewed state across rescans (filePath is stable id)
  const prevByPath = new Map<string, Track>();
  for (const t of getTracks()) prevByPath.set(resolve(t.filePath), t);
  const tracks: Track[] = [];
  for (const filePath of allFiles) {
    const prev = prevByPath.get(resolve(filePath));
    try {
      const meta = await parseFile(filePath);
      const fb = fallbackFromFilename(filePath);
      const hasCover = !!(meta.common.picture && meta.common.picture.length > 0);
      tracks.push({
        id: filePath,
        filePath,
        title: meta.common.title ?? fb.title,
        artist: meta.common.artist ?? fb.artist,
        album: meta.common.album ?? 'Unknown',
        genre: meta.common.genre?.[0] ?? 'Unknown',
        year: meta.common.year,
        duration: meta.format.duration ? Math.round(meta.format.duration) : undefined,
        hasCover,
        reviewed: prev?.reviewed ?? false,
        reviewedAt: prev?.reviewedAt,
        isCover: prev?.isCover ?? false,
      });
    } catch {
      const fb = fallbackFromFilename(filePath);
      tracks.push({
        id: filePath,
        filePath,
        title: fb.title,
        artist: fb.artist,
        album: 'Unknown',
        genre: 'Unknown',
        hasCover: false,
        reviewed: prev?.reviewed ?? false,
        reviewedAt: prev?.reviewedAt,
        isCover: prev?.isCover ?? false,
      });
    }
  }
  markDuplicates(tracks);
  setTracks(tracks);
  dbSetFolders(uniqFolders);
  return tracks;
}
async function getConfig(): Promise<Config> {
  return { folders: getFolders() };
}

async function moveToTrash(resolved: string): Promise<void> {
  const platform = process.platform;
  if (platform === 'darwin') {
    const escaped = resolved.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    try {
      await execFileAsync('osascript', [
        '-e',
        `tell application "Finder" to delete POSIX file "${escaped}"`,
      ]);
      return;
    } catch {}
    // fallback to `trash` CLI if available (brew install trash)
    try {
      await execFileAsync('trash', [resolved]);
      return;
    } catch {}
    // fallback: move to ~/.Trash manually (works without Finder permission, appears in Trash UI)
    try {
      const home = process.env.HOME || '';
      const trashDir = join(home, '.Trash');
      const base = resolved.split('/').pop() || 'file.mp3';
      let dest = join(trashDir, base);
      // avoid collision
      let i = 1;
      while (existsSync(dest)) {
        const dot = base.lastIndexOf('.');
        const name = dot > 0 ? base.slice(0, dot) : base;
        const ext = dot > 0 ? base.slice(dot) : '';
        dest = join(trashDir, `${name} ${i}${ext}`);
        i++;
        if (i > 100) break;
      }
      await fs.rename(resolved, dest);
      return;
    } catch {}
    throw new Error(
      'Failed to move file to Trash (Finder not authorized and ~/.Trash fallback failed)'
    );
  }
  if (platform === 'win32') {
    const ps = `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('${resolved.replace(/'/g, "''")}', 'OnlyRecycleBin', 'SendToRecycleBin')`;
    await execFileAsync('powershell', ['-NoProfile', '-Command', ps]);
    return;
  }
  // linux
  try {
    await execFileAsync('gio', ['trash', resolved]);
    return;
  } catch {}
  try {
    await execFileAsync('trash-put', [resolved]);
    return;
  } catch {}
  try {
    await execFileAsync('kioclient5', ['move', resolved, 'trash:/']);
    return;
  } catch {}
  throw new Error('No trash utility found (install gio or trash-cli)');
}

async function pickFolderNative(): Promise<string | null> {
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      const { stdout } = (await execFileAsync(
        'osascript',
        ['-e', 'POSIX path of (choose folder with prompt "Select music folder")'],
        { timeout: 120000 } as any
      )) as any;
      const p = String(stdout).trim();
      return p ? p.replace(/\/$/, '') : null;
    }
    if (platform === 'linux') {
      try {
        const { stdout } = (await execFileAsync('zenity', [
          '--file-selection',
          '--directory',
          '--title=Select music folder',
        ])) as any;
        return String(stdout).trim() || null;
      } catch {
        const { stdout } = (await execFileAsync('kdialog', ['--getexistingdirectory', '.'])) as any;
        return String(stdout).trim() || null;
      }
    }
    if (platform === 'win32') {
      const ps = `Add-Type -AssemblyName System.Windows.Forms; $f=New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description='Select music folder'; if($f.ShowDialog() -eq 'OK'){ $f.SelectedPath }`;
      const { stdout } = (await execFileAsync('powershell', ['-NoProfile', '-Command', ps])) as any;
      return String(stdout).trim() || null;
    }
  } catch {
    return null;
  }
  return null;
}

function json(res: any, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}
async function getBody(req: any): Promise<any> {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

// ── Split helpers (ffmpeg-based, no temp copy) ──
function _runCmd(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(args[0]!, args.slice(1), { maxBuffer: 10 * 1024 * 1024 } as any) as any;
}
async function getDurationMs(filePath: string): Promise<number> {
  const { stdout } = (await execFileAsync('ffprobe', [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_entries',
    'format=duration:stream=duration',
    filePath,
  ])) as any;
  const data = JSON.parse(stdout);
  const ds: number[] = [];
  const fd = data?.format?.duration;
  if (fd != null) ds.push(Number(fd));
  for (const s of data?.streams ?? []) if (s.duration != null) ds.push(Number(s.duration));
  if (!ds.length) throw new Error('ffprobe: no duration');
  return Math.round(Math.max(...ds) * 1000);
}
async function detectSplitPoints(
  filePath: string,
  minSilenceMs = 700,
  silenceThreshDb = -50
): Promise<number[]> {
  const durationMs = await getDurationMs(filePath);
  const noise = `${silenceThreshDb}dB`;
  const minDur = minSilenceMs / 1000;
  let stderr = '';
  try {
    const r: any = await execFileAsync(
      'ffmpeg',
      [
        '-vn',
        '-i',
        filePath,
        '-af',
        `silencedetect=noise=${noise}:duration=${minDur}`,
        '-f',
        'null',
        '-',
      ],
      { maxBuffer: 10 * 1024 * 1024 } as any
    );
    stderr = r.stderr ?? '';
  } catch (e: any) {
    stderr = e.stderr ?? e.message ?? '';
    if (!stderr.includes('silence_start')) throw e;
  }
  const starts: number[] = [];
  const ends: number[] = [];
  for (const line of stderr.split('\n')) {
    if (line.includes('silence_start:')) {
      const v = Number(line.split('silence_start:')[1]?.trim());
      if (!isNaN(v)) starts.push(v);
    } else if (line.includes('silence_end:')) {
      const v = Number(line.split('silence_end:')[1]?.split('|')[0]?.trim());
      if (!isNaN(v)) ends.push(v);
    }
  }
  const points: number[] = [0];
  for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
    const s = starts[i]!,
      e = ends[i]!;
    if (s < 0.1) points[0] = Math.round(e * 1000);
    else points.push(Math.round(((s + e) / 2) * 1000));
  }
  points.push(durationMs);
  return [...new Set(points)].sort((a, b) => a - b);
}
async function sliceSegment(
  src: string,
  startMs: number,
  endMs: number,
  out: string
): Promise<void> {
  const startS = startMs / 1000;
  const durS = (endMs - startMs) / 1000;
  (await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    src,
    '-vn',
    '-ss',
    String(startS),
    '-t',
    String(durS),
    '-acodec',
    'libmp3lame',
    '-b:a',
    '320k',
    '-write_xing',
    '1',
    out,
  ])) as any;
}
// ── Lyrics helpers ──
function formatLrcTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const cs = Math.floor((ms % 1000) / 10);
  return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}]`;
}
function parseLrcToSynced(lrc: string): { ms: number; text: string }[] | null {
  const lines = lrc.split('\n');
  const out: { ms: number; text: string }[] = [];
  for (const line of lines) {
    const m = line.match(/\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\](.*)/);
    if (m) {
      const min = Number(m[1]), sec = Number(m[2]), msPart = m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) : 0;
      const ms = (min * 60 + sec) * 1000 + msPart;
      const text = (m[4] ?? '').trim();
      if (text) out.push({ ms, text });
    }
  }
  return out.length ? out.sort((a, b) => a.ms - b.ms) : null;
}
function lrcFromSegments(segments: { start: number; text: string }[]): string {
  return segments.map(s => `${formatLrcTime(Math.round(s.start * 1000))}${s.text.trim()}`).join('\n');
}
async function fetchLrclib(artist: string, title: string, album?: string, durationSec?: number): Promise<{ plainLyrics: string; syncedLyrics: string; trackName: string; artistName: string; albumName: string; instrumental: boolean; duration: number } | null> {
  artist = artist.trim(); title = title.trim();
  if (!artist || !title || artist.toLowerCase() === 'unknown' || title.toLowerCase() === 'unknown') return null;
  const LRCLIB = 'https://lrclib.net';
  const HEADERS = { 'User-Agent': 'music-library/1.0' };
  const params = new URLSearchParams({ artist_name: artist, track_name: title });
  if (album && album.trim() && album.toLowerCase() !== 'unknown') params.set('album_name', album.trim());
  if (durationSec && durationSec > 0) params.set('duration', String(Math.round(durationSec)));
  try {
    const r = await fetch(`${LRCLIB}/api/get?${params}`, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
    if (r.ok) {
      const d: any = await r.json();
      if (d?.plainLyrics || d?.syncedLyrics) return normalizeLrclib(d);
    }
  } catch {}
  try {
    const qParts = [artist, title];
    if (album && album.trim().length >= 2 && album.toLowerCase() !== 'unknown') qParts.push(album.trim());
    const q = qParts.join(' ');
    const r2 = await fetch(`${LRCLIB}/api/search?q=${encodeURIComponent(q)}`, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
    if (r2.ok) {
      const arr: any = await r2.json();
      if (Array.isArray(arr) && arr.length) {
        const best = pickBestLrclib(arr, artist, title, album);
        if (best && (best.plainLyrics || best.syncedLyrics)) return normalizeLrclib(best);
      }
    }
  } catch {}
  return null;
}
function pickBestLrclib(cands: any[], artist: string, title: string, album?: string): any {
  const al = artist.toLowerCase(), tl = title.toLowerCase(), albumL = (album || '').trim().toLowerCase();
  const score = (c: any) => {
    let s = 0;
    const ca = (c.artistName || '').toLowerCase(), ct = (c.trackName || '').toLowerCase();
    if (ca === al) s += 10; else if (ca.includes(al) || al.includes(ca)) s += 5;
    if (ct === tl) s += 10; else if (ct.includes(tl) || tl.includes(ct)) s += 5;
    if (albumL) { const cal = (c.albumName || '').toLowerCase(); if (cal === albumL) s += 8; else if (cal.includes(albumL) || albumL.includes(cal)) s += 4; }
    if (c.plainLyrics) s += 3; if (c.syncedLyrics) s += 5; if (!c.instrumental) s += 1;
    return s;
  };
  return [...cands].sort((a, b) => score(b) - score(a))[0];
}
function normalizeLrclib(d: any) {
  let plain = (d.plainLyrics || '').trim();
  const synced = (d.syncedLyrics || '').trim();
  if (!plain && synced) plain = synced.replace(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g, '').split('\n').map((l: string) => l.trim()).join('\n').trim().replace(/\n{3,}/g, '\n\n');
  return { trackName: d.trackName || '', artistName: d.artistName || '', albumName: d.albumName || '', duration: d.duration || 0, instrumental: !!d.instrumental, plainLyrics: plain, syncedLyrics: synced };
}
async function transcribeWithWhisper(filePath: string, model = 'base', language?: string): Promise<{ lrc: string; plain: string; synced: { ms: number; text: string }[] | null; rawSegments: { start: number; text: string }[] }> {
  const tmpDir = join(dirname(filePath), '.whisper-tmp');
  // use `whisper` CLI (openai-whisper). Check availability first
  const args = [filePath, '--model', model, '--output_format', 'json', '--fp16', 'False', '--verbose', 'False'];
  if (language && language.trim()) args.push('--language', language.trim());
  // whisper writes <basename>.json next to input by default; use --output_dir to control
  const outDir = join('/tmp', `ml-whisper-${Date.now().toString(36)}`);
  await fs.mkdir(outDir, { recursive: true });
  args.push('--output_dir', outDir);
  try {
    await execFileAsync('whisper', args, { maxBuffer: 20 * 1024 * 1024, timeout: 300000 } as any);
  } catch (e: any) {
    // whisper returns 0 on success; if binary missing, surface 503
    const msg = e?.message || String(e);
    if (msg.includes('ENOENT') || msg.includes('not found')) throw Object.assign(new Error('whisper CLI not found — run ./start.sh --setup (auto-creates .whisper-venv) or pip install openai-whisper'), { code: 'WHISPER_NOT_FOUND' });
    // if stderr contains error but json was still written, continue
    if (!existsSync(outDir)) throw e;
  }
  const base = basename(filePath).replace(/\.[^.]+$/, '');
  const jsonPath = join(outDir, `${base}.json`);
  let segs: { start: number; text: string }[] = [];
  let plain = '';
  try {
    const raw = await fs.readFile(jsonPath, 'utf-8');
    const j = JSON.parse(raw);
    plain = (j.text || '').trim();
    const segments = j.segments || [];
    for (const s of segments) {
      const txt = String(s.text || '').trim();
      if (txt) segs.push({ start: Number(s.start || 0), text: txt });
    }
    if (!segs.length && plain) {
      // fallback split on sentence punctuation
      const parts = plain.split(/(?<=[.!?])\s+/).map((p: string) => p.trim()).filter(Boolean);
      // distribute evenly if no timestamps
      segs = parts.map((p: string, i: number) => ({ start: i * 3, text: p }));
    }
  } finally {
    try { await fs.rm(outDir, { recursive: true, force: true }); } catch {}
  }
  if (!segs.length) throw new Error('Whisper produced no segments');
  const lrc = lrcFromSegments(segs);
  const synced = parseLrcToSynced(lrc);
  return { lrc, plain, synced, rawSegments: segs };
}

function isAllowedPath(resolved: string, tracks: Track[], folders: string[]): boolean {
  if (tracks.some(t => resolve(t.filePath) === resolved)) return true;
  for (const f of folders)
    if (resolved === resolve(f) || resolved.startsWith(resolve(f) + '/')) return true;
  return false;
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    json(res, 204, {});
    return;
  }
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  try {
    if (url.pathname === '/api/config' && req.method === 'GET') {
      return json(res, 200, await getConfig());
    }
    if (url.pathname === '/api/config' && req.method === 'POST') {
      const body = await getBody(req);
      const folders: string[] = (body.folders ?? []).map((f: string) => f.trim()).filter(Boolean);
      const uniq = dbSetFolders(folders);
      return json(res, 200, { folders: uniq });
    }
    if (url.pathname === '/api/library' && req.method === 'GET') {
      const showDuplicates = url.searchParams.get('duplicates') === '1';
      let tracks = getTracks();
      if (tracks.length && !tracks.some(t => t.duplicateGroupId)) {
        markDuplicates(tracks);
      }
      if (showDuplicates) tracks = tracks.filter(t => t.duplicateGroupId);
      return json(res, 200, tracks);
    }
    if (url.pathname === '/api/library/duplicates' && req.method === 'GET') {
      const tracks = getTracks();
      const dupes = tracks.filter(t => t.duplicateGroupId);
      const groups = new Map<string, Track[]>();
      for (const t of dupes) {
        const g = t.duplicateGroupId!;
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g)!.push(t);
      }
      return json(res, 200, { count: dupes.length, groups: Object.fromEntries(groups) });
    }
    if (url.pathname === '/api/library/validate' && req.method === 'POST') {
      const tracks = getTracks();
      const validated = tracks.filter(t => existsSync(t.filePath));
      if (validated.length !== tracks.length) {
        markDuplicates(validated);
        setTracks(validated);
      }
      return json(res, 200, validated);
    }
    if (url.pathname === '/api/scan' && req.method === 'POST') {
      const body = await getBody(req);
      let folders: string[] = [];
      if (Array.isArray(body.folders)) folders = body.folders;
      else if (body.folder) folders = [body.folder];
      else if (body.folders === undefined && body.folder === undefined) {
        const cfg = await getConfig();
        folders = cfg.folders ?? [];
      }
      folders = folders.map((f: string) => f.trim()).filter(Boolean);
      if (folders.length === 0)
        return json(res, 400, { error: 'folders required (array of absolute paths)' });
      const missing = folders.filter(f => !existsSync(f));
      if (missing.length)
        return json(res, 400, { error: `folders not found: ${missing.join(', ')}` });
      const tracks = await scanFolders(folders);
      return json(res, 200, tracks);
    }

    if (url.pathname === '/api/wishlist' && req.method === 'GET') {
      return json(res, 200, getWishlist());
    }
    if (url.pathname === '/api/wishlist' && req.method === 'POST') {
      const body = await getBody(req);
      if (!body.name?.trim()) return json(res, 400, { error: 'name required' });
      const item: WishlistItem = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: body.name.trim(),
        artist: body.artist?.trim() || undefined,
        priority: body.priority || 'Medium',
        dateAdded: new Date().toISOString(),
      };
      addWishlistItem(item);
      return json(res, 201, item);
    }
    if (url.pathname.startsWith('/api/wishlist/') && req.method === 'PUT') {
      const id = url.pathname.split('/').pop()!;
      const patch = await getBody(req);
      const updated = updateWishlistItem(id, patch);
      if (!updated) return json(res, 404, { error: 'not found' });
      return json(res, 200, updated);
    }
    if (url.pathname.startsWith('/api/wishlist/') && req.method === 'DELETE') {
      const id = url.pathname.split('/').pop()!;
      deleteWishlistItem(id);
      return json(res, 200, { ok: true });
    }

    if (
      (url.pathname === '/api/tracks' ||
        url.pathname === '/api/track' ||
        url.pathname === '/api/library/track') &&
      req.method === 'DELETE'
    ) {
      let filePath = url.searchParams.get('path');
      if (!filePath && req.method === 'DELETE') {
        try {
          const body = await getBody(req);
          if (body?.path) filePath = body.path;
        } catch {}
      }
      if (!filePath)
        return json(res, 400, {
          error: 'path query required (?path=/absolute/file.mp3) or JSON body { path }',
        });
      const resolved = resolve(filePath);
      const tracks = getTracks();
      const allowed = tracks.some(t => resolve(t.filePath) === resolved);
      let inFolder = false;
      if (!allowed) {
        const cfg = await getConfig();
        for (const f of cfg.folders ?? []) {
          if (resolved.startsWith(resolve(f) + '/') || resolved === resolve(f)) {
            inFolder = true;
            break;
          }
        }
        if (!inFolder)
          return json(res, 403, { error: 'file not in library/folders — deletion denied' });
      }
      // if file doesn't exist, just remove from DB
      if (!existsSync(resolved)) {
        deleteTrackByPath(resolved);
        try { deleteSplitDraft(resolved); } catch {}
        return json(res, 200, {
          ok: true,
          deleted: false,
          removedFromLibrary: true,
          message: 'file already missing, removed from library',
        });
      }
      try {
        await moveToTrash(resolved);
      } catch (e: any) {
        return json(res, 500, { error: `failed to move file to Trash: ${e.message}` });
      }
      deleteTrackByPath(resolved);
      try { deleteSplitDraft(resolved); } catch {}
      return json(res, 200, { ok: true, trashed: true, deleted: true });
    }

    if (
      (url.pathname === '/api/tracks' ||
        url.pathname === '/api/track' ||
        url.pathname === '/api/library/track') &&
      req.method === 'PUT'
    ) {
      const body = await getBody(req);
      const filePath: string | undefined =
        body.path || body.filePath || url.searchParams.get('path') || undefined;
      if (!filePath)
        return json(res, 400, {
          error: 'path required (body { path, title?, artist?, album?, genre?, year? } or ?path=)',
        });
      const resolved = resolve(filePath);
      const existing = getTrackByPath(resolved) || getTrackByPath(filePath);
      // allow if in library or in allowed folder
      let allowed = !!existing;
      if (!allowed) {
        const cfg = await getConfig();
        for (const f of cfg.folders ?? []) {
          if (resolved.startsWith(resolve(f) + '/') || resolved === resolve(f)) {
            allowed = true;
            break;
          }
        }
        if (!allowed) return json(res, 403, { error: 'file not in library/folders — edit denied' });
      }
      if (!existsSync(resolved)) return json(res, 404, { error: 'file not found' });

      // validate fields
      const patch: Partial<Track> = {};
      if (body.title !== undefined) {
        const v = String(body.title).trim();
        if (!v) return json(res, 400, { error: 'title cannot be empty' });
        patch.title = v;
      }
      if (body.artist !== undefined) {
        const v = String(body.artist).trim();
        if (!v) return json(res, 400, { error: 'artist cannot be empty' });
        patch.artist = v;
      }
      if (body.album !== undefined) {
        const v = String(body.album).trim();
        patch.album = v;
      }
      if (body.genre !== undefined) {
        const v = String(body.genre).trim();
        if (!v) return json(res, 400, { error: 'genre cannot be empty' });
        patch.genre = v;
      }
      if (body.year !== undefined && body.year !== null && body.year !== '') {
        const y = Number(body.year);
        if (!Number.isInteger(y) || y < 1000 || y > 2100)
          return json(res, 400, { error: 'year must be integer 1000-2100' });
        patch.year = y;
      } else if (body.year === null || body.year === '') {
        patch.year = undefined;
      }
      if (Object.keys(patch).length === 0)
        return json(res, 400, {
          error: 'no editable fields provided (title, artist, album, genre, year)',
        });

      // write to file ID3 tags using node-id3 (preserves cover etc.)
      try {
        const NodeID3: any = (await import('node-id3')).default;
        // node-id3 uses { title, artist, album, genre, year }
        const tags: any = {};
        if (patch.title !== undefined) tags.title = patch.title;
        if (patch.artist !== undefined) tags.artist = patch.artist;
        if (patch.album !== undefined) tags.album = patch.album;
        if (patch.genre !== undefined) tags.genre = patch.genre;
        if (patch.year !== undefined) tags.year = String(patch.year);
        // update keeps existing tags (including picture)
        const success = NodeID3.update(tags, resolved);
        if (!success) throw new Error('node-id3 update returned false');
      } catch (e: any) {
        return json(res, 500, { error: `failed to write tags: ${e.message}` });
      }

      // re-read canonical metadata to sync DB (duration/hasCover may vary, use parseFile)
      let updated: Track | null = null;
      try {
        const meta = await parseFile(resolved);
        const fb = fallbackFromFilename(resolved);
        const hasCover = !!(meta.common.picture && meta.common.picture.length > 0);
        const canonical: Partial<Track> = {
          title: meta.common.title ?? patch.title ?? existing?.title ?? fb.title,
          artist: meta.common.artist ?? patch.artist ?? existing?.artist ?? fb.artist,
          album: meta.common.album ?? patch.album ?? existing?.album ?? 'Unknown',
          genre: meta.common.genre?.[0] ?? patch.genre ?? existing?.genre ?? 'Unknown',
          year: meta.common.year ?? patch.year ?? existing?.year,
          duration: meta.format.duration ? Math.round(meta.format.duration) : existing?.duration,
          hasCover,
        };
        // prefer patch values where metadata may still be stale due to cache, but canonical is truth
        updated = updateTrackByPath(resolved, canonical);
        // recompute duplicates if key changed
        if (patch.artist !== undefined || patch.title !== undefined || patch.album !== undefined) {
          const all = getTracks();
          markDuplicates(all);
          setTracks(all);
          updated = getTrackByPath(resolved);
        }
      } catch {
        updated = updateTrackByPath(resolved, patch);
      }
      if (!updated) return json(res, 500, { error: 'failed to update library' });
      return json(res, 200, updated);
    }

    if (url.pathname === '/api/tracks/rename' && req.method === 'PUT') {
      const body = await getBody(req);
      const filePath: string | undefined =
        body.path || body.filePath || (url.searchParams.get('path') ?? undefined);
      const newFilename: string | undefined =
        body.filename ?? body.fileName ?? body.newFilename ?? body.newFileName;
      if (!filePath) return json(res, 400, { error: 'path required' });
      if (!newFilename || !String(newFilename).trim())
        return json(res, 400, { error: 'filename required (e.g. \"Artist - Title.mp3\")' });
      let filename = String(newFilename).trim();
      // basename only — no directory separators
      if (filename.includes('/') || filename.includes('\\'))
        return json(res, 400, { error: 'filename must not contain path separators' });
      if (!filename.toLowerCase().endsWith('.mp3'))
        return json(res, 400, { error: 'filename must end with .mp3' });
      if (filename.length > 255) return json(res, 400, { error: 'filename too long (max 255)' });
      // disallow empty base
      const baseNoExt = filename.slice(0, -4).trim();
      if (!baseNoExt) return json(res, 400, { error: 'filename without extension cannot be empty' });
      // disallow problematic characters (null byte etc)
      if (filename.includes('\0')) return json(res, 400, { error: 'filename contains invalid characters' });

      const resolved = resolve(filePath);
      const existing = getTrackByPath(resolved) || getTrackByPath(filePath);
      let allowed = !!existing;
      if (!allowed) {
        const cfg = await getConfig();
        for (const f of cfg.folders ?? []) {
          if (resolved.startsWith(resolve(f) + '/') || resolved === resolve(f)) {
            allowed = true;
            break;
          }
        }
        if (!allowed) return json(res, 403, { error: 'file not in library/folders — rename denied' });
      }
      if (!existsSync(resolved)) return json(res, 404, { error: 'file not found' });

      const newPath = join(dirname(resolved), filename);
      const newResolved = resolve(newPath);
      if (newResolved === resolved) return json(res, 200, existing);
      // prevent directory traversal: must stay in same dir
      if (dirname(newResolved) !== dirname(resolved))
        return json(res, 400, { error: 'filename must not change directory' });
      if (existsSync(newResolved))
        return json(res, 409, { error: `a file named \"${filename}\" already exists in this folder` });

      try {
        await fs.rename(resolved, newResolved);
      } catch (e: any) {
        return json(res, 500, { error: `failed to rename file: ${e.message}` });
      }
      // also rename sidecar .lrc if exists (keep lyrics with file)
      try {
        const oldLrc = join(dirname(resolved), basename(resolved, extname(resolved)) + '.lrc');
        const newLrc = join(dirname(newResolved), basename(newResolved, extname(newResolved)) + '.lrc');
        if (existsSync(oldLrc) && !existsSync(newLrc)) await fs.rename(oldLrc, newLrc);
      } catch {}

      const updated = renameTrackPath(resolved, newResolved);
      try { renameSplitDraft(resolved, newResolved); } catch {}
      if (!updated) {
        // fallback: re-scan that file minimally
        return json(res, 200, { ok: true, filePath: newResolved, oldFilePath: resolved });
      }
      return json(res, 200, updated);
    }

    if (url.pathname === '/api/tracks/reviewed' && req.method === 'PUT') {
      const body = await getBody(req);
      const filePath: string | undefined = body.path || body.filePath || (url.searchParams.get('path') ?? undefined);
      if (!filePath) return json(res, 400, { error: 'path required' });
      const reviewedRaw = body.reviewed ?? body.completed ?? body.checked;
      if (reviewedRaw === undefined) return json(res, 400, { error: 'reviewed boolean required' });
      const reviewed = reviewedRaw === true || reviewedRaw === 'true' || reviewedRaw === 1 || reviewedRaw === '1';
      const resolved = resolve(filePath);
      const existing = getTrackByPath(resolved) || getTrackByPath(filePath);
      if (!existing) return json(res, 404, { error: 'track not found' });
      const updated = setTrackReviewed(resolved, reviewed);
      if (!updated) return json(res, 500, { error: 'failed to update reviewed state' });
      return json(res, 200, updated);
    }

    if ((url.pathname === '/api/tracks/is-cover' || url.pathname === '/api/tracks/cover-mark') && req.method === 'PUT') {
      const body = await getBody(req);
      const filePath: string | undefined = body.path || body.filePath || (url.searchParams.get('path') ?? undefined);
      if (!filePath) return json(res, 400, { error: 'path required' });
      const raw = body.isCover ?? body.is_original ?? body.original;
      if (raw === undefined) return json(res, 400, { error: 'isCover boolean required' });
      const isCover = raw === true || raw === 'true' || raw === 1 || raw === '1' || String(raw).toLowerCase() === 'cover';
      const resolved = resolve(filePath);
      const existing = getTrackByPath(resolved) || getTrackByPath(filePath);
      if (!existing) return json(res, 404, { error: 'track not found' });
      const updated = setTrackIsCover(resolved, isCover);
      if (!updated) return json(res, 500, { error: 'failed to update cover/original mark' });
      return json(res, 200, updated);
    }

    if (url.pathname === '/api/tracks/export-reviewed' && req.method === 'POST') {
      const body = await getBody(req);
      const destinationRaw: string | undefined = body.destination ?? body.dest ?? body.folder;
      const modeRaw: string = String(body.mode ?? 'copy').toLowerCase();
      const mode = ['copy', 'move', 'm3u'].includes(modeRaw) ? modeRaw : 'copy';
      const playlistName: string = String(body.playlistName ?? 'Completed.m3u8').trim() || 'Completed.m3u8';
      const overwrite = body.overwrite === true || body.overwrite === 'true';

      const reviewedTracks = getTracks().filter(t => !!t.reviewed);
      if (reviewedTracks.length === 0) return json(res, 400, { error: 'no tracks marked as done/reviewed' });

      // destination required for copy/move/m3u — default to <cwd>/data/playlist
      const destInput = destinationRaw?.trim() || join(process.cwd(), 'data', 'playlist');
      const destResolved = resolve(destInput);
      try {
        await fs.mkdir(destResolved, { recursive: true });
      } catch (e: any) {
        return json(res, 400, { error: `cannot create destination: ${e.message}` });
      }

      if (mode === 'm3u') {
        const safeName = playlistName.includes('/') || playlistName.includes('\\') ? 'Completed.m3u8' : playlistName;
        const finalName = safeName.toLowerCase().endsWith('.m3u') || safeName.toLowerCase().endsWith('.m3u8') ? safeName : `${safeName}.m3u8`;
        const m3uPath = join(destResolved, finalName);
        if (existsSync(m3uPath) && !overwrite) {
          return json(res, 409, { error: `playlist already exists: ${finalName} (use overwrite:true)` });
        }
        const lines: string[] = ['#EXTM3U'];
        for (const t of reviewedTracks) {
          const dur = t.duration ?? -1;
          const title = `${t.artist} - ${t.title}`;
          lines.push(`#EXTINF:${dur},${title}`);
          lines.push(t.filePath);
        }
        await fs.writeFile(m3uPath, lines.join('\n') + '\n', 'utf-8');
        return json(res, 200, { ok: true, mode, destination: destResolved, playlist: m3uPath, count: reviewedTracks.length });
      }

      // copy / move
      const results: { file: string; dest: string; ok: boolean; error?: string }[] = [];
      let okCount = 0;
      for (const t of reviewedTracks) {
        const src = resolve(t.filePath);
        if (!existsSync(src)) {
          results.push({ file: t.filePath, dest: '', ok: false, error: 'source missing' });
          continue;
        }
        const base = basename(src);
        let dest = join(destResolved, base);
        // avoid overwriting different source with same basename
        if (existsSync(dest) && resolve(dest) !== src) {
          const ext = extname(base);
          const nameNoExt = basename(base, ext);
          let n = 1;
          while (existsSync(dest) && n < 100) {
            dest = join(destResolved, `${nameNoExt} (${n})${ext}`);
            n++;
          }
        }
        // if source already in destination, skip (idempotent)
        if (resolve(dest) === src) {
          results.push({ file: t.filePath, dest, ok: true });
          okCount++;
          continue;
        }
        try {
          if (mode === 'copy') {
            await fs.copyFile(src, dest);
            // also copy sidecar .lrc if exists
            const srcLrc = join(dirname(src), basename(src, extname(src)) + '.lrc');
            const destLrc = join(dirname(dest), basename(dest, extname(dest)) + '.lrc');
            if (existsSync(srcLrc) && !existsSync(destLrc)) await fs.copyFile(srcLrc, destLrc).catch(() => {});
          } else {
            await fs.rename(src, dest);
            const srcLrc = join(dirname(src), basename(src, extname(src)) + '.lrc');
            const destLrc = join(dirname(dest), basename(dest, extname(dest)) + '.lrc');
            if (existsSync(srcLrc) && !existsSync(destLrc)) await fs.rename(srcLrc, destLrc).catch(() => {});
            // update DB path
            renameTrackPath(src, dest);
          }
          results.push({ file: t.filePath, dest, ok: true });
          okCount++;
        } catch (e: any) {
          results.push({ file: t.filePath, dest, ok: false, error: e.message });
        }
      }
      return json(res, 200, { ok: true, mode, destination: destResolved, count: reviewedTracks.length, exported: okCount, results });
    }

    if (url.pathname === '/api/stream' && req.method === 'GET') {
      const filePath = url.searchParams.get('path');
      if (!filePath) return json(res, 400, { error: 'path query required' });
      const resolved = resolve(filePath);
      const tracks = getTracks();
      const allowed = tracks.some(t => resolve(t.filePath) === resolved);
      let inFolder = false;
      if (!allowed) {
        const cfg = await getConfig();
        for (const f of cfg.folders ?? []) {
          if (resolved.startsWith(resolve(f) + '/') || resolved === resolve(f)) {
            inFolder = true;
            break;
          }
        }
        if (!inFolder) return json(res, 403, { error: 'file not in library/folders' });
      }
      if (!existsSync(resolved)) return json(res, 404, { error: 'file not found' });
      try {
        const stat = statSync(resolved);
        const range = req.headers.range as string | undefined;
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', 'audio/mpeg');
        if (range) {
          const m = range.match(/bytes=(\d*)-(\d*)/);
          if (m) {
            const start = m[1] ? parseInt(m[1], 10) : 0;
            const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
            const chunkSize = end - start + 1;
            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${stat.size}`,
              'Content-Length': chunkSize,
              'Content-Type': 'audio/mpeg',
            });
            return createReadStream(resolved, { start, end }).pipe(res);
          }
        }
        res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': 'audio/mpeg' });
        return createReadStream(resolved).pipe(res);
      } catch (e: any) {
        return json(res, 500, { error: e.message });
      }
    }

    if (url.pathname === '/api/cover' && req.method === 'GET') {
      const filePath = url.searchParams.get('path');
      if (!filePath) return json(res, 400, { error: 'path query required' });
      const resolved = resolve(filePath);
      // auth: must be in library or allowed folder (same as stream)
      const tracks = getTracks();
      const allowed = tracks.some(t => resolve(t.filePath) === resolved);
      let inFolder = false;
      if (!allowed) {
        const cfg = await getConfig();
        for (const f of cfg.folders ?? []) {
          if (resolved.startsWith(resolve(f) + '/') || resolved === resolve(f)) {
            inFolder = true;
            break;
          }
        }
        if (!inFolder) return json(res, 403, { error: 'file not in library' });
      }
      if (!existsSync(resolved)) return json(res, 404, { error: 'file not found' });
      try {
        const meta = await parseFile(resolved);
        const pic = meta.common.picture?.[0];
        if (!pic) return json(res, 404, { error: 'no cover' });
        res.writeHead(200, {
          'Content-Type': pic.format || 'image/jpeg',
          'Content-Length': pic.data.length,
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        });
        return res.end(pic.data);
      } catch (e: any) {
        return json(res, 500, { error: e.message });
      }
    }

    if ((url.pathname === '/api/tracks/cover' || url.pathname === '/api/cover') && req.method === 'PUT') {
      const body = await getBody(req);
      const filePath: string | undefined = body.path || body.filePath || (url.searchParams.get('path') ?? undefined);
      if (!filePath) return json(res, 400, { error: 'path required' });
      const resolved = resolve(filePath);
      const existing = getTrackByPath(resolved) || getTrackByPath(filePath);
      let allowed = !!existing;
      if (!allowed) {
        const cfg = await getConfig();
        for (const f of cfg.folders ?? []) {
          if (resolved.startsWith(resolve(f) + '/') || resolved === resolve(f)) { allowed = true; break; }
        }
        if (!allowed) return json(res, 403, { error: 'file not in library/folders — cover edit denied' });
      }
      if (!existsSync(resolved)) return json(res, 404, { error: 'file not found' });
      const remove = body.remove === true || body.remove === 'true' || body.action === 'remove';
      try {
        const NodeID3: any = (await import('node-id3')).default;
        if (remove) {
          // remove cover: read all tags, strip image/APIC, rewrite
          const current: any = NodeID3.read(resolved) || {};
          if (current.image || current.APIC || current.picture) {
            delete current.image;
            delete current.APIC;
            delete current.picture;
            // NodeID3.write replaces whole tag; we need to preserve remaining tags
            // If no tags left, removeTags instead
            const hasAny = Object.keys(current).some(k => k !== 'raw' && current[k] != null);
            if (!hasAny) {
              // remove all tags then re-add without picture via parseFile fallback not needed
              NodeID3.removeTags(resolved);
            } else {
              const { raw, ...tagsToWrite } = current;
              // removeTags clears existing ID3, then write new ones
              NodeID3.removeTags(resolved);
              if (Object.keys(tagsToWrite).length) NodeID3.write(tagsToWrite, resolved);
            }
          }
        } else {
          let imageB64: string | undefined = body.image || body.imageBase64 || body.data;
          let mime: string | undefined = body.mime || body.format;
          if (!imageB64) return json(res, 400, { error: 'image (base64 data URL or raw base64) required, or { remove: true }' });
          // support data URL
          if (imageB64.startsWith('data:')) {
            const m = imageB64.match(/^data:([^;]+);base64,(.*)$/);
            if (!m) return json(res, 400, { error: 'invalid data URL' });
            mime = m[1];
            imageB64 = m[2];
          }
          if (!mime) {
            // guess from header bytes
            mime = 'image/jpeg';
          }
          if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) {
            return json(res, 400, { error: `unsupported image mime ${mime} (jpeg/png/webp/gif only)` });
          }
          let buf: Buffer;
          try { buf = Buffer.from(imageB64!, 'base64'); } catch { return json(res, 400, { error: 'invalid base64' }); }
          if (buf.length === 0) return json(res, 400, { error: 'empty image' });
          if (buf.length > 8 * 1024 * 1024) return json(res, 400, { error: 'image too large (max 8MB)' });
          const tags: any = {
            image: {
              mime,
              type: { id: 3, name: 'front cover' },
              description: 'cover',
              imageBuffer: buf,
            },
          };
          const success = NodeID3.update(tags, resolved);
          if (!success) throw new Error('node-id3 update returned false');
        }
        // re-read hasCover and update DB
        let hasCover = false;
        try {
          const meta = await parseFile(resolved);
          hasCover = !!(meta.common.picture && meta.common.picture.length > 0);
        } catch { hasCover = !remove; }
        const updated = updateTrackByPath(resolved, { hasCover } as any);
        return json(res, 200, updated ?? { ok: true, hasCover });
      } catch (e: any) {
        return json(res, 500, { error: `failed to update cover: ${e.message}` });
      }
    }

    if (url.pathname === '/api/pick-folder' && req.method === 'GET') {
      const picked = await pickFolderNative();
      if (!picked)
        return json(res, 200, {
          path: null,
          message: 'No folder selected or native picker unavailable — use manual path',
        });
      return json(res, 200, { path: picked });
    }

    if (url.pathname === '/api/split/detect' && req.method === 'POST') {
      const body = await getBody(req);
      const filePath = body.path || body.filePath;
      if (!filePath) return json(res, 400, { error: 'path required' });
      const resolved = resolve(filePath);
      const tracks = getTracks();
      const cfg = await getConfig();
      if (!isAllowedPath(resolved, tracks, cfg.folders ?? []))
        return json(res, 403, { error: 'file not in library/folders' });
      if (!existsSync(resolved)) return json(res, 404, { error: 'file not found' });
      const minSilenceMs = Number(body.min_silence_ms ?? body.minSilenceMs ?? 700);
      const thresh = Number(body.silence_thresh_db ?? body.silenceThreshDb ?? -50);
      try {
        const points = await detectSplitPoints(resolved, minSilenceMs, thresh);
        return json(res, 200, {
          path: resolved,
          split_points_ms: points,
          duration_ms: points[points.length - 1] ?? 0,
        });
      } catch (e: any) {
        return json(res, 500, { error: `detect failed: ${e.message}` });
      }
    }

    if (url.pathname === '/api/split/apply' && req.method === 'POST') {
      const body = await getBody(req);
      const filePath = body.path || body.filePath;
      const points: number[] = body.split_points_ms ?? body.splitPoints ?? body.points;
      if (!filePath) return json(res, 400, { error: 'path required' });
      if (!Array.isArray(points) || points.length < 2)
        return json(res, 400, {
          error: 'split_points_ms must be array with >=2 entries (include 0 and duration)',
        });
      const resolved = resolve(filePath);
      const tracks = getTracks();
      const cfg = await getConfig();
      if (!isAllowedPath(resolved, tracks, cfg.folders ?? []))
        return json(res, 403, { error: 'file not in library/folders' });
      if (!existsSync(resolved)) return json(res, 404, { error: 'file not found' });
      const sorted = [...new Set(points.map(Number))].sort((a, b) => a - b);
      const dir = dirname(resolved);
      const ext = extname(resolved);
      const base = basename(resolved, ext);
      // For custom titles: optional per-segment metadata array [{title,artist,album}]
      const metas: any[] = Array.isArray(body.segments) ? body.segments : [];
      const created: string[] = [];
      for (let i = 0; i < sorted.length - 1; i++) {
        const s = sorted[i]!,
          e = sorted[i + 1]!;
        if (e - s < 200) continue;
        const outBase = `${base} - part ${String(i + 1).padStart(2, '0')}${ext}`;
        let outPath = join(dir, outBase);
        let n = 1;
        while (existsSync(outPath)) {
          outPath = join(dir, `${base} - part ${String(i + 1).padStart(2, '0')} (${n})${ext}`);
          n++;
          if (n > 100) break;
        }
        try {
          await sliceSegment(resolved, s, e, outPath);
        } catch (e2: any) {
          return json(res, 500, { error: `slice ${i + 1} failed: ${e2.message}` });
        }
        // optionally write ID3 tags if provided
        const meta = metas[i];
        if (meta && (meta.title || meta.artist || meta.album)) {
          try {
            const NodeID3: any = (await import('node-id3')).default;
            const tags: any = {};
            if (meta.title) tags.title = String(meta.title);
            if (meta.artist) tags.artist = String(meta.artist);
            if (meta.album) tags.album = String(meta.album);
            if (meta.year) tags.year = String(meta.year);
            if (meta.genre) tags.genre = String(meta.genre);
            // copy cover from source if exists
            try {
              const srcMeta = await parseFile(resolved);
              const pic = srcMeta.common.picture?.[0];
              if (pic)
                tags.image = {
                  mime: pic.format,
                  type: { id: 3, name: 'front cover' },
                  description: 'cover',
                  imageBuffer: pic.data,
                };
            } catch {}
            NodeID3.update(tags, outPath);
          } catch {}
        }
        created.push(outPath);
      }
      // optional: rescan folders to ingest new tracks
      try {
        const folders = cfg.folders ?? [];
        if (folders.length) {
          // quick ingest of created files only
          const newTracks: Track[] = [];
          for (const p of created) {
            try {
              const meta = await parseFile(p);
              const hasCover = !!(meta.common.picture && meta.common.picture.length > 0);
              newTracks.push({
                id: p,
                filePath: p,
                title: meta.common.title ?? basename(p, ext),
                artist: meta.common.artist ?? 'Unknown',
                album: meta.common.album ?? 'Unknown',
                genre: meta.common.genre?.[0] ?? 'Unknown',
                year: meta.common.year,
                duration: meta.format.duration ? Math.round(meta.format.duration) : undefined,
                hasCover,
              });
            } catch {
              newTracks.push({
                id: p,
                filePath: p,
                title: basename(p, ext),
                artist: 'Unknown',
                album: 'Unknown',
                genre: 'Unknown',
                hasCover: false,
              });
            }
          }
          const all = [...getTracks(), ...newTracks];
          // dedupe by filePath
          const seen = new Set<string>();
          const uniq: Track[] = [];
          for (const t of all)
            if (!seen.has(t.filePath)) {
              seen.add(t.filePath);
              uniq.push(t);
            }
          // recompute dupes inline
          const groups = new Map<string, Track[]>();
          for (const t of uniq) {
            const k = `${t.artist.trim().toLowerCase()}|${t.title.trim().toLowerCase()}|${t.album.trim().toLowerCase()}`;
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k)!.push(t);
          }
          for (const [, arr] of groups) {
            if (arr.length > 1) {
              const gid = arr[0]!.artist + ' - ' + arr[0]!.title;
              for (const t of arr) t.duplicateGroupId = gid;
            } else for (const t of arr) delete (t as any).duplicateGroupId;
          }
          setTracks(uniq);
        }
      } catch {}
      // clear draft after successful export — work is done
      try { deleteSplitDraft(resolved); } catch {}
      return json(res, 200, { ok: true, files: created, count: created.length });
    }

    // ── Split draft persistence (survives server restart) ──
    if (url.pathname === '/api/split/draft' && req.method === 'GET') {
      const filePath = url.searchParams.get('path');
      if (!filePath) return json(res, 400, { error: 'path query required' });
      const resolved = resolve(filePath);
      const cfg = await getConfig();
      if (!isAllowedPath(resolved, getTracks(), cfg.folders ?? []))
        return json(res, 403, { error: 'file not in library/folders' });
      const draft = getSplitDraft(resolved);
      if (!draft) return json(res, 200, { draft: null });
      return json(res, 200, { draft });
    }
    if (url.pathname === '/api/split/draft' && req.method === 'PUT') {
      const body = await getBody(req);
      const filePath = body.path || body.filePath;
      if (!filePath) return json(res, 400, { error: 'path required' });
      const resolved = resolve(filePath);
      const cfg = await getConfig();
      if (!isAllowedPath(resolved, getTracks(), cfg.folders ?? []))
        return json(res, 403, { error: 'file not in library/folders' });
      if (!existsSync(resolved)) return json(res, 404, { error: 'file not found' });
      const splitPoints: number[] = body.split_points_ms ?? body.splitPoints ?? body.points;
      const segmentTitles: string[] = Array.isArray(body.segmentTitles) ? body.segmentTitles : Array.isArray(body.segments) ? body.segments.map((s: any) => (typeof s === 'string' ? s : s?.title ?? '')) : [];
      if (!Array.isArray(splitPoints) || splitPoints.length < 2)
        return json(res, 400, { error: 'split_points_ms must be array with >=2 entries' });
      const sorted = [...new Set(splitPoints.map(Number).filter(n => !isNaN(n) && n >= 0))].sort((a, b) => a - b);
      if (sorted.length < 2) return json(res, 400, { error: 'invalid split points' });
      const titles = sorted.slice(0, -1).map((_, i) => String(segmentTitles[i] ?? ''));
      const draft = setSplitDraft(resolved, sorted, titles);
      return json(res, 200, { draft });
    }
    if (url.pathname === '/api/split/draft' && req.method === 'DELETE') {
      let filePath: string | null = url.searchParams.get('path');
      if (!filePath) {
        try { const b = await getBody(req); filePath = b.path || b.filePath || null; } catch {}
      }
      if (!filePath) return json(res, 400, { error: 'path query required' });
      const resolved = resolve(filePath);
      // allow clearing even if file not in library (orphan draft)
      deleteSplitDraft(resolved);
      return json(res, 200, { ok: true });
    }

    // ── Lyrics auto-detect (LRClib + Whisper base) — preview+confirm, Node-only ──
    if (url.pathname === '/api/lyrics/lookup' && req.method === 'GET') {
      const filePath = url.searchParams.get('path');
      if (!filePath) return json(res, 400, { error: 'path query required' });
      const resolved = resolve(filePath);
      const tracks = getTracks(); const cfg = await getConfig();
      if (!isAllowedPath(resolved, tracks, cfg.folders ?? [])) return json(res, 403, { error: 'file not in library/folders' });
      if (!existsSync(resolved)) return json(res, 404, { error: 'file not found' });
      const tr = getTrackByPath(resolved);
      const artist = url.searchParams.get('artist') || tr?.artist || '';
      const title = url.searchParams.get('title') || tr?.title || '';
      const album = url.searchParams.get('album') || tr?.album || undefined;
      const dur = tr?.duration;
      const hit = await fetchLrclib(artist, title, album, dur);
      if (!hit || (!hit.plainLyrics && !hit.syncedLyrics)) return json(res, 404, { error: 'No lyrics found on LRClib for this artist/title' });
      if (hit.instrumental) return json(res, 404, { error: 'Track is marked as instrumental' });
      const synced = hit.syncedLyrics ? parseLrcToSynced(hit.syncedLyrics) : null;
      return json(res, 200, { ...hit, synced, source: 'lrclib' });
    }
    if (url.pathname === '/api/lyrics/detect' && req.method === 'POST') {
      const body = await getBody(req);
      const filePath: string | undefined = body.path || body.filePath;
      if (!filePath) return json(res, 400, { error: 'path required' });
      const resolved = resolve(filePath);
      const tracks = getTracks(); const cfg = await getConfig();
      if (!isAllowedPath(resolved, tracks, cfg.folders ?? [])) return json(res, 403, { error: 'file not in library/folders' });
      if (!existsSync(resolved)) return json(res, 404, { error: 'file not found' });
      const source: string = (body.source || 'auto').toString().toLowerCase(); // auto|lrclib|whisper
      const model: string = (body.model || 'base').toString();
      const language: string | undefined = body.language ? String(body.language) : undefined;
      const tr = getTrackByPath(resolved);
      const artist = (body.artist || tr?.artist || '').toString();
      const title = (body.title || tr?.title || '').toString();
      const album = (body.album || tr?.album || undefined) as string|undefined;
      // try LRClib unless whisper-only
      if (source === 'auto' || source === 'lrclib') {
        const hit = await fetchLrclib(artist, title, album, tr?.duration);
        if (hit && (hit.plainLyrics || hit.syncedLyrics) && !hit.instrumental) {
          const synced = hit.syncedLyrics ? parseLrcToSynced(hit.syncedLyrics) : null;
          const lrc = hit.syncedLyrics || (synced ? lrcFromSegments(synced.map(s => ({ start: s.ms/1000, text: s.text }))) : hit.plainLyrics);
          // preview only — do not save
          return json(res, 200, { source: 'lrclib', plainLyrics: hit.plainLyrics, syncedLyrics: hit.syncedLyrics, lrc, synced, trackName: hit.trackName, artistName: hit.artistName });
        }
        if (source === 'lrclib') return json(res, 404, { error: 'No lyrics on LRClib — try source: whisper or auto' });
      }
      // fallback to whisper
      try {
        const w = await transcribeWithWhisper(resolved, model, language);
        return json(res, 200, { source: 'whisper', model, plainLyrics: w.plain, syncedLyrics: w.lrc, lrc: w.lrc, synced: w.synced });
      } catch (e: any) {
        if ((e as any).code === 'WHISPER_NOT_FOUND') return json(res, 503, { error: e.message, hint: 'Run ./start.sh --setup to auto-install whisper into .whisper-venv (or pip install openai-whisper). First transcribe downloads base model ~140MB.' });
        return json(res, 500, { error: `Whisper failed: ${e.message}` });
      }
    }
    if (url.pathname === '/api/lyrics' && req.method === 'POST') {
      // save previewed LRC (sidecar + USLT)
      const body = await getBody(req);
      const filePath: string | undefined = body.path || body.filePath;
      const lrc: string | undefined = body.lrc ?? body.lyrics ?? body.syncedLyrics;
      if (!filePath) return json(res, 400, { error: 'path required' });
      if (!lrc || !String(lrc).trim()) return json(res, 400, { error: 'lrc (LRC/lyrics text) required' });
      const resolved = resolve(filePath);
      const tracks = getTracks(); const cfg = await getConfig();
      if (!isAllowedPath(resolved, tracks, cfg.folders ?? [])) return json(res, 403, { error: 'file not in library/folders' });
      if (!existsSync(resolved)) return json(res, 404, { error: 'file not found' });
      const text = String(lrc).trim();
      // write sidecar .lrc
      const lrcPath = join(dirname(resolved), basename(resolved, extname(resolved)) + '.lrc');
      try { await fs.writeFile(lrcPath, text, 'utf-8'); } catch (e: any) { return json(res, 500, { error: `failed to write .lrc: ${e.message}` }); }
      // also embed USLT via node-id3
      try {
        const NodeID3: any = (await import('node-id3')).default;
        NodeID3.update({ unsynchronisedLyrics: { language: 'eng', text: text } }, resolved);
      } catch {}
      const synced = parseLrcToSynced(text);
      return json(res, 200, { ok: true, lrcPath, synced, lyrics: text });
    }
    if (url.pathname === '/api/lyrics/batch' && req.method === 'POST') {
      const body = await getBody(req);
      const source: string = (body.source || 'auto').toString().toLowerCase();
      const model: string = (body.model || 'base').toString();
      const overwrite: boolean = !!body.overwrite;
      const limit: number = Math.min(Math.max(Number(body.limit || 50), 1), 200);
      const all = getTracks();
      // pick candidates missing lyrics (no .lrc and no USLT)
      const candidates: Track[] = [];
      for (const t of all) {
        if (candidates.length >= limit) break;
        if (!existsSync(t.filePath)) continue;
        const lrcPath = join(dirname(t.filePath), basename(t.filePath, extname(t.filePath)) + '.lrc');
        const hasLrc = existsSync(lrcPath);
        if (hasLrc && !overwrite) continue;
        // also check USLT quickly — skip heavy parse if lrc exists handled; else we treat as missing and let detect confirm
        candidates.push(t);
      }
      const results: any[] = [];
      for (const t of candidates) {
        try {
          let hit: any = null; let src = '';
          if (source === 'auto' || source === 'lrclib') {
            const h = await fetchLrclib(t.artist, t.title, t.album, t.duration);
            if (h && (h.plainLyrics || h.syncedLyrics) && !h.instrumental) { hit = h; src = 'lrclib'; }
            else if (source === 'lrclib') { results.push({ path: t.filePath, status: 'not_found', source: 'lrclib' }); continue; }
          }
          if (!hit) {
            try {
              const w = await transcribeWithWhisper(t.filePath, model, body.language);
              hit = { plainLyrics: w.plain, syncedLyrics: w.lrc }; src = 'whisper';
              const synced = w.synced;
              results.push({ path: t.filePath, status: 'preview', source: src, plainLyrics: w.plain, syncedLyrics: w.lrc, lrc: w.lrc, synced, needsConfirm: true });
              continue;
            } catch (e: any) {
              results.push({ path: t.filePath, status: 'error', error: e.message, source: 'whisper' });
              continue;
            }
          }
          const lrc = hit.syncedLyrics || hit.plainLyrics;
          const synced = hit.syncedLyrics ? parseLrcToSynced(hit.syncedLyrics) : null;
          results.push({ path: t.filePath, status: 'preview', source: src, plainLyrics: hit.plainLyrics, syncedLyrics: hit.syncedLyrics, lrc, synced, trackName: hit.trackName, artistName: hit.artistName, needsConfirm: true });
        } catch (e: any) {
          results.push({ path: t.filePath, status: 'error', error: e.message });
        }
      }
      return json(res, 200, { count: candidates.length, results, note: 'Batch returns previews only — call POST /api/lyrics with {path,lrc} per track to confirm/save.' });
    }
    if (url.pathname === '/api/lyrics/batch/save' && req.method === 'POST') {
      const body = await getBody(req);
      const items: { path: string; lrc: string }[] = Array.isArray(body.items) ? body.items : [];
      if (!items.length) return json(res, 400, { error: 'items: [{path,lrc}] required' });
      const out: any[] = [];
      for (const it of items) {
        const resolved = resolve(it.path);
        const tracks = getTracks(); const cfg = await getConfig();
        if (!isAllowedPath(resolved, tracks, cfg.folders ?? [])) { out.push({ path: it.path, ok: false, error: 'not allowed' }); continue; }
        if (!existsSync(resolved)) { out.push({ path: it.path, ok: false, error: 'file not found' }); continue; }
        const text = String(it.lrc || '').trim();
        if (!text) { out.push({ path: it.path, ok: false, error: 'empty lrc' }); continue; }
        const lrcPath = join(dirname(resolved), basename(resolved, extname(resolved)) + '.lrc');
        try {
          await fs.writeFile(lrcPath, text, 'utf-8');
          try { const NodeID3: any = (await import('node-id3')).default; NodeID3.update({ unsynchronisedLyrics: { language: 'eng', text } }, resolved); } catch {}
          out.push({ path: it.path, ok: true, lrcPath });
        } catch (e: any) { out.push({ path: it.path, ok: false, error: e.message }); }
      }
      return json(res, 200, { count: out.length, results: out });
    }

    if (url.pathname === '/api/lyrics' && req.method === 'GET') {
      const filePath = url.searchParams.get('path');
      if (!filePath) return json(res, 400, { error: 'path query required' });
      const resolved = resolve(filePath);
      const tracks = getTracks();
      const cfg = await getConfig();
      if (!isAllowedPath(resolved, tracks, cfg.folders ?? []))
        return json(res, 403, { error: 'file not in library/folders' });
      if (!existsSync(resolved)) return json(res, 404, { error: 'file not found' });
      try {
        const meta = await parseFile(resolved);
        let lyrics: string | null = null;
        let synced: { ms: number; text: string }[] | undefined;
        // 1) ID3 USLT / common.lyric
        const rawLyrics = (meta.common as any).lyrics ?? (meta.common as any).lyric;
        if (Array.isArray(rawLyrics) && rawLyrics.length) {
          const first = rawLyrics[0];
          if (typeof first === 'string') lyrics = first;
          else if (first?.text) lyrics = first.text;
        }
        if (!lyrics) {
          // try native frames
          for (const tagType of Object.keys(meta.native)) {
            for (const f of (meta.native as any)[tagType] ?? []) {
              if (f.id === 'USLT' || f.id === 'SYLT' || f.id?.startsWith('USLT')) {
                const txt = f.value?.text ?? f.value;
                if (typeof txt === 'string' && txt.trim()) lyrics = txt.trim();
              }
            }
          }
        }
        // 2) LRC sidecar
        if (!lyrics) {
          const lrcPath = resolved.replace(/\.mp3$/i, '.lrc');
          const lrcPath2 = join(dirname(resolved), basename(resolved, extname(resolved)) + '.lrc');
          for (const p of [lrcPath, lrcPath2]) {
            if (existsSync(p)) {
              try {
                lyrics = await fs.readFile(p, 'utf-8');
                break;
              } catch {}
            }
          }
        }
        // 3) try parse synced from LRC format
        if (lyrics && /^\s*\[\d{1,3}:\d{2}/m.test(lyrics)) {
          const lines = lyrics.split('\n');
          const parsed: { ms: number; text: string }[] = [];
          for (const line of lines) {
            const m = line.match(/\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\](.*)/);
            if (m) {
              const min = Number(m[1]), sec = Number(m[2]), msPart = m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) : 0;
              const ms = (min * 60 + sec) * 1000 + msPart;
              const text = (m[4] ?? '').trim();
              if (text) parsed.push({ ms, text });
            }
          }
          if (parsed.length) synced = parsed.sort((a, b) => a.ms - b.ms);
        }
        return json(res, 200, { lyrics: lyrics ?? null, synced: synced ?? null });
      } catch (e: any) {
        return json(res, 500, { error: e.message });
      }
    }

    if (url.pathname === '/' && req.method === 'GET') {
      return json(res, 200, {
        ok: true,
        message: 'API server — open http://localhost:5164 for UI',
        endpoints: [
          '/api/config',
          '/api/library',
          '/api/library/duplicates',
          '/api/scan',
          '/api/wishlist',
          '/api/pick-folder',
        ],
      });
    }
    if (process.env.NODE_ENV === 'production') {
      const distFile = join(
        process.cwd(),
        'dist',
        url.pathname === '/' ? 'index.html' : url.pathname
      );
      if (existsSync(distFile) && !url.pathname.startsWith('/api')) {
        const data = await fs.readFile(distFile);
        const ext = distFile.split('.').pop();
        const ct: Record<string, string> = {
          html: 'text/html',
          js: 'text/javascript',
          css: 'text/css',
          json: 'application/json',
        };
        res.writeHead(200, { 'Content-Type': ct[ext || ''] || 'application/octet-stream' });
        return res.end(data);
      }
    }
    json(res, 404, { error: 'not found', path: url.pathname });
  } catch (e: any) {
    json(res, 500, { error: e.message ?? String(e) });
  }
});

server.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));

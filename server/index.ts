import { createServer } from 'http';
import { join, resolve, dirname, basename, extname } from 'path';
import { existsSync, promises as fs, createReadStream, statSync } from 'fs';
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
  const tracks: Track[] = [];
  for (const filePath of allFiles) {
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
      return json(res, 200, { ok: true, files: created, count: created.length });
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

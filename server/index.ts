import { createServer } from 'http';
import { join, resolve } from 'path';
import { existsSync, promises as fs, createReadStream, statSync } from 'fs';
import { parseFile } from 'music-metadata';
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

type Track = {
  id: string;
  filePath: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  year?: number;
  duration?: number;
  duplicateGroupId?: string; // set if part of duplicate group
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
const DATA_DIR = resolve(process.cwd(), 'data');
const CONFIG_FILE = join(DATA_DIR, 'config.json');
const LIBRARY_FILE = join(DATA_DIR, 'library.json');
const WISHLIST_FILE = join(DATA_DIR, 'wishlist.json');

async function readJson<T>(p: string, fallback: T): Promise<T> {
  try {
    if (!existsSync(p)) return fallback;
    return JSON.parse(await fs.readFile(p, 'utf-8')) as T;
  } catch { return fallback; }
}
async function writeJson(p: string, data: unknown) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf-8');
}
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
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
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
  // Also consider exact filePath duplicates already deduped; group by normalized key with count>1
  // Assign duplicateGroupId
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
      tracks.push({
        id: filePath,
        filePath,
        title: meta.common.title ?? fb.title,
        artist: meta.common.artist ?? fb.artist,
        album: meta.common.album ?? 'Unknown',
        genre: meta.common.genre?.[0] ?? 'Unknown',
        year: meta.common.year,
        duration: meta.format.duration ? Math.round(meta.format.duration) : undefined,
      });
    } catch {
      const fb = fallbackFromFilename(filePath);
      tracks.push({ id: filePath, filePath, title: fb.title, artist: fb.artist, album: 'Unknown', genre: 'Unknown' });
    }
  }
  markDuplicates(tracks);
  await writeJson(LIBRARY_FILE, tracks);
  await writeJson(CONFIG_FILE, { folders: uniqFolders });
  return tracks;
}
async function getConfig(): Promise<Config> {
  const raw = await readJson<any>(CONFIG_FILE, {});
  // migrate lastFolder -> folders
  if (raw.folders) return { folders: raw.folders };
  if (raw.lastFolder) return { folders: [raw.lastFolder] };
  return { folders: [] };
}

async function pickFolderNative(): Promise<string | null> {
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      const { stdout } = await execFileAsync('osascript', ['-e', 'POSIX path of (choose folder with prompt "Select music folder")'], { timeout: 120000 } as any) as any;
      const p = String(stdout).trim();
      return p ? p.replace(/\/$/, '') : null;
    }
    if (platform === 'linux') {
      // prefer zenity, fallback to kdialog
      try {
        const { stdout } = await execFileAsync('zenity', ['--file-selection', '--directory', '--title=Select music folder']) as any;
        return String(stdout).trim() || null;
      } catch {
        const { stdout } = await execFileAsync('kdialog', ['--getexistingdirectory', '.']) as any;
        return String(stdout).trim() || null;
      }
    }
    if (platform === 'win32') {
      const ps = `Add-Type -AssemblyName System.Windows.Forms; $f=New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description='Select music folder'; if($f.ShowDialog() -eq 'OK'){ $f.SelectedPath }`;
      const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', ps]) as any;
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

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { json(res, 204, {}); return; }
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  try {
    if (url.pathname === '/api/config' && req.method === 'GET') {
      return json(res, 200, await getConfig());
    }
    if (url.pathname === '/api/config' && req.method === 'POST') {
      const body = await getBody(req);
      const folders: string[] = (body.folders ?? []).map((f: string) => f.trim()).filter(Boolean);
      const uniq = [...new Set(folders.map(f => resolve(f)))];
      await writeJson(CONFIG_FILE, { folders: uniq });
      return json(res, 200, { folders: uniq });
    }
    if (url.pathname === '/api/library' && req.method === 'GET') {
      const showDuplicates = url.searchParams.get('duplicates') === '1';
      let tracks = await readJson<Track[]>(LIBRARY_FILE, []);
      // ensure duplicates marked (for old caches)
      if (tracks.length && !tracks.some(t => t.duplicateGroupId)) {
        markDuplicates(tracks);
      }
      if (showDuplicates) tracks = tracks.filter(t => t.duplicateGroupId);
      return json(res, 200, tracks);
    }
    if (url.pathname === '/api/library/duplicates' && req.method === 'GET') {
      const tracks = await readJson<Track[]>(LIBRARY_FILE, []);
      const dupes = tracks.filter(t => t.duplicateGroupId);
      // group
      const groups = new Map<string, Track[]>();
      for (const t of dupes) {
        const g = t.duplicateGroupId!;
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g)!.push(t);
      }
      return json(res, 200, { count: dupes.length, groups: Object.fromEntries(groups) });
    }
    if (url.pathname === '/api/library/validate' && req.method === 'POST') {
      const tracks = await readJson<Track[]>(LIBRARY_FILE, []);
      const validated = tracks.filter(t => existsSync(t.filePath));
      if (validated.length !== tracks.length) {
        markDuplicates(validated);
        await writeJson(LIBRARY_FILE, validated);
      }
      return json(res, 200, validated);
    }
    if (url.pathname === '/api/scan' && req.method === 'POST') {
      const body = await getBody(req);
      // support both { folder } and { folders }
      let folders: string[] = [];
      if (Array.isArray(body.folders)) folders = body.folders;
      else if (body.folder) folders = [body.folder];
      else if (body.folders === undefined && body.folder === undefined) {
        // if no body, use stored config
        const cfg = await getConfig();
        folders = cfg.folders ?? [];
      }
      folders = folders.map((f: string) => f.trim()).filter(Boolean);
      if (folders.length === 0) return json(res, 400, { error: 'folders required (array of absolute paths)' });
      const missing = folders.filter(f => !existsSync(f));
      if (missing.length) return json(res, 400, { error: `folders not found: ${missing.join(', ')}` });
      const tracks = await scanFolders(folders);
      return json(res, 200, tracks);
    }

    if (url.pathname === '/api/wishlist' && req.method === 'GET') {
      return json(res, 200, await readJson<WishlistItem[]>(WISHLIST_FILE, []));
    }
    if (url.pathname === '/api/wishlist' && req.method === 'POST') {
      const body = await getBody(req);
      if (!body.name?.trim()) return json(res, 400, { error: 'name required' });
      const list = await readJson<WishlistItem[]>(WISHLIST_FILE, []);
      const item: WishlistItem = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: body.name.trim(),
        artist: body.artist?.trim() || undefined,
        priority: body.priority || 'Medium',
        dateAdded: new Date().toISOString(),
      };
      list.push(item);
      await writeJson(WISHLIST_FILE, list);
      return json(res, 201, item);
    }
    if (url.pathname.startsWith('/api/wishlist/') && req.method === 'PUT') {
      const id = url.pathname.split('/').pop()!;
      const patch = await getBody(req);
      const list = await readJson<WishlistItem[]>(WISHLIST_FILE, []);
      const idx = list.findIndex(i => i.id === id);
      if (idx === -1) return json(res, 404, { error: 'not found' });
      list[idx] = { ...list[idx], ...patch, id: list[idx].id };
      await writeJson(WISHLIST_FILE, list);
      return json(res, 200, list[idx]);
    }
    if (url.pathname.startsWith('/api/wishlist/') && req.method === 'DELETE') {
      const id = url.pathname.split('/').pop()!;
      const list = await readJson<WishlistItem[]>(WISHLIST_FILE, []);
      const next = list.filter(i => i.id !== id);
      await writeJson(WISHLIST_FILE, next);
      return json(res, 200, { ok: true });
    }

    if (url.pathname === '/api/stream' && req.method === 'GET') {
      const filePath = url.searchParams.get('path');
      if (!filePath) return json(res, 400, { error: 'path query required' });
      const resolved = resolve(filePath);
      // security: must be inside one of the configured folders or known library
      const tracks = await readJson<Track[]>(LIBRARY_FILE, []);
      const allowed = tracks.some(t => resolve(t.filePath) === resolved);
      // also allow if inside configured folders (for ad-hoc)
      let inFolder = false;
      if (!allowed) {
        const cfg = await getConfig();
        for (const f of cfg.folders ?? []) {
          if (resolved.startsWith(resolve(f) + '/') || resolved === resolve(f)) { inFolder = true; break; }
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

    if (url.pathname === '/api/pick-folder' && req.method === 'GET') {
      const picked = await pickFolderNative();
      if (!picked) return json(res, 200, { path: null, message: 'No folder selected or native picker unavailable — use manual path' });
      return json(res, 200, { path: picked });
    }

    if (url.pathname === '/' && req.method === 'GET') {
      return json(res, 200, { ok: true, message: 'API server — open http://localhost:5164 for UI', endpoints: ['/api/config','/api/library','/api/library/duplicates','/api/scan','/api/wishlist','/api/pick-folder'] });
    }
    if (process.env.NODE_ENV === 'production') {
      const distFile = join(process.cwd(), 'dist', url.pathname === '/' ? 'index.html' : url.pathname);
      if (existsSync(distFile) && !url.pathname.startsWith('/api')) {
        const data = await fs.readFile(distFile);
        const ext = distFile.split('.').pop();
        const ct: Record<string,string> = { html:'text/html', js:'text/javascript', css:'text/css', json:'application/json' };
        res.writeHead(200, { 'Content-Type': ct[ext||''] || 'application/octet-stream' });
        return res.end(data);
      }
    }
    json(res, 404, { error: 'not found', path: url.pathname });
  } catch (e: any) {
    json(res, 500, { error: e.message ?? String(e) });
  }
});

server.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));

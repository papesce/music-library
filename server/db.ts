import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { join, resolve, dirname } from 'path';

export type Loudness = 'normal' | 'loud';
export type Track = {
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
  loudness?: Loudness | null;
  bassBoost?: number | null;
};
export type WishlistItem = {
  id: string;
  name: string;
  artist?: string;
  priority: 'High' | 'Medium' | 'Low';
  dateAdded: string;
};

function getDataDir(): string {
  if (process.env.MUSIC_DATA_DIR) return resolve(process.env.MUSIC_DATA_DIR);
  const cwd = process.cwd();
  // When launched via .app double-click, cwd is "/" (read-only) — fallback to repo's data dir
  if (cwd === '/' || cwd === '/tmp' || cwd === '/private/tmp') {
    try {
      const exeDir = dirname(process.execPath);
      // out/music-library → repo/data (common case)
      const repoData = resolve(join(exeDir, '..', 'data'));
      if (existsSync(repoData) || existsSync(join(exeDir, '..', 'package.json'))) {
        return repoData;
      }
      return resolve(join(exeDir, 'data'));
    } catch {}
    if (process.env.HOME) return join(process.env.HOME, '.music-library', 'data');
  }
  return resolve(cwd, 'data');
}
const DATA_DIR = getDataDir();
const DB_PATH = join(DATA_DIR, 'music.db');

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  // WAL for better concurrency
  db.exec('PRAGMA journal_mode = WAL');
  initSchema(db);
  migrateFromJsonIfNeeded(db);
  return db;
}

function initSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      path TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      filePath TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      album TEXT NOT NULL,
      genre TEXT NOT NULL,
      year INTEGER,
      duration INTEGER,
      duplicateGroupId TEXT,
      hasCover INTEGER DEFAULT 0,
      reviewed INTEGER DEFAULT 0,
      reviewedAt TEXT,
      isCover INTEGER DEFAULT 0,
      loudness TEXT,
      bassBoost INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS wishlist (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      artist TEXT,
      priority TEXT NOT NULL,
      dateAdded TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS split_drafts (
      filePath TEXT PRIMARY KEY,
      splitPoints TEXT NOT NULL,
      segmentTitles TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
  // ensure split_drafts exists for DBs created before this migration
  try {
    database.exec(
      `CREATE TABLE IF NOT EXISTS split_drafts (
        filePath TEXT PRIMARY KEY,
        splitPoints TEXT NOT NULL,
        segmentTitles TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )`
    );
  } catch {}
  // migrate: add segments column for per-track metadata + lyrics draft
  try {
    const cols = database.prepare(`PRAGMA table_info(split_drafts)`).all() as any[];
    if (!cols.some(c => c.name === 'segments')) {
      database.exec(`ALTER TABLE split_drafts ADD COLUMN segments TEXT`);
    }
    if (!cols.some(c => c.name === 'skippedIndices')) database.exec(`ALTER TABLE split_drafts ADD COLUMN skippedIndices TEXT`);
    if (!cols.some(c => c.name === 'dismissedDuplicateTitles')) database.exec(`ALTER TABLE split_drafts ADD COLUMN dismissedDuplicateTitles TEXT`);
    if (!cols.some(c => c.name === 'reviewedIndices')) database.exec(`ALTER TABLE split_drafts ADD COLUMN reviewedIndices TEXT`);
  } catch {}
}

function migrateFromJsonIfNeeded(database: DatabaseSync) {
  // Only migrate if tables are empty and JSON files exist with data
  const hasFolders = (database.prepare('SELECT COUNT(*) as c FROM folders').get() as any).c > 0;
  const hasTracks = (database.prepare('SELECT COUNT(*) as c FROM tracks').get() as any).c > 0;
  const hasWishlist = (database.prepare('SELECT COUNT(*) as c FROM wishlist').get() as any).c > 0;
  if (hasFolders && hasTracks && hasWishlist) return;

  // config.json
  if (!hasFolders) {
    const cfgPath = join(DATA_DIR, 'config.json');
    if (existsSync(cfgPath)) {
      try {
        const raw = JSON.parse(readFileSync(cfgPath, 'utf-8'));
        const folders: string[] = raw.folders ?? (raw.lastFolder ? [raw.lastFolder] : []);
        if (folders.length) {
          const stmt = database.prepare('INSERT OR IGNORE INTO folders (path) VALUES (?)');
          for (const f of folders) {
            const p = resolve(String(f).trim());
            if (p) stmt.run(p);
          }
        }
      } catch {}
    }
  }

  // library.json
  if (!hasTracks) {
    const libPath = join(DATA_DIR, 'library.json');
    if (existsSync(libPath)) {
      try {
        const tracks = JSON.parse(readFileSync(libPath, 'utf-8')) as Track[];
        if (Array.isArray(tracks) && tracks.length) {
          const stmt = database.prepare(
            'INSERT OR IGNORE INTO tracks (id, filePath, title, artist, album, genre, year, duration, duplicateGroupId, hasCover, reviewed, reviewedAt, isCover) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          );
          for (const t of tracks) {
            stmt.run(
              t.id,
              t.filePath,
              t.title,
              t.artist,
              t.album,
              t.genre,
              t.year ?? null,
              t.duration ?? null,
              t.duplicateGroupId ?? null,
              (t as any).hasCover ? 1 : 0,
              (t as any).reviewed ? 1 : 0,
              (t as any).reviewedAt ?? null,
              (t as any).isCover ? 1 : 0
            );
          }
        }
      } catch {}
    }
  }

  // wishlist.json
  if (!hasWishlist) {
    const wishPath = join(DATA_DIR, 'wishlist.json');
    if (existsSync(wishPath)) {
      try {
        const items = JSON.parse(readFileSync(wishPath, 'utf-8')) as WishlistItem[];
        if (Array.isArray(items) && items.length) {
          const stmt = database.prepare(
            'INSERT OR IGNORE INTO wishlist (id, name, artist, priority, dateAdded) VALUES (?, ?, ?, ?, ?)'
          );
          for (const it of items) {
            stmt.run(it.id, it.name, it.artist ?? null, it.priority, it.dateAdded);
          }
        }
      } catch {}
    }
  }
}

// --- Config / Folders ---
export function getFolders(): string[] {
  const d = getDb();
  const rows = d.prepare('SELECT path FROM folders ORDER BY rowid').all() as { path: string }[];
  return rows.map(r => r.path);
}

export function setFolders(folders: string[]) {
  const d = getDb();
  const uniq = [...new Set(folders.map(f => resolve(f)).filter(Boolean))];
  // transaction: delete all then insert
  d.exec('BEGIN');
  try {
    d.prepare('DELETE FROM folders').run();
    const stmt = d.prepare('INSERT INTO folders (path) VALUES (?)');
    for (const p of uniq) stmt.run(p);
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
  return uniq;
}

// --- Tracks ---
function ensureTrackMigrations(d: DatabaseSync) {
  for (const [col, ddl] of [
    ['hasCover', 'ALTER TABLE tracks ADD COLUMN hasCover INTEGER DEFAULT 0'],
    ['reviewed', 'ALTER TABLE tracks ADD COLUMN reviewed INTEGER DEFAULT 0'],
    ['reviewedAt', 'ALTER TABLE tracks ADD COLUMN reviewedAt TEXT'],
    ['isCover', 'ALTER TABLE tracks ADD COLUMN isCover INTEGER DEFAULT 0'],
    ['loudness', 'ALTER TABLE tracks ADD COLUMN loudness TEXT'],
    ['bassBoost', 'ALTER TABLE tracks ADD COLUMN bassBoost INTEGER DEFAULT 0'],
  ] as const) {
    try {
      d.prepare(`SELECT ${col} FROM tracks LIMIT 1`).get();
    } catch {
      try {
        d.exec(ddl);
      } catch {}
    }
  }
  // migrate legacy 'quiet' -> 'normal'
  try {
    d.prepare("UPDATE tracks SET loudness='normal' WHERE loudness='quiet'").run();
  } catch {}
}

export function getTracks(): Track[] {
  const d = getDb();
  ensureTrackMigrations(d);
  const rows = d.prepare('SELECT * FROM tracks ORDER BY artist, album, title').all() as any[];
  return rows.map(r => {
    let loud: Loudness | null = (r.loudness as Loudness | null) ?? null;
    if ((loud as any) === 'quiet') loud = 'normal';
    if (loud !== null && loud !== 'normal' && loud !== 'loud') loud = null;
    const bbRaw = r.bassBoost;
    const bb = bbRaw == null ? null : Math.min(15, Math.max(0, Math.round(Number(bbRaw))));
    return {
      id: r.id,
      filePath: r.filePath,
      title: r.title,
      artist: r.artist,
      album: r.album,
      genre: r.genre,
      year: r.year ?? undefined,
      duration: r.duration ?? undefined,
      duplicateGroupId: r.duplicateGroupId ?? undefined,
      hasCover: !!r.hasCover,
      reviewed: !!r.reviewed,
      reviewedAt: r.reviewedAt ?? undefined,
      isCover: !!r.isCover,
      loudness: loud,
      bassBoost: bb,
    };
  });
}

export function setTracks(tracks: Track[]) {
  const d = getDb();
  ensureTrackMigrations(d);
  d.exec('BEGIN');
  try {
    d.prepare('DELETE FROM tracks').run();
    const stmt = d.prepare(
      'INSERT INTO tracks (id, filePath, title, artist, album, genre, year, duration, duplicateGroupId, hasCover, reviewed, reviewedAt, isCover, loudness, bassBoost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (const t of tracks) {
      stmt.run(
        t.id,
        t.filePath,
        t.title,
        t.artist,
        t.album,
        t.genre,
        t.year ?? null,
        t.duration ?? null,
        t.duplicateGroupId ?? null,
        t.hasCover ? 1 : 0,
        t.reviewed ? 1 : 0,
        t.reviewedAt ?? null,
        t.isCover ? 1 : 0,
        t.loudness ?? null,
        t.bassBoost ?? null
      );
    }
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

export function deleteTracksNotIn(_filePaths: Set<string>) {
  // used for validate: keep only existing files - caller should filter
}

// wishlist
export function getWishlist(): WishlistItem[] {
  const d = getDb();
  const rows = d.prepare('SELECT * FROM wishlist ORDER BY rowid').all() as any[];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    artist: r.artist ?? undefined,
    priority: r.priority,
    dateAdded: r.dateAdded,
  }));
}

export function addWishlistItem(item: WishlistItem): WishlistItem {
  const d = getDb();
  d.prepare(
    'INSERT INTO wishlist (id, name, artist, priority, dateAdded) VALUES (?, ?, ?, ?, ?)'
  ).run(item.id, item.name, item.artist ?? null, item.priority, item.dateAdded);
  return item;
}

export function updateWishlistItem(id: string, patch: Partial<WishlistItem>): WishlistItem | null {
  const d = getDb();
  const existing = d.prepare('SELECT * FROM wishlist WHERE id = ?').get(id) as any;
  if (!existing) return null;
  const updated = { ...existing, ...patch, id: existing.id };
  // null handling for artist
  d.prepare(
    'UPDATE wishlist SET name = ?, artist = ?, priority = ?, dateAdded = ? WHERE id = ?'
  ).run(updated.name, updated.artist ?? null, updated.priority, updated.dateAdded, id);
  return {
    id: updated.id,
    name: updated.name,
    artist: updated.artist ?? undefined,
    priority: updated.priority,
    dateAdded: updated.dateAdded,
  };
}

export function deleteWishlistItem(id: string) {
  getDb().prepare('DELETE FROM wishlist WHERE id = ?').run(id);
}

export function deleteTrackByPath(filePath: string): boolean {
  const d = getDb();
  const resolved = resolve(filePath);
  // try both raw and resolved (id is filePath which was stored as resolve(fp))
  const result = d
    .prepare('DELETE FROM tracks WHERE filePath = ? OR id = ?')
    .run(resolved, resolved);
  // also try exact match if caller passed non-resolved
  if (result.changes === 0 && filePath !== resolved) {
    const result2 = d
      .prepare('DELETE FROM tracks WHERE filePath = ? OR id = ?')
      .run(filePath, filePath);
    return result2.changes > 0;
  }
  return result.changes > 0;
}

export function updateTrackByPath(filePath: string, patch: Partial<Track>): Track | null {
  const d = getDb();
  ensureTrackMigrations(d);
  const resolved = resolve(filePath);
  const existing =
    (d
      .prepare('SELECT * FROM tracks WHERE filePath = ? OR id = ?')
      .get(resolved, resolved) as any) ||
    (filePath !== resolved
      ? (d
          .prepare('SELECT * FROM tracks WHERE filePath = ? OR id = ?')
          .get(filePath, filePath) as any)
      : null);
  if (!existing) return null;
  const merged = { ...existing, ...patch, filePath: existing.filePath, id: existing.id };
  d.prepare(
    'UPDATE tracks SET title = ?, artist = ?, album = ?, genre = ?, year = ?, duration = ?, duplicateGroupId = ?, hasCover = ?, reviewed = ?, reviewedAt = ?, isCover = ?, loudness = ?, bassBoost = ? WHERE filePath = ?'
  ).run(
    merged.title,
    merged.artist,
    merged.album,
    merged.genre,
    merged.year ?? null,
    merged.duration ?? null,
    merged.duplicateGroupId ?? null,
    merged.hasCover ? 1 : 0,
    merged.reviewed ? 1 : 0,
    merged.reviewedAt ?? null,
    merged.isCover ? 1 : 0,
    merged.loudness ?? null,
    merged.bassBoost ?? null,
    existing.filePath
  );
  const row = d.prepare('SELECT * FROM tracks WHERE filePath = ?').get(existing.filePath) as any;
  if (!row) return null;
  return {
    id: row.id,
    filePath: row.filePath,
    title: row.title,
    artist: row.artist,
    album: row.album,
    genre: row.genre,
    year: row.year ?? undefined,
    duration: row.duration ?? undefined,
    duplicateGroupId: row.duplicateGroupId ?? undefined,
    hasCover: !!row.hasCover,
    reviewed: !!row.reviewed,
    reviewedAt: row.reviewedAt ?? undefined,
    isCover: !!row.isCover,
    loudness: (row.loudness as Loudness | null) ?? null,
    bassBoost: row.bassBoost == null ? null : Math.min(15, Math.max(0, Math.round(Number(row.bassBoost)))),
  };
}

export function setTrackIsCover(filePath: string, isCover: boolean): Track | null {
  const d = getDb();
  ensureTrackMigrations(d);
  const resolved = resolve(filePath);
  const existing =
    (d
      .prepare('SELECT * FROM tracks WHERE filePath = ? OR id = ?')
      .get(resolved, resolved) as any) ||
    (filePath !== resolved
      ? (d
          .prepare('SELECT * FROM tracks WHERE filePath = ? OR id = ?')
          .get(filePath, filePath) as any)
      : null);
  if (!existing) return null;
  d.prepare('UPDATE tracks SET isCover = ? WHERE filePath = ?').run(
    isCover ? 1 : 0,
    existing.filePath
  );
  const row2 = d.prepare('SELECT * FROM tracks WHERE filePath = ?').get(existing.filePath) as any;
  if (!row2) return null;
  return {
    id: row2.id,
    filePath: row2.filePath,
    title: row2.title,
    artist: row2.artist,
    album: row2.album,
    genre: row2.genre,
    year: row2.year ?? undefined,
    duration: row2.duration ?? undefined,
    duplicateGroupId: row2.duplicateGroupId ?? undefined,
    hasCover: !!row2.hasCover,
    reviewed: !!row2.reviewed,
    reviewedAt: row2.reviewedAt ?? undefined,
    isCover: !!row2.isCover,
    loudness: (row2.loudness as Loudness | null) ?? null,
    bassBoost: row2.bassBoost == null ? null : Math.min(15, Math.max(0, Math.round(Number(row2.bassBoost)))),
  };
}

export function setTrackReviewed(filePath: string, reviewed: boolean): Track | null {
  const d = getDb();
  ensureTrackMigrations(d);
  const resolved = resolve(filePath);
  const existing =
    (d
      .prepare('SELECT * FROM tracks WHERE filePath = ? OR id = ?')
      .get(resolved, resolved) as any) ||
    (filePath !== resolved
      ? (d
          .prepare('SELECT * FROM tracks WHERE filePath = ? OR id = ?')
          .get(filePath, filePath) as any)
      : null);
  if (!existing) return null;
  const reviewedAt = reviewed ? new Date().toISOString() : null;
  d.prepare('UPDATE tracks SET reviewed = ?, reviewedAt = ? WHERE filePath = ?').run(
    reviewed ? 1 : 0,
    reviewedAt,
    existing.filePath
  );
  const row = d.prepare('SELECT * FROM tracks WHERE filePath = ?').get(existing.filePath) as any;
  if (!row) return null;
  return {
    id: row.id,
    filePath: row.filePath,
    title: row.title,
    artist: row.artist,
    album: row.album,
    genre: row.genre,
    year: row.year ?? undefined,
    duration: row.duration ?? undefined,
    duplicateGroupId: row.duplicateGroupId ?? undefined,
    hasCover: !!row.hasCover,
    reviewed: !!row.reviewed,
    reviewedAt: row.reviewedAt ?? undefined,
    isCover: !!row.isCover,
    loudness: (row.loudness as Loudness | null) ?? null,
    bassBoost: row.bassBoost == null ? null : Math.min(15, Math.max(0, Math.round(Number(row.bassBoost)))),
  };
}

export function getTrackByPath(filePath: string): Track | null {
  const d = getDb();
  ensureTrackMigrations(d);
  const resolved = resolve(filePath);
  const row =
    (d
      .prepare('SELECT * FROM tracks WHERE filePath = ? OR id = ?')
      .get(resolved, resolved) as any) ||
    (filePath !== resolved
      ? (d
          .prepare('SELECT * FROM tracks WHERE filePath = ? OR id = ?')
          .get(filePath, filePath) as any)
      : null);
  if (!row) return null;
  return {
    id: row.id,
    filePath: row.filePath,
    title: row.title,
    artist: row.artist,
    album: row.album,
    genre: row.genre,
    year: row.year ?? undefined,
    duration: row.duration ?? undefined,
    duplicateGroupId: row.duplicateGroupId ?? undefined,
    hasCover: !!row.hasCover,
    reviewed: !!row.reviewed,
    reviewedAt: row.reviewedAt ?? undefined,
    isCover: !!row.isCover,
    loudness: (row.loudness as Loudness | null) ?? null,
    bassBoost: row.bassBoost == null ? null : Math.min(15, Math.max(0, Math.round(Number(row.bassBoost)))),
  };
}

export function setTrackBassBoost(filePath: string, bassBoost: number | null): Track | null {
  const d = getDb();
  ensureTrackMigrations(d);
  const resolved = resolve(filePath);
  const existing =
    (d.prepare('SELECT * FROM tracks WHERE filePath = ? OR id = ?').get(resolved, resolved) as any) ||
    (filePath !== resolved ? (d.prepare('SELECT * FROM tracks WHERE filePath = ? OR id = ?').get(filePath, filePath) as any) : null);
  if (!existing) return null;
  let v: number | null = null;
  if (bassBoost != null) {
    const n = Math.round(Number(bassBoost));
    if (!Number.isFinite(n) || n < 0 || n > 15) throw new Error('invalid bassBoost 0-15');
    v = n;
  }
  d.prepare('UPDATE tracks SET bassBoost = ? WHERE filePath = ?').run(v, existing.filePath);
  const row = d.prepare('SELECT * FROM tracks WHERE filePath = ?').get(existing.filePath) as any;
  if (!row) return null;
  return {
    id: row.id,
    filePath: row.filePath,
    title: row.title,
    artist: row.artist,
    album: row.album,
    genre: row.genre,
    year: row.year ?? undefined,
    duration: row.duration ?? undefined,
    duplicateGroupId: row.duplicateGroupId ?? undefined,
    hasCover: !!row.hasCover,
    reviewed: !!row.reviewed,
    reviewedAt: row.reviewedAt ?? undefined,
    isCover: !!row.isCover,
    loudness: (row.loudness as Loudness | null) ?? null,
    bassBoost: row.bassBoost == null ? null : Math.min(15, Math.max(0, Math.round(Number(row.bassBoost)))),
  };
}

// --- Split drafts (persist work-in-progress split decisions across restarts) ---
export type SegmentDraft = {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  year?: string;
  isCover?: boolean;
  lyrics?: string;
  lyricsSource?: string;
};
export type SplitDraft = {
  filePath: string;
  splitPoints: number[];
  segmentTitles: string[];
  segments?: SegmentDraft[];
  skippedIndices?: number[];
  dismissedDuplicateTitles?: (string | null)[];
  reviewedIndices?: number[];
  updatedAt: string;
};

export function getSplitDraft(filePath: string): SplitDraft | null {
  const d = getDb();
  const resolved = resolve(filePath);
  const row = d.prepare('SELECT * FROM split_drafts WHERE filePath = ?').get(resolved) as any;
  if (!row) return null;
  try {
    let segments: SegmentDraft[] | undefined;
    if (row.segments) {
      try {
        const parsed = JSON.parse(row.segments);
        if (Array.isArray(parsed)) segments = parsed;
      } catch {}
    }
    return {
      filePath: row.filePath,
      splitPoints: JSON.parse(row.splitPoints),
      segmentTitles: JSON.parse(row.segmentTitles),
      segments,
      skippedIndices: row.skippedIndices ? JSON.parse(row.skippedIndices) : undefined,
      dismissedDuplicateTitles: row.dismissedDuplicateTitles ? JSON.parse(row.dismissedDuplicateTitles) : undefined,
      reviewedIndices: row.reviewedIndices ? JSON.parse(row.reviewedIndices) : undefined,
      updatedAt: row.updatedAt,
    };
  } catch {
    return null;
  }
}

export function setSplitDraft(
  filePath: string,
  splitPoints: number[],
  segmentTitles: string[],
  segments?: SegmentDraft[],
  skippedIndices?: number[],
  dismissedDuplicateTitles?: (string | null)[],
  reviewedIndices?: number[]
): SplitDraft {
  const d = getDb();
  const resolved = resolve(filePath);
  const now = new Date().toISOString();
  d.prepare(
    `INSERT INTO split_drafts (filePath, splitPoints, segmentTitles, segments, skippedIndices, dismissedDuplicateTitles, reviewedIndices, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(filePath) DO UPDATE SET splitPoints=excluded.splitPoints, segmentTitles=excluded.segmentTitles, segments=excluded.segments, skippedIndices=excluded.skippedIndices, dismissedDuplicateTitles=excluded.dismissedDuplicateTitles, reviewedIndices=excluded.reviewedIndices, updatedAt=excluded.updatedAt`
  ).run(resolved, JSON.stringify(splitPoints), JSON.stringify(segmentTitles), segments ? JSON.stringify(segments) : null, JSON.stringify(skippedIndices ?? []), JSON.stringify(dismissedDuplicateTitles ?? []), JSON.stringify(reviewedIndices ?? []), now);
  return { filePath: resolved, splitPoints, segmentTitles, segments, skippedIndices, dismissedDuplicateTitles, reviewedIndices, updatedAt: now };
}

export function deleteSplitDraft(filePath: string): boolean {
  const d = getDb();
  const resolved = resolve(filePath);
  const r = d.prepare('DELETE FROM split_drafts WHERE filePath = ?').run(resolved);
  return r.changes > 0;
}

export function renameSplitDraft(oldPath: string, newPath: string): void {
  const d = getDb();
  const o = resolve(oldPath);
  const n = resolve(newPath);
  if (o === n) return;
  d.prepare('UPDATE OR IGNORE split_drafts SET filePath = ? WHERE filePath = ?').run(n, o);
}

export function renameTrackPath(oldPath: string, newPath: string): Track | null {
  const d = getDb();
  const oldResolved = resolve(oldPath);
  const newResolved = resolve(newPath);
  const existing =
    (d
      .prepare('SELECT * FROM tracks WHERE filePath = ? OR id = ?')
      .get(oldResolved, oldResolved) as any) ||
    (oldPath !== oldResolved
      ? (d
          .prepare('SELECT * FROM tracks WHERE filePath = ? OR id = ?')
          .get(oldPath, oldPath) as any)
      : null);
  if (!existing) return null;
  d.prepare('UPDATE tracks SET filePath = ?, id = ? WHERE filePath = ?').run(
    newResolved,
    newResolved,
    existing.filePath
  );
  const row = d.prepare('SELECT * FROM tracks WHERE filePath = ?').get(newResolved) as any;
  if (!row) return null;
  return {
    id: row.id,
    filePath: row.filePath,
    title: row.title,
    artist: row.artist,
    album: row.album,
    genre: row.genre,
    year: row.year ?? undefined,
    duration: row.duration ?? undefined,
    duplicateGroupId: row.duplicateGroupId ?? undefined,
    hasCover: !!row.hasCover,
    reviewed: !!row.reviewed,
    reviewedAt: row.reviewedAt ?? undefined,
    isCover: !!row.isCover,
    loudness: (row.loudness as Loudness | null) ?? null,
    bassBoost: row.bassBoost == null ? null : Math.min(15, Math.max(0, Math.round(Number(row.bassBoost)))),
  };
}

// state export/import helpers (only non-derived fields)
export function getAllSplitDrafts(): SplitDraft[] {
  const d = getDb();
  const rows = d.prepare('SELECT * FROM split_drafts ORDER BY filePath').all() as any[];
  return rows.map(r => {
    let segments: SegmentDraft[] | undefined;
    if (r.segments) {
      try {
        const p = JSON.parse(r.segments);
        if (Array.isArray(p)) segments = p;
      } catch {}
    }
    return {
      filePath: r.filePath,
      splitPoints: JSON.parse(r.splitPoints),
      segmentTitles: JSON.parse(r.segmentTitles),
      segments,
      skippedIndices: r.skippedIndices ? JSON.parse(r.skippedIndices) : undefined,
      dismissedDuplicateTitles: r.dismissedDuplicateTitles ? JSON.parse(r.dismissedDuplicateTitles) : undefined,
      reviewedIndices: r.reviewedIndices ? JSON.parse(r.reviewedIndices) : undefined,
      updatedAt: r.updatedAt,
    };
  });
}

export function setAllSplitDrafts(drafts: SplitDraft[]) {
  const d = getDb();
  d.exec('BEGIN');
  try {
    d.prepare('DELETE FROM split_drafts').run();
    const stmt = d.prepare(
      'INSERT INTO split_drafts (filePath, splitPoints, segmentTitles, segments, skippedIndices, dismissedDuplicateTitles, reviewedIndices, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (const dr of drafts)
      stmt.run(
        resolve(dr.filePath),
        JSON.stringify(dr.splitPoints),
        JSON.stringify(dr.segmentTitles),
        dr.segments ? JSON.stringify(dr.segments) : null,
        JSON.stringify(dr.skippedIndices ?? []),
        JSON.stringify(dr.dismissedDuplicateTitles ?? []),
        JSON.stringify(dr.reviewedIndices ?? []),
        dr.updatedAt
      );
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

export function clearWishlist() {
  getDb().prepare('DELETE FROM wishlist').run();
}

// helpers for loudness
export function setTrackLoudness(filePath: string, loudness: Loudness | null): Track | null {
  const d = getDb();
  ensureTrackMigrations(d);
  const resolved = resolve(filePath);
  const existing =
    (d
      .prepare('SELECT * FROM tracks WHERE filePath = ? OR id = ?')
      .get(resolved, resolved) as any) ||
    (filePath !== resolved
      ? (d
          .prepare('SELECT * FROM tracks WHERE filePath = ? OR id = ?')
          .get(filePath, filePath) as any)
      : null);
  if (!existing) return null;
  if (loudness !== null && !['normal', 'loud'].includes(loudness))
    throw new Error('invalid loudness');
  d.prepare('UPDATE tracks SET loudness = ? WHERE filePath = ?').run(loudness, existing.filePath);
  const row = d.prepare('SELECT * FROM tracks WHERE filePath = ?').get(existing.filePath) as any;
  if (!row) return null;
  return {
    id: row.id,
    filePath: row.filePath,
    title: row.title,
    artist: row.artist,
    album: row.album,
    genre: row.genre,
    year: row.year ?? undefined,
    duration: row.duration ?? undefined,
    duplicateGroupId: row.duplicateGroupId ?? undefined,
    hasCover: !!row.hasCover,
    reviewed: !!row.reviewed,
    reviewedAt: row.reviewedAt ?? undefined,
    isCover: !!row.isCover,
    loudness: (row.loudness as Loudness | null) ?? null,
    bassBoost: row.bassBoost == null ? null : Math.min(15, Math.max(0, Math.round(Number(row.bassBoost)))),
  };
}

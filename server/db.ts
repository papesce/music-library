import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

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
};
export type WishlistItem = {
  id: string;
  name: string;
  artist?: string;
  priority: 'High' | 'Medium' | 'Low';
  dateAdded: string;
};

const DATA_DIR = resolve(process.cwd(), 'data');
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
      hasCover INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS wishlist (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      artist TEXT,
      priority TEXT NOT NULL,
      dateAdded TEXT NOT NULL
    );
  `);
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
            'INSERT OR IGNORE INTO tracks (id, filePath, title, artist, album, genre, year, duration, duplicateGroupId, hasCover) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          );
          for (const t of tracks) {
            stmt.run(t.id, t.filePath, t.title, t.artist, t.album, t.genre, t.year ?? null, t.duration ?? null, t.duplicateGroupId ?? null, (t as any).hasCover ? 1 : 0);
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
          const stmt = database.prepare('INSERT OR IGNORE INTO wishlist (id, name, artist, priority, dateAdded) VALUES (?, ?, ?, ?, ?)');
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
export function getTracks(): Track[] {
  const d = getDb();
  // migrate hasCover column if DB from old version
  try { d.prepare('SELECT hasCover FROM tracks LIMIT 1').get(); } catch { try { d.exec('ALTER TABLE tracks ADD COLUMN hasCover INTEGER DEFAULT 0'); } catch {} }
  const rows = d.prepare('SELECT * FROM tracks ORDER BY artist, album, title').all() as any[];
  return rows.map(r => ({
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
  }));
}

export function setTracks(tracks: Track[]) {
  const d = getDb();
  d.exec('BEGIN');
  try {
    d.prepare('DELETE FROM tracks').run();
    const stmt = d.prepare(
      'INSERT INTO tracks (id, filePath, title, artist, album, genre, year, duration, duplicateGroupId, hasCover) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (const t of tracks) {
      stmt.run(t.id, t.filePath, t.title, t.artist, t.album, t.genre, t.year ?? null, t.duration ?? null, t.duplicateGroupId ?? null, t.hasCover ? 1 : 0);
    }
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

export function deleteTracksNotIn(filePaths: Set<string>) {
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
  d.prepare('INSERT INTO wishlist (id, name, artist, priority, dateAdded) VALUES (?, ?, ?, ?, ?)').run(
    item.id, item.name, item.artist ?? null, item.priority, item.dateAdded
  );
  return item;
}

export function updateWishlistItem(id: string, patch: Partial<WishlistItem>): WishlistItem | null {
  const d = getDb();
  const existing = d.prepare('SELECT * FROM wishlist WHERE id = ?').get(id) as any;
  if (!existing) return null;
  const updated = { ...existing, ...patch, id: existing.id };
  // null handling for artist
  d.prepare('UPDATE wishlist SET name = ?, artist = ?, priority = ?, dateAdded = ? WHERE id = ?').run(
    updated.name, updated.artist ?? null, updated.priority, updated.dateAdded, id
  );
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

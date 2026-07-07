import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * SQLite handle, shared across the whole server process.
 * Stored on globalThis so Next.js dev-mode module reloads reuse the
 * same connection instead of leaking file handles.
 */
declare global {
  // eslint-disable-next-line no-var
  var __tvtime_db: Database.Database | undefined;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS shows (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  tvdb_id INTEGER,
  imdb_id TEXT,
  tmdb_id INTEGER,
  poster_url TEXT,
  backdrop_url TEXT,
  status TEXT NOT NULL DEFAULT '',
  network TEXT,
  runtime INTEGER,
  premiered TEXT,
  genres TEXT NOT NULL DEFAULT '[]',
  summary TEXT,
  followed_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  last_synced_at TEXT
);

CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY,
  show_id INTEGER NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  number INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  airdate TEXT,
  airstamp TEXT,
  runtime INTEGER,
  summary TEXT,
  image_url TEXT,
  watched_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_episodes_show ON episodes(show_id, season, number);
CREATE INDEX IF NOT EXISTS idx_episodes_airstamp ON episodes(airstamp);
CREATE INDEX IF NOT EXISTS idx_shows_tvdb ON shows(tvdb_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function getDb(): Database.Database {
  if (globalThis.__tvtime_db) return globalThis.__tvtime_db;

  const dataDir = process.env.TVTIME_DATA_DIR || path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, "tvtime.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  globalThis.__tvtime_db = db;
  return db;
}

export function getSetting(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(key, value);
}

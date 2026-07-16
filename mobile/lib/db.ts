import * as SQLite from "expo-sqlite";

/** On-device SQLite. Everything the app knows lives in this one database. */

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
  watched_at TEXT,
  rating REAL,
  plays INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_episodes_show ON episodes(show_id, season, number);
CREATE INDEX IF NOT EXISTS idx_episodes_airstamp ON episodes(airstamp);
CREATE INDEX IF NOT EXISTS idx_shows_tvdb ON shows(tvdb_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

let db: SQLite.SQLiteDatabase | null = null;

/** Schema migrations for databases created by earlier app versions. */
function migrate(handle: SQLite.SQLiteDatabase): void {
  const version =
    handle.getFirstSync<{ user_version: number }>("PRAGMA user_version")
      ?.user_version ?? 0;
  const hasColumn = (col: string) =>
    handle
      .getAllSync<{ name: string }>("PRAGMA table_info(episodes)")
      .some((c) => c.name === col);

  if (version < 1) {
    if (!hasColumn("reaction")) {
      handle.execSync("ALTER TABLE episodes ADD COLUMN reaction TEXT");
    }
    handle.execSync("PRAGMA user_version = 1");
  }
  // v2: star ratings replace emoji reactions.
  if (version < 2) {
    if (!hasColumn("rating")) {
      handle.execSync("ALTER TABLE episodes ADD COLUMN rating REAL");
    }
    handle.execSync("PRAGMA user_version = 2");
  }
  // v3: rewatch tracking (times watched per episode).
  if (version < 3) {
    if (!hasColumn("plays")) {
      handle.execSync(
        "ALTER TABLE episodes ADD COLUMN plays INTEGER NOT NULL DEFAULT 0"
      );
      // Backfill: anything already watched counts as one play.
      handle.execSync(
        "UPDATE episodes SET plays = 1 WHERE watched_at IS NOT NULL"
      );
    }
    handle.execSync("PRAGMA user_version = 3");
  }
}

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync("tvtime.db");
    db.execSync("PRAGMA journal_mode = WAL;");
    db.execSync("PRAGMA foreign_keys = ON;");
    db.execSync(SCHEMA);
    migrate(db);
  }
  return db;
}

export function getSetting(key: string): string | null {
  const row = getDb().getFirstSync<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    key
  );
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb().runSync(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value
  );
}

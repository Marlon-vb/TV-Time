import JSZip from "jszip";
import { parseCsvRows } from "./csv";

/**
 * Parser for TV Time data exports — same tolerant column-sniffing as the web
 * app, adapted for React Native (jszip + hand-rolled CSV instead of Node
 * libraries). Pure: no network, no database.
 */

export interface ParsedEpisode {
  season: number | null;
  number: number | null;
  episodeTvdbId: number | null;
  watchedAt: string | null;
}

export interface ParsedShow {
  tvdbId: number | null;
  name: string | null;
  episodes: ParsedEpisode[];
}

export interface ParsedImport {
  shows: ParsedShow[];
  rowsRead: number;
  filesRead: string[];
  warnings: string[];
}

const SHOW_ID_HEADERS = ["tv_show_id", "tvdb_id", "series_id", "show_id"];
const SHOW_NAME_HEADERS = [
  "tv_show_name",
  "show_name",
  "series_name",
  "show_title",
  "show",
];
const SEASON_HEADERS = ["season_number", "episode_season_number", "season"];
const NUMBER_HEADERS = ["episode_number", "number", "episode_num"];
const EPISODE_ID_HEADERS = ["episode_id", "tvdb_episode_id"];
const WATCHED_AT_HEADERS = [
  "watched_at",
  "date_watched",
  "watched_on",
  "created_at",
  "updated_at",
];
const WATCHED_FLAG_HEADERS = ["is_watched", "watched"];

function pick(row: Record<string, string>, headers: string[]): string | null {
  for (const h of headers) {
    const v = row[h];
    if (v !== undefined && v !== "") return v;
  }
  return null;
}

function toInt(value: string | null): number | null {
  if (value == null) return null;
  const n = parseInt(value.trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function toIsoDate(value: string | null): string | null {
  if (!value) return null;
  let t = Date.parse(value);
  if (Number.isNaN(t)) t = Date.parse(value.replace(" ", "T") + "Z");
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

function isFalse(value: string | null): boolean {
  if (value == null) return false;
  return ["0", "false", "no", "n"].includes(value.trim().toLowerCase());
}

export interface ImportFile {
  name: string;
  /** CSV text, or zip contents as bytes. */
  text?: string;
  bytes?: Uint8Array;
}

interface ShowAccumulator {
  tvdbId: number | null;
  name: string | null;
  episodes: ParsedEpisode[];
}

export async function parseImportFiles(
  files: ImportFile[]
): Promise<ParsedImport> {
  const warnings: string[] = [];
  const filesRead: string[] = [];
  let rowsRead = 0;

  const csvs: { name: string; content: string }[] = [];
  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".zip") && file.bytes) {
      try {
        const zip = await JSZip.loadAsync(file.bytes);
        for (const entry of Object.values(zip.files)) {
          if (entry.dir) continue;
          if (!entry.name.toLowerCase().endsWith(".csv")) continue;
          csvs.push({ name: entry.name, content: await entry.async("string") });
        }
      } catch {
        warnings.push(`Could not open zip file ${file.name}`);
      }
    } else if (lower.endsWith(".csv") && file.text != null) {
      csvs.push({ name: file.name, content: file.text });
    } else {
      warnings.push(`Skipped ${file.name} (not a CSV or zip)`);
    }
  }

  const byId = new Map<number, ShowAccumulator>();
  const byName = new Map<string, ShowAccumulator>();

  const accFor = (
    tvdbId: number | null,
    name: string | null
  ): ShowAccumulator | null => {
    if (tvdbId != null) {
      let acc = byId.get(tvdbId);
      if (!acc) {
        acc = { tvdbId, name, episodes: [] };
        byId.set(tvdbId, acc);
      }
      if (!acc.name && name) acc.name = name;
      return acc;
    }
    if (name) {
      const key = name.trim().toLowerCase();
      let acc = byName.get(key);
      if (!acc) {
        acc = { tvdbId: null, name: name.trim(), episodes: [] };
        byName.set(key, acc);
      }
      return acc;
    }
    return null;
  };

  for (const csv of csvs) {
    const rows = parseCsvRows(csv.content);
    if (rows.length === 0) continue;
    filesRead.push(csv.name);

    for (const row of rows) {
      rowsRead++;
      const tvdbId = toInt(pick(row, SHOW_ID_HEADERS));
      const name = pick(row, SHOW_NAME_HEADERS);
      const acc = accFor(tvdbId, name);
      if (!acc) continue;

      const season = toInt(pick(row, SEASON_HEADERS));
      const number = toInt(pick(row, NUMBER_HEADERS));
      const episodeTvdbId = toInt(pick(row, EPISODE_ID_HEADERS));
      const watchedFlag = pick(row, WATCHED_FLAG_HEADERS);

      const isEpisodeRow =
        (season != null && number != null) || episodeTvdbId != null;
      if (!isEpisodeRow) continue;
      if (isFalse(watchedFlag)) continue;

      acc.episodes.push({
        season,
        number,
        episodeTvdbId,
        watchedAt: toIsoDate(pick(row, WATCHED_AT_HEADERS)),
      });
    }
  }

  const idByName = new Map<string, ShowAccumulator>();
  for (const acc of byId.values()) {
    if (acc.name) idByName.set(acc.name.trim().toLowerCase(), acc);
  }
  const shows: ParsedShow[] = [...byId.values()];
  for (const [key, acc] of byName.entries()) {
    const existing = idByName.get(key);
    if (existing) existing.episodes.push(...acc.episodes);
    else shows.push(acc);
  }

  return { shows, rowsRead, filesRead, warnings };
}

export function dedupeEpisodes(episodes: ParsedEpisode[]): ParsedEpisode[] {
  const byPosition = new Map<string, ParsedEpisode>();
  const byTvdbOnly = new Map<number, ParsedEpisode>();
  for (const ep of episodes) {
    if (ep.season != null && ep.number != null) {
      const key = `${ep.season}x${ep.number}`;
      const prev = byPosition.get(key);
      if (
        !prev ||
        (ep.watchedAt && prev.watchedAt && ep.watchedAt < prev.watchedAt)
      ) {
        byPosition.set(key, ep);
      }
    } else if (ep.episodeTvdbId != null) {
      if (!byTvdbOnly.has(ep.episodeTvdbId)) {
        byTvdbOnly.set(ep.episodeTvdbId, ep);
      }
    }
  }
  return [...byPosition.values(), ...byTvdbOnly.values()];
}

import type { RemoteEpisode, RemoteShow } from "./types";

/**
 * Deterministic offline fixture universe, enabled with TV_API_MOCK=1.
 * Episode air dates are generated relative to "now" so Watch Next,
 * Upcoming, and behind-counts all exercise realistically at any time.
 */

interface MockConfig {
  id: number;
  name: string;
  tvdbId: number;
  imdbId: string;
  status: "Running" | "Ended" | "To Be Determined";
  network: string;
  runtime: number;
  genres: string[];
  summary: string;
  /** episodes per season; the last season may still be airing */
  seasons: number[];
  /**
   * Days from now to the most recently aired episode of the last season
   * (negative = past). Remaining episodes continue weekly after it.
   * How many episodes of the last season have aired is set by lastSeasonAired.
   */
  lastAiredOffsetDays: number;
  lastSeasonAired: number; // how many episodes of the final season have aired
}

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

const CONFIGS: MockConfig[] = [
  {
    id: 101, name: "Midnight Signal", tvdbId: 501101, imdbId: "tt9000101",
    status: "Running", network: "AMC", runtime: 45,
    genres: ["Drama", "Thriller"],
    summary: "A late-night radio host in a fading desert town starts receiving calls that predict local disasters — always exactly one week before they happen.",
    seasons: [8, 10, 10], lastAiredOffsetDays: -2, lastSeasonAired: 5,
  },
  {
    id: 102, name: "The Long Static", tvdbId: 501102, imdbId: "tt9000102",
    status: "Ended", network: "HBO", runtime: 55,
    genres: ["Drama", "Science-Fiction"],
    summary: "Twenty years after a signal from deep space went silent, the last members of the listening project reunite to discover it never actually stopped.",
    seasons: [8, 8], lastAiredOffsetDays: -400, lastSeasonAired: 8,
  },
  {
    id: 103, name: "Orbit City", tvdbId: 501103, imdbId: "tt9000103",
    status: "Running", network: "Adult Swim", runtime: 22,
    genres: ["Comedy", "Animation", "Science-Fiction"],
    summary: "An animated workplace comedy about the underfunded maintenance crew of humanity's first orbital shopping mall.",
    seasons: [12, 12, 12, 6], lastAiredOffsetDays: -9, lastSeasonAired: 3,
  },
  {
    id: 104, name: "Glasshouse", tvdbId: 501104, imdbId: "tt9000104",
    status: "Running", network: "Netflix", runtime: 50,
    genres: ["Thriller", "Mystery"],
    summary: "Eight strangers wake up in a transparent mansion where every room they enter reveals one of their secrets to the others.",
    seasons: [8], lastAiredOffsetDays: 21, lastSeasonAired: 0,
  },
  {
    id: 105, name: "Paper Crowns", tvdbId: 501105, imdbId: "tt9000105",
    status: "Ended", network: "BBC One", runtime: 58,
    genres: ["Drama", "History"],
    summary: "The rise and quiet fall of a family-run printing house that forged royal documents for three generations of European courts.",
    seasons: [6, 6, 6, 6], lastAiredOffsetDays: -900, lastSeasonAired: 6,
  },
  {
    id: 106, name: "Deadline", tvdbId: 501106, imdbId: "tt9000106",
    status: "Running", network: "FX", runtime: 30,
    genres: ["Comedy", "Drama"],
    summary: "A once-great newspaper's four remaining journalists have 24 hours per episode to land the story that keeps the lights on.",
    seasons: [10, 10], lastAiredOffsetDays: -5, lastSeasonAired: 8,
  },
  {
    id: 107, name: "Cold Harbor", tvdbId: 501107, imdbId: "tt9000107",
    status: "To Be Determined", network: "Apple TV+", runtime: 48,
    genres: ["Crime", "Mystery"],
    summary: "A detective returns to the Arctic port town she fled as a teenager when the harbor ice gives up a body frozen for thirty years.",
    seasons: [8], lastAiredOffsetDays: -60, lastSeasonAired: 8,
  },
  {
    id: 108, name: "Static & Sons", tvdbId: 501108, imdbId: "tt9000108",
    status: "Ended", network: "NBC", runtime: 21,
    genres: ["Comedy", "Family"],
    summary: "A classic sitcom about a father and his three adult sons running the last TV-repair shop in Brooklyn.",
    seasons: [22, 22, 22], lastAiredOffsetDays: -1500, lastSeasonAired: 22,
  },
];

function toShow(c: MockConfig): RemoteShow {
  return {
    id: c.id,
    name: c.name,
    tvdbId: c.tvdbId,
    imdbId: c.imdbId,
    posterUrl: `/mock-posters/${c.id}.svg`,
    backdropUrl: null,
    status: c.status,
    network: c.network,
    runtime: c.runtime,
    premiered: isoDate(firstEpisodeTime(c)),
    genres: c.genres,
    summary: c.summary,
  };
}

function firstEpisodeTime(c: MockConfig): number {
  // Work backwards: last season's ep1 = lastAired - (lastSeasonAired-1) weeks,
  // earlier seasons run consecutively before it with a 90-day gap between seasons.
  let seasonStart =
    Date.now() +
    c.lastAiredOffsetDays * DAY -
    Math.max(c.lastSeasonAired - 1, 0) * WEEK;
  // Mirror buildEpisodes' forward walk exactly: a season occupies
  // count*WEEK (cursor lands one week past its finale) plus the 90-day gap.
  for (let s = c.seasons.length - 2; s >= 0; s--) {
    seasonStart -= 90 * DAY + c.seasons[s] * WEEK;
  }
  return seasonStart;
}

function buildEpisodes(c: MockConfig): RemoteEpisode[] {
  const episodes: RemoteEpisode[] = [];
  let cursor = firstEpisodeTime(c);
  for (let s = 0; s < c.seasons.length; s++) {
    for (let n = 1; n <= c.seasons[s]; n++) {
      const t = cursor;
      episodes.push({
        id: c.id * 1000 + (s + 1) * 100 + n, // stable, readable ids
        season: s + 1,
        number: n,
        name: `${episodeTitle(c.id, s + 1, n)}`,
        airdate: isoDate(t),
        airstamp: new Date(t).toISOString(),
        runtime: c.runtime,
        summary: `Season ${s + 1}, episode ${n} of ${c.name}.`,
        imageUrl: null,
      });
      cursor += WEEK;
    }
    cursor += 90 * DAY; // gap between seasons
  }
  return episodes;
}

const TITLE_WORDS_A = ["Cold", "Silent", "Broken", "Golden", "Last", "First", "Hollow", "Bright", "Lost", "Quiet", "Sudden", "Empty"];
const TITLE_WORDS_B = ["Signal", "Harbor", "Hour", "Letter", "Room", "Season", "Promise", "Static", "Orbit", "Deadline", "Crown", "Wire"];

function episodeTitle(showId: number, season: number, num: number): string {
  const a = TITLE_WORDS_A[(showId + season * 3 + num * 7) % TITLE_WORDS_A.length];
  const b = TITLE_WORDS_B[(showId * 5 + season + num * 11) % TITLE_WORDS_B.length];
  return `The ${a} ${b}`;
}

function isoDate(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/** TVDB episode ids in the mock universe are 900000 + tvmaze episode id. */
export const MOCK_TVDB_EPISODE_OFFSET = 900000;

export async function searchShows(query: string): Promise<RemoteShow[]> {
  const q = query.trim().toLowerCase();
  return CONFIGS.filter((c) => c.name.toLowerCase().includes(q)).map(toShow);
}

export async function getShow(id: number): Promise<RemoteShow | null> {
  const c = CONFIGS.find((c) => c.id === id);
  return c ? toShow(c) : null;
}

export async function getShowWithEpisodes(id: number) {
  const c = CONFIGS.find((c) => c.id === id);
  if (!c) return null;
  return { show: toShow(c), episodes: buildEpisodes(c) };
}

export async function lookupByTvdb(tvdbId: number): Promise<RemoteShow | null> {
  const c = CONFIGS.find((c) => c.tvdbId === tvdbId);
  return c ? toShow(c) : null;
}

export async function lookupByImdb(imdbId: string): Promise<RemoteShow | null> {
  const c = CONFIGS.find((c) => c.imdbId === imdbId);
  return c ? toShow(c) : null;
}

export async function singleSearch(name: string): Promise<RemoteShow | null> {
  const results = await searchShows(name);
  return results[0] ?? null;
}

/** Mock TMDB /find lookup: resolve a TVDB *episode* id to its position. */
export function findEpisodeByTvdbId(
  tvdbEpisodeId: number
): { showTvdbId: number; season: number; number: number } | null {
  const tvmazeEpId = tvdbEpisodeId - MOCK_TVDB_EPISODE_OFFSET;
  const showId = Math.floor(tvmazeEpId / 1000);
  const c = CONFIGS.find((c) => c.id === showId);
  if (!c) return null;
  const rem = tvmazeEpId % 1000;
  const season = Math.floor(rem / 100);
  const number = rem % 100;
  if (season < 1 || season > c.seasons.length) return null;
  if (number < 1 || number > c.seasons[season - 1]) return null;
  return { showTvdbId: c.tvdbId, season, number };
}

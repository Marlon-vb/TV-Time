import { supabase } from "./supabase";
import type { RemoteMovie } from "./types";

/**
 * Movie + documentary search.
 *
 * The app holds no provider key. It calls our own `movies` Edge Function,
 * which keeps the TMDB key server-side and caches results in a shared table —
 * so a popular title costs one upstream call for the whole user base rather
 * than one per person, and nobody can extract a key from the binary and spend
 * our quota. See supabase/functions/movies/index.ts.
 *
 * This replaced Apple's iTunes Search API, which needed no key and was chosen
 * for exactly that reason, then stopped returning results and took the entire
 * film half of search down with it silently.
 */

/** The function answering 503 — the key was never set. A deployment gap. */
export class MovieSearchUnavailable extends Error {}

/**
 * Below this, don't ask.
 *
 * Debouncing collapses a burst of keystrokes but not a pause mid-word, so
 * typing one title can still emit "o", "opp", "oppenheimer" as three distinct
 * queries — three cache rows and three upstream calls for one search. One- and
 * two-letter prefixes are also the least useful results and the most numerous:
 * there are only so many of them, and every user in the world types all of
 * them. Enforced here rather than per screen so a third caller cannot forget,
 * and again in the function so a stale client cannot fill the cache with them.
 */
export const MIN_QUERY = 3;

export async function searchMovies(query: string): Promise<RemoteMovie[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY) return [];

  const { data, error } = await supabase.functions.invoke<{
    movies?: RemoteMovie[];
    error?: string;
  }>("movies", { body: { q } });

  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 503) {
      throw new MovieSearchUnavailable("Movie search is not set up");
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data?.movies ?? [];
}

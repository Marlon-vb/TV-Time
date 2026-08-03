/**
 * Ranking for the Discover search list.
 *
 * Results arrive from two sources — TVmaze for TV, iTunes for film — and the
 * obvious merge, one list after the other, hides the second source. TVmaze
 * fuzzy-matches, so a film title still returns a screenful of loosely related
 * series; the film itself lands below the fold and reads as "movies don't show
 * up in search".
 *
 * So rank on how well the title answers what was typed, and let medium fall
 * out of that. Ties keep the order they came in, which preserves each source's
 * own relevance ranking (TVmaze returns its list best-first) and keeps TV
 * ahead of film when neither is a better answer.
 */

/** Lowercase, strip accents, collapse whitespace, drop a leading article. */
export function normalizeTitle(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

/**
 * How well `title` answers `query`, 0–4. Whole-word boundaries are what
 * separate a real hit from an incidental one: "Up" should match "Up" and
 * "Up in the Air", not "Supernatural".
 */
export function titleScore(title: string, query: string): number {
  const t = normalizeTitle(title);
  const q = normalizeTitle(query);
  if (!q || !t) return 0;
  if (t === q) return 4;
  if (t.startsWith(q) && isBoundary(t, q.length)) return 3;
  if (containsAtWordStart(t, q)) return 2;
  if (t.includes(q)) return 1;
  return 0;
}

function isBoundary(t: string, at: number): boolean {
  return at >= t.length || !/[a-z0-9]/.test(t[at]);
}

function containsAtWordStart(t: string, q: string): boolean {
  let from = 0;
  for (;;) {
    const i = t.indexOf(q, from);
    if (i < 0) return false;
    const startsWord = i === 0 || !/[a-z0-9]/.test(t[i - 1]);
    if (startsWord && isBoundary(t, i + q.length)) return true;
    from = i + 1;
  }
}

/**
 * Stable sort by descending title score. `Array.prototype.sort` is required to
 * be stable, so equal scores keep their incoming order rather than needing an
 * index carried alongside.
 */
export function rankByTitle<T>(
  items: T[],
  query: string,
  titleOf: (item: T) => string
): T[] {
  const q = query.trim();
  if (!q) return items;
  const scored = items.map((item) => ({ item, score: titleScore(titleOf(item), q) }));
  return scored.sort((a, b) => b.score - a.score).map((s) => s.item);
}

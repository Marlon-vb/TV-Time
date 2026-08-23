/**
 * The one definition of shelf order.
 *
 * Three screens read favourites — the Library rails, the arrange screen, and a
 * profile — and two of them were deriving the list from data already in hand
 * rather than re-querying. That is the right call for a list of ten, but it
 * meant the ordering rule existed twice, and only the SQL copy learned about
 * ranks. So the rule lives here, in JavaScript, and the queries just select.
 *
 * Ranked entries first, in their order; then anything never arranged, newest
 * star first. Arranging the top of a shelf therefore does not oblige you to
 * arrange all of it, and a new favourite lands at the end rather than
 * appearing silently in the middle.
 */
export interface Favoritable {
  favorite_rank: number | null;
  favorited_at: string | null;
}

export function byFavoriteOrder(a: Favoritable, b: Favoritable): number {
  const ar = a.favorite_rank;
  const br = b.favorite_rank;
  if (ar != null && br != null) return ar - br;
  if (ar != null) return -1;
  if (br != null) return 1;
  // Both unranked: most recently starred first.
  return (b.favorited_at ?? "").localeCompare(a.favorited_at ?? "");
}

/** Starred only, in shelf order. */
export function favoritesOf<T extends Favoritable>(items: T[]): T[] {
  return items.filter((i) => i.favorited_at != null).sort(byFavoriteOrder);
}

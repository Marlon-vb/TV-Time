import type { ShowWithProgress } from "./types";

/** Sort options for the My Shows grid. Pure so they're easy to unit-test. */
export type ShowSort = "az" | "behind" | "aired" | "added";

export const SHOW_SORTS: { key: ShowSort; label: string }[] = [
  { key: "az", label: "A–Z" },
  { key: "behind", label: "Most behind" },
  { key: "aired", label: "Recently aired" },
  { key: "added", label: "Recently added" },
];

export function sortLabel(sort: ShowSort): string {
  return SHOW_SORTS.find((s) => s.key === sort)?.label ?? "A–Z";
}

/** Case-insensitive substring match on the show name. */
export function filterShows(
  shows: ShowWithProgress[],
  query: string
): ShowWithProgress[] {
  const q = query.trim().toLowerCase();
  if (!q) return shows;
  return shows.filter((s) => s.name.toLowerCase().includes(q));
}

export function sortShows(
  shows: ShowWithProgress[],
  sort: ShowSort
): ShowWithProgress[] {
  const byName = (a: ShowWithProgress, b: ShowWithProgress) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  const arr = [...shows];
  switch (sort) {
    case "behind":
      return arr.sort(
        (a, b) => b.aired_unwatched - a.aired_unwatched || byName(a, b)
      );
    case "aired":
      return arr.sort(
        (a, b) =>
          (b.last_aired ?? "").localeCompare(a.last_aired ?? "") || byName(a, b)
      );
    case "added":
      return arr.sort(
        (a, b) =>
          (b.followed_at ?? "").localeCompare(a.followed_at ?? "") ||
          byName(a, b)
      );
    case "az":
    default:
      return arr.sort(byName);
  }
}

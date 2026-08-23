import { describe, expect, it } from "vitest";
import { byFavoriteOrder, favoritesOf } from "../favorites-order";

const item = (
  name: string,
  favorite_rank: number | null,
  favorited_at: string | null
) => ({ name, favorite_rank, favorited_at });

describe("byFavoriteOrder", () => {
  it("puts ranked entries in their order", () => {
    const list = [item("c", 2, null), item("a", 0, null), item("b", 1, null)];
    expect([...list].sort(byFavoriteOrder).map((i) => i.name)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("keeps every ranked entry ahead of every unranked one", () => {
    // Arranging the top of a shelf must not oblige you to arrange all of it.
    const list = [
      item("new", null, "2026-08-20"),
      item("ranked", 5, "2020-01-01"),
    ];
    expect([...list].sort(byFavoriteOrder).map((i) => i.name)).toEqual([
      "ranked",
      "new",
    ]);
  });

  it("orders unranked entries newest star first", () => {
    const list = [
      item("older", null, "2026-01-01"),
      item("newer", null, "2026-08-01"),
    ];
    expect([...list].sort(byFavoriteOrder).map((i) => i.name)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("does not fall over on a missing timestamp", () => {
    const list = [item("a", null, null), item("b", null, "2026-01-01")];
    expect([...list].sort(byFavoriteOrder).map((i) => i.name)).toEqual([
      "b",
      "a",
    ]);
  });
});

describe("favoritesOf", () => {
  it("keeps only starred items, in shelf order", () => {
    const list = [
      item("unstarred", null, null),
      item("second", 1, "2026-01-01"),
      item("first", 0, "2026-01-01"),
    ];
    expect(favoritesOf(list).map((i) => i.name)).toEqual(["first", "second"]);
  });

  it("agrees with itself whichever list it is given", () => {
    // The Library rail derives from every followed show; the arrange screen
    // queries only the starred ones. Both must produce the same shelf, which
    // is the bug this rule exists to prevent.
    const all = [
      item("unstarred", null, null),
      item("b", 1, "2026-01-01"),
      item("a", 0, "2026-02-01"),
      item("c", null, "2026-03-01"),
    ];
    const starredOnly = all.filter((i) => i.favorited_at != null);
    expect(favoritesOf(all).map((i) => i.name)).toEqual(
      favoritesOf(starredOnly).map((i) => i.name)
    );
  });
});

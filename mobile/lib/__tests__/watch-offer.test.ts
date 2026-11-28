import { describe, expect, it } from "vitest";
import { normalizeWatchRegion, watchOfferIsEmpty } from "../watch-offer";

const netflix = {
  provider_id: 8,
  provider_name: "Netflix",
  logo_path: "/netflix.jpg",
  display_priority: 1,
};
const apple = {
  provider_id: 2,
  provider_name: "Apple TV",
  logo_path: "/apple.jpg",
  display_priority: 3,
};
const amazon = {
  provider_id: 10,
  provider_name: "Amazon Video",
  logo_path: "/amazon.jpg",
  display_priority: 2,
};

describe("normalizeWatchRegion", () => {
  it("groups flatrate, rent, and buy and builds logo URLs", () => {
    const offer = normalizeWatchRegion("GB", {
      link: "https://www.themoviedb.org/tv/1/watch?locale=GB",
      flatrate: [amazon, netflix],
      rent: [apple],
      buy: [apple],
    });
    expect(offer.region).toBe("GB");
    expect(offer.link).toContain("locale=GB");
    expect(offer.flatrate.map((p) => p.name)).toEqual(["Netflix", "Amazon Video"]);
    expect(offer.flatrate[0].logoUrl).toBe("https://image.tmdb.org/t/p/w154/netflix.jpg");
    expect(offer.rent.map((p) => p.name)).toEqual(["Apple TV"]);
    expect(offer.buy.map((p) => p.name)).toEqual(["Apple TV"]);
    expect(watchOfferIsEmpty(offer)).toBe(false);
  });

  it("drops rent and buy copies of a service you can already stream", () => {
    const offer = normalizeWatchRegion("US", {
      flatrate: [netflix],
      rent: [netflix, apple],
      buy: [netflix],
    });
    expect(offer.rent.map((p) => p.id)).toEqual([2]);
    expect(offer.buy).toEqual([]);
  });

  it("is empty, not an error, when the country has no block", () => {
    const offer = normalizeWatchRegion("US", null);
    expect(watchOfferIsEmpty(offer)).toBe(true);
    expect(offer.link).toBeNull();
  });

  it("skips providers with no name and de-dupes within a group", () => {
    const offer = normalizeWatchRegion("US", {
      flatrate: [netflix, { ...netflix }, { provider_id: 9, provider_name: "  " }],
    });
    expect(offer.flatrate).toHaveLength(1);
  });
});

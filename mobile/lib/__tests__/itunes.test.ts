import { describe, expect, it } from "vitest";
import { mapMovieResult, upscaleArtwork } from "../itunes";

describe("upscaleArtwork", () => {
  it("swaps the iTunes size segment for a larger poster", () => {
    expect(
      upscaleArtwork("https://is1.mzstatic.com/image/foo/100x100bb.jpg")
    ).toBe("https://is1.mzstatic.com/image/foo/600x600bb.jpg");
  });

  it("handles png artwork and a custom size", () => {
    expect(
      upscaleArtwork("https://cdn/bar/200x200bb.png", 400)
    ).toBe("https://cdn/bar/400x400bb.png");
  });

  it("returns null for null/undefined", () => {
    expect(upscaleArtwork(null)).toBeNull();
    expect(upscaleArtwork(undefined)).toBeNull();
  });

  it("leaves an unexpected URL shape untouched", () => {
    expect(upscaleArtwork("https://cdn/no-size.jpg")).toBe(
      "https://cdn/no-size.jpg"
    );
  });
});

describe("mapMovieResult", () => {
  const raw = {
    trackId: 123,
    trackName: "Inception",
    releaseDate: "2010-07-16T07:00:00Z",
    artworkUrl100: "https://cdn/inception/100x100bb.jpg",
    primaryGenreName: "Action & Adventure",
    trackTimeMillis: 8880000, // 148 minutes
    longDescription: "A thief who steals corporate secrets…",
  };

  it("maps a full iTunes result", () => {
    const m = mapMovieResult(raw);
    expect(m).toEqual({
      id: 123,
      title: "Inception",
      year: 2010,
      posterUrl: "https://cdn/inception/600x600bb.jpg",
      genre: "Action & Adventure",
      runtime: 148,
      overview: "A thief who steals corporate secrets…",
      releaseDate: "2010-07-16T07:00:00Z",
    });
  });

  it("falls back to shortDescription and tolerates missing fields", () => {
    const m = mapMovieResult({
      trackId: 9,
      trackName: "Doc",
      shortDescription: "short",
    });
    expect(m).toMatchObject({
      id: 9,
      title: "Doc",
      year: null,
      posterUrl: null,
      genre: null,
      runtime: null,
      overview: "short",
    });
  });

  it("accepts an id that arrives as a numeric string", () => {
    // A field-type change at Apple's end used to empty the whole film column
    // silently, because every row failed the same check at once.
    expect(mapMovieResult({ trackId: "456", trackName: "Dune" })).toMatchObject({
      id: 456,
      title: "Dune",
    });
  });

  it("falls back to the collection id and name", () => {
    expect(
      mapMovieResult({ collectionId: 77, collectionName: "Alien Anthology" })
    ).toMatchObject({ id: 77, title: "Alien Anthology" });
  });

  it("rejects rows without an id or name", () => {
    expect(mapMovieResult({ trackName: "No id" })).toBeNull();
    expect(mapMovieResult({ trackId: 1 })).toBeNull();
    expect(mapMovieResult({ trackId: "not-a-number", trackName: "X" })).toBeNull();
    expect(mapMovieResult(null)).toBeNull();
  });
});

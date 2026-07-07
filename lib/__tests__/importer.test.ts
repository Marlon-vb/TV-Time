import { describe, expect, it } from "vitest";
import AdmZip from "adm-zip";
import {
  dedupeEpisodes,
  parseImportFiles,
} from "../importer";
import { computeCategory } from "../categories";

const buf = (s: string) => Buffer.from(s, "utf-8");

describe("parseImportFiles", () => {
  it("parses the classic GDPR export (tvdb ids only)", () => {
    const seen = [
      "tv_show_id,episode_id,created_at",
      "501101,900101101,2024-01-05 21:00:00",
      "501101,900101102,2024-01-12 21:00:00",
      "501102,900102101,2023-06-01 20:00:00",
    ].join("\n");
    const followed = [
      "tv_show_id,created_at",
      "501101,2023-12-01 10:00:00",
      "501102,2023-01-01 10:00:00",
      "501105,2022-05-05 10:00:00", // followed, nothing watched
    ].join("\n");

    const result = parseImportFiles([
      { name: "seen_episode.csv", buffer: buf(seen) },
      { name: "followed_tv_show.csv", buffer: buf(followed) },
    ]);

    expect(result.shows).toHaveLength(3);
    const s101 = result.shows.find((s) => s.tvdbId === 501101)!;
    expect(s101.episodes).toHaveLength(2);
    expect(s101.episodes[0].episodeTvdbId).toBe(900101101);
    expect(s101.episodes[0].season).toBeNull();
    expect(s101.episodes[0].watchedAt).toMatch(/^2024-01-05T21:00:00/);
    const s105 = result.shows.find((s) => s.tvdbId === 501105)!;
    expect(s105.episodes).toHaveLength(0);
  });

  it("parses the newer name + season/episode format", () => {
    const csv = [
      "tv_show_name,season_number,episode_number,is_watched,created_at",
      "Midnight Signal,1,1,1,2024-02-01 20:00:00",
      "Midnight Signal,1,2,1,2024-02-08 20:00:00",
      "Midnight Signal,1,3,0,", // in list but not watched
      "Orbit City,2,5,1,2024-03-01 20:00:00",
    ].join("\n");

    const result = parseImportFiles([
      { name: "user_tv_show_data.csv", buffer: buf(csv) },
    ]);

    expect(result.shows).toHaveLength(2);
    const midnight = result.shows.find((s) => s.name === "Midnight Signal")!;
    expect(midnight.tvdbId).toBeNull();
    expect(midnight.episodes).toHaveLength(2);
    expect(midnight.episodes[1]).toMatchObject({ season: 1, number: 2 });
  });

  it("reads CSVs out of a zip and skips non-CSV entries", () => {
    const zip = new AdmZip();
    zip.addFile(
      "tv-time/seen_episode.csv",
      buf("tv_show_id,episode_id,created_at\n501103,900103101,2024-01-01 12:00:00")
    );
    zip.addFile("tv-time/readme.txt", buf("not a csv"));

    const result = parseImportFiles([
      { name: "export.zip", buffer: zip.toBuffer() },
    ]);

    expect(result.shows).toHaveLength(1);
    expect(result.shows[0].tvdbId).toBe(501103);
    expect(result.filesRead).toEqual(["tv-time/seen_episode.csv"]);
  });

  it("merges name-keyed and id-keyed records for the same show", () => {
    const withIds = "tv_show_id,tv_show_name,episode_id,created_at\n42,Deadline,777,2024-01-01 12:00:00";
    const withNames =
      "show_name,season_number,episode_number\nDeadline,1,1";

    const result = parseImportFiles([
      { name: "a.csv", buffer: buf(withIds) },
      { name: "b.csv", buffer: buf(withNames) },
    ]);

    expect(result.shows).toHaveLength(1);
    expect(result.shows[0].tvdbId).toBe(42);
    expect(result.shows[0].episodes).toHaveLength(2);
  });

  it("handles junk files and headers with spaces/BOM", () => {
    const weird = "﻿TV Show Name,Season Number,Episode Number\nGlasshouse,1,4";
    const result = parseImportFiles([
      { name: "export.csv", buffer: buf(weird) },
      { name: "photo.png", buffer: buf("PNG") },
    ]);
    expect(result.shows).toHaveLength(1);
    expect(result.shows[0].name).toBe("Glasshouse");
    expect(result.shows[0].episodes[0]).toMatchObject({ season: 1, number: 4 });
    expect(result.warnings.some((w) => w.includes("photo.png"))).toBe(true);
  });
});

describe("dedupeEpisodes", () => {
  it("collapses duplicate positions keeping the earliest watch date", () => {
    const out = dedupeEpisodes([
      { season: 1, number: 1, episodeTvdbId: null, watchedAt: "2024-02-01T00:00:00Z" },
      { season: 1, number: 1, episodeTvdbId: null, watchedAt: "2024-01-01T00:00:00Z" },
      { season: null, number: null, episodeTvdbId: 900, watchedAt: null },
      { season: null, number: null, episodeTvdbId: 900, watchedAt: null },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].watchedAt).toBe("2024-01-01T00:00:00Z");
  });
});

describe("computeCategory", () => {
  const base = { archived: false, watchedCount: 0, airedUnwatched: 0, status: "Running" };

  it("classifies shows the way TV Time does", () => {
    expect(computeCategory({ ...base, airedUnwatched: 5 })).toBe("not_started");
    expect(computeCategory({ ...base, watchedCount: 3, airedUnwatched: 2 })).toBe("watching");
    expect(computeCategory({ ...base, watchedCount: 10 })).toBe("up_to_date");
    expect(computeCategory({ ...base, watchedCount: 10, status: "Ended" })).toBe("finished");
    expect(computeCategory({ ...base, status: "Running" })).toBe("up_to_date"); // premieres soon
    expect(computeCategory({ ...base, archived: true, airedUnwatched: 4 })).toBe("archived");
  });
});

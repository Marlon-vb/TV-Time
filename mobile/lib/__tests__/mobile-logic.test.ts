import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseCsvRows } from "../csv";
import { dedupeEpisodes, parseImportFiles } from "../importer";
import { pickUpcomingForScheduling } from "../schedulePick";
import { computeCategory } from "../categories";

describe("parseCsvRows", () => {
  it("handles quotes, embedded commas/newlines, CRLF, and BOM", () => {
    const csv =
      '﻿TV Show Name,Season Number,Note\r\n' +
      '"Static & Sons",1,"has, a comma"\r\n' +
      '"Multi\nLine",2,"say ""hi"""\n';
    const rows = parseCsvRows(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      tv_show_name: "Static & Sons",
      season_number: "1",
      note: "has, a comma",
    });
    expect(rows[1].tv_show_name).toBe("Multi\nLine");
    expect(rows[1].note).toBe('say "hi"');
  });

  it("returns nothing for headers-only or empty input", () => {
    expect(parseCsvRows("a,b,c\n")).toEqual([]);
    expect(parseCsvRows("")).toEqual([]);
  });
});

describe("parseImportFiles (mobile port)", () => {
  it("parses the classic GDPR export from a zip", async () => {
    const zip = new JSZip();
    zip.file(
      "export/seen_episode.csv",
      "tv_show_id,episode_id,created_at\n501101,1005101,2024-01-05 21:00:00\n501101,1005102,2024-01-12 21:00:00"
    );
    zip.file("export/readme.txt", "not a csv");
    const bytes = await zip.generateAsync({ type: "uint8array" });

    const result = await parseImportFiles([{ name: "export.zip", bytes }]);
    expect(result.shows).toHaveLength(1);
    expect(result.shows[0].tvdbId).toBe(501101);
    expect(result.shows[0].episodes).toHaveLength(2);
    expect(result.shows[0].episodes[0].episodeTvdbId).toBe(1005101);
  });

  it("parses the newer name + season/episode CSV directly", async () => {
    const csv = [
      "tv_show_name,season_number,episode_number,is_watched,created_at",
      "Midnight Signal,1,1,1,2024-02-01 20:00:00",
      "Midnight Signal,1,2,0,",
    ].join("\n");
    const result = await parseImportFiles([{ name: "data.csv", text: csv }]);
    expect(result.shows).toHaveLength(1);
    expect(result.shows[0].episodes).toHaveLength(1);
    expect(result.shows[0].episodes[0]).toMatchObject({ season: 1, number: 1 });
  });

  it("dedupes repeated seen records", () => {
    const out = dedupeEpisodes([
      { season: 1, number: 1, episodeTvdbId: null, watchedAt: "2024-02-01T00:00:00Z" },
      { season: 1, number: 1, episodeTvdbId: null, watchedAt: "2024-01-01T00:00:00Z" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].watchedAt).toBe("2024-01-01T00:00:00Z");
  });
});

describe("pickUpcomingForScheduling", () => {
  const now = new Date("2026-07-12T12:00:00Z");
  const ep = (offsetHours: number) => ({
    airstamp: new Date(now.getTime() + offsetHours * 3_600_000).toISOString(),
  });

  it("keeps only future episodes, soonest first, capped at the limit", () => {
    const episodes = [ep(50), ep(-1), ep(2), ep(10), { airstamp: null }];
    const picked = pickUpcomingForScheduling(episodes, now, 2);
    expect(picked).toHaveLength(2);
    expect(picked[0].airstamp).toBe(ep(2).airstamp);
    expect(picked[1].airstamp).toBe(ep(10).airstamp);
  });

  it("prefers higher-priority (active) shows over sooner ones", () => {
    const soonOther = { ...ep(2), priority: 1 };
    const laterActive = { ...ep(10), priority: 0 };
    const picked = pickUpcomingForScheduling([soonOther, laterActive], now, 1);
    expect(picked).toHaveLength(1);
    expect(picked[0].airstamp).toBe(ep(10).airstamp);
  });
});

describe("computeCategory (shared with web)", () => {
  it("buckets like TV Time", () => {
    const base = { archived: false, watchedCount: 0, airedUnwatched: 0, status: "Running" };
    expect(computeCategory({ ...base, airedUnwatched: 3 })).toBe("not_started");
    expect(computeCategory({ ...base, watchedCount: 2, airedUnwatched: 1 })).toBe("watching");
    expect(computeCategory({ ...base, watchedCount: 5, status: "Ended" })).toBe("finished");
  });
});

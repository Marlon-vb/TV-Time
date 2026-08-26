import { describe, expect, it } from "vitest";
import { watchTimeCompact } from "../format";

describe("watchTimeCompact", () => {
  it("stays in hours until they stop being readable", () => {
    expect(watchTimeCompact(0)).toBe("0h");
    expect(watchTimeCompact(90)).toBe("2h");
    expect(watchTimeCompact(60 * 71)).toBe("71h");
  });

  it("switches to days, then months", () => {
    expect(watchTimeCompact(60 * 72)).toBe("3d");
    expect(watchTimeCompact(60 * 24 * 59)).toBe("59d");
    expect(watchTimeCompact(60 * 24 * 60)).toBe("2mo");
    expect(watchTimeCompact(60 * 24 * 295)).toBe("10mo");
  });

  it("never returns an empty or fractional string", () => {
    for (const m of [1, 59, 61, 4319, 4321, 86_399, 1_000_000]) {
      expect(watchTimeCompact(m)).toMatch(/^\d+(h|d|mo)$/);
    }
  });
});

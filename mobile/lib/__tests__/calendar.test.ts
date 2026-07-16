import { describe, expect, it } from "vitest";
import { localDateIso, monthGrid, shiftMonth } from "../calendar";

describe("monthGrid", () => {
  it("pads July 2026 (starts Wednesday) back to the previous Sunday", () => {
    const grid = monthGrid(2026, 6);
    expect(grid.title).toBe("July 2026");
    expect(grid.weeks).toHaveLength(5);
    // June 28 is the Sunday before July 1 2026.
    expect(grid.weeks[0][0]).toEqual({ iso: "2026-06-28", day: 28, inMonth: false });
    expect(grid.weeks[0][3]).toEqual({ iso: "2026-07-01", day: 1, inMonth: true });
    // Trailing pad runs into August.
    const lastWeek = grid.weeks[4];
    expect(lastWeek[5]).toEqual({ iso: "2026-07-31", day: 31, inMonth: true });
    expect(lastWeek[6]).toEqual({ iso: "2026-08-01", day: 1, inMonth: false });
  });

  it("every row has exactly 7 days and the month is fully covered", () => {
    for (let month = 0; month < 12; month++) {
      const grid = monthGrid(2026, month);
      const inMonthDays = grid.weeks.flat().filter((d) => d.inMonth);
      expect(inMonthDays[0].day).toBe(1);
      expect(inMonthDays.length).toBe(new Date(2026, month + 1, 0).getDate());
      for (const week of grid.weeks) expect(week).toHaveLength(7);
    }
  });

  it("handles a 28-day February starting on Sunday (exactly 4 rows)", () => {
    // February 2026 starts on a Sunday and has 28 days.
    const grid = monthGrid(2026, 1);
    expect(grid.weeks).toHaveLength(4);
    expect(grid.weeks.flat().every((d) => d.inMonth)).toBe(true);
  });

  it("handles December (year rollover in the trailing pad)", () => {
    const grid = monthGrid(2026, 11);
    const last = grid.weeks[grid.weeks.length - 1][6];
    expect(last.iso.startsWith("2027-01") || last.iso === "2026-12-31").toBe(true);
  });
});

describe("shiftMonth", () => {
  it("carries across year boundaries in both directions", () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth(2026, 5, 0)).toEqual({ year: 2026, month: 5 });
  });
});

describe("localDateIso", () => {
  it("uses local fields, zero-padded", () => {
    expect(localDateIso(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(localDateIso(new Date(2026, 10, 30))).toBe("2026-11-30");
  });
});

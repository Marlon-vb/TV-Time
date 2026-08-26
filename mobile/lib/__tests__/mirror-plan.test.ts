import { describe, expect, it } from "vitest";
import { planReconcile } from "../social/mirror-plan";

const row = (
  show_id: number,
  season: number,
  episode: number,
  rating: number | null = null,
  watched_at: string | null = "2026-08-01T12:00:00Z"
) => ({ show_id, season, episode, rating, watched_at });

describe("planReconcile", () => {
  it("NEVER deletes server history for shows the local library doesn't have (fresh install / second device)", () => {
    const server = [row(1, 1, 1), row(1, 1, 2), row(2, 3, 4, 4.5)];
    // Fresh install: nothing local, nothing followed.
    const plan = planReconcile([], server, new Set());
    expect(plan.deletes).toEqual([]);
    expect(plan.upserts).toEqual([]);
  });

  it("deletes server rows the user un-watched, but only for followed shows", () => {
    const local = [row(1, 1, 1)];
    const server = [row(1, 1, 1), row(1, 1, 2), row(99, 1, 1)];
    const plan = planReconcile(local, server, new Set([1]));
    expect(plan.deletes).toEqual([row(1, 1, 2)]); // 99 is not ours to judge
    expect(plan.upserts).toEqual([]);
  });

  it("upserts missing rows and rating drift", () => {
    const local = [row(1, 1, 1, 5), row(1, 1, 2), row(2, 1, 1)];
    const server = [row(1, 1, 1, 3), row(1, 1, 2)];
    const plan = planReconcile(local, server, new Set([1, 2]));
    expect(plan.upserts).toEqual([row(1, 1, 1, 5), row(2, 1, 1)]);
    expect(plan.deletes).toEqual([]);
  });

  it("treats null and undefined ratings as equal (no phantom upserts)", () => {
    const local = [row(1, 1, 1, null)];
    const server = [
      { show_id: 1, season: 1, episode: 1, rating: null, watched_at: "x" },
    ];
    const plan = planReconcile(local, server, new Set([1]));
    expect(plan.upserts).toEqual([]);
  });

  it("re-sends a row whose server copy predates the watched_at column", () => {
    const local = [row(1, 1, 1)];
    const server = [row(1, 1, 1, null, null)];
    const plan = planReconcile(local, server, new Set([1]));
    expect(plan.upserts).toEqual(local);
  });

  it("does not re-send once the server has a date, however it is formatted", () => {
    // The device writes "2026-08-01T12:00:00Z"; Postgres hands it back as
    // "2026-08-01 12:00:00+00". Comparing those would upsert the whole
    // library on every pass, forever.
    const local = [row(1, 1, 1, null, "2026-08-01T12:00:00Z")];
    const server = [row(1, 1, 1, null, "2026-08-01 12:00:00+00")];
    expect(planReconcile(local, server, new Set([1])).upserts).toEqual([]);
  });
});

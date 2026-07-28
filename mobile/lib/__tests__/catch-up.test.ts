import { describe, expect, it } from "vitest";
import { catchUpPrompt } from "../catch-up-core";

describe("catchUpPrompt", () => {
  it("uses singular wording for one skipped episode", () => {
    const p = catchUpPrompt(1);
    expect(p.title).toBe("Skipped an episode?");
    expect(p.message).toContain("The episode before this one");
    expect(p.message).not.toMatch(/\bepisodes\b/);
    expect(p.confirm).toBe("Mark it too");
  });

  it("uses plural wording and names the count above one", () => {
    const p = catchUpPrompt(6);
    expect(p.title).toBe("Skipped some episodes?");
    expect(p.message).toContain("6 earlier episodes");
    expect(p.confirm).toBe("Mark all 6");
  });

  it("never says '1 episodes' at the boundary", () => {
    for (const n of [1, 2, 11, 21, 100]) {
      const p = catchUpPrompt(n);
      const plural = /\bepisodes\b/.test(p.message);
      expect(plural).toBe(n > 1);
    }
  });
});

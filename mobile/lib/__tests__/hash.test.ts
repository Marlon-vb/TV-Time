import { describe, expect, it } from "vitest";
import { normalizeEmail } from "../social/hash";

describe("normalizeEmail", () => {
  it("lowercases and trims valid emails", () => {
    expect(normalizeEmail("  Marlon@Example.COM ")).toBe("marlon@example.com");
  });
  it("rejects invalid emails", () => {
    expect(normalizeEmail("nope")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
  });
});

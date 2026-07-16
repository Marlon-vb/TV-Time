import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizePhone } from "../social/hash";

describe("normalizePhone", () => {
  it("keeps already-international numbers", () => {
    expect(normalizePhone("+1 (415) 555-2671")).toBe("+14155552671");
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("applies the default country code to local numbers", () => {
    // Dutch local number with trunk 0, default +31
    expect(normalizePhone("06 12345678", "+31")).toBe("+31612345678");
    expect(normalizePhone("020 7946 0958", "+44")).toBe("+442079460958");
  });

  it("handles the 00 international prefix", () => {
    expect(normalizePhone("0044 20 7946 0958")).toBe("+442079460958");
  });

  it("prepends the country code to a plain local number", () => {
    expect(normalizePhone("6 12345678", "+31")).toBe("+3161234"+"5678");
  });

  it("rejects junk and too-short numbers", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("not a phone")).toBeNull();
  });

  it("is stable — same input yields the same canonical form", () => {
    const a = normalizePhone("+1 415-555-2671");
    const b = normalizePhone("+1 (415) 555 2671");
    expect(a).toBe(b);
  });
});

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

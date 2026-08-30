import { describe, expect, it } from "vitest";
import { SITE, inviteMessage, profileUrl } from "../share";

describe("profileUrl", () => {
  it("is a real link, not the app's own scheme", () => {
    // The custom scheme was the bug: WhatsApp renders tvtime:// as plain text
    // nobody can tap, and on a phone without the app it resolves to nothing.
    expect(profileUrl("jeremy")).toBe(`${SITE}/u/jeremy`);
    expect(profileUrl("jeremy")).toMatch(/^https:\/\//);
    expect(profileUrl("jeremy")).not.toContain("tvtime://");
  });

  it("escapes anything that would break the URL", () => {
    expect(profileUrl("a b")).toBe(`${SITE}/u/a%20b`);
    expect(profileUrl("a/b")).toBe(`${SITE}/u/a%2Fb`);
  });
});

describe("inviteMessage", () => {
  it("names the handle and carries a tappable link", () => {
    const msg = inviteMessage("jeremy");
    expect(msg).toContain("@jeremy");
    expect(msg).toContain(`${SITE}/u/jeremy`);
  });

  it("ends with the link so clients linkify it cleanly", () => {
    // A trailing full stop gets swallowed into the href by some clients.
    expect(inviteMessage("jeremy").endsWith(profileUrl("jeremy"))).toBe(true);
  });
});

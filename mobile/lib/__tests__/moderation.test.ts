import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkCommentRate,
  resetCommentRate,
  screenComment,
} from "../social/moderation";

// moderation.ts also carries the report/block flows, which pull in Alert and
// the Supabase-backed api; the screening helpers under test are pure.
vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));
vi.mock("../social/api", () => ({
  reportContent: vi.fn(),
  blockUser: vi.fn(),
}));

const BLOCKED = { ok: false, reason: "That comment breaks the community rules." };

describe("screenComment — comments that must post", () => {
  it("passes ordinary comments, swearing and dark subject matter included", () => {
    expect(screenComment("That finale was insane — best season yet.")).toEqual({
      ok: true,
    });
    expect(
      screenComment("Damn, the shit they pulled in the last 5 minutes.")
    ).toEqual({ ok: true });
    expect(
      screenComment("The murder scene was brutal but the sex scene was worse.")
    ).toEqual({ ok: true });
  });

  it("passes sexual words in TV context", () => {
    // The blocklist is for spam, not for talking about what is on screen.
    expect(screenComment("the sex scene")).toEqual({ ok: true });
    expect(screenComment("the live sex scene was awkward")).toEqual({
      ok: true,
    });
    expect(screenComment("The live sex scene in The Deuce is hard to watch")).toEqual(
      { ok: true }
    );
    expect(screenComment("full frontal, in episode two of all things")).toEqual({
      ok: true,
    });
    expect(screenComment("that nude scene went on forever")).toEqual({
      ok: true,
    });
    expect(screenComment("the camera work in the sex scenes is great")).toEqual({
      ok: true,
    });
  });

  it("passes near-misses that differ from a slur by a repeated letter", () => {
    // The patterns demand the doubled letter, so one-g/one-o words fall out.
    expect(screenComment("The documentary about Niger was gorgeous")).toEqual({
      ok: true,
    });
    expect(screenComment("Nigerien food deserves its own series")).toEqual({
      ok: true,
    });
    expect(screenComment("Gok Wan is the best presenter")).toEqual({ ok: true });
    expect(screenComment("a fagot of sticks in the fireplace")).toEqual({
      ok: true,
    });
  });

  it("passes allowlisted phrases the pattern cannot separate", () => {
    expect(screenComment("Their place is spic and span")).toEqual({ ok: true });
    expect(screenComment("spick and span by the end of the montage")).toEqual({
      ok: true,
    });
  });

  it("still blocks a slur sitting next to an allowlisted phrase", () => {
    // The allowlist blanks the phrase, it does not wave the whole comment past.
    expect(screenComment("spic and span, you nigger")).toEqual(BLOCKED);
  });

  it("does not fire on innocent words containing a blocked substring", () => {
    expect(screenComment("What an auspicious start to the season.")).toEqual({
      ok: true,
    });
    expect(screenComment("The spicy takes in this thread are wild")).toEqual({
      ok: true,
    });
    expect(screenComment("Scunthorpe United got a whole episode?")).toEqual({
      ok: true,
    });
    expect(screenComment("Classic gangbusters pacing")).toEqual({ ok: true });
    expect(screenComment("the tyranny of the writers room")).toEqual({
      ok: true,
    });
    expect(screenComment("assassination arc, start to finish")).toEqual({
      ok: true,
    });
    expect(screenComment("the sex camera angles were odd")).toEqual({
      ok: true,
    });
  });

  it("passes the words left off the list on purpose", () => {
    expect(screenComment("a chink in the armour of the whole plot")).toEqual({
      ok: true,
    });
    expect(screenComment("disaster porn is a genre now")).toEqual({ ok: true });
    expect(screenComment("he lit a fag on the balcony")).toEqual({ ok: true });
    expect(screenComment("the spice must flow")).toEqual({ ok: true });
    expect(screenComment("Kiki's Delivery Service holds up")).toEqual({
      ok: true,
    });
  });

  // Every one of these was blocked by a separator class that ran across spaces,
  // full stops and commas, so the filter read straight through the end of one
  // word and into the next.
  it("does not read a term across a word boundary", () => {
    expect(screenComment("Let it go. OK, the finale was still bad")).toEqual({
      ok: true,
    });
    expect(screenComment("Did the table read go ok?")).toEqual({ ok: true });
    expect(screenComment("He lit a fag, got in the Jag and drove off")).toEqual({
      ok: true,
    });
    expect(
      screenComment("He came out of the canal soaking wet, back on the towpath")
    ).toEqual({ ok: true });
    expect(screenComment("She wipes the blade with a rag, head down")).toEqual({
      ok: true,
    });
    expect(
      screenComment("Malcolm X videos on YouTube are worth a watch")
    ).toEqual({ ok: true });
    expect(
      screenComment("The wound is deep. Throat cut two seconds later")
    ).toEqual({ ok: true });
    expect(
      screenComment("The Deuce nails the porn hub that Times Square used to be")
    ).toEqual({ ok: true });
    expect(screenComment("It's free. Porn ads everywhere though")).toEqual({
      ok: true,
    });
    expect(screenComment("Every child. Pornography of misery, this show")).toEqual(
      { ok: true }
    );
    expect(screenComment("The talk about sex, Cam looked mortified")).toEqual({
      ok: true,
    });
    expect(screenComment("Ki Ke-young is credited in the pilot")).toEqual({
      ok: true,
    });
  });

  // The em dash and the full stop join two words as readily as a space does —
  // an aside, or a missing space after a sentence — so the intra-word class
  // cannot admit them. Every one of these was blocked while it did.
  it("does not read a term across sentence punctuation", () => {
    expect(
      screenComment("He lit a fag—got straight in the Jag and drove off.")
    ).toEqual({ ok: true });
    expect(
      screenComment(
        "He came out of the canal soaking wet—back to the nick, no dialogue."
      )
    ).toEqual({ ok: true });
    expect(
      screenComment("She wipes the blade with a rag—head down, says nothing.")
    ).toEqual({ ok: true });
    expect(
      screenComment("He came out of the canal soaking wet.Back to the nick.")
    ).toEqual({ ok: true });
    expect(screenComment("She lit a fag.Got in the car. Roll credits.")).toEqual(
      { ok: true }
    );
    expect(
      screenComment(
        "The Deuce nails the porn—hub of the world, Times Square in 1971."
      )
    ).toEqual({ ok: true });
    // The en dash, semicolon, colon and question mark are the same shape.
    expect(screenComment("he lit a fag–got in the car")).toEqual({ ok: true });
    expect(screenComment("soaking wet; back to the nick")).toEqual({ ok: true });
    expect(screenComment("one more rag: head down, say nothing")).toEqual({
      ok: true,
    });
    expect(screenComment("did he lit a fag?Got in the car")).toEqual({
      ok: true,
    });
  });

  // The second half of the same corpus: terms whose everyday meaning the
  // pattern cannot see, resolved by dropping the term or naming the phrase.
  it("passes dictionary and name collisions with the term list", () => {
    // Dropped: a gearbox and a transistor radio.
    expect(screenComment("The tranny in his old Holden gives out")).toEqual({
      ok: true,
    });
    expect(screenComment("He's got a tranny radio on the workbench")).toEqual({
      ok: true,
    });
    // Dropped: the 2017 film, in an app for talking about films.
    expect(screenComment("Gook (2017) is a great LA riots film")).toEqual({
      ok: true,
    });
    // Allowlisted: the Spanish nickname for Enrique, accented or not.
    expect(screenComment("Kike Hernandez cameo was fun")).toEqual({ ok: true });
    expect(screenComment("Kiké Hernández cameo was fun")).toEqual({ ok: true });
    // No [sz]* on a multi-word term, so it stops swallowing the next verb.
    expect(
      screenComment("the gang bangs on Frank's door for ten minutes")
    ).toEqual({ ok: true });
    // Allowlisted: the Midlands dish.
    expect(
      screenComment(
        "Mr Brain's faggots and peas turn up in every gritty Midlands drama"
      )
    ).toEqual({ ok: true });
  });

  it("still blocks a slur sitting next to a newly allowlisted phrase", () => {
    expect(screenComment("Kike Hernandez cameo, you kike")).toEqual(BLOCKED);
    expect(screenComment("faggots and peas, you faggot")).toEqual(BLOCKED);
  });
});

describe("screenComment — comments that must not post", () => {
  it("catches slurs", () => {
    const result = screenComment("you are a faggot");
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      reason: "That comment breaks the community rules.",
    });
    expect(screenComment("Nigger.")).toEqual(BLOCKED);
    expect(screenComment("stop being such a WETBACK")).toEqual(BLOCKED);
    expect(screenComment("spics")).toEqual(BLOCKED);
    expect(screenComment("raghead")).toEqual(BLOCKED);
    expect(screenComment("kike")).toEqual(BLOCKED);
  });

  it("catches trailing-letter evasion beyond a plural s", () => {
    expect(screenComment("niggerz")).toEqual(BLOCKED);
    expect(screenComment("faggotz")).toEqual(BLOCKED);
    expect(screenComment("niggers")).toEqual(BLOCKED);
  });

  it("catches the nigga family", () => {
    expect(screenComment("nigga")).toEqual(BLOCKED);
    expect(screenComment("niggas")).toEqual(BLOCKED);
    expect(screenComment("niggaz")).toEqual(BLOCKED);
  });

  // Padding a word with a mark that prose never uses to join two words. The
  // intra-word class carries these on its own, single occurrence or not.
  it("catches punctuation separator evasion", () => {
    expect(screenComment("n-i-g-g-e-r")).toEqual(BLOCKED);
    expect(screenComment("n_i_g_g_e_r")).toEqual(BLOCKED);
    expect(screenComment("f-a-g-g-o-t")).toEqual(BLOCKED);
    expect(screenComment("nig-ger")).toEqual(BLOCKED);
    expect(screenComment("nig_ger")).toEqual(BLOCKED);
    expect(screenComment("n*i*g*g*e*r")).toEqual(BLOCKED);
    expect(screenComment("f*a*g*g*o*t")).toEqual(BLOCKED);
    expect(screenComment("n~i~g~g~e~r")).toEqual(BLOCKED);
    expect(screenComment("wet-back")).toEqual(BLOCKED);
  });

  // The intra-word class refuses whitespace and sentence punctuation, so every
  // one of these is the separate collapse pass doing the work: four or more
  // single characters in a row, whatever is wedged between them.
  it("catches spaced-out and sentence-punctuation evasion", () => {
    expect(screenComment("n i g g e r")).toEqual(BLOCKED);
    expect(screenComment("n - i - g - g - e - r")).toEqual(BLOCKED);
    expect(screenComment("say it with me: f a g g o t")).toEqual(BLOCKED);
    expect(screenComment("s p i c")).toEqual(BLOCKED);
    expect(screenComment("n.i.g.g.e.r")).toEqual(BLOCKED);
    expect(screenComment("n. i. g. g. e. r.")).toEqual(BLOCKED);
    expect(screenComment("n,i,g,g,e,r")).toEqual(BLOCKED);
    expect(screenComment("n—i—g—g—e—r")).toEqual(BLOCKED); // em dashes
    expect(screenComment("n–i–g–g–e–r")).toEqual(BLOCKED); // en dashes
    expect(screenComment("n!i!g!g!e!r")).toEqual(BLOCKED);
    expect(screenComment("f/a/g/g/o/t")).toEqual(BLOCKED);
    expect(screenComment("he typed n i g g e r and left")).toEqual(BLOCKED);
  });

  it("catches zero-width padding", () => {
    expect(screenComment("n\u200Bigger")).toEqual(BLOCKED);
    expect(screenComment("nig\u200Dger")).toEqual(BLOCKED);
    expect(screenComment("\uFEFFnigger")).toEqual(BLOCKED);
  });

  it("catches homoglyph and fullwidth evasion", () => {
    expect(screenComment("n\u0456gger")).toEqual(BLOCKED); // Cyrillic і
    expect(screenComment("\uFF4E\uFF49\uFF47\uFF47\uFF45\uFF52")).toEqual(
      BLOCKED
    ); // fullwidth
    expect(screenComment("sp\u0456\u0441")).toEqual(BLOCKED); // Cyrillic і + с
  });

  it("catches leetspeak evasion", () => {
    expect(screenComment("n1gg3r")).toEqual(BLOCKED);
    expect(screenComment("f4gg0t")).toEqual(BLOCKED);
    expect(screenComment("K1K3")).toEqual(BLOCKED);
    expect(screenComment("free p0rn")).toEqual(BLOCKED);
    expect(screenComment("n!gger")).toEqual(BLOCKED);
    expect(screenComment("f@gg0t")).toEqual(BLOCKED);
    expect(screenComment("|ive$ex")).toEqual(BLOCKED);
    expect(screenComment("bukkak3")).toEqual(BLOCKED);
    expect(screenComment("!nigger")).toEqual(BLOCKED); // symbol as separator
  });

  it("catches padded-letter and accent evasion", () => {
    expect(screenComment("niiiiiggggerrr")).toEqual(BLOCKED);
    expect(screenComment("faaaggggot")).toEqual(BLOCKED);
    expect(screenComment("nïggér")).toEqual(BLOCKED);
  });

  it("catches multiword porn spam however it is joined", () => {
    expect(screenComment("freeporn")).toEqual(BLOCKED);
    expect(screenComment("free-porn")).toEqual(BLOCKED);
    expect(screenComment("free porn")).toEqual(BLOCKED);
    expect(screenComment("livesex")).toEqual(BLOCKED);
    expect(screenComment("live-sex")).toEqual(BLOCKED);
    expect(screenComment("gang bang")).toEqual(BLOCKED);
    expect(screenComment("gangbang")).toEqual(BLOCKED);
    expect(screenComment("deep throat")).toEqual(BLOCKED);
    expect(screenComment("deepthroat")).toEqual(BLOCKED);
    expect(screenComment("sexcam")).toEqual(BLOCKED);
    expect(screenComment("cumshot")).toEqual(BLOCKED);
    expect(screenComment("pornhub")).toEqual(BLOCKED);
  });

  it("catches child-exploitation terms past the word boundary", () => {
    expect(screenComment("child porn")).toEqual(BLOCKED);
    expect(screenComment("childporn")).toEqual(BLOCKED);
    expect(screenComment("child pornography")).toEqual(BLOCKED);
    expect(screenComment("child porno")).toEqual(BLOCKED);
    expect(screenComment("ch1ld p0rn0graphy")).toEqual(BLOCKED);
    expect(screenComment("kiddie porno")).toEqual(BLOCKED);
  });
});

describe("screenComment — spam shapes and hostile input", () => {
  // Posting a trailer is the most natural thing there is in a TV app, and a
  // bare link is shorter than any prose you'd wrap around it.
  it("allows a link on its own and a link with a few words in front", () => {
    expect(
      screenComment("Trailer: https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    ).toEqual({ ok: true });
    expect(
      screenComment(
        "New teaser dropped, looks incredible: https://www.youtube.com/watch?v=aqz-KE-bpKQ"
      )
    ).toEqual({ ok: true });
    expect(
      screenComment(
        "Good primer before the rewatch: https://en.wikipedia.org/wiki/The_Wire"
      )
    ).toEqual({ ok: true });
    expect(screenComment("https://spam.example.com/watch-free-now")).toEqual({
      ok: true,
    });
    expect(screenComment("watch www.pirate-stream.xyz/s01e01")).toEqual({
      ok: true,
    });
  });

  it("allows two links and rejects more", () => {
    expect(
      screenComment(
        "trailer https://a.example/one and the wiki page https://b.example/two"
      )
    ).toEqual({ ok: true });
    expect(
      screenComment(
        "loved this one, the recap over at https://a.example/one and https://b.example/two and https://c.example/three all agree with me on the ending"
      )
    ).toEqual({
      ok: false,
      reason: "That's a lot of links — keep it to two.",
    });
  });

  it("does not read a missing space after a full stop as a link", () => {
    expect(screenComment("Ended perfectly.Top tier.")).toEqual({ ok: true });
    expect(screenComment("so good.io")).toEqual({ ok: true });
  });

  // Emphatic typing is how people talk, and one of these is a direct quote.
  it("normalises long character runs instead of rejecting them", () => {
    expect(screenComment("Sheeeeeeeeeeeeeeeeeeeeeeeeit")).toEqual({ ok: true });
    expect(screenComment("NOOOOOOOOOOOOOOOOOOOOOO not him")).toEqual({
      ok: true,
    });
    expect(screenComment(`wow${"!".repeat(40)}`)).toEqual({ ok: true });
    // ...and a run inside a slur is still a slur.
    expect(screenComment(`ni${"g".repeat(40)}er`)).toEqual(BLOCKED);
  });

  it("rejects empty and whitespace-only bodies", () => {
    expect(screenComment("")).toEqual({
      ok: false,
      reason: "Write something first.",
    });
    expect(screenComment("   \n\t ").ok).toBe(false);
  });

  it("rejects bodies over the 2000-character column cap", () => {
    expect(screenComment("great episode ".repeat(200))).toEqual({
      ok: false,
      reason: "Comments are limited to 2000 characters.",
    });
    expect(screenComment("ab".repeat(1000))).toEqual({ ok: true }); // exactly 2000
  });

  it("treats regex metacharacters as text, never as a pattern", () => {
    // No pattern is ever built from the body, so these are just odd comments.
    for (const body of [
      "(((*+?[]{}\\^$|",
      "[a-z]{1,3}",
      ".*.*.*.*.*.*.*.*.*b",
      "\\b\\w+\\b",
      "$1 @ 100% (+tax)",
    ]) {
      expect(() => screenComment(body)).not.toThrow();
      expect(screenComment(body)).toEqual({ ok: true });
    }
  });

  it("stays fast on long hostile input", () => {
    // Separator-heavy near-misses are the worst case for the padded patterns:
    // every letter lines up except the doubled one.
    const started = Date.now();
    expect(screenComment("n.i.g.e.r.".repeat(190)).ok).toBe(true);
    expect(screenComment("-=+".repeat(600)).ok).toBe(true);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("checkCommentRate", () => {
  // Every test starts from the same epoch: if the reset were not working, the
  // suite would fail whatever order the tests ran in.
  const T = 1_700_000_000_000;

  beforeEach(() => {
    resetCommentRate();
  });

  it("allows 5 in a minute, blocks the 6th, recovers after the window", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkCommentRate(T + i * 1000)).toEqual({ ok: true });
    }
    const blocked = checkCommentRate(T + 5000);
    expect(blocked.ok).toBe(false);
    expect(blocked).toMatchObject({
      reason: "You're commenting too fast. Try again in a minute.",
    });

    // The first post falls out of the rolling window exactly 60s later.
    expect(checkCommentRate(T + 60_000)).toEqual({ ok: true });
  });

  it("slides rather than resets — one slot frees up at a time", () => {
    for (let i = 0; i < 5; i++) checkCommentRate(T + i * 10_000);
    expect(checkCommentRate(T + 41_000).ok).toBe(false);
    expect(checkCommentRate(T + 60_000).ok).toBe(true); // first expired
    expect(checkCommentRate(T + 61_000).ok).toBe(false); // still four in window
  });

  it("does not charge a slot for a rejected attempt", () => {
    for (let i = 0; i < 5; i++) checkCommentRate(T + i * 1000);
    for (let i = 0; i < 20; i++) expect(checkCommentRate(T + 6000).ok).toBe(false);
    // The five accepted posts still expire on their own schedule.
    expect(checkCommentRate(T + 60_000).ok).toBe(true);
  });

  it("recovers from a backwards clock change instead of locking the user out", () => {
    for (let i = 0; i < 5; i++) checkCommentRate(T + i * 1000);
    expect(checkCommentRate(T + 5000).ok).toBe(false);

    // NTP correction / manual clock change: an hour into the past. The old
    // stamps can never expire relative to this, so the window starts over.
    const rewound = T - 3_600_000;
    expect(checkCommentRate(rewound)).toEqual({ ok: true });
    for (let i = 1; i < 5; i++) {
      expect(checkCommentRate(rewound + i * 1000).ok).toBe(true);
    }
    // ...and the limit still applies in the new window.
    expect(checkCommentRate(rewound + 5000).ok).toBe(false);
  });

  it("clears on demand so a new account doesn't inherit the burst", () => {
    for (let i = 0; i < 5; i++) checkCommentRate(T + i * 1000);
    expect(checkCommentRate(T + 5000).ok).toBe(false);
    resetCommentRate();
    expect(checkCommentRate(T + 5000)).toEqual({ ok: true });
  });
});

describe("allowlist and homoglyph coverage", () => {
  // The allowlist joined its words with \s+ while the blocklist joined with
  // [ _-]?, so the hyphenated spelling — the commoner one in writing — was
  // caught by the blocklist and could not be cleared by the allowlist.
  it("clears allowlisted phrases in their hyphenated spelling", () => {
    expect(screenComment("The spic-and-span flat says everything about him")).toEqual({
      ok: true,
    });
    expect(screenComment("spic and span, as ever")).toEqual({ ok: true });
    expect(screenComment("spick-and-span kitchen in every scene")).toEqual({ ok: true });
    expect(screenComment("Kike-Hernandez cameo was fun")).toEqual({ ok: true });
    expect(screenComment("faggots-and-peas is a proper Midlands dish")).toEqual({
      ok: true,
    });
  });

  it("still blocks a slur sitting next to an allowlisted phrase", () => {
    expect(screenComment("spic-and-span, you spic")).toEqual(BLOCKED);
  });

  // Cyrillic en/em/te/ve/ka/u were missing from the confusable map, so
  // swapping a single one of them walked a slur straight through.
  it("folds the Cyrillic letters that read as Latin ones", () => {
    expect(screenComment("н1gger").ok).toBe(false);
    expect(screenComment("you are a нigger").ok).toBe(false);
    // Mixed script: Cyrillic н and е, Latin everything else.
    expect(screenComment("нiggеr").ok).toBe(false);
  });

  // Only glyph-alikes are folded. Cyrillic и reads as a mirrored N, so mapping
  // it to "i" would start folding ordinary Russian words toward English terms.
  it("leaves Cyrillic letters that are not Latin lookalikes alone", () => {
    expect(screenComment("ниggеr").ok).toBe(true);
  });

  it("does not fold Cyrillic in ordinary non-English comments", () => {
    expect(screenComment("Отличный финал, лучший сезон")).toEqual({ ok: true });
    expect(screenComment("Мне очень понравилось")).toEqual({ ok: true });
  });
});

import { Alert } from "react-native";
import * as api from "./api";

/**
 * The report/block flows shared by every surface (comment rows, profile
 * pages) so the App-Store-mandated moderation copy and behavior can't drift
 * between screens.
 */

/** File a report and tell the user how it went. */
export async function reportWithFeedback(input: {
  commentId?: string;
  userId?: string;
}): Promise<void> {
  const ok = await api.reportContent(input);
  Alert.alert(
    ok ? "Reported" : "Couldn't report",
    ok
      ? "Thanks — we'll review it."
      : "Check your connection and try again."
  );
}

/** Confirm-and-block; runs `onDone` after the block lands. */
export function confirmBlock(
  name: string,
  userId: string,
  onDone?: () => void | Promise<void>
): void {
  Alert.alert(
    `Block ${name}?`,
    "You won't see their comments or activity, and you'll stop following each other.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block",
        style: "destructive",
        onPress: async () => {
          try {
            await api.blockUser(userId);
            await onDone?.();
          } catch {
            Alert.alert("Couldn't block", "Please try again.");
          }
        },
      },
    ]
  );
}

/**
 * Pre-post screening for comments (App Review 1.2). The list is deliberately
 * short: unambiguous hate slurs, child-exploitation terms and porn spam only.
 * Shows get dark and people swear about them, so blocking ordinary profanity —
 * or sexual words in TV context ("the sex scene", "full frontal", "nude
 * scene") — would cost us far more good comments than it saves bad ones.
 */

/** The `comments.body` column caps at 2000 — fail before the round-trip. */
const MAX_LENGTH = 2000;

/** Sharing a trailer and its wiki page is normal; a list of links is not. */
const MAX_LINKS = 2;

type BlockedTerm = {
  word: string;
  /**
   * The danger runs past the end of the word, so no trailing boundary:
   * "child porn" has to catch "child pornography" and "child porno" too.
   */
  prefix?: boolean;
  /**
   * The gap may be closed up or hyphenated but never a real space. "livesex"
   * and "live-sex" are spam; "the live sex scene" is how people talk about TV.
   */
  tight?: boolean;
};

/**
 * Deliberately absent, because nothing separates them from normal speech in a
 * show thread:
 *   bare "porn"/"sex" — "disaster porn", "the sex scene", "full frontal"
 *   "chink"           — "a chink in the armour"
 *   "coon"            — surnames, and South Park's The Coon
 *   "fag"             — a cigarette in half the English-speaking world
 *   "child abuse", "child rape" — the plot of a lot of prestige TV
 *
 * Dropped after an adversarial pass over real comments, because the word has an
 * everyday meaning we cannot fence off with a phrase:
 *   "tranny"  — a gearbox ("the tranny in his old Holden gives out") and a
 *               transistor radio. Both are open-ended sentences, not a fixed
 *               phrase we could allowlist.
 *   "gook"    — Gook (2017) is a film, and this is an app for talking about
 *               films. A title allowlist would have to carry the year, and the
 *               year does not survive leetspeak folding ("0" reads as "o").
 * Losing them costs us a determined adversary; keeping them cost us people
 * describing a car and people recommending a film, which is the worse trade for
 * a few friends talking about television.
 */
const BLOCKED_TERMS: BlockedTerm[] = [
  // Slurs with no defensible use in a show thread.
  { word: "nigger" },
  { word: "nigga" },
  { word: "kike" },
  { word: "faggot" },
  { word: "wetback" },
  { word: "spic" },
  { word: "raghead" },
  // Child exploitation. Prefix-matched: the word carries on ("pornography",
  // "porno") far more often than it stops.
  { word: "child porn", prefix: true },
  { word: "kiddie porn", prefix: true },
  // Porn spam. The gap between the words may be closed up, hyphenated or a
  // single space, so "free porn", "freeporn" and "free-porn" are one entry.
  { word: "free porn" },
  { word: "live sex", tight: true },
  { word: "sex cam" },
  { word: "cum shot" },
  { word: "gang bang" },
  // "deep throat" costs us the X-Files character and the Watergate source, but
  // both are rarer in a show thread than the spam.
  { word: "deep throat" },
  { word: "bukkake" },
  { word: "pornhub" },
  { word: "xvideos" },
  { word: "xhamster" },
];

/**
 * Phrases the patterns genuinely cannot separate from a slur. Checked before
 * the blocklist and matched literally — a repeat-tolerant "niger" would swallow
 * "nigger" — then blanked, so "spic and span, you nigger" still fails.
 */
const ALLOWED_PHRASES = [
  "spic and span",
  "spick and span",
  // Kiké Hernández, the ballplayer, in a cameo. Kiké is the standard Spanish
  // nickname for Enrique; accents are folded away before this runs, so the
  // unaccented spelling covers both.
  "kike hernandez",
  // Mr Brain's faggots and peas, the Midlands dish that turns up in Midlands
  // drama. The slur is worth keeping, so the dish gets a phrase instead.
  "faggots and peas",
  // The country. One 'g' short of the slur, so the pattern already lets it
  // through; listed anyway so a future pattern change can't quietly ban it.
  "niger",
];

// The gap has to be at least as permissive as the blocklist's WORD_GAP, or the
// allowlist can't clear a form the blocklist catches: "spic and span" passed
// while the commoner written "spic-and-span" was blocked.
const ALLOWED_PATTERNS = ALLOWED_PHRASES.map(
  (phrase) => new RegExp(`\\b${phrase.replace(/ /g, "[\\s_-]+")}\\b`, "g")
);

/** Digits that read as letters. Always folded — a digit can't be a separator. */
const DIGIT_LEET: Record<string, string> = {
  "0": "o",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
};

/**
 * Symbols that read as letters. Folded in one variant and left as punctuation
 * in another, because "n!gger" needs the letter reading while "!nigger" needs
 * the separator reading.
 */
const SYMBOL_LEET: Record<string, string> = {
  "@": "a",
  $: "s",
  "!": "i",
  "+": "t",
  "(": "c",
};

/** Cyrillic lookalikes — the cheapest homoglyph swap there is. */
const CONFUSABLES: Record<string, string> = {
  "\u0430": "a", // а
  "\u0435": "e", // е
  "\u043e": "o", // о
  "\u0440": "p", // р
  "\u0441": "c", // с
  "\u0445": "x", // х
  "\u0456": "i", // і
  // Not glyph-identical, but close enough to read as the Latin letter at
  // comment size — "н1gger" walked straight through on the first of these.
  "\u043d": "n", // н
  "\u043c": "m", // м
  "\u0442": "t", // т
  "\u0432": "b", // в
  "\u043a": "k", // к
  "\u0443": "y", // у
};

/**
 * Fold the cheap ways people smuggle a slur past a word list: fullwidth forms,
 * case, accents, zero-width padding, homoglyphs and leetspeak. Returns one
 * string per ambiguous reading — "1" and "|" read as both i and l, and the
 * symbols read as both letters and punctuation — so a caller testing every
 * variant catches "n1gger", "1ivesex" and "!nigger" alike.
 */
function normalizeVariants(text: string): string[] {
  const base = text
    .normalize("NFKC") // fullwidth "ｎｉ..." -> ascii
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // combining marks
    .replace(/[\u200b-\u200d\ufeff]/g, "") // zero-width padding
    .replace(/[\u0400-\u04ff]/g, (c) => CONFUSABLES[c] ?? c)
    .replace(/[034578]/g, (c) => DIGIT_LEET[c] ?? c);

  const variants = new Set<string>();
  for (const one of ["i", "l"]) {
    variants.add(
      base.replace(/[@$!+(]/g, (c) => SYMBOL_LEET[c] ?? c).replace(/[1|]/g, one)
    );
    variants.add(base.replace(/1/g, one));
  }
  return [...variants];
}

/**
 * Padding *inside* a word. An allowlist, not a denylist: the marks below censor
 * or decorate a word rather than join two of them, so admitting them cannot
 * merge a pair of innocent words.
 *
 * The hyphen is the one exception and it is kept deliberately. It does build
 * compounds, so it can still cost us "porn-hub" and "wet-back" — but the
 * hyphenated slur ("nig-ger", "rag-head") is a real evasion, `WORD_GAP` already
 * treats a hyphen as a closed-up space for the multi-word terms, and the corpus
 * writes these asides with a dash or a full stop, not a hyphen.
 *
 * What is left out is what buys the precision. Whitespace went first — a class
 * that crossed spaces read "go. OK" as one word, and likewise "Ki Ke" and
 * "X videos". Sentence punctuation went with it: the full stop, comma,
 * semicolon, colon, exclamation mark, question mark and both dashes are exactly
 * how prose joins the end of one word to the start of the next, so a class that
 * admitted them read "fag—got", "fag.got", "wet—back", "rag—head" and
 * "porn—hub" as slurs. Quotes, brackets, slashes and ampersands are out for the
 * same reason ("actor/director", "rock&roll").
 *
 * Neither exclusion costs us *systematic* evasion, because `collapseSpacedLetters`
 * recovers that whole shape on its own — "n i g g e r", "n.i.g.g.e.r",
 * "n,i,g,g,e,r", "n—i—g—g—e—r" and "n - i - g - g - e - r" all still block. What
 * it costs is one sentence mark buried in an otherwise intact word ("nig.ger",
 * "n—igger"), which now posts. Buying that back means treating a full stop
 * between two words as padding again, and that is six real comments per 220
 * against one hand-placed dot — the wrong way round.
 */
const INTRA_WORD = "[-_*~^|+=]*";
/**
 * The join *between* the words of a multi-word term: closed up, or exactly one
 * space, hyphen or underscore. Anything richer runs the two halves across a
 * sentence boundary — "The wound is deep. Throat cut later", "It's free. Porn
 * ads everywhere", "the porn hub that Times Square used to be".
 */
const WORD_GAP = "[ _-]?";
/** Same, minus the space, for terms whose spaced form is ordinary TV talk. */
const TIGHT_WORD_GAP = "[_-]?";

/**
 * Build a repeat-tolerant pattern: every letter may repeat and may be padded
 * with punctuation, so "niggggerrr" and "n-i-g-g-e-r" both match. Demanding each
 * letter *in order* is what keeps the near-misses clean — the pattern wants two
 * g's, so the country "Niger" and "a fagot of sticks" fall out on their own.
 *
 * Terms are module constants of `[a-z ]` only, so nothing needs escaping and no
 * pattern is ever built from user input. The separator and the letter classes
 * are disjoint, so the pattern can't backtrack quadratically on junk input.
 */
function buildPattern({ word, prefix, tight }: BlockedTerm): RegExp {
  const letters = [...word];
  let source = "\\b";
  letters.forEach((letter, i) => {
    if (letter === " ") {
      source += tight ? TIGHT_WORD_GAP : WORD_GAP;
      return;
    }
    if (i > 0 && letters[i - 1] !== " ") source += INTRA_WORD;
    source += `${letter}+`;
  });
  if (prefix) return new RegExp(source);
  // A trailing s/z is a plural or an evasion ("niggerz"), not a new word; the
  // boundary after it is what keeps "spicy" and "auspicious" postable. Only on
  // single words, though: on a multi-word term it swallowed the following verb,
  // so "the gang bangs on Frank's door" read as the spam phrase.
  const plural = word.includes(" ") ? "" : "[sz]*";
  return new RegExp(`${source}${plural}\\b`);
}

const BLOCKED_PATTERNS = BLOCKED_TERMS.map(buildPattern);

/**
 * Runs of the same character are emphasis, not spam — "Sheeeeeeeit" is a
 * quote and "NOOOOO" is how people type. Trim them to three so the patterns
 * (already `letter+`, so unaffected in what they match) never have to chew
 * through a thousand-character run.
 */
function collapseRuns(text: string): string {
  return text.replace(/([\s\S])\1{3,}/g, (_, char: string) => char.repeat(3));
}

/**
 * The shortest term on the list is four letters, so a shorter run of loose
 * characters cannot spell one and is left alone.
 */
const MIN_SPACED_RUN = 4;

/**
 * The second, deliberately narrow pass for character-by-character evasion:
 * "n i g g e r", "n.i.g.g.e.r", "n,i,g,g,e,r", "n—i—g—g—e—r",
 * "n - i - g - g - e - r". `INTRA_WORD` refuses whitespace and sentence
 * punctuation, which is what makes ordinary prose safe; this recovers the one
 * shape where such a separator really is padding — four or more single
 * characters in a row, each standing alone — by closing the run up. Prose does
 * not string single letters together, and because the collapsed text is matched
 * as its own candidate, neither pass loosens the other.
 *
 * Rewriting only the run, rather than re-joining every token, is what keeps this
 * safe to point at punctuation: everything outside a run survives byte for byte,
 * so "The wound is deep. Throat cut later" is not quietly turned into
 * "deep throat".
 */
const SPACED_RUN = new RegExp(
  `\\b[a-z0-9](?:[\\W_]+[a-z0-9]){${MIN_SPACED_RUN - 1},}\\b`,
  "g"
);

function collapseSpacedLetters(text: string): string {
  // Callers pass normalized (lowercased, folded) text, hence the ascii class.
  return text.replace(SPACED_RUN, (run) => run.replace(/[\W_]+/g, ""));
}

function isBlocked(body: string): boolean {
  // A Set because the collapse pass is usually a no-op: dedupe rather than run
  // every pattern twice over the same string.
  const candidates = new Set<string>();
  for (const variant of normalizeVariants(collapseRuns(body))) {
    candidates.add(variant);
    candidates.add(collapseSpacedLetters(variant));
  }
  return [...candidates].some((candidate) => {
    const cleared = ALLOWED_PATTERNS.reduce(
      (text, allowed) => text.replace(allowed, " "),
      candidate
    );
    return BLOCKED_PATTERNS.some((blocked) => blocked.test(cleared));
  });
}

/**
 * A scheme or a leading "www." is required. The bare-domain arm this replaces
 * matched any word.tld, so a missing space after a full stop became a link:
 * "Ended perfectly.Top tier." and "so good.io" were both read as URLs.
 */
const URL_RE = /(?:https?:\/\/|www\.)\S+/gi;

/** Trailing punctuation is part of the sentence, not the link. */
function findUrls(body: string): string[] {
  return (body.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?)\]]+$/, ""));
}

/**
 * Decide whether a comment may be posted. Callers show `reason` verbatim, so
 * it is written as plain user-facing copy rather than a policy citation.
 */
export function screenComment(
  body: string
): { ok: true } | { ok: false; reason: string } {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, reason: "Write something first." };
  if (trimmed.length > MAX_LENGTH) {
    return { ok: false, reason: "Comments are limited to 2000 characters." };
  }

  if (isBlocked(trimmed)) {
    return { ok: false, reason: "That comment breaks the community rules." };
  }

  // Links are counted, not measured. The old rule wanted more prose than link,
  // which rejected the most natural post in a TV app — a bare trailer URL, or a
  // wikipedia primer with a few words in front of it. One or two links is a
  // recommendation; a pile of them is spam.
  const urls = findUrls(trimmed);
  if (new Set(urls.map((u) => u.toLowerCase())).size > MAX_LINKS) {
    return { ok: false, reason: "That's a lot of links — keep it to two." };
  }

  return { ok: true };
}

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

/** Recent post times, oldest first. Client-side only — the DB is the real gate. */
let recentPosts: number[] = [];

/**
 * Drop the window. Sign-out calls this so the next account doesn't inherit the
 * previous one's burst, and tests call it so they don't depend on each other.
 */
export function resetCommentRate(): void {
  recentPosts = [];
}

/**
 * Throttle a burst of comments. `now` is a parameter so the window is
 * testable and so a paused/backgrounded app can't drift the clock on us.
 */
export function checkCommentRate(
  now: number
): { ok: true } | { ok: false; reason: string } {
  // A clock that jumps backwards (NTP correction, manual change) leaves stamps
  // in the future that the prune below can never expire, which used to lock the
  // user out until real time caught up. Treat it as a fresh window instead.
  if (recentPosts.length && now < recentPosts[recentPosts.length - 1]) {
    recentPosts = [];
  }
  while (recentPosts.length && now - recentPosts[0] >= RATE_WINDOW_MS) {
    recentPosts.shift();
  }
  if (recentPosts.length >= RATE_LIMIT) {
    // Rejected attempts are not recorded — otherwise hammering the button would
    // keep extending the lockout.
    return {
      ok: false,
      reason: "You're commenting too fast. Try again in a minute.",
    };
  }
  recentPosts.push(now);
  return { ok: true };
}

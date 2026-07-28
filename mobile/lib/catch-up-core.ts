/**
 * Wording for the catch-up prompt. Pure, and kept out of catch-up.ts so it can
 * be tested without pulling in React Native — the plurals are exactly the kind
 * of thing that ships as "1 earlier episodes" and then sits there.
 */
export function catchUpPrompt(count: number): {
  title: string;
  message: string;
  confirm: string;
} {
  const one = count === 1;
  return {
    title: one ? "Skipped an episode?" : "Skipped some episodes?",
    message: one
      ? "The episode before this one hasn't been marked watched. Mark it too?"
      : `${count} earlier episodes haven't been marked watched. Mark them too?`,
    confirm: one ? "Mark it too" : `Mark all ${count}`,
  };
}

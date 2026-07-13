/** Previous/next episode in broadcast order (pure, unit-tested). */
export function findNeighbors<
  T extends { id: number; season: number; number: number },
>(episodes: T[], episodeId: number): { prev: T | null; next: T | null } {
  const sorted = [...episodes].sort(
    (a, b) => a.season - b.season || a.number - b.number
  );
  const idx = sorted.findIndex((e) => e.id === episodeId);
  if (idx === -1) return { prev: null, next: null };
  return { prev: sorted[idx - 1] ?? null, next: sorted[idx + 1] ?? null };
}

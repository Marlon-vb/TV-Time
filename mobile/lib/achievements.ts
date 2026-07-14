/**
 * TV Time-style achievements, computed live from library stats (no extra
 * storage — badges can't get out of sync with reality).
 */

export interface AchievementInput {
  episodesWatched: number;
  minutesWatched: number;
  showsFollowed: number;
  showsFinished: number;
  episodesBehind: number;
  distinctGenres: number;
  reactionsCount: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string; // Ionicons name
  achieved: boolean;
  current: number;
  target: number;
  progress: number; // 0..1
}

interface Def {
  id: string;
  name: string;
  description: string;
  icon: string;
  target: number;
  metric: (s: AchievementInput) => number;
}

const DEFS: Def[] = [
  { id: "first_episode", name: "First Steps", description: "Watch your first episode", icon: "play", target: 1, metric: (s) => s.episodesWatched },
  { id: "century", name: "Century Club", description: "Watch 100 episodes", icon: "trophy", target: 100, metric: (s) => s.episodesWatched },
  { id: "binge_lord", name: "Binge Lord", description: "Watch 500 episodes", icon: "flash", target: 500, metric: (s) => s.episodesWatched },
  { id: "four_digits", name: "Four Digits", description: "Watch 1,000 episodes", icon: "flame", target: 1000, metric: (s) => s.episodesWatched },
  { id: "around_clock", name: "Around the Clock", description: "24 hours of watch time", icon: "time", target: 24 * 60, metric: (s) => s.minutesWatched },
  { id: "couch_week", name: "Couch Week", description: "A full week of watch time", icon: "bed", target: 7 * 24 * 60, metric: (s) => s.minutesWatched },
  { id: "finisher", name: "Finisher", description: "Finish a show, every episode", icon: "flag", target: 1, metric: (s) => s.showsFinished },
  { id: "serial_finisher", name: "Serial Finisher", description: "Finish 5 shows", icon: "ribbon", target: 5, metric: (s) => s.showsFinished },
  { id: "explorer", name: "Explorer", description: "Follow 10 shows", icon: "compass", target: 10, metric: (s) => s.showsFollowed },
  { id: "genre_hopper", name: "Genre Hopper", description: "Watch across 5 genres", icon: "shuffle", target: 5, metric: (s) => s.distinctGenres },
  { id: "reactor", name: "Reactor", description: "React to 10 episodes", icon: "happy", target: 10, metric: (s) => s.reactionsCount },
  {
    id: "zero_inbox",
    name: "Zero Inbox",
    description: "Fully caught up on 3+ shows",
    icon: "checkmark-done",
    target: 1,
    metric: (s) => (s.showsFollowed >= 3 && s.episodesBehind === 0 ? 1 : 0),
  },
];

export function computeAchievements(input: AchievementInput): Achievement[] {
  return DEFS.map((def) => {
    const current = def.metric(input);
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      icon: def.icon,
      achieved: current >= def.target,
      current: Math.min(current, def.target),
      target: def.target,
      progress: Math.max(0, Math.min(1, current / def.target)),
    };
  });
}

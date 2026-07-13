import { epCode } from "./format";

/** Text for the native share sheet (pure, unit-tested). */

export function episodeShareMessage(input: {
  showName: string;
  season: number;
  number: number;
  episodeName?: string | null;
  reaction?: string | null;
  watched: boolean;
}): string {
  const code = epCode(input.season, input.number);
  const title = input.episodeName ? ` — “${input.episodeName}”` : "";
  const emoji = input.reaction ? ` ${input.reaction}` : "";
  return input.watched
    ? `Just watched ${input.showName} ${code}${title}${emoji}`
    : `Up next for me: ${input.showName} ${code}${title}`;
}

export function showShareMessage(input: {
  showName: string;
  watched: number;
  total: number;
}): string {
  if (input.watched === 0) {
    return `Just started following ${input.showName} 📺`;
  }
  if (input.total > 0 && input.watched >= input.total) {
    return `Finished ${input.showName} — all ${input.total} episodes 🏁`;
  }
  return `I'm ${input.watched}/${input.total} episodes into ${input.showName} 📺`;
}

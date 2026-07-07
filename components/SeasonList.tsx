"use client";

import { useMemo, useState } from "react";
import { CheckIcon } from "./ui";
import { epCode, fmtDate } from "@/lib/format";
import type { EpisodeRow } from "@/lib/types";

interface Props {
  episodes: EpisodeRow[];
  followed: boolean;
  spoilerProtection: boolean;
  onToggleEpisode: (episodeId: number, watched: boolean) => void;
  onMarkSeason: (season: number, watched: boolean) => void;
  onMarkUpTo: (episodeId: number) => void;
}

export default function SeasonList({
  episodes,
  followed,
  spoilerProtection,
  onToggleEpisode,
  onMarkSeason,
  onMarkUpTo,
}: Props) {
  const seasons = useMemo(() => {
    const map = new Map<number, EpisodeRow[]>();
    for (const ep of episodes) {
      if (!map.has(ep.season)) map.set(ep.season, []);
      map.get(ep.season)!.push(ep);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [episodes]);

  // Default-open: the first season with an unwatched aired episode.
  const now = new Date().toISOString();
  const defaultOpen = useMemo(() => {
    for (const [num, eps] of seasons) {
      if (eps.some((e) => !e.watched_at && e.airstamp && e.airstamp <= now))
        return num;
    }
    return seasons.length ? seasons[seasons.length - 1][0] : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasons.length]);
  const [open, setOpen] = useState<Set<number> | null>(null);
  const openSet = open ?? new Set(defaultOpen != null ? [defaultOpen] : []);

  const toggleOpen = (season: number) => {
    const next = new Set(openSet);
    if (next.has(season)) next.delete(season);
    else next.add(season);
    setOpen(next);
  };

  if (seasons.length === 0) return null;

  return (
    <div className="mt-8 space-y-3">
      <h2 className="text-lg font-extrabold tracking-tight">Episodes</h2>
      {seasons.map(([seasonNum, eps]) => {
        const watched = eps.filter((e) => e.watched_at).length;
        const allWatched = watched === eps.length;
        const isOpen = openSet.has(seasonNum);
        return (
          <section
            key={seasonNum}
            className="overflow-hidden rounded-xl border border-line bg-surface"
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                onClick={() => toggleOpen(seasonNum)}
                className="flex flex-1 items-center gap-3 text-left"
                aria-expanded={isOpen}
              >
                <span
                  className={`transition-transform ${isOpen ? "rotate-90" : ""}`}
                >
                  ▸
                </span>
                <span className="font-bold">Season {seasonNum}</span>
                <span className="text-sm text-faint">
                  {watched}/{eps.length}
                </span>
              </button>
              {followed && (
                <button
                  onClick={() => onMarkSeason(seasonNum, !allWatched)}
                  className={`rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
                    allWatched
                      ? "bg-overlay text-muted hover:text-fg"
                      : "border border-line text-muted hover:border-accent hover:text-accent"
                  }`}
                >
                  {allWatched ? "Unmark season" : "Mark season watched"}
                </button>
              )}
            </div>

            {isOpen && (
              <ul className="divide-y divide-line border-t border-line">
                {eps.map((ep) => (
                  <EpisodeItem
                    key={ep.id}
                    ep={ep}
                    followed={followed}
                    spoilerProtection={spoilerProtection}
                    onToggle={onToggleEpisode}
                    onMarkUpTo={onMarkUpTo}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function EpisodeItem({
  ep,
  followed,
  spoilerProtection,
  onToggle,
  onMarkUpTo,
}: {
  ep: EpisodeRow;
  followed: boolean;
  spoilerProtection: boolean;
  onToggle: (episodeId: number, watched: boolean) => void;
  onMarkUpTo: (episodeId: number) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const aired = Boolean(ep.airstamp && ep.airstamp <= new Date().toISOString());
  const watched = Boolean(ep.watched_at);
  const hideSummary = spoilerProtection && !watched && !revealed;

  return (
    <li
      className={`group flex items-center gap-3 px-4 py-2.5 ${
        !aired ? "opacity-60" : ""
      }`}
    >
      <button
        onClick={() => followed && aired && onToggle(ep.id, !watched)}
        disabled={!followed || !aired}
        aria-label={`Mark ${epCode(ep.season, ep.number)} ${watched ? "unwatched" : "watched"}`}
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border transition-colors ${
          watched
            ? "border-accent bg-accent text-ink"
            : "border-line text-faint hover:border-accent hover:text-accent"
        } disabled:cursor-not-allowed disabled:hover:border-line disabled:hover:text-faint`}
      >
        <CheckIcon className="h-4 w-4" />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 text-xs font-bold text-faint">
            {epCode(ep.season, ep.number)}
          </span>
          <span className={`truncate text-sm font-semibold ${watched ? "text-muted" : ""}`}>
            {ep.name || "TBA"}
          </span>
        </div>
        {ep.summary && (
          <p
            onClick={() => hideSummary && setRevealed(true)}
            title={hideSummary ? "Tap to reveal spoilers" : undefined}
            className={`mt-0.5 line-clamp-2 text-xs text-faint ${
              hideSummary ? "spoiler" : "spoiler revealed"
            }`}
          >
            {ep.summary}
          </p>
        )}
      </div>

      <div className="shrink-0 text-right">
        <div className="text-xs text-faint">{fmtDate(ep.airstamp)}</div>
        {followed && aired && !watched && (
          <button
            onClick={() => onMarkUpTo(ep.id)}
            title="Mark this and everything before it as watched"
            className="mt-0.5 hidden text-[11px] font-semibold text-accent hover:underline group-hover:inline"
          >
            watched up to here
          </button>
        )}
      </div>
    </li>
  );
}

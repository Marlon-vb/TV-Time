"use client";

import Link from "next/link";
import Poster from "@/components/Poster";
import { EmptyState } from "@/components/ui";
import { minutesHuman, monthLabel } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { ShowRow } from "@/lib/types";

interface Stats {
  showsFollowed: number;
  episodesWatched: number;
  minutesWatched: number;
  showsFinished: number;
  episodesBehind: number;
  topGenres: { genre: string; minutes: number }[];
  mostWatched: { show: ShowRow; watched: number; minutes: number }[];
  monthly: { month: string; episodes: number }[];
}

export default function StatsPage() {
  const { data, loading } = useApi<Stats>("/api/stats");

  if (loading || !data) {
    return (
      <div className="h-64 animate-pulse rounded-xl border border-line bg-surface" />
    );
  }

  if (data.showsFollowed === 0) {
    return (
      <div>
        <h1 className="mb-5 text-2xl font-extrabold tracking-tight">Profile</h1>
        <EmptyState
          title="No stats yet"
          body="Once you follow shows and mark episodes watched, your watch time and history show up here."
          cta={{ href: "/search", label: "Discover shows" }}
        />
      </div>
    );
  }

  const time = minutesHuman(data.minutesWatched);

  return (
    <div>
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight">Profile</h1>

      {/* Time watched hero */}
      <div className="rounded-2xl border border-line bg-surface p-6">
        <div className="text-xs font-bold uppercase tracking-wider text-muted">
          Time spent watching TV
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <HeroUnit value={time.months} unit="months" />
          <HeroUnit value={time.days} unit="days" />
          <HeroUnit value={time.hours} unit="hours" />
        </div>
      </div>

      {/* KPI tiles */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Episodes watched" value={data.episodesWatched} />
        <StatTile label="Shows followed" value={data.showsFollowed} />
        <StatTile label="Shows finished" value={data.showsFinished} />
        <StatTile label="Episodes behind" value={data.episodesBehind} accent />
      </div>

      {/* Monthly activity */}
      {data.monthly.length > 1 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-extrabold tracking-tight">
            Episodes watched per month
          </h2>
          <MonthlyBars monthly={data.monthly} />
        </section>
      )}

      {/* Most watched */}
      {data.mostWatched.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-extrabold tracking-tight">
            Most watched shows
          </h2>
          <div className="space-y-2">
            {data.mostWatched.map(({ show, watched, minutes }) => (
              <Link
                key={show.id}
                href={`/show/${show.id}`}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5 transition-colors hover:border-overlay"
              >
                <Poster
                  src={show.poster_url}
                  name={show.name}
                  className="h-14 w-10 shrink-0 rounded-md"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{show.name}</div>
                  <div className="text-xs text-faint">
                    {watched} episodes · {Math.round(minutes / 60)} hours
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Top genres */}
      {data.topGenres.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-extrabold tracking-tight">
            Top genres
          </h2>
          <GenreBars genres={data.topGenres} />
        </section>
      )}
    </div>
  );
}

function HeroUnit({ value, unit }: { value: number; unit: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-4xl font-extrabold tabular-nums tracking-tight">
        {value}
      </span>
      <span className="text-sm font-semibold text-muted">{unit}</span>
    </div>
  );
}

function StatTile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div
        className={`text-2xl font-extrabold tabular-nums ${
          accent && value > 0 ? "text-accent" : ""
        }`}
      >
        {value.toLocaleString()}
      </div>
      <div className="mt-0.5 text-xs font-medium text-muted">{label}</div>
    </div>
  );
}

/**
 * Single-series monthly bar chart. Follows the house dataviz rules:
 * one hue (the accent), bars anchored to the baseline with rounded data-ends,
 * 2px gaps, per-bar hover tooltip, and a direct label on the peak month only.
 */
function MonthlyBars({ monthly }: { monthly: { month: string; episodes: number }[] }) {
  const max = Math.max(...monthly.map((m) => m.episodes), 1);
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex h-36 items-end gap-[2px]">
        {monthly.map((m) => {
          const isPeak = m.episodes === max;
          return (
            <div
              key={m.month}
              className="group relative flex h-full flex-1 flex-col items-center justify-end"
              title={`${monthLabel(m.month)} ${m.month.slice(0, 4)}: ${m.episodes} episodes`}
            >
              {isPeak && (
                <span className="mb-1 text-[11px] font-bold tabular-nums text-fg/90">
                  {m.episodes}
                </span>
              )}
              <div
                className="w-full max-w-8 rounded-t bg-accent transition-opacity group-hover:opacity-80"
                style={{ height: `${Math.max((m.episodes / max) * 100, 2)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[2px]">
        {monthly.map((m) => (
          <div
            key={m.month}
            className="flex-1 text-center text-[10px] font-medium text-faint"
          >
            {monthLabel(m.month)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal magnitude bars, one hue, direct-labeled — identity is the row. */
function GenreBars({ genres }: { genres: { genre: string; minutes: number }[] }) {
  const max = Math.max(...genres.map((g) => g.minutes), 1);
  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface p-4">
      {genres.map((g) => (
        <div key={g.genre} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-sm font-semibold">
            {g.genre}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-overlay">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${(g.minutes / max) * 100}%` }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted">
            {Math.round(g.minutes / 60)} h
          </span>
        </div>
      ))}
    </div>
  );
}

"use client";

import Link from "next/link";
import Poster from "@/components/Poster";
import { EmptyState, SkeletonList } from "@/components/ui";
import { epCode, fmtDate, fmtTime, relativeDay } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { UpcomingItem } from "@/lib/types";

export default function UpcomingPage() {
  const { data, loading } = useApi<{ items: UpcomingItem[] }>(
    "/api/upcoming?days=90"
  );
  const items = data?.items ?? [];

  // Group by calendar day, preserving airstamp order from the API.
  const groups: { day: string; items: UpcomingItem[] }[] = [];
  for (const item of items) {
    const day = item.episode.airstamp!.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }

  return (
    <div>
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">Upcoming</h1>
        <a
          href="/api/calendar.ics"
          className="text-sm font-semibold text-accent hover:underline"
          title="Subscribe from your calendar app to get new-episode events"
        >
          Calendar feed (.ics)
        </a>
      </div>

      {loading && <SkeletonList height={90} />}

      {!loading && items.length === 0 && (
        <EmptyState
          title="Nothing scheduled"
          body="None of your shows have announced episodes in the next 90 days. New dates appear here automatically after a sync."
          cta={{ href: "/search", label: "Discover shows" }}
        />
      )}

      <div className="space-y-7">
        {groups.map((group) => (
          <section key={group.day}>
            <h2 className="mb-2 flex items-baseline gap-2 text-sm font-bold uppercase tracking-wide text-accent">
              {relativeDay(group.day + "T12:00:00")}
              {relativeDay(group.day + "T12:00:00") !==
                fmtDate(group.day + "T12:00:00") && (
                <span className="text-xs font-medium normal-case tracking-normal text-faint">
                  {fmtDate(group.day + "T12:00:00")}
                </span>
              )}
            </h2>
            <div className="space-y-2">
              {group.items.map(({ show, episode }) => (
                <Link
                  key={episode.id}
                  href={`/show/${show.id}`}
                  className="flex items-center gap-4 rounded-xl border border-line bg-surface p-3 transition-colors hover:border-overlay"
                >
                  <Poster
                    src={show.poster_url}
                    name={show.name}
                    className="h-16 w-12 shrink-0 rounded-md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{show.name}</div>
                    <div className="truncate text-sm text-muted">
                      <span className="font-semibold text-fg/90">
                        {epCode(episode.season, episode.number)}
                      </span>
                      {episode.name ? ` · ${episode.name}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-sm">
                    <div className="font-semibold text-fg/90">
                      {fmtTime(episode.airstamp!)}
                    </div>
                    {show.network && (
                      <div className="text-xs text-faint">{show.network}</div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

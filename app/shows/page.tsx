"use client";

import Link from "next/link";
import { useState } from "react";
import Poster from "@/components/Poster";
import { CATEGORY_LABELS, EmptyState, ProgressBar } from "@/components/ui";
import { relativeDay } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { ShowCategory, ShowWithProgress } from "@/lib/types";

const TAB_ORDER: (ShowCategory | "all")[] = [
  "all",
  "watching",
  "up_to_date",
  "not_started",
  "finished",
  "archived",
];

export default function MyShowsPage() {
  const { data, loading } = useApi<{ shows: ShowWithProgress[] }>("/api/shows");
  const [tab, setTab] = useState<ShowCategory | "all">("all");
  const shows = data?.shows ?? [];

  const counts = new Map<string, number>();
  for (const s of shows) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);

  const visible =
    tab === "all"
      ? shows.filter((s) => s.category !== "archived")
      : shows.filter((s) => s.category === tab);

  return (
    <div>
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight">My Shows</h1>

      <div className="rail mb-6 flex gap-2 overflow-x-auto pb-1">
        {TAB_ORDER.map((t) => {
          const count =
            t === "all"
              ? shows.filter((s) => s.category !== "archived").length
              : counts.get(t) ?? 0;
          if (t === "archived" && count === 0) return null;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                tab === t
                  ? "bg-accent text-ink"
                  : "bg-surface text-muted hover:bg-raised hover:text-fg"
              }`}
            >
              {t === "all" ? "All" : CATEGORY_LABELS[t]}
              <span className="ml-1.5 opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {!loading && shows.length === 0 && (
        <EmptyState
          title="No shows yet"
          body="Follow shows from Discover, or import your TV Time history from Settings to bring your whole library over."
          cta={{ href: "/search", label: "Discover shows" }}
        />
      )}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {visible.map((show) => (
          <ShowCard key={show.id} show={show} />
        ))}
      </div>
    </div>
  );
}

function ShowCard({ show }: { show: ShowWithProgress }) {
  return (
    <Link
      href={`/show/${show.id}`}
      className="group overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-overlay"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden">
        <Poster
          src={show.poster_url}
          name={show.name}
          className="h-full w-full transition-transform duration-300 group-hover:scale-105"
        />
        {show.aired_unwatched > 0 && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-accent px-2 py-0.5 text-[11px] font-extrabold text-ink shadow">
            {show.aired_unwatched}
          </span>
        )}
      </div>
      <div className="p-2">
        <div className="truncate text-sm font-bold">{show.name}</div>
        <div className="mt-0.5 truncate text-[11px] text-faint">
          {show.category === "up_to_date" && show.next_airstamp
            ? `Next ${relativeDay(show.next_airstamp)}`
            : `${show.watched_count}/${show.total_episodes} watched`}
        </div>
        <ProgressBar
          value={show.watched_count}
          max={show.total_episodes}
          className="mt-1.5"
        />
      </div>
    </Link>
  );
}

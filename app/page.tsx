"use client";

import Link from "next/link";
import { useState } from "react";
import Poster from "@/components/Poster";
import { CheckIcon, EmptyState, SkeletonList } from "@/components/ui";
import { epCode, relativeDay } from "@/lib/format";
import { postJson, useApi } from "@/lib/useApi";
import type { WatchNextItem } from "@/lib/types";

export default function WatchNextPage() {
  const { data, loading, refresh } = useApi<{ items: WatchNextItem[] }>(
    "/api/watch-next"
  );
  const items = data?.items ?? [];

  return (
    <div>
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">Watch Next</h1>
        {items.length > 0 && (
          <span className="text-sm text-muted">
            {items.reduce((n, i) => n + i.aired_unwatched, 0)} episodes to catch
            up on
          </span>
        )}
      </div>

      {loading && <SkeletonList />}

      {!loading && items.length === 0 && (
        <EmptyState
          title="You're all caught up"
          body="No aired episodes waiting. Follow more shows from Discover, or import your TV Time history in Settings."
          cta={{ href: "/search", label: "Discover shows" }}
        />
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <WatchNextCard key={item.episode.id} item={item} onChanged={refresh} />
        ))}
      </div>
    </div>
  );
}

function WatchNextCard({
  item,
  onChanged,
}: {
  item: WatchNextItem;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const { show, episode } = item;
  const behind = item.aired_unwatched - 1;

  const markWatched = async () => {
    setBusy(true);
    await postJson(`/api/shows/${show.id}/watch`, {
      action: "episode",
      episodeId: episode.id,
      watched: true,
    });
    onChanged();
    setBusy(false);
  };

  return (
    <div className="flex items-stretch gap-4 rounded-xl border border-line bg-surface p-3 transition-colors hover:border-overlay">
      <Link href={`/show/${show.id}`} className="shrink-0">
        <Poster
          src={show.poster_url}
          name={show.name}
          className="h-28 w-20 rounded-lg"
        />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <Link
          href={`/show/${show.id}`}
          className="truncate font-bold hover:text-accent"
        >
          {show.name}
        </Link>
        <div className="truncate text-sm text-muted">
          <span className="font-semibold text-fg/90">
            {epCode(episode.season, episode.number)}
          </span>{" "}
          · {episode.name}
        </div>
        <div className="text-xs text-faint">
          Aired {relativeDay(episode.airstamp)}
          {episode.runtime ? ` · ${episode.runtime} min` : ""}
        </div>
        {behind > 0 && (
          <span className="mt-1 w-fit rounded-full bg-overlay px-2 py-0.5 text-[11px] font-semibold text-accent">
            +{behind} more behind
          </span>
        )}
      </div>
      <button
        onClick={markWatched}
        disabled={busy}
        aria-label={`Mark ${show.name} ${epCode(episode.season, episode.number)} watched`}
        className="grid w-14 shrink-0 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-accent hover:bg-accent hover:text-ink disabled:opacity-40"
      >
        <CheckIcon className="h-6 w-6" />
      </button>
    </div>
  );
}

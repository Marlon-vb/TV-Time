"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Poster from "@/components/Poster";
import SeasonList from "@/components/SeasonList";
import { ProgressBar } from "@/components/ui";
import { postJson, useApi } from "@/lib/useApi";
import type { EpisodeRow, ShowRow } from "@/lib/types";

interface ShowDetail {
  followed: boolean;
  show: ShowRow;
  episodes: EpisodeRow[];
}

export default function ShowPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, loading, error, refresh } = useApi<ShowDetail>(
    id ? `/api/shows/${id}` : null
  );
  const settings = useApi<{ spoilerProtection: boolean }>("/api/settings");
  const [busy, setBusy] = useState(false);
  const [episodes, setEpisodes] = useState<EpisodeRow[] | null>(null);

  const eps = episodes ?? data?.episodes ?? [];
  const show = data?.show;

  const progress = useMemo(() => {
    const now = new Date().toISOString();
    const aired = eps.filter((e) => e.airstamp && e.airstamp <= now);
    const watched = eps.filter((e) => e.watched_at);
    return {
      total: eps.length,
      aired: aired.length,
      watched: watched.length,
      behind: aired.filter((e) => !e.watched_at).length,
    };
  }, [eps]);

  if (loading) {
    return (
      <div className="h-64 animate-pulse rounded-xl border border-line bg-surface" />
    );
  }
  if (error || !show) {
    return (
      <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
        {error ?? "Show not found."}
      </p>
    );
  }

  const genres = JSON.parse(show.genres || "[]") as string[];

  const doFollow = async () => {
    setBusy(true);
    await postJson("/api/shows", { tvmazeId: show.id });
    await refresh();
    setBusy(false);
  };

  const doUnfollow = async () => {
    if (!confirm(`Unfollow ${show.name}? Your watch history for it will be deleted.`))
      return;
    setBusy(true);
    await postJson(`/api/shows/${show.id}`, undefined, "DELETE");
    router.push("/shows");
  };

  const doArchive = async (archived: boolean) => {
    setBusy(true);
    await postJson(`/api/shows/${show.id}`, { archived }, "PATCH");
    await refresh();
    setEpisodes(null);
    setBusy(false);
  };

  const watchAction = async (body: Record<string, unknown>) => {
    const res = await postJson<{ episodes: EpisodeRow[] }>(
      `/api/shows/${show.id}/watch`,
      body
    );
    if (res.ok && res.data) setEpisodes(res.data.episodes);
  };

  return (
    <div>
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface">
        {show.backdrop_url && (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-25"
            style={{ backgroundImage: `url(${show.backdrop_url})` }}
          />
        )}
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row">
          <Poster
            src={show.poster_url}
            name={show.name}
            className="h-56 w-40 shrink-0 self-center rounded-xl sm:self-start"
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              {show.name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              {show.premiered && <span>{show.premiered.slice(0, 4)}</span>}
              {show.network && <span>· {show.network}</span>}
              {show.runtime && <span>· {show.runtime} min</span>}
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  show.status === "Running"
                    ? "bg-ok/15 text-ok"
                    : "bg-overlay text-muted"
                }`}
              >
                {show.status || "Unknown"}
              </span>
            </div>
            {genres.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {genres.map((g) => (
                  <span
                    key={g}
                    className="rounded-full bg-overlay px-2.5 py-0.5 text-xs font-semibold text-fg/80"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}
            {show.summary && (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
                {show.summary}
              </p>
            )}

            {/* Actions */}
            <div className="mt-4 flex flex-wrap gap-2">
              {!data?.followed ? (
                <button
                  onClick={doFollow}
                  disabled={busy}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-ink hover:bg-accent-dim disabled:opacity-50"
                >
                  + Follow this show
                </button>
              ) : (
                <>
                  {progress.behind > 0 && (
                    <button
                      onClick={() => watchAction({ action: "show", watched: true })}
                      className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-ink hover:bg-accent-dim"
                    >
                      Mark all watched
                    </button>
                  )}
                  <button
                    onClick={() => doArchive(show.archived !== 1)}
                    disabled={busy}
                    className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted hover:bg-raised hover:text-fg"
                  >
                    {show.archived === 1 ? "Unarchive" : "Archive"}
                  </button>
                  <button
                    onClick={doUnfollow}
                    disabled={busy}
                    className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-danger/80 hover:bg-danger/10 hover:text-danger"
                  >
                    Unfollow
                  </button>
                </>
              )}
            </div>

            {/* Progress */}
            {data?.followed && progress.total > 0 && (
              <div className="mt-4 max-w-md">
                <div className="mb-1 flex justify-between text-xs text-muted">
                  <span>
                    <strong className="text-fg">{progress.watched}</strong> /{" "}
                    {progress.total} episodes watched
                  </span>
                  {progress.behind > 0 && (
                    <span className="font-semibold text-accent">
                      {progress.behind} to catch up
                    </span>
                  )}
                </div>
                <ProgressBar value={progress.watched} max={progress.total} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Episodes by season */}
      <SeasonList
        episodes={eps}
        followed={Boolean(data?.followed)}
        spoilerProtection={settings.data?.spoilerProtection ?? true}
        onToggleEpisode={(episodeId, watched) =>
          watchAction({ action: "episode", episodeId, watched })
        }
        onMarkSeason={(season, watched) =>
          watchAction({ action: "season", season, watched })
        }
        onMarkUpTo={(episodeId) => watchAction({ action: "up_to", episodeId })}
      />
    </div>
  );
}

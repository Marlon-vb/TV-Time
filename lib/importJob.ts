import { dedupeEpisodes, parseImportFiles, type ParsedShow } from "./importer";
import * as tvmaze from "./tvmaze";
import * as tmdb from "./tmdb";
import * as repo from "./repo";
import type { ImportReport } from "./types";

/**
 * Single background import job for the whole server process. Uploads can be
 * large (years of watch history) and provider APIs are rate-limited, so the
 * import runs asynchronously while the UI polls for progress.
 */

declare global {
  // eslint-disable-next-line no-var
  var __tvtime_import: ImportReport | undefined;
}

function freshReport(): ImportReport {
  return {
    status: "idle",
    progress: 0,
    message: "",
    showsMatched: 0,
    showsFailed: [],
    episodesMarked: 0,
    episodesApproximated: 0,
    startedAt: null,
    finishedAt: null,
  };
}

export function getReport(): ImportReport {
  if (!globalThis.__tvtime_import) globalThis.__tvtime_import = freshReport();
  return globalThis.__tvtime_import;
}

export function startImport(files: { name: string; buffer: Buffer }[]): {
  ok: boolean;
  error?: string;
} {
  const report = getReport();
  if (report.status === "running") {
    return { ok: false, error: "An import is already running." };
  }

  const parsed = parseImportFiles(files);
  if (parsed.shows.length === 0) {
    return {
      ok: false,
      error:
        parsed.warnings.join(" ") ||
        "No shows found in the uploaded file. Expected a TV Time export (zip or CSV).",
    };
  }

  const next = freshReport();
  next.status = "running";
  next.startedAt = new Date().toISOString();
  next.message = `Found ${parsed.shows.length} shows in ${parsed.filesRead.length} file(s). Matching…`;
  globalThis.__tvtime_import = next;

  // Fire and forget; progress is observable via getReport().
  void runImport(parsed.shows, next).catch((err) => {
    next.status = "error";
    next.message = `Import failed: ${(err as Error).message}`;
    next.finishedAt = new Date().toISOString();
  });

  return { ok: true };
}

async function runImport(shows: ParsedShow[], report: ImportReport) {
  const throttle = () => new Promise((r) => setTimeout(r, 600)); // ~TVmaze rate limit

  for (let i = 0; i < shows.length; i++) {
    const parsedShow = shows[i];
    const label =
      parsedShow.name ?? `TVDB show ${parsedShow.tvdbId ?? "unknown"}`;
    report.progress = i / shows.length;
    report.message = `Matching "${label}" (${i + 1}/${shows.length})…`;

    try {
      // 1. Resolve to a TVmaze show.
      let remote =
        parsedShow.tvdbId != null
          ? await tvmaze.lookupByTvdb(parsedShow.tvdbId)
          : null;
      if (!remote && parsedShow.name) {
        remote = await tvmaze.singleSearch(parsedShow.name);
      }
      if (!remote) {
        report.showsFailed.push(label);
        continue;
      }

      // 2. Follow (stores show + episode list).
      if (!repo.isFollowed(remote.id)) {
        await repo.followShow(remote.id);
        await throttle();
      }
      report.showsMatched++;

      // 3. Mark seen episodes.
      const episodes = dedupeEpisodes(parsedShow.episodes);
      let unresolvedCount = 0;

      for (const ep of episodes) {
        let season = ep.season;
        let number = ep.number;

        // TVDB-episode-id-only records (classic GDPR export): resolve the
        // position via TMDB's external-id lookup when a key is configured.
        if ((season == null || number == null) && ep.episodeTvdbId != null) {
          const pos = await tmdb.findEpisodeByTvdbId(ep.episodeTvdbId);
          if (pos) {
            season = pos.season;
            number = pos.number;
          }
        }

        if (season != null && number != null) {
          const marked = repo.markEpisodeBySeasonNumber(
            remote.id,
            season,
            number,
            ep.watchedAt ?? undefined
          );
          if (marked) report.episodesMarked++;
          else unresolvedCount++;
        } else {
          unresolvedCount++;
        }
      }

      // 4. Fallback: if some records couldn't be positioned (no TMDB key),
      // approximate by marking the earliest N unwatched aired episodes —
      // right for the common case of watching a show from the start.
      if (unresolvedCount > 0) {
        const all = repo.getEpisodes(remote.id);
        const nowIso = new Date().toISOString();
        const candidates = all.filter(
          (e) => !e.watched_at && e.airstamp && e.airstamp <= nowIso
        );
        for (const e of candidates.slice(0, unresolvedCount)) {
          repo.markEpisode(e.id, true);
          report.episodesMarked++;
          report.episodesApproximated++;
        }
      }
    } catch {
      report.showsFailed.push(label);
    }
  }

  report.progress = 1;
  report.status = "done";
  report.finishedAt = new Date().toISOString();
  const failNote = report.showsFailed.length
    ? ` ${report.showsFailed.length} show(s) could not be matched.`
    : "";
  const approxNote = report.episodesApproximated
    ? ` ${report.episodesApproximated} episodes were matched approximately (add a TMDB key for exact matching).`
    : "";
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  report.message = `Imported ${plural(report.showsMatched, "show")} and ${plural(report.episodesMarked, "watched episode")}.${failNote}${approxNote}`;
}

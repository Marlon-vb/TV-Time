import { dedupeEpisodes, type ParsedShow } from "./importer";
import * as tvmaze from "./tvmaze";
import * as tmdb from "./tmdb";
import * as repo from "./repo";

export interface ImportProgress {
  progress: number; // 0..1
  message: string;
  showsMatched: number;
  showsFailed: string[];
  episodesMarked: number;
  episodesApproximated: number;
}

/**
 * Match parsed shows against TVmaze, follow them, and mark watch history —
 * same strategy as the web app: exact by season/episode when the export has
 * them, TMDB TVDB-episode-id resolution when a key is configured, and a
 * mark-from-the-start approximation as the last resort.
 */
export async function runImport(
  shows: ParsedShow[],
  onProgress: (p: ImportProgress) => void
): Promise<ImportProgress> {
  const state: ImportProgress = {
    progress: 0,
    message: "",
    showsMatched: 0,
    showsFailed: [],
    episodesMarked: 0,
    episodesApproximated: 0,
  };
  const throttle = () => new Promise((r) => setTimeout(r, 600));

  for (let i = 0; i < shows.length; i++) {
    const parsedShow = shows[i];
    const label =
      parsedShow.name ?? `TVDB show ${parsedShow.tvdbId ?? "unknown"}`;
    state.progress = i / shows.length;
    state.message = `Matching “${label}” (${i + 1}/${shows.length})…`;
    onProgress({ ...state });

    try {
      let remote =
        parsedShow.tvdbId != null
          ? await tvmaze.lookupByTvdb(parsedShow.tvdbId)
          : null;
      if (!remote && parsedShow.name) {
        remote = await tvmaze.singleSearch(parsedShow.name);
      }
      if (!remote) {
        state.showsFailed.push(label);
        continue;
      }

      if (!repo.isFollowed(remote.id)) {
        await repo.followShow(remote.id);
        await throttle();
      }
      state.showsMatched++;

      const episodes = dedupeEpisodes(parsedShow.episodes);
      let unresolvedCount = 0;

      for (const ep of episodes) {
        let season = ep.season;
        let number = ep.number;
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
          if (marked) state.episodesMarked++;
          else unresolvedCount++;
        } else {
          unresolvedCount++;
        }
      }

      if (unresolvedCount > 0) {
        const all = repo.getEpisodes(remote.id);
        const nowIso = new Date().toISOString();
        const candidates = all.filter(
          (e) => !e.watched_at && e.airstamp && e.airstamp <= nowIso
        );
        for (const e of candidates.slice(0, unresolvedCount)) {
          // Backdate to the air date so approximated history isn't all "today".
          repo.markEpisode(e.id, true, e.airstamp ?? undefined);
          state.episodesMarked++;
          state.episodesApproximated++;
        }
      }
    } catch {
      state.showsFailed.push(label);
    }
  }

  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const failNote = state.showsFailed.length
    ? ` ${state.showsFailed.length} show(s) could not be matched.`
    : "";
  const approxNote = state.episodesApproximated
    ? ` ${state.episodesApproximated} episodes were matched approximately (add a TMDB key for exact matching).`
    : "";
  state.progress = 1;
  state.message = `Imported ${plural(state.showsMatched, "show")} and ${plural(state.episodesMarked, "watched episode")}.${failNote}${approxNote}`;
  onProgress({ ...state });
  return state;
}

-- Trending: what the community watched in the last seven days.
--
-- Run once in the Supabase SQL editor, after schema.sql. Idempotent.

-- ---------------------------------------------------------------- watched_at
--
-- The mirror only ever recorded created_at — when a row reached the server —
-- which is the wrong clock for "trending this week". Someone importing ten
-- years of history writes every row today, and without the real date they
-- would register as having watched their whole library this week.
--
-- Nullable, because rows written before this column existed cannot be
-- backfilled from the server side; the device backfills its own on the next
-- reconcile, and every read below falls back to created_at meanwhile.
alter table public.watched_episodes
  add column if not exists watched_at timestamptz;

-- The trending window filters on coalesce(watched_at, created_at), which no
-- plain column index can serve. This expression index matches it exactly.
create index if not exists idx_watched_when
  on public.watched_episodes ((coalesce(watched_at, created_at)) desc);

-- ------------------------------------------------------------------ trending
--
-- SECURITY DEFINER for the same reason also_watched() is: these are anonymous
-- community-wide counts over rows a caller cannot otherwise read. Nothing
-- identifying is returned — only ids, counts, and artwork.
--
-- Distinct users, not rows, is the whole ranking. It caps every person at one
-- vote per show however many episodes they marked, so a binge cannot
-- manufacture a trend and an import cannot vote 262 times for itself.

drop function if exists public.trending_shows(integer, integer);
create or replace function public.trending_shows(
  p_days integer default 7, p_limit integer default 20
)
returns table (
  show_id integer, watchers integer, episodes integer,
  show_name text, poster_url text
)
language sql stable security definer set search_path = public as $$
  with win as (
    select w.show_id, w.user_id
    from public.watched_episodes w
    where coalesce(w.watched_at, w.created_at)
          > now() - make_interval(days => greatest(p_days, 1))
  ),
  agg as (
    select show_id,
           count(distinct user_id)::integer as watchers,
           count(*)::integer as episodes
    from win group by show_id
  )
  -- watched_episodes carries no artwork, and hydrating 20 shows from TVmaze
  -- costs the client ten seconds. Activities do carry it, so borrow the most
  -- recent; the client hydrates whatever is still missing (usually nothing).
  select a.show_id, a.watchers, a.episodes, art.show_name, art.poster_url
  from agg a
  left join lateral (
    select ac.show_name, ac.poster_url
    from public.activities ac
    where ac.show_id = a.show_id and ac.poster_url is not null
    order by ac.created_at desc
    limit 1
  ) art on true
  order by a.watchers desc, a.episodes desc
  limit least(p_limit, 50);
$$;

drop function if exists public.trending_episodes(integer, integer);
create or replace function public.trending_episodes(
  p_days integer default 7, p_limit integer default 20
)
returns table (
  show_id integer, season integer, episode integer, watchers integer,
  show_name text, episode_name text, poster_url text
)
language sql stable security definer set search_path = public as $$
  with agg as (
    select w.show_id, w.season, w.episode,
           count(distinct w.user_id)::integer as watchers
    from public.watched_episodes w
    where coalesce(w.watched_at, w.created_at)
          > now() - make_interval(days => greatest(p_days, 1))
    group by w.show_id, w.season, w.episode
  )
  select a.show_id, a.season, a.episode, a.watchers,
         art.show_name, art.episode_name, art.poster_url
  from agg a
  left join lateral (
    select ac.show_name, ac.episode_name, ac.poster_url
    from public.activities ac
    where ac.show_id = a.show_id and ac.season = a.season
      and ac.episode = a.episode and ac.poster_url is not null
    order by ac.created_at desc
    limit 1
  ) art on true
  order by a.watchers desc
  limit least(p_limit, 50);
$$;

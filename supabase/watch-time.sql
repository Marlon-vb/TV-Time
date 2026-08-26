-- Time spent watching, on other people's profiles.
--
-- Run once in the Supabase SQL editor, after schema.sql. Idempotent.

-- ------------------------------------------------------------------ runtime
--
-- watched_episodes recorded which episode, never how long it was, so the only
-- watch figure a profile could show for someone else was a count of episodes.
-- Minutes need the runtime, and the server has no episode table to look it up
-- in — so the row carries it, mirrored from the device the same way
-- watched_at is.
--
-- Nullable, because rows written before this column existed cannot be
-- backfilled server-side; the device fills its own on the next reconcile.
alter table public.watched_episodes
  add column if not exists runtime integer;

-- ---------------------------------------------------------- watch summary
--
-- Now returns minutes alongside the episode count. Dropped first because the
-- return type changed and PostgREST would otherwise see two overloads.
--
-- SECURITY INVOKER, unchanged and load-bearing: the RLS policy on
-- watched_episodes is what limits this to yourself and people you follow. A
-- definer here would publish every user's history to every caller.
--
-- coalesce(runtime, 40) is the same default the device applies locally when an
-- episode and its show both lack a runtime. It also carries rows written
-- before the column existed, so a profile reads about right immediately and
-- exactly once that user's next reconcile lands.
drop function if exists public.profile_watch_summary(uuid);
create or replace function public.profile_watch_summary(p_user_id uuid)
returns table (show_id integer, episodes integer, minutes integer)
language sql stable security invoker set search_path = public as $$
  select show_id,
         count(*)::integer as episodes,
         sum(coalesce(runtime, 40))::integer as minutes
  from public.watched_episodes
  where user_id = p_user_id
  group by show_id
  order by episodes desc;
$$;

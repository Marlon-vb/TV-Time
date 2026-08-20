-- Shared cache for the movie search proxy (functions/movies).
--
-- Run this once, in the Supabase SQL editor. It is idempotent, so re-running
-- is safe.
--
-- Every user's search lands in the same row, so a popular title costs one TMDB
-- call per TTL window no matter how many people type it.

create table if not exists public.movie_cache (
  query text primary key,           -- normalized search text
  payload jsonb not null,           -- [{ id, title, year, posterUrl, ... }]
  fetched_at timestamptz not null default now()
);

-- Only the Edge Function touches this, and it uses the service-role key, which
-- bypasses RLS. Enabling RLS with no policies therefore locks the table to
-- everyone else — including anyone holding the app's publishable key.
alter table public.movie_cache enable row level security;

-- Housekeeping: drop rows nothing has asked for in a month. Optional.
create or replace function public.prune_movie_cache()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.movie_cache where fetched_at < now() - interval '30 days';
$$;

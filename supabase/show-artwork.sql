-- Cache for the show artwork proxy (supabase/functions/artwork).
--
-- Run once in the Supabase SQL editor. Idempotent.

create table if not exists public.show_artwork_cache (
  -- "imdb:tt0903747" or "tvdb:81189" — whichever id resolved it.
  external_id text primary key,
  -- { tmdbId, posterUrl, backdropUrl }, or null for a show TMDB does not
  -- have. Nulls are cached deliberately: without that, every sync of every
  -- unmatched show costs an upstream call forever.
  payload jsonb,
  fetched_at timestamptz not null default now()
);

-- Only the Edge Function touches this, and it uses the service-role key, which
-- bypasses RLS. Enabling RLS with no policies therefore locks the table to
-- everyone else — including anyone holding the app's publishable key.
alter table public.show_artwork_cache enable row level security;

-- Housekeeping: artwork rows are tiny and change about never, so this exists
-- for completeness rather than necessity. Optional.
create or replace function public.prune_show_artwork_cache()
returns void language sql security definer set search_path = public as $$
  delete from public.show_artwork_cache
  where fetched_at < now() - interval '180 days';
$$;

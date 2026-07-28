-- Shared cache for the GIF search proxy (functions/gifs).
--
-- Run this once, in the Supabase SQL editor. It is idempotent, so re-running
-- is safe.
--
-- Every user's search lands in the same row, so a popular query costs one
-- upstream Tenor call per TTL window no matter how many people type it. That
-- is what keeps GIF search viable on a free key at scale.

create table if not exists public.gif_cache (
  query text primary key,           -- normalized; '' is the trending feed
  payload jsonb not null,           -- [{ id, url, preview }, ...]
  fetched_at timestamptz not null default now()
);

-- Only the Edge Function touches this, and it uses the service-role key, which
-- bypasses RLS. Enabling RLS with no policies therefore locks the table to
-- everyone else — including anyone holding the app's publishable key.
alter table public.gif_cache enable row level security;

-- Housekeeping: drop rows nothing has asked for in a month. Optional — call it
-- from a cron job, or just ignore it; the table stays small either way.
create or replace function public.prune_gif_cache()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.gif_cache where fetched_at < now() - interval '30 days';
$$;

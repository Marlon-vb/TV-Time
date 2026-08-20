-- Favourite shows: the handful you want on your profile.
--
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run.
--
-- Unlike watched_episodes, this is readable by every signed-in user rather
-- than only your followers. Watch history is a record of what you did;
-- favourites are a showcase you curate on purpose, and a stranger landing on
-- your profile seeing your top shows is the entire point of the feature.
-- Blocks still apply, matching how comments are scoped.
--
-- name and poster_url are denormalised copies. A profile screen would
-- otherwise need one TVmaze round trip per favourite before it could render
-- anything, and these are display-only — the show id stays authoritative.

create table if not exists public.favorite_shows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  show_id integer not null,
  name text not null,
  poster_url text,
  created_at timestamptz not null default now(),
  primary key (user_id, show_id)
);

create index if not exists idx_favorites_user
  on public.favorite_shows(user_id, created_at desc);

alter table public.favorite_shows enable row level security;

drop policy if exists "favorites readable" on public.favorite_shows;
create policy "favorites readable" on public.favorite_shows for select to authenticated using (
  user_id = auth.uid()
  or user_id not in (select blocked_id from public.blocks where blocker_id = auth.uid())
);

drop policy if exists "write own favorites" on public.favorite_shows;
create policy "write own favorites" on public.favorite_shows for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

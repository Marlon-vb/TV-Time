-- TV Time — social backend schema (Supabase / Postgres)
--
-- Run this in your Supabase project: Dashboard → SQL Editor → New query →
-- paste this whole file → Run. Safe to re-run.
--
-- Security model: the app uses the public "anon"/publishable key; every table
-- is protected by Row Level Security. Private data (contact hashes) is only
-- reachable through SECURITY DEFINER functions, never selected directly.

-- =====================================================================
-- Tables
-- =====================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.profile_contacts (
  id uuid primary key references public.profiles(id) on delete cascade,
  phone_hash text,
  email_hash text
);
create index if not exists idx_profile_contacts_phone on public.profile_contacts(phone_hash);
create index if not exists idx_profile_contacts_email on public.profile_contacts(email_hash);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists idx_follows_followee on public.follows(followee_id);

-- Activity feed events (watched / rated / finished / started).
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('watched','rated','finished','started')),
  show_id integer,
  show_name text,
  poster_url text,
  season integer,
  episode integer,
  episode_name text,
  rating real,
  created_at timestamptz not null default now()
);
create index if not exists idx_activities_user_time on public.activities(user_id, created_at desc);

-- Watched log — one row per (user, episode) a friend has seen. Powers the
-- "friends who watched" indicator, per episode and per show.
create table if not exists public.watched_episodes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  show_id integer not null,
  season integer not null,
  episode integer not null,
  rating real,
  created_at timestamptz not null default now(),
  primary key (user_id, show_id, season, episode)
);
create index if not exists idx_watched_show on public.watched_episodes(show_id);
create index if not exists idx_watched_episode on public.watched_episodes(show_id, season, episode);

-- Episode comments, now with an optional photo and upvotes.
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  show_id integer not null,
  season integer not null,
  episode integer not null,
  body text check (body is null or char_length(body) <= 2000),
  image_url text,
  created_at timestamptz not null default now(),
  check (coalesce(body, '') <> '' or image_url is not null)
);
create index if not exists idx_comments_episode on public.comments(show_id, season, episode, created_at desc);

-- Upvotes on comments (one per user per comment).
create table if not exists public.comment_votes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

-- Per-episode character votes (one choice per user per episode).
create table if not exists public.character_votes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  show_id integer not null,
  season integer not null,
  episode integer not null,
  character_id integer not null,     -- TMDB person/credit id
  character_name text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, show_id, season, episode)
);
create index if not exists idx_charvotes_episode on public.character_votes(show_id, season, episode);

-- Expo push tokens for social notifications.
create table if not exists public.push_tokens (
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

-- User-generated-content reports (App Store Guideline 1.2). Reviewed by the
-- app owner in the Supabase dashboard.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete set null,
  reported_user_id uuid references public.profiles(id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

-- Blocks: hide a user's content from the blocker (App Store Guideline 1.2).
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.profile_contacts enable row level security;
alter table public.follows enable row level security;
alter table public.activities enable row level security;
alter table public.watched_episodes enable row level security;
alter table public.comments enable row level security;
alter table public.comment_votes enable row level security;
alter table public.character_votes enable row level security;
alter table public.push_tokens enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select to authenticated using (true);
drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update to authenticated using (id = auth.uid());

drop policy if exists "own contact hashes" on public.profile_contacts;
create policy "own contact hashes" on public.profile_contacts for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "follows readable" on public.follows;
create policy "follows readable" on public.follows for select to authenticated using (true);
drop policy if exists "create own follow" on public.follows;
create policy "create own follow" on public.follows for insert to authenticated with check (follower_id = auth.uid());
drop policy if exists "delete own follow" on public.follows;
create policy "delete own follow" on public.follows for delete to authenticated using (follower_id = auth.uid());
-- You may also remove one of your own followers (used when blocking someone).
drop policy if exists "remove follower" on public.follows;
create policy "remove follower" on public.follows for delete to authenticated using (followee_id = auth.uid());

drop policy if exists "read own and followed activities" on public.activities;
create policy "read own and followed activities" on public.activities for select to authenticated using (
  user_id = auth.uid()
  or user_id in (select followee_id from public.follows where follower_id = auth.uid())
);
drop policy if exists "insert own activities" on public.activities;
create policy "insert own activities" on public.activities for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "delete own activities" on public.activities;
create policy "delete own activities" on public.activities for delete to authenticated using (user_id = auth.uid());

-- watched_episodes: your watch history is visible to you and people you let
-- follow you — NOT to every signed-in stranger. Community aggregates
-- (episode_stats, also_watched) go through SECURITY DEFINER functions that
-- return only counts, never rows.
drop policy if exists "watched readable" on public.watched_episodes;
create policy "watched readable" on public.watched_episodes for select to authenticated using (
  user_id = auth.uid()
  or user_id in (select followee_id from public.follows where follower_id = auth.uid())
);
drop policy if exists "write own watched" on public.watched_episodes;
create policy "write own watched" on public.watched_episodes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "comments readable" on public.comments;
create policy "comments readable" on public.comments for select to authenticated using (true);
drop policy if exists "insert own comment" on public.comments;
create policy "insert own comment" on public.comments for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "delete own comment" on public.comments;
create policy "delete own comment" on public.comments for delete to authenticated using (user_id = auth.uid());

drop policy if exists "votes readable" on public.comment_votes;
create policy "votes readable" on public.comment_votes for select to authenticated using (true);
drop policy if exists "write own vote" on public.comment_votes;
create policy "write own vote" on public.comment_votes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- character_votes rows reveal watch history, so the same follower scoping
-- applies; the public tally goes through the SECURITY DEFINER function.
drop policy if exists "charvotes readable" on public.character_votes;
create policy "charvotes readable" on public.character_votes for select to authenticated using (
  user_id = auth.uid()
  or user_id in (select followee_id from public.follows where follower_id = auth.uid())
);
drop policy if exists "write own charvote" on public.character_votes;
create policy "write own charvote" on public.character_votes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own push tokens" on public.push_tokens;
create policy "own push tokens" on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "create own report" on public.reports;
create policy "create own report" on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());
drop policy if exists "read own reports" on public.reports;
create policy "read own reports" on public.reports for select to authenticated
  using (reporter_id = auth.uid());

drop policy if exists "own blocks" on public.blocks;
create policy "own blocks" on public.blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- =====================================================================
-- Functions
-- =====================================================================

-- Drop first so re-running works even when a function's return type changed
-- (Postgres won't let CREATE OR REPLACE change the return type).
drop function if exists public.find_friends(text[], text[]);
drop function if exists public.feed(integer, timestamptz);
drop function if exists public.friends_who_watched(integer, integer, integer);
drop function if exists public.episode_stats(integer, integer, integer);
drop function if exists public.character_vote_tally(integer, integer, integer);
drop function if exists public.also_watched(integer[], integer);
drop function if exists public.delete_account();

create or replace function public.find_friends(phone_hashes text[], email_hashes text[])
returns setof public.profiles
language sql security definer set search_path = public as $$
  select p.* from public.profiles p
  join public.profile_contacts c on c.id = p.id
  where p.id <> auth.uid()
    and (
      (array_length(phone_hashes, 1) is not null and c.phone_hash = any(phone_hashes))
      or (array_length(email_hashes, 1) is not null and c.email_hash = any(email_hashes))
    );
$$;

create or replace function public.feed(limit_count integer default 50, before timestamptz default now())
returns table (
  id uuid, user_id uuid, username text, display_name text, avatar_url text,
  type text, show_id integer, show_name text, poster_url text,
  season integer, episode integer, episode_name text, rating real, created_at timestamptz
)
language sql stable security invoker set search_path = public as $$
  select a.id, a.user_id, p.username, p.display_name, p.avatar_url,
         a.type, a.show_id, a.show_name, a.poster_url,
         a.season, a.episode, a.episode_name, a.rating, a.created_at
  from public.activities a
  join public.profiles p on p.id = a.user_id
  where (a.user_id = auth.uid()
         or a.user_id in (select followee_id from public.follows where follower_id = auth.uid()))
    and a.user_id not in (select blocked_id from public.blocks where blocker_id = auth.uid())
    and a.created_at < before
  order by a.created_at desc
  limit least(limit_count, 100);
$$;

-- Friends (people you follow) who have watched a given show — optionally a
-- specific episode when season/episode are provided.
create or replace function public.friends_who_watched(
  p_show_id integer, p_season integer default null, p_episode integer default null
)
returns setof public.profiles
language sql stable security invoker set search_path = public as $$
  select distinct p.*
  from public.watched_episodes w
  join public.profiles p on p.id = w.user_id
  where w.show_id = p_show_id
    and w.user_id in (select followee_id from public.follows where follower_id = auth.uid())
    and (p_season is null or w.season = p_season)
    and (p_episode is null or w.episode = p_episode);
$$;

-- Community rating for an episode: average + count across everyone.
-- SECURITY DEFINER: watch rows are follower-scoped by RLS, but these
-- anonymous aggregates are intentionally community-wide.
create or replace function public.episode_stats(
  p_show_id integer, p_season integer, p_episode integer
)
returns table (avg_rating real, rating_count integer, watch_count integer)
language sql stable security definer set search_path = public as $$
  select
    (select avg(rating)::real from public.watched_episodes
       where show_id = p_show_id and season = p_season and episode = p_episode and rating is not null),
    (select count(*)::integer from public.watched_episodes
       where show_id = p_show_id and season = p_season and episode = p_episode and rating is not null),
    (select count(*)::integer from public.watched_episodes
       where show_id = p_show_id and season = p_season and episode = p_episode);
$$;

-- Community collaborative filtering: shows that people who watch the same
-- shows as you also watch, ranked by how many of those "taste neighbors"
-- watch them. Show ids are TVmaze ids. Grows smarter as the user base grows.
-- SECURITY DEFINER: returns only anonymous per-show counts, never rows.
create or replace function public.also_watched(
  p_show_ids integer[], p_limit integer default 30
)
returns table (show_id integer, watchers integer)
language sql stable security definer set search_path = public as $$
  select w.show_id, count(distinct w.user_id)::integer as watchers
  from public.watched_episodes w
  where w.user_id in (
      select distinct user_id from public.watched_episodes
      where show_id = any(p_show_ids) and user_id <> auth.uid()
    )
    and w.show_id <> all(p_show_ids)
  group by w.show_id
  order by watchers desc
  limit least(p_limit, 100);
$$;

-- Tally of character votes for an episode. SECURITY DEFINER: anonymous
-- community-wide counts over follower-scoped rows.
create or replace function public.character_vote_tally(
  p_show_id integer, p_season integer, p_episode integer
)
returns table (character_id integer, character_name text, votes integer)
language sql stable security definer set search_path = public as $$
  select character_id, character_name, count(*)::integer as votes
  from public.character_votes
  where show_id = p_show_id and season = p_season and episode = p_episode
  group by character_id, character_name
  order by votes desc;
$$;

-- Full account deletion (App Store Guideline 5.1.1(v)). Removes the auth
-- user; every social row cascades via profiles, and uploaded photos are
-- deleted from storage. Callable only by the signed-in user, for themselves.
create or replace function public.delete_account()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from storage.objects
    where bucket_id = 'comment-photos' and owner = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    'user_' || substr(replace(new.id::text, '-', ''), 1, 10),
    nullif(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- =====================================================================
-- Storage: a public bucket for comment photos
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('comment-photos', 'comment-photos', true)
on conflict (id) do nothing;

drop policy if exists "comment photos readable" on storage.objects;
create policy "comment photos readable" on storage.objects for select
  using (bucket_id = 'comment-photos');
drop policy if exists "upload own comment photos" on storage.objects;
create policy "upload own comment photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'comment-photos' and owner = auth.uid());
drop policy if exists "delete own comment photos" on storage.objects;
create policy "delete own comment photos" on storage.objects for delete to authenticated
  using (bucket_id = 'comment-photos' and owner = auth.uid());

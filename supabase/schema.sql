-- TV Time — social backend schema (Supabase / Postgres)
--
-- Run this ONCE in your Supabase project: Dashboard → SQL Editor → New query →
-- paste this whole file → Run. It's safe to re-run (drops/recreates policies).
--
-- Security model: the app talks to Supabase with the public "anon" key, and
-- every table is protected by Row Level Security so a signed-in user can only
-- read/write what they're allowed to. Private data (contact hashes) is never
-- directly selectable — it's only reachable through the find_friends() function.

-- =====================================================================
-- Tables
-- =====================================================================

-- Public profile, one row per authenticated user.
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Private contact hashes, kept out of the public profile. Used only by
-- find_friends() to match your address book against other users.
create table if not exists public.profile_contacts (
  id uuid primary key references public.profiles(id) on delete cascade,
  phone_hash text,
  email_hash text
);
create index if not exists idx_profile_contacts_phone on public.profile_contacts(phone_hash);
create index if not exists idx_profile_contacts_email on public.profile_contacts(email_hash);

-- Follow graph (directed edges: follower → followee).
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists idx_follows_followee on public.follows(followee_id);

-- Activity feed events (a friend watched/rated/finished/started something).
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('watched','rated','finished','started')),
  show_id integer,          -- TVmaze show id
  show_name text,
  poster_url text,
  season integer,
  episode integer,
  episode_name text,
  rating real,
  created_at timestamptz not null default now()
);
create index if not exists idx_activities_user_time on public.activities(user_id, created_at desc);

-- Episode comments (a shared discussion thread per episode).
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  show_id integer not null,
  season integer not null,
  episode integer not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists idx_comments_episode on public.comments(show_id, season, episode, created_at desc);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.profile_contacts enable row level security;
alter table public.follows enable row level security;
alter table public.activities enable row level security;
alter table public.comments enable row level security;

drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);
drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile"
  on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile"
  on public.profiles for update to authenticated using (id = auth.uid());

-- profile_contacts: you may only touch your own row, and nobody selects it
-- directly in practice (find_friends() reads it via SECURITY DEFINER).
drop policy if exists "write own contact hashes" on public.profile_contacts;
create policy "write own contact hashes"
  on public.profile_contacts for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "follows readable by authenticated" on public.follows;
create policy "follows readable by authenticated"
  on public.follows for select to authenticated using (true);
drop policy if exists "create own follow" on public.follows;
create policy "create own follow"
  on public.follows for insert to authenticated with check (follower_id = auth.uid());
drop policy if exists "delete own follow" on public.follows;
create policy "delete own follow"
  on public.follows for delete to authenticated using (follower_id = auth.uid());

-- activities: you see your own + those of people you follow.
drop policy if exists "read own and followed activities" on public.activities;
create policy "read own and followed activities"
  on public.activities for select to authenticated using (
    user_id = auth.uid()
    or user_id in (select followee_id from public.follows where follower_id = auth.uid())
  );
drop policy if exists "insert own activities" on public.activities;
create policy "insert own activities"
  on public.activities for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "delete own activities" on public.activities;
create policy "delete own activities"
  on public.activities for delete to authenticated using (user_id = auth.uid());

-- comments: readable by anyone signed in (episode discussion); write your own.
drop policy if exists "comments readable by authenticated" on public.comments;
create policy "comments readable by authenticated"
  on public.comments for select to authenticated using (true);
drop policy if exists "insert own comment" on public.comments;
create policy "insert own comment"
  on public.comments for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "delete own comment" on public.comments;
create policy "delete own comment"
  on public.comments for delete to authenticated using (user_id = auth.uid());

-- =====================================================================
-- Functions
-- =====================================================================

-- Friend discovery: pass SHA-256 hashes of your contacts' phone numbers and
-- emails; get back matching public profiles (never your own, never the
-- hashes). SECURITY DEFINER lets it read profile_contacts safely.
create or replace function public.find_friends(phone_hashes text[], email_hashes text[])
returns setof public.profiles
language sql security definer set search_path = public as $$
  select p.*
  from public.profiles p
  join public.profile_contacts c on c.id = p.id
  where p.id <> auth.uid()
    and (
      (array_length(phone_hashes, 1) is not null and c.phone_hash = any(phone_hashes))
      or (array_length(email_hashes, 1) is not null and c.email_hash = any(email_hashes))
    );
$$;

-- Feed: activities from people you follow (and yourself), newest first,
-- joined with the author's profile. Keyset-paginated via `before`.
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
  where (
      a.user_id = auth.uid()
      or a.user_id in (select followee_id from public.follows where follower_id = auth.uid())
    )
    and a.created_at < before
  order by a.created_at desc
  limit least(limit_count, 100);
$$;

-- Auto-create a profile row when a new auth user signs up. The username is a
-- temporary placeholder; the app prompts the user to choose a real one.
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
  after insert on auth.users
  for each row execute function public.handle_new_user();

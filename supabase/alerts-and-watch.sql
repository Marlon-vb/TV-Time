-- Episode alerts and where-to-watch cache.
--
-- Run in the Supabase SQL editor after schema.sql. Idempotent: safe to re-run.
-- Does not send anything until episode_alert_config has a row (see the README).
--
-- Episode alerts: the phone uploads the shows it follows (the same set the
-- calendar is built from). A job asks TVmaze for air dates every 15 minutes, the same
-- source the calendar uses, and pushes once per user per episode.
--
-- Where to watch: a shared cache of TMDB watch/providers responses. Only the
-- Edge Function (service role) reads or writes it.

create extension if not exists pg_net;

-- --------------------------------------------------------- episode alerts

create table if not exists public.notification_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  episode_alerts boolean not null default false,
  -- Set by trigger when alerts flip on. Episodes that aired before this
  -- are never backfilled.
  enabled_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tracked_shows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  show_id integer not null check (show_id > 0),
  name text not null check (char_length(name) between 1 and 300),
  -- When they followed the show, sent by the phone on insert and then frozen.
  tracked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, show_id)
);

create index if not exists idx_tracked_shows_show
  on public.tracked_shows (show_id);

create index if not exists idx_notification_prefs_on
  on public.notification_prefs (user_id)
  where episode_alerts;

-- Air dates refreshed from TVmaze. Not user data. Service role only.
create table if not exists public.tracked_episodes (
  show_id integer not null check (show_id > 0),
  season integer not null check (season >= 0),
  episode integer not null check (episode >= 0),
  name text not null default '',
  airstamp timestamptz not null,
  fetched_at timestamptz not null default now(),
  primary key (show_id, season, episode)
);

create index if not exists idx_tracked_episodes_airstamp
  on public.tracked_episodes (airstamp);

create table if not exists public.show_schedule_fetches (
  show_id integer primary key check (show_id > 0),
  fetched_at timestamptz not null default now()
);

-- One row per user per episode we have already pushed.
create table if not exists public.episode_alerts_sent (
  user_id uuid not null references public.profiles(id) on delete cascade,
  show_id integer not null check (show_id > 0),
  season integer not null check (season >= 0),
  episode integer not null check (episode >= 0),
  sent_at timestamptz not null default now(),
  primary key (user_id, show_id, season, episode)
);

create index if not exists idx_episode_alerts_sent_show
  on public.episode_alerts_sent (show_id);

-- Where the scheduled job posts, and the shared secret. No policies on purpose:
-- the same model as notify_config. Clients cannot read the secret.
create table if not exists public.episode_alert_config (
  single boolean primary key default true check (single),
  function_url text not null,
  secret text not null
);

-- -------------------------------------------------------------- watch cache

create table if not exists public.watch_provider_cache (
  kind text not null check (kind in ('tv', 'movie')),
  tmdb_id integer not null check (tmdb_id > 0),
  region text not null check (region ~ '^[A-Z]{2}$'),
  payload jsonb,
  fetched_at timestamptz not null default now(),
  primary key (kind, tmdb_id, region)
);

-- ------------------------------------------------------------------- triggers

-- enabled_at moves only on the off -> on transition, and only to now().
-- A client cannot backdate it to replay the last day and a half of episodes.
create or replace function public.notification_prefs_stamp_enabled()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.episode_alerts then
      new.enabled_at := now();
    end if;
  else
    if new.episode_alerts and not old.episode_alerts then
      new.enabled_at := now();
    else
      new.enabled_at := old.enabled_at;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists notification_prefs_stamp_enabled on public.notification_prefs;
create trigger notification_prefs_stamp_enabled
  before insert or update on public.notification_prefs
  for each row execute function public.notification_prefs_stamp_enabled();

-- The follow time is whatever the phone sent on the first insert. Later
-- syncs refresh the name only.
create or replace function public.tracked_shows_keep_followed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.tracked_at := old.tracked_at;
  return new;
end $$;

drop trigger if exists tracked_shows_keep_followed_at on public.tracked_shows;
create trigger tracked_shows_keep_followed_at
  before update on public.tracked_shows
  for each row execute function public.tracked_shows_keep_followed_at();

revoke all on function public.notification_prefs_stamp_enabled() from public, anon, authenticated;
revoke all on function public.tracked_shows_keep_followed_at() from public, anon, authenticated;

-- ---------------------------------------------------------------- claim/send

create or replace function public.claim_episode_alerts(p_rows jsonb)
returns table (user_id uuid, show_id integer, season integer, episode integer)
language sql
security definer
set search_path = public
as $$
  insert into public.episode_alerts_sent as s (user_id, show_id, season, episode)
  select x.user_id, x.show_id, x.season, x.episode
  from jsonb_to_recordset(p_rows) as x(
    user_id uuid,
    show_id integer,
    season integer,
    episode integer
  )
  on conflict on constraint episode_alerts_sent_pkey do nothing
  returning s.user_id, s.show_id, s.season, s.episode;
$$;

create or replace function public.release_episode_alerts(p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.episode_alerts_sent as s
  using jsonb_to_recordset(p_rows) as x(
    user_id uuid,
    show_id integer,
    season integer,
    episode integer
  )
  where s.user_id = x.user_id
    and s.show_id = x.show_id
    and s.season = x.season
    and s.episode = x.episode;
end $$;

revoke all on function public.claim_episode_alerts(jsonb) from public, anon, authenticated;
revoke all on function public.release_episode_alerts(jsonb) from public, anon, authenticated;
grant execute on function public.claim_episode_alerts(jsonb) to service_role;
grant execute on function public.release_episode_alerts(jsonb) to service_role;

-- Wake the Edge Function. No-op until episode_alert_config is filled in,
-- and never raises: a broken push pipeline must not fill the cron log.
create or replace function public.invoke_episode_alerts()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg record;
begin
  select function_url, secret into cfg
  from public.episode_alert_config
  where single;
  if not found then
    return;
  end if;
  perform net.http_post(
    url := cfg.function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', cfg.secret
    ),
    body := jsonb_build_object('source', 'cron')
  );
exception when others then
  null;
end $$;

revoke all on function public.invoke_episode_alerts() from public, anon, authenticated;

-- --------------------------------------------------------------------- RLS

alter table public.notification_prefs enable row level security;
alter table public.tracked_shows enable row level security;
alter table public.tracked_episodes enable row level security;
alter table public.show_schedule_fetches enable row level security;
alter table public.episode_alerts_sent enable row level security;
alter table public.episode_alert_config enable row level security;
alter table public.watch_provider_cache enable row level security;

drop policy if exists "own notification prefs" on public.notification_prefs;
create policy "own notification prefs" on public.notification_prefs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own tracked shows" on public.tracked_shows;
create policy "own tracked shows" on public.tracked_shows
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- The rest are service-role only. RLS with no policies locks out the
-- publishable key. The Edge Function uses the service role, which bypasses RLS.

revoke all on public.tracked_episodes from anon, authenticated;
revoke all on public.show_schedule_fetches from anon, authenticated;
revoke all on public.episode_alerts_sent from anon, authenticated;
revoke all on public.episode_alert_config from anon, authenticated;
revoke all on public.watch_provider_cache from anon, authenticated;

revoke all on public.notification_prefs from anon;
revoke all on public.tracked_shows from anon;
grant select, insert, update, delete on public.notification_prefs to authenticated;
grant select, insert, update, delete on public.tracked_shows to authenticated;

-- The Edge Function connects as service_role. Bypass RLS does not imply GRANT.
grant select, insert, update, delete on public.notification_prefs to service_role;
grant select, insert, update, delete on public.tracked_shows to service_role;
grant select, insert, update, delete on public.tracked_episodes to service_role;
grant select, insert, update, delete on public.show_schedule_fetches to service_role;
grant select, insert, update, delete on public.episode_alerts_sent to service_role;
grant select on public.episode_alert_config to service_role;
grant select, insert, update, delete on public.watch_provider_cache to service_role;

-- ------------------------------------------------------------------- schedule
-- Every 15 minutes. If pg_cron is not enabled yet this block notices and
-- continues, so the tables above still exist. Enable the extension in
-- Database → Extensions and re-run this file.

do $cron$
declare
  existing bigint;
begin
  create extension if not exists pg_cron;
  select jobid into existing from cron.job where jobname = 'episode-alerts';
  if existing is not null then
    perform cron.unschedule(existing);
  end if;
  perform cron.schedule(
    'episode-alerts',
    '*/15 * * * *',
    $job$select public.invoke_episode_alerts();$job$
  );
exception when others then
  raise notice 'episode-alerts cron was not scheduled: %', sqlerrm;
end
$cron$;

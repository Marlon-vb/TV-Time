-- Social push delivery: database triggers → pg_net → the `notify` Edge
-- Function → Expo's push API → the user's phone.
--
-- Run AFTER schema.sql, and only once you've deployed the Edge Function
-- (see supabase/README.md § Push notifications). Everything here is
-- additive and idempotent — safe to re-run.

create extension if not exists pg_net;

-- ---------------------------------------------------------------- config
-- Single-row config: where the notify function lives and the shared secret
-- that gates it. RLS is enabled with NO policies on purpose — app clients
-- can never read the secret; only the definer function below (and the
-- dashboard) can.
create table if not exists public.notify_config (
  single boolean primary key default true check (single),
  function_url text not null,
  secret text not null
);
alter table public.notify_config enable row level security;

-- ---------------------------------------------------------------- sender
-- Fire-and-forget push to one user. Never raises: a broken notification
-- pipeline must not break the follow/comment/upvote write that caused it.
create or replace function public.notify_push(
  p_user_id uuid, p_title text, p_body text, p_url text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  cfg record;
begin
  select function_url, secret into cfg from public.notify_config where single;
  if not found then
    return; -- not configured yet — silently skip
  end if;
  perform net.http_post(
    url := cfg.function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', cfg.secret
    ),
    body := jsonb_build_object(
      'user_id', p_user_id,
      'title', p_title,
      'body', p_body,
      'url', p_url
    )
  );
exception when others then
  null;
end $$;

revoke all on function public.notify_push(uuid, text, text, text)
  from public, anon, authenticated;

-- ------------------------------------------------------------- followers
create or replace function public.handle_notify_follow()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  f record;
begin
  select username, display_name into f
  from public.profiles where id = new.follower_id;
  if found then
    perform public.notify_push(
      new.followee_id,
      'New follower',
      coalesce(nullif(f.display_name, ''), '@' || f.username)
        || ' started following you',
      '/u/' || f.username
    );
  end if;
  return new;
end $$;

drop trigger if exists on_follow_notify on public.follows;
create trigger on_follow_notify
  after insert on public.follows
  for each row execute function public.handle_notify_follow();

-- ---------------------------------------------------------------- upvotes
create or replace function public.handle_notify_upvote()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c record;
  voter record;
  show text;
begin
  select user_id, show_id, season, episode into c
  from public.comments where id = new.comment_id;
  if not found or c.user_id = new.user_id then
    return new; -- self-upvote or comment vanished
  end if;
  -- Respect blocks in both directions.
  if exists (
    select 1 from public.blocks
    where (blocker_id = c.user_id and blocked_id = new.user_id)
       or (blocker_id = new.user_id and blocked_id = c.user_id)
  ) then
    return new;
  end if;
  select username, display_name into voter
  from public.profiles where id = new.user_id;
  if not found then return new; end if;
  -- Comments don't carry the show name; borrow it from any feed activity.
  select show_name into show from public.activities
  where show_id = c.show_id and show_name is not null limit 1;
  perform public.notify_push(
    c.user_id,
    'Your comment got a like',
    coalesce(nullif(voter.display_name, ''), '@' || voter.username)
      || ' liked your comment on '
      || coalesce(show, 'S' || c.season || ' E' || c.episode),
    '/show/' || c.show_id
  );
  return new;
end $$;

drop trigger if exists on_upvote_notify on public.comment_votes;
create trigger on_upvote_notify
  after insert on public.comment_votes
  for each row execute function public.handle_notify_upvote();

-- --------------------------------------------------------------- comments
-- "Someone also commented on the episode you commented on."
create or replace function public.handle_notify_comment()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  author record;
  show text;
  r record;
begin
  select username, display_name into author
  from public.profiles where id = new.user_id;
  if not found then return new; end if;
  select show_name into show from public.activities
  where show_id = new.show_id and show_name is not null limit 1;
  for r in
    select distinct c.user_id
    from public.comments c
    where c.show_id = new.show_id
      and c.season = new.season
      and c.episode = new.episode
      and c.user_id <> new.user_id
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = c.user_id and b.blocked_id = new.user_id)
           or (b.blocker_id = new.user_id and b.blocked_id = c.user_id)
      )
  loop
    perform public.notify_push(
      r.user_id,
      'New comment',
      coalesce(nullif(author.display_name, ''), '@' || author.username)
        || ' also commented on '
        || coalesce(show, 'an episode you commented on')
        || ' S' || new.season || ' E' || new.episode,
      '/show/' || new.show_id
    );
  end loop;
  return new;
end $$;

drop trigger if exists on_comment_notify on public.comments;
create trigger on_comment_notify
  after insert on public.comments
  for each row execute function public.handle_notify_comment();

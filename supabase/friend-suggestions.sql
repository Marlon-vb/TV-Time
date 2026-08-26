-- Friend suggestions from the graph the app already has.
--
-- Run once in the Supabase SQL editor, after schema.sql. Idempotent.

-- --------------------------------------------------------- friend suggestions
--
-- Two signals, neither of which needs anything the app does not already hold.
--
--  1. Friends of friends. If several people you follow all follow someone,
--     that is the strongest suggestion a social graph can make, and it costs
--     no permission prompt and no new personal data.
--  2. Taste neighbours. People whose watched shows overlap yours — the same
--     idea also_watched() uses for shows, pointed at people instead.
--
-- Address-book matching stays where it is (find_friends, email only). This is
-- what fills the screen for everyone who never grants contacts access, and for
-- everyone signing in with Hide My Email whose address nobody has.

drop function if exists public.suggested_friends(integer);
create or replace function public.suggested_friends(p_limit integer default 12)
returns table (
  id uuid, username text, display_name text, avatar_url text,
  created_at timestamptz, reason text, mutuals integer, shows_in_common integer
)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id),
  mine as (
    select followee_id from public.follows
    where follower_id = (select id from me)
  ),
  -- Blocks hide in both directions: someone I blocked, and someone who
  -- blocked me, are equally not a suggestion.
  hidden as (
    select blocked_id as id from public.blocks
    where blocker_id = (select id from me)
    union
    select blocker_id from public.blocks
    where blocked_id = (select id from me)
  ),
  fof as (
    select f.followee_id as id, count(*)::integer as n
    from public.follows f
    where f.follower_id in (select followee_id from mine)
    group by f.followee_id
  ),
  my_shows as (
    select distinct show_id from public.watched_episodes
    where user_id = (select id from me)
  ),
  taste as (
    select w.user_id as id, count(distinct w.show_id)::integer as n
    from public.watched_episodes w
    where w.show_id in (select show_id from my_shows)
      and w.user_id <> (select id from me)
    group by w.user_id
    -- Two shows in common is a coincidence in a library this size.
    having count(distinct w.show_id) >= 3
  )
  select p.id, p.username, p.display_name, p.avatar_url, p.created_at,
         case
           when coalesce(fof.n, 0) > 0 then
             'Followed by ' || fof.n ||
             case when fof.n = 1 then ' person' else ' people' end ||
             ' you follow'
           else coalesce(taste.n, 0) || ' shows in common'
         end as reason,
         coalesce(fof.n, 0) as mutuals,
         coalesce(taste.n, 0) as shows_in_common
  from public.profiles p
  left join fof on fof.id = p.id
  left join taste on taste.id = p.id
  where p.id <> (select id from me)
    and p.id not in (select followee_id from mine)
    and p.id not in (select id from hidden)
    and (fof.n is not null or taste.n is not null)
  -- A mutual follow outweighs shared taste: three people you know already
  -- vouching beats twenty shows in common with a stranger.
  order by (coalesce(fof.n, 0) * 3 + least(coalesce(taste.n, 0), 20)) desc,
           p.created_at desc
  limit least(p_limit, 50);
$$;

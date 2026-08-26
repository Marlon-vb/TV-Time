-- Sending a show to one person.
--
-- Run once in the Supabase SQL editor, after schema.sql and notifications.sql.
-- Idempotent.
--
-- Everything social in the app so far is broadcast (the feed, comments) or
-- passive (favourites, profiles). This is the first thing addressed TO
-- somebody: I picked this, for you.

create table if not exists public.show_recommendations (
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  show_id integer not null,
  -- Denormalised so the recipient's Discover rail renders without a TVmaze
  -- round trip per card for shows they do not follow.
  show_name text not null,
  poster_url text,
  note text,
  created_at timestamptz not null default now(),
  -- One recommendation per person per show: sending it twice is the same
  -- statement, and the upsert refreshes the note rather than stacking.
  primary key (from_user_id, to_user_id, show_id),
  check (from_user_id <> to_user_id)
);
create index if not exists idx_recommendations_to
  on public.show_recommendations(to_user_id, created_at desc);

alter table public.show_recommendations enable row level security;

-- Readable by both sides: the recipient needs the rail, and the sender needs
-- to see that it went.
drop policy if exists "recommendations readable" on public.show_recommendations;
create policy "recommendations readable" on public.show_recommendations
  for select to authenticated using (
    to_user_id = auth.uid() or from_user_id = auth.uid()
  );

-- You may send one as yourself, to someone you follow, provided neither of you
-- has blocked the other. Following is the gate: without it this is an open
-- channel to any account in the app, which is how a recommendation feature
-- becomes a spam feature.
drop policy if exists "send own recommendations" on public.show_recommendations;
create policy "send own recommendations" on public.show_recommendations
  for insert to authenticated with check (
    from_user_id = auth.uid()
    and exists (
      select 1 from public.follows
      where follower_id = auth.uid() and followee_id = to_user_id
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = to_user_id and b.blocked_id = auth.uid())
         or (b.blocker_id = auth.uid() and b.blocked_id = to_user_id)
    )
  );

-- The recipient dismisses; the sender can take one back.
drop policy if exists "clear recommendations" on public.show_recommendations;
create policy "clear recommendations" on public.show_recommendations
  for delete to authenticated using (
    to_user_id = auth.uid() or from_user_id = auth.uid()
  );

-- Updating is how re-sending refreshes the note, and only the sender may.
drop policy if exists "update own recommendations" on public.show_recommendations;
create policy "update own recommendations" on public.show_recommendations
  for update to authenticated using (from_user_id = auth.uid())
  with check (from_user_id = auth.uid());

-- ------------------------------------------------------------------- push
-- Deep-links to the show rather than to a list, because there is exactly one
-- thing to look at and the tap should land on it.
create or replace function public.handle_notify_recommendation()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sender record;
begin
  select username, display_name into sender
  from public.profiles where id = new.from_user_id;
  if not found then return new; end if;
  perform public.notify_push(
    new.to_user_id,
    'A show for you',
    coalesce(nullif(sender.display_name, ''), '@' || sender.username)
      || ' thinks you should watch ' || new.show_name,
    '/show/' || new.show_id
  );
  return new;
end $$;

drop trigger if exists on_recommendation_notify on public.show_recommendations;
create trigger on_recommendation_notify
  after insert on public.show_recommendations
  for each row execute function public.handle_notify_recommendation();

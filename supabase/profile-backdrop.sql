-- Artwork behind a profile.
--
-- Run once in the Supabase SQL editor, after favorites.sql. Idempotent.

-- A profile had no image of its own — an avatar on flat navy, the same page
-- for everyone. The one picture that is genuinely theirs is already decided:
-- whatever they put first on their favourites shelf.
--
-- favorite_shows mirrors the poster but not the backdrop, and a 2:3 poster
-- cropped to a header band is unusable. So the wide art rides along with it,
-- filled in by the same reconcile that maintains the shelf.
alter table public.favorite_shows
  add column if not exists backdrop_url text;

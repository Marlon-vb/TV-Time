-- Feed activities for adding shows, and for movies.
--
-- Run once in the Supabase SQL editor. Idempotent.
--
-- The feed only ever knew about episodes: watched, rated, finished. Following
-- a show published nothing, and the film half of the library was entirely
-- invisible — a friend could watch twenty movies and their feed would say
-- nothing at all.
--
-- Four new activity types. 'added' is a show joining someone's library;
-- the movie_* trio mirrors the episode trio, with show_id carrying the TMDB
-- movie id and season/episode staying null. A TMDB id can collide with a
-- TVmaze id, which is why the types stay distinct instead of sharing
-- 'watched': the type is what tells a tap which page to open.
alter table public.activities drop constraint if exists activities_type_check;
alter table public.activities add constraint activities_type_check
  check (type in (
    'watched','rated','finished','started','commented',
    'added','movie_added','movie_watched','movie_rated'
  ));

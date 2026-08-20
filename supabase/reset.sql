-- DANGER: drops all social tables and their data. Only use on a fresh
-- project (or when you intend to wipe the social layer), then re-run
-- schema.sql to recreate everything.
--
-- Needed once when upgrading from an earlier schema where `activities`
-- and `comments` had different columns — CREATE TABLE IF NOT EXISTS won't
-- alter an existing table, so the columns must be recreated.

drop table if exists public.favorite_shows cascade;
drop table if exists public.reports cascade;
drop table if exists public.blocks cascade;
drop table if exists public.comment_votes cascade;
drop table if exists public.character_votes cascade;
drop table if exists public.push_tokens cascade;
drop table if exists public.watched_episodes cascade;
drop table if exists public.comments cascade;
drop table if exists public.activities cascade;
drop table if exists public.follows cascade;
drop table if exists public.profile_contacts cascade;
drop table if exists public.profiles cascade;

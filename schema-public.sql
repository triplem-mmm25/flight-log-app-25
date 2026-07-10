-- ============================================================
-- Travelers Log - public sharing
-- Run this ONCE in the Supabase SQL editor (SQL -> New query -> Run).
-- It is safe to run again; every statement is guarded.
--
-- What it does:
--   1. Creates a "profiles" table holding, per user, a public on/off
--      switch, a random share slug, and an optional display name.
--   2. Turns on row-level security (RLS) so:
--        - a signed-in user can read and change only their OWN profile
--        - ANYONE (even signed-out visitors) can read profiles that are public
--        - ANYONE can read the FLIGHTS of accounts that are public,
--          and only read them (no insert / update / delete)
-- ============================================================

create table if not exists profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  share_slug   text unique,
  display_name text,
  is_public    boolean not null default false,
  created_at   timestamptz default now()
);

-- holds your settings (profile name, goals, home airport, bucket list,
-- manually added countries, last tab) so they follow you across devices
alter table profiles add column if not exists prefs jsonb;

alter table profiles enable row level security;

-- --- profiles policies ---------------------------------------------------

-- a signed-in user can read their own profile row
drop policy if exists "own profile read" on profiles;
create policy "own profile read" on profiles
  for select using (auth.uid() = user_id);

-- anyone can read a profile row that is marked public
drop policy if exists "public profile read" on profiles;
create policy "public profile read" on profiles
  for select using (is_public = true);

-- a signed-in user can create their own profile row
drop policy if exists "own profile insert" on profiles;
create policy "own profile insert" on profiles
  for insert with check (auth.uid() = user_id);

-- a signed-in user can update only their own profile row
drop policy if exists "own profile update" on profiles;
create policy "own profile update" on profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- --- flights policy: public READ for public accounts ---------------------
-- This ADDS a read path. Your existing "users see their own rows" policy
-- stays as-is. Because RLS policies are OR-ed, a flight row is readable if
-- it is yours OR its owner is public. There is no public insert/update/delete
-- policy, so the public can never change anything.

drop policy if exists "public flights read" on flights;
create policy "public flights read" on flights
  for select using (
    user_id in (select user_id from profiles where is_public = true)
  );

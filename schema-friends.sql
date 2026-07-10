-- ============================================================
-- Travelers Log - friends & comparison
-- Run this ONCE in the Supabase SQL editor (SQL -> New query -> Run).
-- Safe to run again; every statement is guarded.
--
-- What it does:
--   1. friend_stats: a small, deliberately shareable row per user
--      (display name, avatar, totals, and the list of country codes
--      visited). Friends can read this. It never contains your flight
--      details, dates, routes, or your private profile (DOB, etc).
--   2. friendships: friend requests and accepted friendships, with RLS
--      so you can only ever see rows you are part of.
--   3. friend_find(email): a safe lookup so you can send a request by
--      email without being able to read anyone's data.
-- ============================================================

create extension if not exists pgcrypto;

-- --- shareable stats -----------------------------------------------------
create table if not exists friend_stats (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb,
  updated_at timestamptz default now()
);
alter table friend_stats enable row level security;

-- --- friendships ---------------------------------------------------------
create table if not exists friendships (
  id             uuid primary key default gen_random_uuid(),
  requester      uuid not null references auth.users(id) on delete cascade,
  addressee      uuid not null references auth.users(id) on delete cascade,
  requester_name text,
  addressee_name text,
  status         text not null default 'pending',   -- 'pending' | 'accepted'
  created_at     timestamptz default now(),
  unique (requester, addressee)
);
alter table friendships enable row level security;

-- --- friendships policies ------------------------------------------------
-- see only rows you are part of
drop policy if exists "friendship read" on friendships;
create policy "friendship read" on friendships
  for select using (auth.uid() = requester or auth.uid() = addressee);

-- you can only create requests where you are the requester
drop policy if exists "friendship insert" on friendships;
create policy "friendship insert" on friendships
  for insert with check (auth.uid() = requester);

-- only the addressee can accept (update the row)
drop policy if exists "friendship update" on friendships;
create policy "friendship update" on friendships
  for update using (auth.uid() = addressee) with check (auth.uid() = addressee);

-- either party can delete (decline / cancel / unfriend)
drop policy if exists "friendship delete" on friendships;
create policy "friendship delete" on friendships
  for delete using (auth.uid() = requester or auth.uid() = addressee);

-- --- friend_stats policies -----------------------------------------------
-- you can read and write your own stats
drop policy if exists "own stats" on friend_stats;
create policy "own stats" on friend_stats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- accepted friends can READ your stats (nothing else)
drop policy if exists "friends read stats" on friend_stats;
create policy "friends read stats" on friend_stats
  for select using (
    exists (
      select 1 from friendships f
      where f.status = 'accepted'
        and ( (f.requester = auth.uid() and f.addressee = friend_stats.user_id)
           or (f.addressee = auth.uid() and f.requester = friend_stats.user_id) )
    )
  );

-- --- safe email lookup ---------------------------------------------------
-- Returns just the id and a display name for an exact email match, so you
-- can send a request. Runs as owner (security definer) but reveals nothing
-- beyond what is needed to add a friend.
create or replace function friend_find(p_email text)
returns table (uid uuid, name text)
language sql
security definer
set search_path = public
as $$
  select u.id,
         coalesce(s.data->>'name', split_part(u.email, '@', 1))
  from auth.users u
  left join friend_stats s on s.user_id = u.id
  where lower(u.email) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function friend_find(text) from public;
grant execute on function friend_find(text) to authenticated;

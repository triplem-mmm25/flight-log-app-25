-- Flight Log · Supabase schema
-- Run this once in the Supabase SQL editor (Dashboard -> SQL -> New query -> paste -> Run).

create table if not exists flights (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  flight_date date not null,
  from_iata   text not null,
  to_iata     text not null,
  airline     text,
  created_at  timestamptz not null default now()
);

-- Each user can only see and change their own rows.
alter table flights enable row level security;

drop policy if exists "own rows: select" on flights;
drop policy if exists "own rows: insert" on flights;
drop policy if exists "own rows: update" on flights;
drop policy if exists "own rows: delete" on flights;

create policy "own rows: select" on flights for select using  (auth.uid() = user_id);
create policy "own rows: insert" on flights for insert with check (auth.uid() = user_id);
create policy "own rows: update" on flights for update using  (auth.uid() = user_id);
create policy "own rows: delete" on flights for delete using  (auth.uid() = user_id);

create index if not exists flights_user_date_idx on flights (user_id, flight_date);

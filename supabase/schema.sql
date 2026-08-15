-- Run once in the Supabase SQL editor (Dashboard → SQL → New query).

create table if not exists worksheets (
  id uuid primary key default gen_random_uuid(),
  athlete_name text not null,
  athlete_email text not null default '',
  payload jsonb not null,
  filled_moves int not null default 0,
  updated_at timestamptz not null default now(),
  unique (athlete_name, athlete_email)
);

alter table worksheets enable row level security;

-- Prototype: anon can read/write (small trusted tester group).
-- Tighten with Auth + stricter policies before a public launch.
drop policy if exists "anon_select" on worksheets;
drop policy if exists "anon_insert" on worksheets;
drop policy if exists "anon_update" on worksheets;

create policy "anon_select" on worksheets
  for select to anon using (true);

create policy "anon_insert" on worksheets
  for insert to anon with check (true);

create policy "anon_update" on worksheets
  for update to anon using (true) with check (true);

-- Team coach log. One shared row. Signed-in Google users can read and write it.
-- Run in Supabase → SQL Editor after Google sign-in is enabled.

create table if not exists coach_logs (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table coach_logs enable row level security;

drop policy if exists "coach_logs_select" on coach_logs;
drop policy if exists "coach_logs_insert" on coach_logs;
drop policy if exists "coach_logs_update" on coach_logs;

create policy "coach_logs_select" on coach_logs
  for select to authenticated using (true);

create policy "coach_logs_insert" on coach_logs
  for insert to authenticated with check (true);

create policy "coach_logs_update" on coach_logs
  for update to authenticated using (true) with check (true);

grant select, insert, update on table coach_logs to authenticated;

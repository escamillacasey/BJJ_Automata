-- Run in the Supabase SQL editor.
-- Identity = athlete_name + athlete_email + pin_hash (PIN never stored in plaintext).

create table if not exists worksheets (
  id uuid primary key default gen_random_uuid(),
  athlete_name text not null,
  athlete_email text not null default '',
  pin_hash text not null,
  payload jsonb not null,
  filled_moves int not null default 0,
  updated_at timestamptz not null default now(),
  unique (athlete_name, athlete_email, pin_hash)
);

-- Migrate from older name+email-only unique (safe if already on new schema)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'worksheets' and column_name = 'pin_hash'
  ) then
    null;
  else
    alter table worksheets add column pin_hash text;
  end if;
end $$;

alter table worksheets
  alter column pin_hash set default '';

update worksheets set pin_hash = '' where pin_hash is null;

alter table worksheets
  alter column pin_hash set not null;

-- Replace unique key with PIN-aware identity
alter table worksheets drop constraint if exists worksheets_athlete_name_athlete_email_key;
alter table worksheets drop constraint if exists worksheets_athlete_name_athlete_email_pin_hash_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'worksheets_athlete_name_athlete_email_pin_hash_key'
  ) then
    alter table worksheets
      add constraint worksheets_athlete_name_athlete_email_pin_hash_key
      unique (athlete_name, athlete_email, pin_hash);
  end if;
end $$;

alter table worksheets enable row level security;

drop policy if exists "anon_select" on worksheets;
drop policy if exists "anon_insert" on worksheets;
drop policy if exists "anon_update" on worksheets;

create policy "anon_select" on worksheets
  for select to anon using (true);

create policy "anon_insert" on worksheets
  for insert to anon with check (true);

create policy "anon_update" on worksheets
  for update to anon using (true) with check (true);

create policy "anon_delete" on worksheets
  for delete to anon using (true);

-- Rows with empty pin_hash are legacy / unusable for Load — clear or re-save with a PIN.

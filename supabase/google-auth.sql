-- Google Auth: one sheet per auth user + RLS for signed-in sessions.
-- Run in Supabase → SQL Editor after enabling Google provider.

alter table worksheets
  add column if not exists user_id uuid;

create unique index if not exists worksheets_user_id_uidx
  on worksheets (user_id)
  where user_id is not null;

-- Signed-in users use the `authenticated` role (not `anon`).
-- Keep open anon policies so Admin can still list sheets with the publishable key.

drop policy if exists "authenticated_select" on worksheets;
drop policy if exists "authenticated_insert" on worksheets;
drop policy if exists "authenticated_update" on worksheets;
drop policy if exists "authenticated_delete" on worksheets;

create policy "authenticated_select" on worksheets
  for select to authenticated using (true);

create policy "authenticated_insert" on worksheets
  for insert to authenticated with check (true);

create policy "authenticated_update" on worksheets
  for update to authenticated using (true) with check (true);

create policy "authenticated_delete" on worksheets
  for delete to authenticated using (true);

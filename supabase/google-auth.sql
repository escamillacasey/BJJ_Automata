-- Google Auth: one sheet per auth user.
-- Run in Supabase → SQL Editor after enabling Google provider.

alter table worksheets
  add column if not exists user_id uuid;

create unique index if not exists worksheets_user_id_uidx
  on worksheets (user_id)
  where user_id is not null;

-- Keep existing anon policies for Admin listing (prototype).
-- Authenticated users still work through the publishable key + JWT.

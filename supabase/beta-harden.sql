-- Beta harden: stop anonymous writes; keep anon read for Admin.
-- Run once in Supabase → SQL Editor before sharing with friends.

drop policy if exists "anon_insert" on worksheets;
drop policy if exists "anon_update" on worksheets;
drop policy if exists "anon_delete" on worksheets;

-- Optional: remove orphan PIN-era duplicates that never linked to Google
-- (keeps any row that already has user_id).
-- Uncomment if you want a cleaner Admin list:
-- delete from worksheets where user_id is null and filled_moves > 0;

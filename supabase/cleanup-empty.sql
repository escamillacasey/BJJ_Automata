-- Cleanup empty sheets + allow anon delete for coach maintenance.
-- Run once in Supabase → SQL Editor.

drop policy if exists "anon_delete" on worksheets;
create policy "anon_delete" on worksheets
  for delete to anon using (true);

-- Remove rows with no moves (and anything already marked obsolete-empty)
delete from worksheets
where filled_moves = 0
   or athlete_name like '__obsolete__%';
   or pin_hash like 'obsolete-empty-%';

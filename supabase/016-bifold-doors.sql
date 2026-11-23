-- 016: "Bi-fold door" opening type with a panel count (each panel counts as a door).
-- Run once; safe to re-run.
alter table public.openings add column if not exists door_count integer;
alter table public.openings drop constraint if exists openings_opening_type_check;
alter table public.openings add constraint openings_opening_type_check
  check (opening_type in ('single_door', 'double_door', 'bifold_door', 'window', 'other'));

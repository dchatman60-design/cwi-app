-- 013: allow the "Other" opening type the app already offers (bi-folds, sliders, …).
-- Run once; safe to re-run.
alter table public.openings drop constraint if exists openings_opening_type_check;
alter table public.openings add constraint openings_opening_type_check
  check (opening_type in ('single_door', 'double_door', 'window', 'other'));

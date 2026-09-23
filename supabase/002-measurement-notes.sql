-- =====================================================================
-- CWI App — measurement notes (run once in Supabase → SQL Editor; safe to re-run)
--
-- Lets each measurement carry a type / condition note (e.g. "Water return",
-- "Automatic", "Sticking — adjust", "Casement") and allows note-only
-- entries with no number (surface bolt condition, window type, …).
-- =====================================================================

alter table public.measurements add column if not exists note text;
alter table public.measurements alter column value_confirmed drop not null;

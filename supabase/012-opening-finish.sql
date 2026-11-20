-- 012: finish per door (Brass, Dark bronze, …) — printed into the proposal's
-- weatherstrip / threshold / sill cover / sweep lines. Run once; safe to re-run.
alter table public.openings add column if not exists finish text;

-- =====================================================================
-- CWI App — scope of work per door, for the customer proposal
-- Run once in Supabase → SQL Editor. Safe to re-run.
--
-- The proposal lists each door (doors with the same scope grouped) with what
-- is being done — "Furnish and install weatherstripping", "… door sweeps" —
-- and one Total Job price. No per-door prices.
-- =====================================================================

alter table public.openings add column if not exists scope_items text[] not null default '{}';

-- =====================================================================
-- CWI App — proposal fields to match the printed CWI proposal
-- Run once in Supabase → SQL Editor. Safe to re-run.
--   proposal_date  the DATE printed on the proposal (blank = day created)
--   scope_intro    the line under SCOPE OF WORK (blank = "Furnish and
--                  install weatherstrip")
--   show_details   list products, quantities and diagrams under each door
-- =====================================================================

alter table public.quotes add column if not exists proposal_date date;
alter table public.quotes add column if not exists scope_intro text;
alter table public.quotes add column if not exists show_details boolean not null default false;

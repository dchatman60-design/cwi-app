-- 015: a customer-facing clarification printed under "Total Job" (what the price counts).
-- Run once; safe to re-run.
alter table public.quotes add column if not exists total_note text;

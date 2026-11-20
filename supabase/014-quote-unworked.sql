-- 014: list the openings with no work on the proposal, with a recommendation note.
-- Run once; safe to re-run.
alter table public.quotes add column if not exists show_unworked boolean not null default false;
alter table public.quotes add column if not exists unworked_note text;

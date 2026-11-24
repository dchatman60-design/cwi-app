-- 017: option / add-on quotes list only the doors that have lines on that quote,
-- described by those lines (not the doors' main scope). Run once; safe to re-run.
alter table public.quotes add column if not exists items_only boolean not null default false;

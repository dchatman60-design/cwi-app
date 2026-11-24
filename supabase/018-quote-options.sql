-- 018: link option / add-on quotes to the main quote they belong to.
-- Run once; safe to re-run.
alter table public.quotes add column if not exists parent_quote_id uuid references public.quotes(id) on delete set null;
create index if not exists quotes_parent_quote_id_idx on public.quotes(parent_quote_id);

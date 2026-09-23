alter table public.transport_order_cargo add column if not exists source_type text;
alter table public.transport_order_cargo add column if not exists source_id uuid;
alter table public.transport_order_cargo add column if not exists source_line_id uuid;
create index if not exists transport_order_cargo_source_idx on public.transport_order_cargo(source_type,source_id);
comment on column public.transport_order_cargo.source_type is 'Optional canonical source record: WAREHOUSE_RECEIPT or CARGO_RELEASE';
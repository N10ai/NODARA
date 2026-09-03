alter table public.inventory_items
  add column if not exists owner_entity_id uuid references public.entities(id) on delete set null;

create index if not exists inventory_items_owner_entity_idx
  on public.inventory_items(owner_entity_id);

create sequence if not exists public.nodara_internal_item_seq start with 100001;

create or replace function public.generate_nodara_item_identifiers()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  n bigint;
  sku text;
  barcode text;
begin
  n := nextval('public.nodara_internal_item_seq');
  sku := 'NOD-' || lpad(n::text,8,'0');
  barcode := 'ND' || lpad(n::text,10,'0');
  return jsonb_build_object('sku',sku,'barcode',barcode,'symbology','CODE128');
end $$;

create table if not exists public.entity_relationships(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,entity_id uuid not null references public.entities(id) on delete restrict,
 related_entity_id uuid not null references public.entities(id) on delete restrict,relationship_type text not null,notes text,active boolean not null default true,
 metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(entity_id<>related_entity_id),unique(organization_id,entity_id,related_entity_id,relationship_type));
create index if not exists entity_relationships_entity_idx on public.entity_relationships(organization_id,entity_id,active);
alter table public.entity_relationships enable row level security;
drop policy if exists entity_relationships_org on public.entity_relationships;
create policy entity_relationships_org on public.entity_relationships for all using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));

create or replace function public.nodara_customer_inventory(p_organization_id uuid,p_customer_id uuid)
returns table(inventory_item_id uuid,sku text,part_number text,description text,quantity numeric,reserved numeric,available numeric,locations integer,last_updated timestamptz)
language sql stable security invoker as $$
 select i.id,i.sku,i.part_number,i.description,coalesce(sum(b.quantity_base),0),coalesce(sum(b.quantity_reserved),0),
 coalesce(sum(b.quantity_base-b.quantity_reserved),0),count(distinct coalesce(b.warehouse_location_id,b.location_id))::int,max(b.updated_at)
 from public.inventory_items i join public.inventory_balances b on b.inventory_item_id=i.id and b.organization_id=p_organization_id
 where i.organization_id=p_organization_id and coalesce(i.owner_entity_id,i.entity_id)=p_customer_id
 group by i.id,i.sku,i.part_number,i.description having coalesce(sum(b.quantity_base),0)<>0 order by max(b.updated_at) desc;
$$;

create or replace function public.nodara_customer_receipts(p_organization_id uuid,p_customer_id uuid,p_limit integer default 12)
returns table(id uuid,reference text,status text,created_at timestamptz) language sql stable security invoker as $$
 select w.id,w.receipt_number,w.status::text,w.created_at from public.warehouse_receipts w join public.jobs j on j.id=w.job_id
 where w.organization_id=p_organization_id and j.customer_id=p_customer_id order by w.created_at desc limit p_limit;
$$;
create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  cargo_unit_id uuid not null references public.cargo_units(id) on delete restrict,
  transaction_type text not null check(transaction_type in ('MOVE','ADJUST','HOLD','RELEASE_HOLD','CYCLE_COUNT','SPLIT')),
  quantity_before numeric,
  quantity_after numeric,
  from_location_id uuid references public.warehouse_locations(id) on delete set null,
  to_location_id uuid references public.warehouse_locations(id) on delete set null,
  status_before text,
  status_after text,
  reason text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists inventory_transactions_org_created_idx on public.inventory_transactions(organization_id,created_at desc);
create index if not exists inventory_transactions_cargo_idx on public.inventory_transactions(cargo_unit_id,created_at desc);

alter table public.inventory_transactions enable row level security;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='inventory_transactions' and policyname='inventory_transactions_authenticated') then
    create policy inventory_transactions_authenticated on public.inventory_transactions for all to authenticated using(true) with check(true);
  end if;
end $$;

create or replace function public.inventory_move(p_cargo_unit_id uuid,p_to_location_id uuid,p_reason text default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c record; org uuid;
begin
  select * into c from public.cargo_units where id=p_cargo_unit_id for update;
  if c.id is null then raise exception 'Cargo unit not found'; end if;
  org:=public.bootstrap_workspace('NODARA Workspace');
  insert into public.inventory_transactions(organization_id,cargo_unit_id,transaction_type,quantity_before,quantity_after,from_location_id,to_location_id,status_before,status_after,reason,notes)
  values(org,c.id,'MOVE',c.quantity,c.quantity,c.warehouse_location_id,p_to_location_id,c.status,c.status,p_reason,p_notes);
  update public.cargo_units set warehouse_location_id=p_to_location_id where id=c.id;
  return jsonb_build_object('id',c.id,'location_id',p_to_location_id);
end $$;

create or replace function public.inventory_adjust(p_cargo_unit_id uuid,p_new_quantity numeric,p_reason text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c record; org uuid;
begin
  if p_new_quantity < 0 then raise exception 'Quantity cannot be negative'; end if;
  select * into c from public.cargo_units where id=p_cargo_unit_id for update;
  if c.id is null then raise exception 'Cargo unit not found'; end if;
  org:=public.bootstrap_workspace('NODARA Workspace');
  insert into public.inventory_transactions(organization_id,cargo_unit_id,transaction_type,quantity_before,quantity_after,from_location_id,to_location_id,status_before,status_after,reason,notes)
  values(org,c.id,'ADJUST',c.quantity,p_new_quantity,c.warehouse_location_id,c.warehouse_location_id,c.status,case when p_new_quantity=0 then 'DEPLETED' else c.status end,p_reason,p_notes);
  update public.cargo_units set quantity=p_new_quantity,status=case when p_new_quantity=0 then 'DEPLETED' else status end where id=c.id;
  return jsonb_build_object('id',c.id,'quantity',p_new_quantity);
end $$;

create or replace function public.inventory_set_hold(p_cargo_unit_id uuid,p_hold boolean,p_reason text default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c record; org uuid; ns text; tt text;
begin
  select * into c from public.cargo_units where id=p_cargo_unit_id for update;
  if c.id is null then raise exception 'Cargo unit not found'; end if;
  ns:=case when p_hold then 'HOLD' else 'AVAILABLE' end;
  tt:=case when p_hold then 'HOLD' else 'RELEASE_HOLD' end;
  org:=public.bootstrap_workspace('NODARA Workspace');
  insert into public.inventory_transactions(organization_id,cargo_unit_id,transaction_type,quantity_before,quantity_after,from_location_id,to_location_id,status_before,status_after,reason,notes)
  values(org,c.id,tt,c.quantity,c.quantity,c.warehouse_location_id,c.warehouse_location_id,c.status,ns,p_reason,p_notes);
  update public.cargo_units set status=ns where id=c.id;
  return jsonb_build_object('id',c.id,'status',ns);
end $$;

create or replace function public.inventory_cycle_count(p_cargo_unit_id uuid,p_counted_quantity numeric,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c record; org uuid;
begin
  if p_counted_quantity < 0 then raise exception 'Counted quantity cannot be negative'; end if;
  select * into c from public.cargo_units where id=p_cargo_unit_id for update;
  if c.id is null then raise exception 'Cargo unit not found'; end if;
  org:=public.bootstrap_workspace('NODARA Workspace');
  insert into public.inventory_transactions(organization_id,cargo_unit_id,transaction_type,quantity_before,quantity_after,from_location_id,to_location_id,status_before,status_after,reason,notes)
  values(org,c.id,'CYCLE_COUNT',c.quantity,p_counted_quantity,c.warehouse_location_id,c.warehouse_location_id,c.status,c.status,'Cycle count',p_notes);
  update public.cargo_units set quantity=p_counted_quantity where id=c.id;
  return jsonb_build_object('id',c.id,'quantity',p_counted_quantity,'variance',p_counted_quantity-c.quantity);
end $$;

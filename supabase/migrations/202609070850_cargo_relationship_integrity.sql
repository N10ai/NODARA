create or replace function public.nodara_assert_transaction_target(p_org uuid,p_type text,p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_type text:=upper(coalesce(p_type,''));
begin
 if p_id is null then raise exception 'Transaction target is required'; end if;
 if v_type='SHIPMENT' then
  if not exists(select 1 from public.shipments where id=p_id and organization_id=p_org) then raise exception 'Shipment target not found in this workspace'; end if;
 elsif v_type='TRANSPORT_ORDER' then
  if not exists(select 1 from public.transport_orders where id=p_id and organization_id=p_org) then raise exception 'Transport Order target not found in this workspace'; end if;
 elsif v_type='WAREHOUSE_RECEIPT' then
  if not exists(select 1 from public.warehouse_receipts where id=p_id and organization_id=p_org) then raise exception 'Warehouse Receipt target not found in this workspace'; end if;
 elsif v_type='CARGO_RELEASE' then
  if not exists(select 1 from public.cargo_releases where id=p_id and organization_id=p_org) then raise exception 'Cargo Release target not found in this workspace'; end if;
 else
  raise exception 'Unsupported cargo transaction type: %',p_type;
 end if;
end $$;

create or replace function public.nodara_guard_cargo_assignment()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_cargo_org uuid;
begin
 if not public.nodara_is_org_member(new.organization_id) then raise exception 'Workspace access denied'; end if;
 select organization_id into v_cargo_org from public.cargo_objects where id=new.cargo_object_id;
 if v_cargo_org is null then raise exception 'Cargo object not found'; end if;
 if v_cargo_org<>new.organization_id then raise exception 'Cargo object belongs to a different workspace'; end if;
 perform public.nodara_assert_transaction_target(new.organization_id,new.transaction_type,new.transaction_id);
 new.updated_at:=now();
 return new;
end $$;
drop trigger if exists trg_nodara_guard_cargo_assignment on public.cargo_assignments;
create trigger trg_nodara_guard_cargo_assignment before insert or update on public.cargo_assignments for each row execute function public.nodara_guard_cargo_assignment();

create or replace function public.nodara_guard_cargo_object()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_parent_org uuid; v_owner_org uuid; v_type text;
begin
 if not public.nodara_is_org_member(new.organization_id) then raise exception 'Workspace access denied'; end if;
 if coalesce(new.quantity,0)<0 then raise exception 'Cargo quantity cannot be negative'; end if;
 if upper(coalesce(new.source_type,''))='TRANSACTION' and coalesce(new.quantity,0)<=0 then raise exception 'Transaction cargo quantity must be greater than zero'; end if;
 if coalesce(new.gross_weight,0)<0 or coalesce(new.length,0)<0 or coalesce(new.width,0)<0 or coalesce(new.height,0)<0 or coalesce(new.volume_cbm,0)<0 then raise exception 'Cargo measurements cannot be negative'; end if;
 if new.parent_cargo_id is not null then
  select organization_id into v_parent_org from public.cargo_objects where id=new.parent_cargo_id;
  if v_parent_org is null then raise exception 'Parent cargo object not found'; end if;
  if v_parent_org<>new.organization_id then raise exception 'Parent cargo belongs to a different workspace'; end if;
 end if;
 if new.owner_entity_id is not null then
  select organization_id into v_owner_org from public.entities where id=new.owner_entity_id;
  if v_owner_org is null or v_owner_org<>new.organization_id then raise exception 'Cargo owner entity belongs to a different workspace'; end if;
 end if;
 if upper(coalesce(new.source_type,''))='TRANSACTION' then
  v_type:=upper(coalesce(new.metadata->>'transaction_type',''));
  perform public.nodara_assert_transaction_target(new.organization_id,v_type,new.source_id);
 end if;
 new.updated_at:=now();
 return new;
end $$;
drop trigger if exists trg_nodara_guard_cargo_object on public.cargo_objects;
create trigger trg_nodara_guard_cargo_object before insert or update on public.cargo_objects for each row execute function public.nodara_guard_cargo_object();

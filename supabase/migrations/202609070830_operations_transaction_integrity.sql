create or replace function public.nodara_assert_entity_in_org(p_org uuid,p_entity uuid,p_label text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_entity is null then return; end if;
 if not exists(select 1 from public.entities e where e.id=p_entity and e.organization_id=p_org) then raise exception '% does not belong to this workspace',coalesce(p_label,'Entity'); end if;
end $$;

create or replace function public.nodara_next_shipment_number(p_org uuid,p_mode text)
returns text language plpgsql security definer set search_path=public as $$
declare v_prefix text; v_n int; v_candidate text;
begin
 if not public.nodara_is_org_member(p_org) then raise exception 'Workspace access denied'; end if;
 v_prefix:=case upper(coalesce(p_mode,'')) when 'AIR' then 'AIR' when 'OCEAN' then 'OCN' when 'GROUND' then 'GRD' else 'SHP' end||'-'||to_char(current_date,'YYMM')||'-';
 perform pg_advisory_xact_lock(hashtextextended('NODARA_SHIPMENT_NO:'||p_org::text||':'||v_prefix,0));
 select coalesce(max((regexp_match(shipment_number,'^'||v_prefix||'([0-9]+)$'))[1]::int),0)+1 into v_n from public.shipments where organization_id=p_org and shipment_number like v_prefix||'%';
 loop v_candidate:=v_prefix||lpad(v_n::text,4,'0'); exit when not exists(select 1 from public.shipments where organization_id=p_org and shipment_number=v_candidate); v_n:=v_n+1; end loop;
 return v_candidate;
end $$;

create or replace function public.nodara_next_transport_order_number(p_org uuid,p_type text)
returns text language plpgsql security definer set search_path=public as $$
declare v_prefix text; v_n int; v_candidate text;
begin
 if not public.nodara_is_org_member(p_org) then raise exception 'Workspace access denied'; end if;
 v_prefix:=case upper(coalesce(p_type,'')) when 'PICKUP' then 'PU' when 'DELIVERY' then 'DL' when 'TRANSFER' then 'TR' when 'DRAYAGE' then 'DR' else 'TO' end||'-'||to_char(current_date,'YYMM')||'-';
 perform pg_advisory_xact_lock(hashtextextended('NODARA_TRANSPORT_NO:'||p_org::text||':'||v_prefix,0));
 select coalesce(max((regexp_match(order_number,'^'||v_prefix||'([0-9]+)$'))[1]::int),0)+1 into v_n from public.transport_orders where organization_id=p_org and order_number like v_prefix||'%';
 loop v_candidate:=v_prefix||lpad(v_n::text,4,'0'); exit when not exists(select 1 from public.transport_orders where organization_id=p_org and order_number=v_candidate); v_n:=v_n+1; end loop;
 return v_candidate;
end $$;

create or replace function public.nodara_guard_shipment_write()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if not public.nodara_is_org_member(new.organization_id) then raise exception 'Workspace access denied'; end if;
 perform public.nodara_assert_entity_in_org(new.organization_id,new.customer_id,'Customer');
 perform public.nodara_assert_entity_in_org(new.organization_id,new.shipper_id,'Shipper');
 perform public.nodara_assert_entity_in_org(new.organization_id,new.consignee_id,'Consignee');
 perform public.nodara_assert_entity_in_org(new.organization_id,new.carrier_id,'Carrier');
 if coalesce(new.pieces,0)<0 or coalesce(new.weight,0)<0 or coalesce(new.volume_cbm,0)<0 then raise exception 'Shipment quantities and measurements cannot be negative'; end if;
 if tg_op='INSERT' then
   if nullif(btrim(new.shipment_number),'') is null then new.shipment_number:=public.nodara_next_shipment_number(new.organization_id,new.mode);
   elsif new.shipment_number ~ '^(AIR|OCN|GRD)-[0-9]{6}-[0-9]{4}$' then
     perform pg_advisory_xact_lock(hashtextextended('NODARA_SHIPMENT_CLIENT_NO:'||new.organization_id::text||':'||new.shipment_number,0));
     if exists(select 1 from public.shipments s where s.organization_id=new.organization_id and s.shipment_number=new.shipment_number) then new.shipment_number:=public.nodara_next_shipment_number(new.organization_id,new.mode); end if;
   end if;
 end if;
 new.updated_at:=now(); return new;
end $$;
drop trigger if exists trg_nodara_guard_shipment_write on public.shipments;
create trigger trg_nodara_guard_shipment_write before insert or update on public.shipments for each row execute function public.nodara_guard_shipment_write();

create or replace function public.nodara_guard_transport_order_write()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if not public.nodara_is_org_member(new.organization_id) then raise exception 'Workspace access denied'; end if;
 perform public.nodara_assert_entity_in_org(new.organization_id,new.customer_id,'Customer');
 perform public.nodara_assert_entity_in_org(new.organization_id,new.carrier_id,'Carrier');
 perform public.nodara_assert_entity_in_org(new.organization_id,new.pickup_entity_id,'Pickup entity');
 perform public.nodara_assert_entity_in_org(new.organization_id,new.delivery_entity_id,'Delivery entity');
 if coalesce(new.pieces,0)<0 or coalesce(new.weight,0)<0 or coalesce(new.sell_amount,0)<0 or coalesce(new.buy_amount,0)<0 then raise exception 'Transport quantities and amounts cannot be negative'; end if;
 if tg_op='INSERT' then
   if nullif(btrim(new.order_number),'') is null then new.order_number:=public.nodara_next_transport_order_number(new.organization_id,new.order_type);
   elsif new.order_number ~ '^(PU|DL|TR|DR)-[0-9]{6}-[0-9]{4}$' then
     perform pg_advisory_xact_lock(hashtextextended('NODARA_TRANSPORT_CLIENT_NO:'||new.organization_id::text||':'||new.order_number,0));
     if exists(select 1 from public.transport_orders t where t.organization_id=new.organization_id and t.order_number=new.order_number) then new.order_number:=public.nodara_next_transport_order_number(new.organization_id,new.order_type); end if;
   end if;
 end if;
 new.updated_at:=now(); return new;
end $$;
drop trigger if exists trg_nodara_guard_transport_order_write on public.transport_orders;
create trigger trg_nodara_guard_transport_order_write before insert or update on public.transport_orders for each row execute function public.nodara_guard_transport_order_write();

create or replace function public.nodara_guard_shipment_delete()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if not public.nodara_is_org_member(old.organization_id) then raise exception 'Workspace access denied'; end if;
 if exists(select 1 from public.consolidation_houses ch where ch.shipment_id=old.id) then raise exception 'Shipment % is linked to consolidation house records and cannot be deleted until those links are removed',old.shipment_number; end if;
 return old;
end $$;
drop trigger if exists trg_nodara_guard_shipment_delete on public.shipments;
create trigger trg_nodara_guard_shipment_delete before delete on public.shipments for each row execute function public.nodara_guard_shipment_delete();

create or replace function public.delete_transport_orders_safe(p_ids uuid[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_deleted int;
begin
 select organization_id into v_org from public.organization_members where user_id=auth.uid() order by created_at limit 1;
 if v_org is null then raise exception 'No workspace found'; end if;
 delete from public.transport_orders where organization_id=v_org and id=any(coalesce(p_ids,'{}'::uuid[])); get diagnostics v_deleted=row_count;
 return jsonb_build_object('deleted',v_deleted);
end $$;

create or replace function public.delete_shipments_safe(p_ids uuid[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_deleted int; v_blocked jsonb;
begin
 select organization_id into v_org from public.organization_members where user_id=auth.uid() order by created_at limit 1;
 if v_org is null then raise exception 'No workspace found'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'shipment_number',s.shipment_number)),'[]'::jsonb) into v_blocked from public.shipments s where s.organization_id=v_org and s.id=any(coalesce(p_ids,'{}'::uuid[])) and exists(select 1 from public.consolidation_houses ch where ch.shipment_id=s.id);
 delete from public.shipments s where s.organization_id=v_org and s.id=any(coalesce(p_ids,'{}'::uuid[])) and not exists(select 1 from public.consolidation_houses ch where ch.shipment_id=s.id); get diagnostics v_deleted=row_count;
 return jsonb_build_object('deleted',v_deleted,'blocked',v_blocked);
end $$;

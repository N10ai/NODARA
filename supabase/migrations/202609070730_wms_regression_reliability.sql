-- WMS regression reliability baseline: WR -> warehouse inventory -> CR.
-- Makes warehouse_locations the canonical WMS location model while leaving legacy
-- locations/current_location_id columns untouched for compatibility.

alter table public.inventory_balances
  add column if not exists warehouse_location_id uuid
  references public.warehouse_locations(id) on delete restrict;

create unique index if not exists inventory_balances_org_item_whloc_lot_key
  on public.inventory_balances(organization_id,inventory_item_id,warehouse_location_id,lot_number) nulls not distinct;
create index if not exists inventory_balances_item_whloc_idx
  on public.inventory_balances(inventory_item_id,warehouse_location_id);

alter table public.cargo_release_lines
  add column if not exists release_source_warehouse_location_id uuid references public.warehouse_locations(id) on delete restrict,
  add column if not exists release_inventory_item_id uuid references public.inventory_items(id) on delete restrict,
  add column if not exists release_lot_number text;

create or replace function public.nodara_guard_location_capacity()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  j jsonb := to_jsonb(new);
  loc public.warehouse_locations%rowtype;
  used_positions numeric := 0;
  incoming_qty numeric := greatest(1,coalesce(nullif(j->>'quantity','')::numeric,1));
  pkg text := upper(coalesce(j->>'package_type',''));
  fit_count integer;
  used_loose numeric := 0;
begin
  if new.warehouse_location_id is null then return new; end if;
  if nullif(j->>'parent_id','') is not null then return new; end if;
  select * into loc from public.warehouse_locations where id=new.warehouse_location_id and active=true;
  if not found then raise exception 'Storage location is inactive or does not exist.'; end if;
  select coalesce(sum(greatest(1,coalesce(c.quantity,1))),0) into used_positions
  from public.cargo_units c
  where c.warehouse_location_id=new.warehouse_location_id
    and c.parent_id is null
    and c.id is distinct from new.id
    and upper(coalesce(c.status::text,'')) not in ('RELEASED','DELETED','CANCELLED','VOID','SHIPPED');
  if pkg in ('PALLET','SKID','CRATE') then
    if coalesce(loc.capacity,0)>0 and used_positions+incoming_qty>loc.capacity then
      raise exception 'Location % is full. Capacity: %, currently used: %, requested: %.',loc.code,loc.capacity,used_positions,incoming_qty;
    end if;
    return new;
  end if;
  fit_count:=public.nodara_dimensional_fit_count(new.warehouse_location_id,nullif(j->>'length_in','')::numeric,nullif(j->>'width_in','')::numeric,nullif(j->>'height_in','')::numeric);
  if fit_count is not null then
    used_loose:=used_positions;
    if used_loose+incoming_qty>fit_count then
      raise exception 'Cargo does not fit in location %. Dimensional capacity is approximately %, currently used %, requested %.',loc.code,fit_count,used_loose,incoming_qty;
    end if;
  elsif coalesce(loc.capacity,0)>0 and used_positions+incoming_qty>loc.capacity then
    raise exception 'Location % is full. Capacity: %, currently used: %, requested: %.',loc.code,loc.capacity,used_positions,incoming_qty;
  end if;
  return new;
end;$function$;

create or replace function public.insert_cargo_tree_node(p_org uuid,p_job uuid,p_wr uuid,p_parent uuid,p_node jsonb,p_path text default '')
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
 v_id uuid; v_type text:=upper(nullif(trim(coalesce(p_node->>'type','PACKAGE')),''));
 v_qty numeric:=coalesce((p_node->>'quantity')::numeric,1); v_sku text:=nullif(trim(p_node->>'sku'),'');
 v_part text:=nullif(trim(p_node->>'part_number'),''); v_desc text:=nullif(trim(p_node->>'description'),'');
 v_serial text:=nullif(trim(p_node->>'serial_number'),''); v_lot text:=nullif(trim(p_node->>'lot_number'),'');
 v_weight numeric:=nullif(p_node->>'weight_lb','')::numeric; v_l numeric:=nullif(p_node->>'length_in','')::numeric;
 v_w numeric:=nullif(p_node->>'width_in','')::numeric; v_h numeric:=nullif(p_node->>'height_in','')::numeric;
 v_uom text:=coalesce(nullif(trim(p_node->>'uom'),''),case when v_sku is not null or v_part is not null then 'EA' else v_type end);
 v_item uuid:=nullif(p_node->>'inventory_item_id','')::uuid; v_location uuid:=nullif(p_node->>'warehouse_location_id','')::uuid;
 v_child jsonb; v_index int:=0; v_status cargo_status;
begin
 if v_type is null then raise exception 'Package/item type is required'; end if;
 if v_qty<=0 then raise exception 'Quantity must be greater than zero for %',v_type; end if;
 if v_weight is not null and v_weight<0 then raise exception 'Weight cannot be negative'; end if;
 if (v_l is not null and v_l<=0) or (v_w is not null and v_w<=0) or (v_h is not null and v_h<=0) then raise exception 'Dimensions must be greater than zero'; end if;
 if v_serial is not null and v_qty<>1 then raise exception 'Serialized cargo must have quantity 1 per serial'; end if;
 v_status:=case when lower(coalesce(p_node->>'condition','good'))='damaged' then 'exception'::cargo_status else 'received'::cargo_status end;
 if v_location is not null and not exists(select 1 from warehouse_locations where id=v_location and organization_id=p_org and active=true) then raise exception 'Invalid or inactive warehouse location'; end if;
 if v_item is not null then
   select id,coalesce(v_sku,sku),coalesce(v_part,part_number),coalesce(v_desc,description),coalesce(nullif(v_uom,''),base_uom,'EA')
   into v_item,v_sku,v_part,v_desc,v_uom from inventory_items where id=v_item and organization_id=p_org;
   if v_item is null then raise exception 'Invalid Part Master item'; end if;
 end if;
 insert into cargo_units(organization_id,job_id,parent_id,handling_unit_code,uin,description,package_type,quantity,weight_lb,length_in,width_in,height_in,status,sku,part_number,serial_number,lot_number,uom,inventory_item_id,warehouse_location_id,metadata)
 values(p_org,p_job,p_parent,coalesce(nullif(p_node->>'code',''),v_type||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,6)),coalesce(nullif(p_node->>'uin',''),p_path||case when p_path='' then '' else '-' end||substr(replace(gen_random_uuid()::text,'-',''),1,8)),v_desc,v_type,v_qty,v_weight,v_l,v_w,v_h,v_status,v_sku,v_part,v_serial,v_lot,v_uom,v_item,v_location,jsonb_build_object('warehouse_receipt_id',p_wr,'condition',coalesce(p_node->>'condition','good'))||coalesce(p_node->'metadata','{}'::jsonb)) returning id into v_id;
 if v_item is not null and v_qty>0 then
   insert into inventory_balances(organization_id,inventory_item_id,warehouse_location_id,lot_number,quantity_base,quantity_reserved)
   values(p_org,v_item,v_location,v_lot,v_qty,0)
   on conflict (organization_id,inventory_item_id,warehouse_location_id,lot_number) do update set quantity_base=inventory_balances.quantity_base+excluded.quantity_base,updated_at=now();
 end if;
 if jsonb_typeof(p_node->'children')='array' then
   for v_child in select value from jsonb_array_elements(p_node->'children') loop
     v_index:=v_index+1;
     if nullif(v_child->>'warehouse_location_id','') is null and v_location is not null then v_child:=jsonb_set(v_child,'{warehouse_location_id}',to_jsonb(v_location::text),true); end if;
     perform public.insert_cargo_tree_node(p_org,p_job,p_wr,v_id,v_child,p_path||case when p_path='' then '' else '.' end||v_index::text);
   end loop;
 end if;
 return v_id;
end;$function$;

create or replace function public.update_wr_cargo_core(p_wr_id uuid,p_cargo_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_user uuid:=auth.uid(); v_org uuid; v_job uuid; v_old cargo_units%rowtype; d record; v_new_item uuid; v_new_qty numeric; v_new_lot text; v_new_loc uuid; v_is_root boolean;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 select wr.organization_id,wr.job_id into v_org,v_job from warehouse_receipts wr join organization_members om on om.organization_id=wr.organization_id where wr.id=p_wr_id and om.user_id=v_user limit 1;
 if v_org is null then raise exception 'Warehouse receipt not found'; end if;
 select * into v_old from cargo_units where id=p_cargo_id and organization_id=v_org and job_id=v_job;
 if not found then raise exception 'Cargo line not found on this WR'; end if;
 v_is_root:=v_old.parent_id is null;
 if exists(select 1 from cargo_release_lines l join cargo_releases r on r.id=l.cargo_release_id where l.cargo_unit_id=p_cargo_id and r.status<>'CANCELLED') then raise exception 'This cargo is already used by a Cargo Release and cannot be edited directly'; end if;
 v_new_item:=nullif(p_payload->>'inventory_item_id','')::uuid; v_new_qty:=greatest(1,coalesce(nullif(p_payload->>'quantity','')::numeric,v_old.quantity,1)); v_new_lot:=nullif(trim(p_payload->>'lot_number'),''); v_new_loc:=nullif(p_payload->>'warehouse_location_id','')::uuid;
 if v_new_loc is not null and not exists(select 1 from warehouse_locations where id=v_new_loc and organization_id=v_org and active=true) then raise exception 'Invalid or inactive warehouse location'; end if;
 if v_new_item is not null and not exists(select 1 from inventory_items where id=v_new_item and organization_id=v_org) then raise exception 'Invalid Part Master item'; end if;
 if v_old.inventory_item_id is not null then
   update inventory_balances set quantity_base=greatest(0,quantity_base-coalesce(v_old.quantity,0)),updated_at=now() where organization_id=v_org and inventory_item_id=v_old.inventory_item_id and warehouse_location_id is not distinct from v_old.warehouse_location_id and lot_number is not distinct from v_old.lot_number;
   delete from inventory_balances where organization_id=v_org and inventory_item_id=v_old.inventory_item_id and warehouse_location_id is not distinct from v_old.warehouse_location_id and lot_number is not distinct from v_old.lot_number and quantity_base<=0 and quantity_reserved<=0;
 end if;
 update cargo_units set package_type=coalesce(nullif(p_payload->>'package_type',''),package_type),quantity=v_new_qty,description=nullif(trim(p_payload->>'description'),''),inventory_item_id=v_new_item,part_number=nullif(trim(p_payload->>'part_number'),''),sku=nullif(trim(p_payload->>'sku'),''),lot_number=v_new_lot,serial_number=nullif(trim(p_payload->>'serial_number'),''),weight_lb=nullif(p_payload->>'weight_lb','')::numeric,length_in=nullif(p_payload->>'length_in','')::numeric,width_in=nullif(p_payload->>'width_in','')::numeric,height_in=nullif(p_payload->>'height_in','')::numeric,warehouse_location_id=v_new_loc,metadata=coalesce(p_payload->'metadata','{}'::jsonb),updated_at=now() where id=p_cargo_id;
 if v_new_item is not null then
   insert into inventory_balances(organization_id,inventory_item_id,warehouse_location_id,lot_number,quantity_base,quantity_reserved) values(v_org,v_new_item,v_new_loc,v_new_lot,v_new_qty,0)
   on conflict (organization_id,inventory_item_id,warehouse_location_id,lot_number) do update set quantity_base=inventory_balances.quantity_base+excluded.quantity_base,updated_at=now();
 end if;
 if v_is_root and v_new_loc is distinct from v_old.warehouse_location_id then
   for d in with recursive subtree as (select id from cargo_units where parent_id=p_cargo_id and organization_id=v_org union all select c.id from cargo_units c join subtree s on c.parent_id=s.id where c.organization_id=v_org) select c.* from cargo_units c where c.id in (select id from subtree) loop
     if exists(select 1 from cargo_release_lines l join cargo_releases r on r.id=l.cargo_release_id where l.cargo_unit_id=d.id and r.status<>'CANCELLED') then raise exception 'Contained cargo is already used by a Cargo Release and location cannot be changed'; end if;
     if d.inventory_item_id is not null then
       update inventory_balances set quantity_base=greatest(0,quantity_base-coalesce(d.quantity,0)),updated_at=now() where organization_id=v_org and inventory_item_id=d.inventory_item_id and warehouse_location_id is not distinct from d.warehouse_location_id and lot_number is not distinct from d.lot_number;
       delete from inventory_balances where organization_id=v_org and inventory_item_id=d.inventory_item_id and warehouse_location_id is not distinct from d.warehouse_location_id and lot_number is not distinct from d.lot_number and quantity_base<=0 and quantity_reserved<=0;
       insert into inventory_balances(organization_id,inventory_item_id,warehouse_location_id,lot_number,quantity_base,quantity_reserved) values(v_org,d.inventory_item_id,v_new_loc,d.lot_number,coalesce(d.quantity,0),0) on conflict (organization_id,inventory_item_id,warehouse_location_id,lot_number) do update set quantity_base=inventory_balances.quantity_base+excluded.quantity_base,updated_at=now();
     end if;
     update cargo_units set warehouse_location_id=v_new_loc,updated_at=now() where id=d.id;
   end loop;
 end if;
 return jsonb_build_object('updated',true,'cargo_unit_id',p_cargo_id);
end;$function$;

create or replace function public.confirm_cargo_release(p_release_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare l record; c record; remaining numeric;
begin
 if exists(select 1 from cargo_releases where id=p_release_id and status='RELEASED') then raise exception 'Cargo release is already confirmed'; end if;
 if not exists(select 1 from cargo_release_lines where cargo_release_id=p_release_id) then raise exception 'Cargo release has no lines'; end if;
 for l in select * from cargo_release_lines where cargo_release_id=p_release_id order by created_at,id loop
   if l.cargo_unit_id is null then raise exception 'Cargo release line is missing cargo unit'; end if;
   if l.requested_quantity is null or l.requested_quantity<=0 then raise exception 'Cargo release line has invalid quantity'; end if;
   select id,organization_id,inventory_item_id,warehouse_location_id,lot_number,quantity,status into c from cargo_units where id=l.cargo_unit_id for update;
   if c.id is null then raise exception 'Cargo unit not found'; end if;
   if upper(coalesce(c.status::text,'')) in ('RELEASED','SHIPPED','DELETED','VOID','CANCELLED') then raise exception 'Cargo unit is not available'; end if;
   if l.requested_quantity>coalesce(c.quantity,0) then raise exception 'Requested quantity exceeds available cargo'; end if;
   update cargo_release_lines set release_source_warehouse_location_id=c.warehouse_location_id,release_inventory_item_id=c.inventory_item_id,release_lot_number=c.lot_number where id=l.id;
   remaining:=coalesce(c.quantity,0)-l.requested_quantity;
   if c.inventory_item_id is not null then
     update inventory_balances set quantity_base=greatest(0,quantity_base-l.requested_quantity),updated_at=now() where organization_id=c.organization_id and inventory_item_id=c.inventory_item_id and warehouse_location_id is not distinct from c.warehouse_location_id and lot_number is not distinct from c.lot_number;
     delete from inventory_balances where organization_id=c.organization_id and inventory_item_id=c.inventory_item_id and warehouse_location_id is not distinct from c.warehouse_location_id and lot_number is not distinct from c.lot_number and quantity_base<=0 and quantity_reserved<=0;
   end if;
   if remaining=0 then update cargo_units set quantity=0,status='RELEASED',warehouse_location_id=null where id=c.id; else update cargo_units set quantity=remaining where id=c.id; end if;
 end loop;
 update cargo_releases set status='RELEASED',confirmed_at=now(),released_by=auth.uid(),updated_at=now() where id=p_release_id;
 return jsonb_build_object('id',p_release_id,'status','RELEASED');
end;$function$;

create or replace function public.reset_delete_cargo_releases(p_release_ids uuid[])
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_org uuid; v_id uuid; v_line record; v_deleted int:=0; v_cargo record;
begin
 select organization_id into v_org from organization_members where user_id=auth.uid() order by created_at limit 1;
 if v_org is null then raise exception 'No workspace found'; end if;
 foreach v_id in array p_release_ids loop
   if not exists(select 1 from cargo_releases where id=v_id and organization_id=v_org) then continue; end if;
   if exists(select 1 from cargo_releases where id=v_id and status='RELEASED') then
     for v_line in select * from cargo_release_lines where cargo_release_id=v_id loop
       select * into v_cargo from cargo_units where id=v_line.cargo_unit_id and organization_id=v_org for update;
       if found then
         update cargo_units set quantity=coalesce(quantity,0)+coalesce(v_line.requested_quantity,0),status=case when upper(coalesce(status::text,''))='RELEASED' then 'received'::cargo_status else status end,warehouse_location_id=coalesce(warehouse_location_id,v_line.release_source_warehouse_location_id),updated_at=now() where id=v_line.cargo_unit_id;
         if coalesce(v_line.release_inventory_item_id,v_cargo.inventory_item_id) is not null then
           insert into inventory_balances(organization_id,inventory_item_id,warehouse_location_id,lot_number,quantity_base,quantity_reserved)
           values(v_org,coalesce(v_line.release_inventory_item_id,v_cargo.inventory_item_id),coalesce(v_line.release_source_warehouse_location_id,v_cargo.warehouse_location_id),coalesce(v_line.release_lot_number,v_cargo.lot_number),coalesce(v_line.requested_quantity,0),0)
           on conflict (organization_id,inventory_item_id,warehouse_location_id,lot_number) do update set quantity_base=inventory_balances.quantity_base+excluded.quantity_base,updated_at=now();
         end if;
       end if;
     end loop;
   end if;
   delete from cargo_release_lines where cargo_release_id=v_id;
   delete from cargo_releases where id=v_id and organization_id=v_org;
   if found then v_deleted:=v_deleted+1; end if;
 end loop;
 return jsonb_build_object('deleted',v_deleted);
end;$function$;

create or replace function public.delete_cargo_subtree(p_id uuid)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare v_org uuid; v_count integer; r record;
begin
 select organization_id into v_org from organization_members where user_id=auth.uid() order by created_at limit 1;
 if not exists(select 1 from cargo_units where id=p_id and organization_id=v_org) then raise exception 'Cargo node not found'; end if;
 if exists(with recursive subtree as (select id from cargo_units where id=p_id and organization_id=v_org union all select c.id from cargo_units c join subtree s on c.parent_id=s.id) select 1 from cargo_release_lines l join cargo_releases cr on cr.id=l.cargo_release_id where l.cargo_unit_id in (select id from subtree) and cr.status<>'CANCELLED') then raise exception 'This cargo is used by a Cargo Release and cannot be deleted'; end if;
 for r in with recursive subtree as (select id,inventory_item_id,quantity,warehouse_location_id,lot_number from cargo_units where id=p_id and organization_id=v_org union all select c.id,c.inventory_item_id,c.quantity,c.warehouse_location_id,c.lot_number from cargo_units c join subtree s on c.parent_id=s.id) select inventory_item_id,warehouse_location_id,lot_number,sum(quantity) qty from subtree where inventory_item_id is not null group by inventory_item_id,warehouse_location_id,lot_number loop
   update inventory_balances set quantity_base=greatest(0,quantity_base-r.qty),updated_at=now() where organization_id=v_org and inventory_item_id=r.inventory_item_id and warehouse_location_id is not distinct from r.warehouse_location_id and lot_number is not distinct from r.lot_number;
   delete from inventory_balances where organization_id=v_org and inventory_item_id=r.inventory_item_id and warehouse_location_id is not distinct from r.warehouse_location_id and lot_number is not distinct from r.lot_number and quantity_base<=0 and quantity_reserved<=0;
 end loop;
 with recursive subtree as (select id from cargo_units where id=p_id and organization_id=v_org union all select c.id from cargo_units c join subtree s on c.parent_id=s.id) delete from cargo_objects where id in (select id from subtree);
 with recursive subtree as (select id from cargo_units where id=p_id and organization_id=v_org union all select c.id from cargo_units c join subtree s on c.parent_id=s.id),del as (delete from cargo_units where id in (select id from subtree) returning 1) select count(*) into v_count from del;
 return v_count;
end;$function$;

create or replace function public.delete_warehouse_receipt(p_wr_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_user uuid:=auth.uid(); v_org uuid; v_job uuid; rec record; v_cargo_ids uuid[];
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 select wr.organization_id,wr.job_id into v_org,v_job from warehouse_receipts wr join organization_members om on om.organization_id=wr.organization_id where wr.id=p_wr_id and om.user_id=v_user limit 1;
 if v_org is null then raise exception 'Warehouse receipt not found'; end if;
 if exists(select 1 from cargo_units where job_id=v_job and lower(status::text) in ('allocated','picked')) then raise exception 'Cannot delete a receipt with allocated or picked cargo'; end if;
 if exists(select 1 from cargo_release_lines l join cargo_units c on c.id=l.cargo_unit_id join cargo_releases r on r.id=l.cargo_release_id where c.job_id=v_job and r.status<>'CANCELLED') then raise exception 'Cannot delete a receipt with cargo used by a Cargo Release'; end if;
 select coalesce(array_agg(id),'{}'::uuid[]) into v_cargo_ids from cargo_units where job_id=v_job;
 for rec in select inventory_item_id,warehouse_location_id,lot_number,sum(quantity) qty from cargo_units where job_id=v_job and inventory_item_id is not null and quantity>0 group by inventory_item_id,warehouse_location_id,lot_number loop
   update inventory_balances set quantity_base=greatest(0,quantity_base-rec.qty),updated_at=now() where organization_id=v_org and inventory_item_id=rec.inventory_item_id and warehouse_location_id is not distinct from rec.warehouse_location_id and lot_number is not distinct from rec.lot_number;
   delete from inventory_balances where organization_id=v_org and inventory_item_id=rec.inventory_item_id and warehouse_location_id is not distinct from rec.warehouse_location_id and lot_number is not distinct from rec.lot_number and quantity_base<=0 and quantity_reserved<=0;
 end loop;
 update custody_transfers set warehouse_receipt_id=null where warehouse_receipt_id=p_wr_id;
 update warehouse_visits set warehouse_receipt_id=null where warehouse_receipt_id=p_wr_id;
 delete from cargo_assignments where transaction_type='WAREHOUSE_RECEIPT' and transaction_id=p_wr_id;
 delete from cargo_events where transaction_type='WAREHOUSE_RECEIPT' and transaction_id=p_wr_id;
 -- Delete job/cargo first. The cargo sync trigger cannot recreate canonical objects afterward.
 delete from jobs where id=v_job;
 delete from cargo_objects where (source_type='WAREHOUSE_RECEIPT' and source_id=p_wr_id) or id=any(v_cargo_ids);
 return jsonb_build_object('deleted',true,'warehouse_receipt_id',p_wr_id,'job_id',v_job);
end;$function$;

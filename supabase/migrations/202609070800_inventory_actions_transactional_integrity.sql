-- Transactional inventory actions: physical cargo, canonical warehouse locations and inventory balances move together.

create or replace function public.inventory_allocation_snapshot()
returns table(cargo_unit_id uuid, allocated_quantity numeric)
language sql security definer set search_path to 'public'
as $function$
 with myorg as (select organization_id from organization_members where user_id=auth.uid() order by created_at limit 1)
 select crl.cargo_unit_id,coalesce(sum(crl.requested_quantity),0)::numeric
 from cargo_release_lines crl join cargo_releases cr on cr.id=crl.cargo_release_id join myorg o on o.organization_id=cr.organization_id
 where cr.status in ('ALLOCATED','READY') group by crl.cargo_unit_id;
$function$;

create or replace function public.inventory_move(p_cargo_unit_id uuid,p_to_location_id uuid,p_reason text default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_org uuid; c cargo_units%rowtype; r record;
begin
 select organization_id into v_org from organization_members where user_id=auth.uid() order by created_at limit 1;
 if v_org is null then raise exception 'No workspace found'; end if;
 select * into c from cargo_units where id=p_cargo_unit_id and organization_id=v_org for update;
 if not found then raise exception 'Cargo unit not found'; end if;
 if p_to_location_id is null or not exists(select 1 from warehouse_locations where id=p_to_location_id and organization_id=v_org and active=true) then raise exception 'Target warehouse location is invalid or inactive'; end if;
 for r in with recursive subtree as (
   select id,inventory_item_id,quantity,warehouse_location_id,lot_number from cargo_units where id=c.id and organization_id=v_org
   union all select x.id,x.inventory_item_id,x.quantity,x.warehouse_location_id,x.lot_number from cargo_units x join subtree s on x.parent_id=s.id where x.organization_id=v_org
 ) select inventory_item_id,warehouse_location_id,lot_number,sum(quantity) qty from subtree where inventory_item_id is not null and coalesce(quantity,0)>0 group by inventory_item_id,warehouse_location_id,lot_number loop
   if r.warehouse_location_id is distinct from p_to_location_id then
     update inventory_balances set quantity_base=quantity_base-r.qty,updated_at=now()
       where organization_id=v_org and inventory_item_id=r.inventory_item_id and warehouse_location_id is not distinct from r.warehouse_location_id and lot_number is not distinct from r.lot_number and quantity_base>=r.qty;
     if not found then raise exception 'Inventory balance is missing or insufficient for this move'; end if;
     delete from inventory_balances where organization_id=v_org and inventory_item_id=r.inventory_item_id and warehouse_location_id is not distinct from r.warehouse_location_id and lot_number is not distinct from r.lot_number and quantity_base<=0 and quantity_reserved<=0;
     insert into inventory_balances(organization_id,inventory_item_id,warehouse_location_id,lot_number,quantity_base,quantity_reserved)
       values(v_org,r.inventory_item_id,p_to_location_id,r.lot_number,r.qty,0)
       on conflict (organization_id,inventory_item_id,warehouse_location_id,lot_number) do update set quantity_base=inventory_balances.quantity_base+excluded.quantity_base,updated_at=now();
   end if;
 end loop;
 with recursive subtree as (select id from cargo_units where id=c.id and organization_id=v_org union all select x.id from cargo_units x join subtree s on x.parent_id=s.id where x.organization_id=v_org)
 update cargo_units set warehouse_location_id=p_to_location_id,updated_at=now() where id in(select id from subtree);
 insert into inventory_transactions(organization_id,cargo_unit_id,transaction_type,quantity_before,quantity_after,from_location_id,to_location_id,status_before,status_after,reason,notes)
 values(v_org,c.id,'MOVE',c.quantity,c.quantity,c.warehouse_location_id,p_to_location_id,c.status::text,c.status::text,p_reason,p_notes);
 return jsonb_build_object('id',c.id,'location_id',p_to_location_id);
end;$function$;

create or replace function public.inventory_adjust(p_cargo_unit_id uuid,p_new_quantity numeric,p_reason text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_org uuid; c cargo_units%rowtype; v_delta numeric;
begin
 if p_new_quantity is null or p_new_quantity<0 then raise exception 'Quantity cannot be negative'; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'Reason is required'; end if;
 select organization_id into v_org from organization_members where user_id=auth.uid() order by created_at limit 1;
 if v_org is null then raise exception 'No workspace found'; end if;
 select * into c from cargo_units where id=p_cargo_unit_id and organization_id=v_org for update;
 if not found then raise exception 'Cargo unit not found'; end if;
 if exists(select 1 from cargo_release_lines l join cargo_releases r on r.id=l.cargo_release_id where l.cargo_unit_id=c.id and r.status<>'CANCELLED') then raise exception 'Cargo is committed to a Cargo Release and cannot be adjusted directly'; end if;
 v_delta:=p_new_quantity-coalesce(c.quantity,0);
 if c.inventory_item_id is not null and v_delta<>0 then
   if v_delta<0 then
     update inventory_balances set quantity_base=quantity_base+v_delta,updated_at=now() where organization_id=v_org and inventory_item_id=c.inventory_item_id and warehouse_location_id is not distinct from c.warehouse_location_id and lot_number is not distinct from c.lot_number and quantity_base>=abs(v_delta);
     if not found then raise exception 'Inventory balance is missing or insufficient for this adjustment'; end if;
     delete from inventory_balances where organization_id=v_org and inventory_item_id=c.inventory_item_id and warehouse_location_id is not distinct from c.warehouse_location_id and lot_number is not distinct from c.lot_number and quantity_base<=0 and quantity_reserved<=0;
   else
     insert into inventory_balances(organization_id,inventory_item_id,warehouse_location_id,lot_number,quantity_base,quantity_reserved) values(v_org,c.inventory_item_id,c.warehouse_location_id,c.lot_number,v_delta,0)
       on conflict (organization_id,inventory_item_id,warehouse_location_id,lot_number) do update set quantity_base=inventory_balances.quantity_base+excluded.quantity_base,updated_at=now();
   end if;
 end if;
 update cargo_units set quantity=p_new_quantity,updated_at=now() where id=c.id;
 insert into inventory_transactions(organization_id,cargo_unit_id,transaction_type,quantity_before,quantity_after,from_location_id,to_location_id,status_before,status_after,reason,notes)
 values(v_org,c.id,'ADJUST',c.quantity,p_new_quantity,c.warehouse_location_id,c.warehouse_location_id,c.status::text,c.status::text,p_reason,p_notes);
 return jsonb_build_object('id',c.id,'quantity',p_new_quantity);
end;$function$;

create or replace function public.inventory_cycle_count(p_cargo_unit_id uuid,p_counted_quantity numeric,p_notes text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_org uuid; c cargo_units%rowtype; v_delta numeric;
begin
 if p_counted_quantity is null or p_counted_quantity<0 then raise exception 'Counted quantity cannot be negative'; end if;
 select organization_id into v_org from organization_members where user_id=auth.uid() order by created_at limit 1;
 if v_org is null then raise exception 'No workspace found'; end if;
 select * into c from cargo_units where id=p_cargo_unit_id and organization_id=v_org for update;
 if not found then raise exception 'Cargo unit not found'; end if;
 if exists(select 1 from cargo_release_lines l join cargo_releases r on r.id=l.cargo_release_id where l.cargo_unit_id=c.id and r.status<>'CANCELLED') then raise exception 'Cargo is committed to a Cargo Release and cannot be cycle-count adjusted'; end if;
 v_delta:=p_counted_quantity-coalesce(c.quantity,0);
 if c.inventory_item_id is not null and v_delta<>0 then
   if v_delta<0 then
     update inventory_balances set quantity_base=quantity_base+v_delta,updated_at=now() where organization_id=v_org and inventory_item_id=c.inventory_item_id and warehouse_location_id is not distinct from c.warehouse_location_id and lot_number is not distinct from c.lot_number and quantity_base>=abs(v_delta);
     if not found then raise exception 'Inventory balance is missing or insufficient for this cycle count'; end if;
     delete from inventory_balances where organization_id=v_org and inventory_item_id=c.inventory_item_id and warehouse_location_id is not distinct from c.warehouse_location_id and lot_number is not distinct from c.lot_number and quantity_base<=0 and quantity_reserved<=0;
   else
     insert into inventory_balances(organization_id,inventory_item_id,warehouse_location_id,lot_number,quantity_base,quantity_reserved) values(v_org,c.inventory_item_id,c.warehouse_location_id,c.lot_number,v_delta,0)
       on conflict (organization_id,inventory_item_id,warehouse_location_id,lot_number) do update set quantity_base=inventory_balances.quantity_base+excluded.quantity_base,updated_at=now();
   end if;
 end if;
 update cargo_units set quantity=p_counted_quantity,updated_at=now() where id=c.id;
 insert into inventory_transactions(organization_id,cargo_unit_id,transaction_type,quantity_before,quantity_after,from_location_id,to_location_id,status_before,status_after,reason,notes)
 values(v_org,c.id,'CYCLE_COUNT',c.quantity,p_counted_quantity,c.warehouse_location_id,c.warehouse_location_id,c.status::text,c.status::text,'Cycle count',p_notes);
 return jsonb_build_object('id',c.id,'quantity',p_counted_quantity,'variance',p_counted_quantity-c.quantity);
end;$function$;

create or replace function public.inventory_split(p_cargo_unit_id uuid,p_split_quantity numeric,p_notes text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_org uuid; c cargo_units%rowtype; new_id uuid;
begin
 select organization_id into v_org from organization_members where user_id=auth.uid() order by created_at limit 1;
 if v_org is null then raise exception 'No workspace found'; end if;
 select * into c from cargo_units where id=p_cargo_unit_id and organization_id=v_org for update;
 if not found then raise exception 'Cargo unit not found'; end if;
 if p_split_quantity is null or p_split_quantity<=0 or p_split_quantity>=coalesce(c.quantity,0) then raise exception 'Split quantity must be greater than zero and less than current quantity'; end if;
 if nullif(trim(c.serial_number),'') is not null then raise exception 'Serialized inventory cannot be quantity-split'; end if;
 if exists(select 1 from cargo_release_lines l join cargo_releases r on r.id=l.cargo_release_id where l.cargo_unit_id=c.id and r.status<>'CANCELLED') then raise exception 'Cargo is committed to a Cargo Release and cannot be split'; end if;
 update cargo_units set quantity=c.quantity-p_split_quantity,updated_at=now() where id=c.id;
 insert into cargo_units(organization_id,parent_id,job_id,inventory_item_id,package_type,quantity,uom,description,status,sku,part_number,lot_number,warehouse_location_id,weight_lb,length_in,width_in,height_in,metadata)
 values(v_org,c.parent_id,c.job_id,c.inventory_item_id,c.package_type,p_split_quantity,c.uom,c.description,c.status,c.sku,c.part_number,c.lot_number,c.warehouse_location_id,c.weight_lb,c.length_in,c.width_in,c.height_in,coalesce(c.metadata,'{}'::jsonb)||jsonb_build_object('split_from',c.id::text)) returning id into new_id;
 insert into inventory_transactions(organization_id,cargo_unit_id,transaction_type,quantity_before,quantity_after,from_location_id,to_location_id,status_before,status_after,reason,notes)
 values(v_org,c.id,'SPLIT',c.quantity,c.quantity-p_split_quantity,c.warehouse_location_id,c.warehouse_location_id,c.status::text,c.status::text,'Split cargo',coalesce(p_notes,'')||case when coalesce(p_notes,'')='' then '' else ' · ' end||'New cargo unit: '||new_id::text);
 insert into inventory_transactions(organization_id,cargo_unit_id,transaction_type,quantity_before,quantity_after,from_location_id,to_location_id,status_before,status_after,reason,notes)
 values(v_org,new_id,'SPLIT',0,p_split_quantity,c.warehouse_location_id,c.warehouse_location_id,c.status::text,c.status::text,'Created by split','Source cargo unit: '||c.id::text);
 return jsonb_build_object('source_id',c.id,'new_id',new_id,'source_quantity',c.quantity-p_split_quantity,'split_quantity',p_split_quantity);
end;$function$;

create or replace function public.inventory_repack(p_source_cargo_unit_id uuid,p_move_quantity numeric,p_new_package_type text,p_new_location_id uuid default null,p_new_weight_lb numeric default null,p_new_length_in numeric default null,p_new_width_in numeric default null,p_new_height_in numeric default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_org uuid; src cargo_units%rowtype; new_root_id uuid; new_child_id uuid; new_hu text; target_location uuid;
begin
 select organization_id into v_org from organization_members where user_id=auth.uid() order by created_at limit 1;
 if v_org is null then raise exception 'No workspace found'; end if;
 select * into src from cargo_units where id=p_source_cargo_unit_id and organization_id=v_org for update;
 if not found then raise exception 'Source cargo unit not found'; end if;
 if src.inventory_item_id is null then raise exception 'Repack requires an inventory-linked cargo level. Select the contained item/package instead of the handling-unit shell'; end if;
 if p_move_quantity is null or p_move_quantity<=0 or p_move_quantity>coalesce(src.quantity,0) then raise exception 'Repack quantity must be greater than zero and no more than source quantity'; end if;
 if nullif(trim(src.serial_number),'') is not null and p_move_quantity<>src.quantity then raise exception 'Serialized cargo cannot be partially repacked'; end if;
 if nullif(trim(p_new_package_type),'') is null then raise exception 'New handling unit package type is required'; end if;
 if exists(select 1 from cargo_release_lines l join cargo_releases r on r.id=l.cargo_release_id where l.cargo_unit_id=src.id and r.status<>'CANCELLED') then raise exception 'Cargo is committed to a Cargo Release and cannot be repacked'; end if;
 target_location:=coalesce(p_new_location_id,src.warehouse_location_id);
 if target_location is not null and not exists(select 1 from warehouse_locations where id=target_location and organization_id=v_org and active=true) then raise exception 'Target warehouse location is invalid or inactive'; end if;
 new_hu:='HU-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
 insert into cargo_units(organization_id,parent_id,job_id,package_type,quantity,uom,description,status,warehouse_location_id,weight_lb,length_in,width_in,height_in,handling_unit_code,uin,metadata)
 values(v_org,null,src.job_id,upper(p_new_package_type),1,case upper(p_new_package_type) when 'PALLET' then 'PLT' when 'BOX' then 'BOX' when 'CARTON' then 'CTN' when 'CRATE' then 'CRT' else 'EA' end,'Repacked handling unit',src.status,target_location,p_new_weight_lb,p_new_length_in,p_new_width_in,p_new_height_in,new_hu,new_hu,jsonb_build_object('repacked_from',src.id::text)) returning id into new_root_id;
 insert into cargo_units(organization_id,parent_id,job_id,inventory_item_id,package_type,quantity,uom,description,status,sku,part_number,serial_number,lot_number,warehouse_location_id,weight_lb,length_in,width_in,height_in,metadata)
 values(v_org,new_root_id,src.job_id,src.inventory_item_id,src.package_type,p_move_quantity,src.uom,src.description,src.status,src.sku,src.part_number,src.serial_number,src.lot_number,target_location,src.weight_lb,src.length_in,src.width_in,src.height_in,coalesce(src.metadata,'{}'::jsonb)||jsonb_build_object('repacked_from',src.id::text)) returning id into new_child_id;
 update cargo_units set quantity=quantity-p_move_quantity,updated_at=now() where id=src.id;
 if target_location is distinct from src.warehouse_location_id then
   update inventory_balances set quantity_base=quantity_base-p_move_quantity,updated_at=now() where organization_id=v_org and inventory_item_id=src.inventory_item_id and warehouse_location_id is not distinct from src.warehouse_location_id and lot_number is not distinct from src.lot_number and quantity_base>=p_move_quantity;
   if not found then raise exception 'Inventory balance is missing or insufficient for this repack'; end if;
   delete from inventory_balances where organization_id=v_org and inventory_item_id=src.inventory_item_id and warehouse_location_id is not distinct from src.warehouse_location_id and lot_number is not distinct from src.lot_number and quantity_base<=0 and quantity_reserved<=0;
   insert into inventory_balances(organization_id,inventory_item_id,warehouse_location_id,lot_number,quantity_base,quantity_reserved) values(v_org,src.inventory_item_id,target_location,src.lot_number,p_move_quantity,0)
     on conflict (organization_id,inventory_item_id,warehouse_location_id,lot_number) do update set quantity_base=inventory_balances.quantity_base+excluded.quantity_base,updated_at=now();
 end if;
 insert into inventory_transactions(organization_id,cargo_unit_id,transaction_type,quantity_before,quantity_after,from_location_id,to_location_id,status_before,status_after,reason,notes)
 values(v_org,src.id,'REPACK',src.quantity,src.quantity-p_move_quantity,src.warehouse_location_id,target_location,src.status::text,src.status::text,'Repacked cargo',coalesce(p_notes,'')||case when coalesce(p_notes,'')='' then '' else ' · ' end||'Moved '||p_move_quantity::text||' '||coalesce(src.uom,'')||' to '||new_hu);
 insert into inventory_transactions(organization_id,cargo_unit_id,transaction_type,quantity_before,quantity_after,from_location_id,to_location_id,status_before,status_after,reason,notes)
 values(v_org,new_child_id,'REPACK',0,p_move_quantity,src.warehouse_location_id,target_location,src.status::text,src.status::text,'Created by repack','Source cargo unit: '||src.id::text||' · New handling unit: '||new_hu);
 return jsonb_build_object('source_id',src.id,'source_remaining',src.quantity-p_move_quantity,'new_root_id',new_root_id,'new_child_id',new_child_id,'handling_unit_code',new_hu,'moved_quantity',p_move_quantity);
end;$function$;

create or replace function public.inventory_set_hold(p_cargo_unit_id uuid,p_hold boolean,p_reason text default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_org uuid; c cargo_units%rowtype;
begin
 select organization_id into v_org from organization_members where user_id=auth.uid() order by created_at limit 1;
 if v_org is null then raise exception 'No workspace found'; end if;
 select * into c from cargo_units where id=p_cargo_unit_id and organization_id=v_org for update;
 if not found then raise exception 'Cargo unit not found'; end if;
 if p_hold and exists(with recursive subtree as (select id from cargo_units where id=c.id and organization_id=v_org union all select x.id from cargo_units x join subtree s on x.parent_id=s.id where x.organization_id=v_org) select 1 from cargo_release_lines l join cargo_releases r on r.id=l.cargo_release_id where l.cargo_unit_id in(select id from subtree) and r.status<>'CANCELLED') then raise exception 'Cargo is committed to a Cargo Release and cannot be placed on hold'; end if;
 with recursive subtree as (select id from cargo_units where id=c.id and organization_id=v_org union all select x.id from cargo_units x join subtree s on x.parent_id=s.id where x.organization_id=v_org)
 update cargo_units set metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{inventory_hold}',to_jsonb(p_hold),true),updated_at=now() where id in(select id from subtree);
 insert into inventory_transactions(organization_id,cargo_unit_id,transaction_type,quantity_before,quantity_after,from_location_id,to_location_id,status_before,status_after,reason,notes)
 values(v_org,c.id,case when p_hold then 'HOLD' else 'RELEASE_HOLD' end,c.quantity,c.quantity,c.warehouse_location_id,c.warehouse_location_id,c.status::text,c.status::text,p_reason,p_notes);
 return jsonb_build_object('id',c.id,'hold',p_hold);
end;$function$;

create or replace function public.inventory_explorer_list()
returns table(inventory_item_id uuid,item_key text,sku text,part_number text,description text,base_uom text,on_hand numeric,reserved numeric,available numeric,package_count bigint,locations text[])
language sql security definer set search_path to 'public'
as $function$
with recursive myorg as (select organization_id from organization_members where user_id=auth.uid() order by created_at limit 1),
balances as (select b.inventory_item_id,sum(b.quantity_base) on_hand from inventory_balances b join myorg o on o.organization_id=b.organization_id group by b.inventory_item_id),
allocations as (select c.inventory_item_id,sum(crl.requested_quantity)::numeric reserved from cargo_release_lines crl join cargo_releases cr on cr.id=crl.cargo_release_id and cr.status in ('ALLOCATED','READY') join cargo_units c on c.id=crl.cargo_unit_id join myorg o on o.organization_id=cr.organization_id and o.organization_id=c.organization_id where c.inventory_item_id is not null group by c.inventory_item_id),
holds as (select c.inventory_item_id,sum(c.quantity)::numeric held from cargo_units c join myorg o on o.organization_id=c.organization_id where c.inventory_item_id is not null and coalesce((c.metadata->>'inventory_hold')::boolean,false)=true and c.status in ('received','stored','allocated','picked') group by c.inventory_item_id),
upward(inventory_item_id,id,parent_id,package_type,warehouse_location_id) as (select c.inventory_item_id,c.id,c.parent_id,c.package_type,c.warehouse_location_id from cargo_units c join myorg o on o.organization_id=c.organization_id where c.inventory_item_id is not null and c.status in ('received','stored','allocated','picked') union all select u.inventory_item_id,p.id,p.parent_id,p.package_type,p.warehouse_location_id from upward u join cargo_units p on p.id=u.parent_id),
physical as (select u.inventory_item_id,count(distinct u.id) filter(where lower(coalesce(u.package_type,'')) not in ('unit','piece','ea')) package_count,array_remove(array_agg(distinct wl.code),null) locations from upward u left join warehouse_locations wl on wl.id=u.warehouse_location_id group by u.inventory_item_id)
select i.id,coalesce(i.part_number,i.sku,i.description,'UNSPECIFIED'),i.sku,i.part_number,i.description,i.base_uom,coalesce(b.on_hand,0),coalesce(a.reserved,0),greatest(0,coalesce(b.on_hand,0)-coalesce(a.reserved,0)-coalesce(h.held,0)),coalesce(p.package_count,0),coalesce(p.locations,array[]::text[])
from inventory_items i join myorg o on o.organization_id=i.organization_id left join balances b on b.inventory_item_id=i.id left join allocations a on a.inventory_item_id=i.id left join holds h on h.inventory_item_id=i.id left join physical p on p.inventory_item_id=i.id
where coalesce(b.on_hand,0)<>0 or coalesce(a.reserved,0)<>0 order by coalesce(i.part_number,i.sku,i.description,'UNSPECIFIED');
$function$;

create or replace function public.confirm_cargo_release(p_release_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_org uuid; l record; c cargo_units%rowtype; remaining numeric;
begin
 select r.organization_id into v_org from cargo_releases r join organization_members om on om.organization_id=r.organization_id where r.id=p_release_id and om.user_id=auth.uid() limit 1;
 if v_org is null then raise exception 'Cargo release not found'; end if;
 if exists(select 1 from cargo_releases where id=p_release_id and status='RELEASED') then raise exception 'Cargo release is already confirmed'; end if;
 if not exists(select 1 from cargo_release_lines where cargo_release_id=p_release_id) then raise exception 'Cargo release has no lines'; end if;
 for l in select * from cargo_release_lines where cargo_release_id=p_release_id order by created_at,id loop
   if l.cargo_unit_id is null or l.requested_quantity is null or l.requested_quantity<=0 then raise exception 'Cargo release line is invalid'; end if;
   select * into c from cargo_units where id=l.cargo_unit_id and organization_id=v_org for update;
   if not found then raise exception 'Cargo unit not found'; end if;
   if c.inventory_item_id is null then raise exception 'Cargo Release lines must use inventory-linked cargo levels. Select the contained item/package rather than the handling-unit shell'; end if;
   if coalesce((c.metadata->>'inventory_hold')::boolean,false)=true then raise exception 'Cargo is on hold and cannot be released'; end if;
   if upper(coalesce(c.status::text,'')) in ('RELEASED','SHIPPED','DELETED','VOID','CANCELLED') then raise exception 'Cargo unit is not available'; end if;
   if l.requested_quantity>coalesce(c.quantity,0) then raise exception 'Requested quantity exceeds available cargo'; end if;
   update cargo_release_lines set release_source_warehouse_location_id=c.warehouse_location_id,release_inventory_item_id=c.inventory_item_id,release_lot_number=c.lot_number where id=l.id;
   remaining:=coalesce(c.quantity,0)-l.requested_quantity;
   update inventory_balances set quantity_base=quantity_base-l.requested_quantity,updated_at=now() where organization_id=v_org and inventory_item_id=c.inventory_item_id and warehouse_location_id is not distinct from c.warehouse_location_id and lot_number is not distinct from c.lot_number and quantity_base>=l.requested_quantity;
   if not found then raise exception 'Inventory balance is missing or insufficient for this release'; end if;
   delete from inventory_balances where organization_id=v_org and inventory_item_id=c.inventory_item_id and warehouse_location_id is not distinct from c.warehouse_location_id and lot_number is not distinct from c.lot_number and quantity_base<=0 and quantity_reserved<=0;
   if remaining=0 then update cargo_units set quantity=0,status='released'::cargo_status,warehouse_location_id=null,updated_at=now() where id=c.id; else update cargo_units set quantity=remaining,updated_at=now() where id=c.id; end if;
 end loop;
 update cargo_releases set status='RELEASED',confirmed_at=now(),released_by=auth.uid(),updated_at=now() where id=p_release_id and organization_id=v_org;
 return jsonb_build_object('id',p_release_id,'status','RELEASED');
end;$function$;

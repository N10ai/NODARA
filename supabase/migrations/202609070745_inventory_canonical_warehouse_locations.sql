-- Inventory UI/read/edit side of the WMS regression baseline.
-- Never translate warehouse_locations IDs into the legacy locations table.

create or replace function public.inventory_explorer_list()
returns table(inventory_item_id uuid,item_key text,sku text,part_number text,description text,base_uom text,on_hand numeric,reserved numeric,available numeric,package_count bigint,locations text[])
language sql security definer set search_path to 'public' as $function$
with recursive myorg as (
  select organization_id from organization_members where user_id=auth.uid() order by created_at limit 1
), balances as (
  select b.inventory_item_id,sum(b.quantity_base) on_hand,sum(b.quantity_reserved) reserved
  from inventory_balances b join myorg o on o.organization_id=b.organization_id group by b.inventory_item_id
), upward(inventory_item_id,id,parent_id,package_type,warehouse_location_id) as (
  select c.inventory_item_id,c.id,c.parent_id,c.package_type,c.warehouse_location_id
  from cargo_units c join myorg o on o.organization_id=c.organization_id
  where c.inventory_item_id is not null and c.status in ('received','stored','allocated','picked')
  union all
  select u.inventory_item_id,p.id,p.parent_id,p.package_type,p.warehouse_location_id
  from upward u join cargo_units p on p.id=u.parent_id
), physical as (
  select u.inventory_item_id,
    count(distinct u.id) filter(where lower(coalesce(u.package_type,'')) not in ('unit','piece','ea')) package_count,
    array_remove(array_agg(distinct wl.code),null) locations
  from upward u left join warehouse_locations wl on wl.id=u.warehouse_location_id
  group by u.inventory_item_id
)
select i.id,coalesce(i.part_number,i.sku,i.description,'UNSPECIFIED'),i.sku,i.part_number,i.description,i.base_uom,
  coalesce(b.on_hand,0),coalesce(b.reserved,0),coalesce(b.on_hand,0)-coalesce(b.reserved,0),coalesce(p.package_count,0),coalesce(p.locations,array[]::text[])
from inventory_items i join myorg o on o.organization_id=i.organization_id
left join balances b on b.inventory_item_id=i.id left join physical p on p.inventory_item_id=i.id
where coalesce(b.on_hand,0)<>0 or coalesce(b.reserved,0)<>0
order by coalesce(i.part_number,i.sku,i.description,'UNSPECIFIED');
$function$;

create or replace function public.inventory_item_cargo_tree(p_inventory_item_id uuid)
returns table(id uuid,parent_id uuid,job_id uuid,uin text,handling_unit_code text,package_type text,quantity numeric,uom text,description text,weight_lb numeric,length_in numeric,width_in numeric,height_in numeric,status cargo_status,location_code text,sku text,part_number text,serial_number text,lot_number text,inventory_item_id uuid,metadata jsonb)
language sql security definer set search_path to 'public' as $function$
with recursive myorg as (
  select organization_id from organization_members where user_id=auth.uid() order by created_at limit 1
), seeds as (
  select c.id,c.parent_id from cargo_units c join myorg o on o.organization_id=c.organization_id where c.inventory_item_id=p_inventory_item_id
), ancestors(id,parent_id) as (
  select id,parent_id from seeds
  union
  select p.id,p.parent_id from ancestors a join cargo_units p on p.id=a.parent_id
), chosen as (
  select distinct id from ancestors union select id from seeds
)
select c.id,c.parent_id,c.job_id,c.uin,c.handling_unit_code,c.package_type,c.quantity,c.uom,c.description,c.weight_lb,c.length_in,c.width_in,c.height_in,c.status,wl.code,c.sku,c.part_number,c.serial_number,c.lot_number,c.inventory_item_id,c.metadata
from cargo_units c join chosen x on x.id=c.id left join warehouse_locations wl on wl.id=c.warehouse_location_id
order by c.created_at,c.id;
$function$;

create or replace function public.update_cargo_node(p_id uuid,p_package_type text default null,p_quantity numeric default null,p_uom text default null,p_description text default null,p_weight_lb numeric default null,p_length_in numeric default null,p_width_in numeric default null,p_height_in numeric default null,p_serial_number text default null,p_lot_number text default null,p_status cargo_status default null,p_location_id uuid default null,p_uin text default null,p_handling_unit_code text default null)
returns cargo_units language plpgsql security definer set search_path to 'public' as $function$
declare v_org uuid; v_old cargo_units; v_new cargo_units; v_new_loc uuid;
begin
 select organization_id into v_org from organization_members where user_id=auth.uid() order by created_at limit 1;
 select * into v_old from cargo_units where id=p_id and organization_id=v_org for update;
 if not found then raise exception 'Cargo node not found'; end if;
 if exists(select 1 from cargo_release_lines l join cargo_releases r on r.id=l.cargo_release_id where l.cargo_unit_id=p_id and r.status<>'CANCELLED') then raise exception 'This cargo is used by a Cargo Release and cannot be edited directly'; end if;
 v_new_loc:=coalesce(p_location_id,v_old.warehouse_location_id);
 if v_new_loc is not null and not exists(select 1 from warehouse_locations where id=v_new_loc and organization_id=v_org and active=true) then raise exception 'Invalid or inactive warehouse location'; end if;
 if v_old.inventory_item_id is not null then
   update inventory_balances set quantity_base=greatest(0,quantity_base-coalesce(v_old.quantity,0)),updated_at=now()
   where organization_id=v_org and inventory_item_id=v_old.inventory_item_id and warehouse_location_id is not distinct from v_old.warehouse_location_id and lot_number is not distinct from v_old.lot_number;
   delete from inventory_balances where organization_id=v_org and inventory_item_id=v_old.inventory_item_id and warehouse_location_id is not distinct from v_old.warehouse_location_id and lot_number is not distinct from v_old.lot_number and quantity_base<=0 and quantity_reserved<=0;
 end if;
 update cargo_units set
   package_type=coalesce(nullif(trim(p_package_type),''),package_type),quantity=coalesce(p_quantity,quantity),uom=coalesce(nullif(trim(p_uom),''),uom),description=coalesce(p_description,description),
   weight_lb=p_weight_lb,length_in=p_length_in,width_in=p_width_in,height_in=p_height_in,serial_number=p_serial_number,lot_number=p_lot_number,status=coalesce(p_status,status),
   warehouse_location_id=v_new_loc,uin=coalesce(nullif(trim(p_uin),''),uin),handling_unit_code=coalesce(nullif(trim(p_handling_unit_code),''),handling_unit_code),updated_at=now()
 where id=p_id returning * into v_new;
 if v_new.inventory_item_id is not null and coalesce(v_new.quantity,0)>0 then
   insert into inventory_balances(organization_id,inventory_item_id,warehouse_location_id,lot_number,quantity_base,quantity_reserved)
   values(v_org,v_new.inventory_item_id,v_new.warehouse_location_id,v_new.lot_number,v_new.quantity,0)
   on conflict (organization_id,inventory_item_id,warehouse_location_id,lot_number) do update set quantity_base=inventory_balances.quantity_base+excluded.quantity_base,updated_at=now();
 end if;
 return v_new;
end;$function$;

create or replace function public.create_cargo_child(p_parent_id uuid,p_package_type text,p_quantity numeric default 1,p_uom text default null,p_description text default null,p_weight_lb numeric default null,p_length_in numeric default null,p_width_in numeric default null,p_height_in numeric default null,p_sku text default null,p_part_number text default null,p_serial_number text default null,p_lot_number text default null)
returns cargo_units language plpgsql security definer set search_path to 'public' as $function$
declare
 v_org uuid; v_parent cargo_units; v_new cargo_units;
 v_type text:=upper(coalesce(nullif(trim(p_package_type),''),'PACKAGE'));
 v_uom text:=coalesce(nullif(trim(p_uom),''),case when nullif(trim(p_sku),'') is not null or nullif(trim(p_part_number),'') is not null then 'EA' else v_type end);
begin
 select organization_id into v_org from organization_members where user_id=auth.uid() order by created_at limit 1;
 select * into v_parent from cargo_units where id=p_parent_id and organization_id=v_org;
 if not found then raise exception 'Parent cargo node not found'; end if;
 -- Part/SKU text is descriptive only. Part Master creation/linking must be explicit.
 insert into cargo_units(organization_id,job_id,parent_id,handling_unit_code,uin,description,package_type,quantity,weight_lb,length_in,width_in,height_in,status,warehouse_location_id,sku,part_number,serial_number,lot_number,uom,inventory_item_id,metadata)
 values(v_org,v_parent.job_id,p_parent_id,v_type||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,6),'UIN-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),p_description,v_type,coalesce(p_quantity,1),p_weight_lb,p_length_in,p_width_in,p_height_in,'received'::cargo_status,v_parent.warehouse_location_id,nullif(trim(p_sku),''),nullif(trim(p_part_number),''),nullif(trim(p_serial_number),''),nullif(trim(p_lot_number),''),v_uom,null,jsonb_build_object('created_manually',true)) returning * into v_new;
 return v_new;
end;$function$;

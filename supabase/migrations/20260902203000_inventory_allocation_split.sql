create or replace function public.inventory_allocation_snapshot()
returns table(cargo_unit_id uuid, allocated_quantity numeric)
language sql
security definer
set search_path=public
as $$
  select crl.cargo_unit_id, coalesce(sum(crl.requested_quantity),0)::numeric
  from public.cargo_release_lines crl
  join public.cargo_releases cr on cr.id=crl.cargo_release_id
  where cr.status in ('ALLOCATED','READY')
  group by crl.cargo_unit_id;
$$;

create or replace function public.inventory_split(
  p_cargo_unit_id uuid,
  p_split_quantity numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  c record;
  org uuid;
  new_id uuid;
begin
  select * into c
  from public.cargo_units
  where id=p_cargo_unit_id
  for update;

  if c.id is null then raise exception 'Cargo unit not found'; end if;
  if p_split_quantity <= 0 then raise exception 'Split quantity must be greater than zero'; end if;
  if p_split_quantity >= coalesce(c.quantity,0) then raise exception 'Split quantity must be less than current quantity'; end if;
  if c.serial_number is not null and btrim(c.serial_number)<>'' then raise exception 'Serialized inventory cannot be quantity-split'; end if;

  org:=public.bootstrap_workspace('NODARA Workspace');

  update public.cargo_units
  set quantity=c.quantity-p_split_quantity
  where id=c.id;

  insert into public.cargo_units(
    parent_id,job_id,inventory_item_id,package_type,quantity,uom,description,status,
    sku,part_number,lot_number,warehouse_location_id,weight_lb,length_in,width_in,height_in
  )
  values(
    c.parent_id,c.job_id,c.inventory_item_id,c.package_type,p_split_quantity,c.uom,c.description,c.status,
    c.sku,c.part_number,c.lot_number,c.warehouse_location_id,c.weight_lb,c.length_in,c.width_in,c.height_in
  )
  returning id into new_id;

  insert into public.inventory_transactions(
    organization_id,cargo_unit_id,transaction_type,quantity_before,quantity_after,
    from_location_id,to_location_id,status_before,status_after,reason,notes
  ) values(
    org,c.id,'SPLIT',c.quantity,c.quantity-p_split_quantity,
    c.warehouse_location_id,c.warehouse_location_id,c.status,c.status,'Split cargo',
    coalesce(p_notes,'')||case when p_notes is null or p_notes='' then '' else ' · ' end||'New cargo unit: '||new_id::text
  );

  insert into public.inventory_transactions(
    organization_id,cargo_unit_id,transaction_type,quantity_before,quantity_after,
    from_location_id,to_location_id,status_before,status_after,reason,notes
  ) values(
    org,new_id,'SPLIT',0,p_split_quantity,
    c.warehouse_location_id,c.warehouse_location_id,c.status,c.status,'Created by split',
    'Source cargo unit: '||c.id::text
  );

  return jsonb_build_object(
    'source_id',c.id,
    'new_id',new_id,
    'source_quantity',c.quantity-p_split_quantity,
    'split_quantity',p_split_quantity
  );
end $$;

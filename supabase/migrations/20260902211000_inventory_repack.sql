alter table public.inventory_transactions
  drop constraint if exists inventory_transactions_transaction_type_check;

alter table public.inventory_transactions
  add constraint inventory_transactions_transaction_type_check
  check (transaction_type in ('MOVE','ADJUST','HOLD','RELEASE_HOLD','CYCLE_COUNT','SPLIT','REPACK'));

create or replace function public.inventory_repack(
  p_source_cargo_unit_id uuid,
  p_move_quantity numeric,
  p_new_package_type text,
  p_new_location_id uuid default null,
  p_new_weight_lb numeric default null,
  p_new_length_in numeric default null,
  p_new_width_in numeric default null,
  p_new_height_in numeric default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  src record;
  org uuid;
  new_root_id uuid;
  new_child_id uuid;
  new_hu text;
  target_location uuid;
begin
  select * into src
  from public.cargo_units
  where id = p_source_cargo_unit_id
  for update;

  if src.id is null then
    raise exception 'Source cargo unit not found';
  end if;

  if p_move_quantity is null or p_move_quantity <= 0 then
    raise exception 'Repack quantity must be greater than zero';
  end if;

  if p_move_quantity > coalesce(src.quantity,0) then
    raise exception 'Repack quantity exceeds source quantity';
  end if;

  if src.serial_number is not null and btrim(src.serial_number) <> '' and p_move_quantity <> src.quantity then
    raise exception 'Serialized cargo cannot be partially repacked';
  end if;

  if p_new_package_type is null or btrim(p_new_package_type) = '' then
    raise exception 'New handling unit package type is required';
  end if;

  org := public.bootstrap_workspace('NODARA Workspace');
  target_location := coalesce(p_new_location_id, src.warehouse_location_id);
  new_hu := 'HU-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));

  insert into public.cargo_units(
    parent_id,job_id,package_type,quantity,uom,description,status,
    warehouse_location_id,weight_lb,length_in,width_in,height_in,
    handling_unit_code,uin
  ) values (
    null,src.job_id,upper(p_new_package_type),1,
    case upper(p_new_package_type)
      when 'PALLET' then 'PLT'
      when 'BOX' then 'BOX'
      when 'CARTON' then 'CTN'
      when 'CRATE' then 'CRT'
      else 'EA'
    end,
    'Repacked handling unit',src.status,
    target_location,p_new_weight_lb,p_new_length_in,p_new_width_in,p_new_height_in,
    new_hu,new_hu
  ) returning id into new_root_id;

  insert into public.cargo_units(
    parent_id,job_id,inventory_item_id,package_type,quantity,uom,description,status,
    sku,part_number,serial_number,lot_number,
    weight_lb,length_in,width_in,height_in
  ) values (
    new_root_id,src.job_id,src.inventory_item_id,src.package_type,p_move_quantity,src.uom,src.description,src.status,
    src.sku,src.part_number,src.serial_number,src.lot_number,
    src.weight_lb,src.length_in,src.width_in,src.height_in
  ) returning id into new_child_id;

  update public.cargo_units
  set quantity = quantity - p_move_quantity
  where id = src.id;

  insert into public.inventory_transactions(
    organization_id,cargo_unit_id,transaction_type,
    quantity_before,quantity_after,
    from_location_id,to_location_id,
    status_before,status_after,reason,notes
  ) values (
    org,src.id,'REPACK',src.quantity,src.quantity-p_move_quantity,
    src.warehouse_location_id,target_location,
    src.status,src.status,'Repacked cargo',
    coalesce(p_notes,'') || case when coalesce(p_notes,'')='' then '' else ' · ' end ||
    'Moved ' || p_move_quantity::text || ' ' || coalesce(src.uom,'') || ' to ' || new_hu
  );

  insert into public.inventory_transactions(
    organization_id,cargo_unit_id,transaction_type,
    quantity_before,quantity_after,
    from_location_id,to_location_id,
    status_before,status_after,reason,notes
  ) values (
    org,new_child_id,'REPACK',0,p_move_quantity,
    src.warehouse_location_id,target_location,
    src.status,src.status,'Created by repack',
    'Source cargo unit: ' || src.id::text || ' · New handling unit: ' || new_hu
  );

  return jsonb_build_object(
    'source_id',src.id,
    'source_remaining',src.quantity-p_move_quantity,
    'new_root_id',new_root_id,
    'new_child_id',new_child_id,
    'handling_unit_code',new_hu,
    'moved_quantity',p_move_quantity
  );
end $$;

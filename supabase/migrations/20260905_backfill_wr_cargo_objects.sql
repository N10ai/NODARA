-- NODARA: repair/backfill existing Warehouse Receipt cargo into canonical cargo_objects
-- Safe to re-run.

-- 1) Ensure every existing cargo_unit has a canonical cargo_object row.
insert into public.cargo_objects (
  id, organization_id, cargo_code, source_type, source_id, parent_cargo_id,
  package_type, quantity, uom, description, gross_weight, weight_unit,
  length, width, height, dimension_unit, volume_cbm, warehouse_location_id,
  status, metadata, created_at, updated_at
)
select
  coalesce(cu.cargo_object_id, cu.id),
  cu.organization_id,
  coalesce(cu.uin, cu.handling_unit_code),
  'WAREHOUSE_RECEIPT',
  wr.id,
  null,
  cu.package_type,
  coalesce(cu.quantity,1),
  cu.uom,
  cu.description,
  cu.weight_lb,
  'LB',
  cu.length_in,
  cu.width_in,
  cu.height_in,
  'IN',
  case when coalesce(cu.length_in,0)>0 and coalesce(cu.width_in,0)>0 and coalesce(cu.height_in,0)>0
       then (cu.length_in*cu.width_in*cu.height_in*coalesce(cu.quantity,1))/61023.744
       else null end,
  cu.warehouse_location_id,
  'AVAILABLE',
  jsonb_strip_nulls(jsonb_build_object(
    'legacy_cargo_unit_id', cu.id,
    'part_number', cu.part_number,
    'sku', cu.sku,
    'serial_number', cu.serial_number,
    'lot_number', cu.lot_number,
    'inventory_quantity', coalesce(cu.metadata->'inventory_quantity', to_jsonb(cu.quantity)),
    'inventory_uom', coalesce(cu.metadata->'inventory_uom', to_jsonb(cu.uom)),
    'barcode', cu.metadata->'barcode'
  )),
  coalesce(cu.created_at, now()),
  now()
from public.cargo_units cu
join public.warehouse_receipts wr on wr.job_id = cu.job_id
where not exists (
  select 1 from public.cargo_objects co
  where co.id = coalesce(cu.cargo_object_id, cu.id)
);

-- 2) Repair canonical rows created by the first migration that lacked WR source_id.
update public.cargo_objects co
set source_type='WAREHOUSE_RECEIPT',
    source_id=wr.id,
    cargo_code=coalesce(cu.uin,cu.handling_unit_code,co.cargo_code),
    package_type=coalesce(cu.package_type,co.package_type),
    quantity=coalesce(cu.quantity,co.quantity,1),
    uom=coalesce(cu.uom,co.uom),
    description=coalesce(cu.description,co.description),
    gross_weight=coalesce(cu.weight_lb,co.gross_weight),
    weight_unit='LB',
    length=coalesce(cu.length_in,co.length),
    width=coalesce(cu.width_in,co.width),
    height=coalesce(cu.height_in,co.height),
    dimension_unit='IN',
    warehouse_location_id=coalesce(cu.warehouse_location_id,co.warehouse_location_id),
    status=case when upper(coalesce(cu.status,'')) in ('RELEASED','VOID','DELETED') then upper(cu.status) else 'AVAILABLE' end,
    metadata=coalesce(co.metadata,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'legacy_cargo_unit_id',cu.id,
      'part_number',cu.part_number,
      'sku',cu.sku,
      'serial_number',cu.serial_number,
      'lot_number',cu.lot_number,
      'inventory_quantity',coalesce(cu.metadata->'inventory_quantity',to_jsonb(cu.quantity)),
      'inventory_uom',coalesce(cu.metadata->'inventory_uom',to_jsonb(cu.uom)),
      'barcode',cu.metadata->'barcode'
    )),
    updated_at=now()
from public.cargo_units cu
join public.warehouse_receipts wr on wr.job_id=cu.job_id
where co.id=coalesce(cu.cargo_object_id,cu.id);

-- 3) Restore hierarchy only after all objects exist.
update public.cargo_objects child
set parent_cargo_id = coalesce(parent_cu.cargo_object_id,parent_cu.id), updated_at=now()
from public.cargo_units cu
join public.cargo_units parent_cu on parent_cu.id=cu.parent_id
where child.id=coalesce(cu.cargo_object_id,cu.id)
  and exists (select 1 from public.cargo_objects p where p.id=coalesce(parent_cu.cargo_object_id,parent_cu.id));

-- 4) Point cargo_units at their canonical object.
update public.cargo_units cu
set cargo_object_id=coalesce(cu.cargo_object_id,cu.id)
where exists (select 1 from public.cargo_objects co where co.id=coalesce(cu.cargo_object_id,cu.id));

-- 5) Make every WR cargo object addressable from its receipt.
insert into public.cargo_assignments (
  organization_id,cargo_object_id,transaction_type,transaction_id,assignment_role,status
)
select co.organization_id,co.id,'WAREHOUSE_RECEIPT',co.source_id,'SOURCE','ASSIGNED'
from public.cargo_objects co
where co.source_type='WAREHOUSE_RECEIPT' and co.source_id is not null
on conflict (cargo_object_id,transaction_type,transaction_id,assignment_role)
do update set status='ASSIGNED',updated_at=now();

notify pgrst,'reload schema';

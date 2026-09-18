-- NODARA FTZ / ICRS foundation: configurable control identity + first-class admissions.
create table if not exists public.ftz_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  inventory_identification_method text not null default 'ZONE_LOT' check (inventory_identification_method in ('ZONE_LOT','UIN','OTHER')),
  identity_numbering_method text not null default 'ADMISSION_NUMBER' check (identity_numbering_method in ('ADMISSION_NUMBER','INDEPENDENT_SEQUENCE','MANUAL')),
  depletion_method text not null default 'SPECIFIC_IDENTITY' check (depletion_method in ('SPECIFIC_IDENTITY','FIFO','OTHER')),
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table if not exists public.ftz_admissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  admission_number text not null,
  cbp_admission_number text,
  admission_status text not null default 'PREPARING' check (admission_status in ('PREPARING','AWAITING_DOCS','READY_TO_FILE','FILED','AUTHORIZED','RECEIVING','SUSPENSE','RECONCILING','CLOSED','CANCELLED')),
  admission_type text,
  requested_ftz_status text check (requested_ftz_status is null or requested_ftz_status in ('PF','NPF','DOMESTIC','ZR')),
  applicant_entity_id uuid references public.entities(id),
  customer_entity_id uuid references public.entities(id),
  carrier_entity_id uuid references public.entities(id),
  source_reference text,
  arrival_date timestamptz,
  authorized_at timestamptz,
  closed_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  unique(organization_id, admission_number)
);

create table if not exists public.ftz_inventory_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  admission_id uuid not null references public.ftz_admissions(id) on delete cascade,
  identity_type text not null check (identity_type in ('ZONE_LOT','UIN','OTHER')),
  identity_number text not null,
  status text not null default 'OPEN' check (status in ('OPEN','HOLD','CLOSED','VOID')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique(organization_id, identity_type, identity_number)
);

create table if not exists public.ftz_admission_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  admission_id uuid not null references public.ftz_admissions(id) on delete cascade,
  warehouse_receipt_id uuid not null references public.warehouse_receipts(id) on delete cascade,
  role text not null default 'RECEIVING',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique(admission_id, warehouse_receipt_id)
);

create table if not exists public.ftz_inventory_identity_cargo (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inventory_identity_id uuid not null references public.ftz_inventory_identities(id) on delete cascade,
  cargo_object_id uuid not null references public.cargo_objects(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid default auth.uid(),
  metadata jsonb not null default '{}'::jsonb,
  unique(inventory_identity_id,cargo_object_id)
);

create table if not exists public.ftz_admission_reconciliation (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  admission_id uuid not null references public.ftz_admissions(id) on delete cascade,
  cargo_object_id uuid references public.cargo_objects(id) on delete cascade,
  quantity_uom text,
  expected_quantity numeric not null default 0,
  received_quantity numeric not null default 0,
  variance_quantity numeric generated always as (received_quantity-expected_quantity) stored,
  resolution_status text not null default 'OPEN' check (resolution_status in ('OPEN','MATCHED','EXPLAINED','CORRECTED','ACCEPTED')),
  resolution_note text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ftz_admissions_org_status on public.ftz_admissions(organization_id,admission_status);
create index if not exists idx_ftz_identity_admission on public.ftz_inventory_identities(admission_id);
create index if not exists idx_ftz_identity_cargo on public.ftz_inventory_identity_cargo(cargo_object_id);
create index if not exists idx_ftz_reconciliation_admission on public.ftz_admission_reconciliation(admission_id);

alter table public.ftz_settings enable row level security;
alter table public.ftz_admissions enable row level security;
alter table public.ftz_inventory_identities enable row level security;
alter table public.ftz_admission_receipts enable row level security;
alter table public.ftz_inventory_identity_cargo enable row level security;
alter table public.ftz_admission_reconciliation enable row level security;

drop policy if exists ftz_settings_org_access on public.ftz_settings;
create policy ftz_settings_org_access on public.ftz_settings for all to authenticated using (public.nodara_is_org_member(organization_id)) with check (public.nodara_is_org_member(organization_id));
drop policy if exists ftz_admissions_org_access on public.ftz_admissions;
create policy ftz_admissions_org_access on public.ftz_admissions for all to authenticated using (public.nodara_is_org_member(organization_id)) with check (public.nodara_is_org_member(organization_id));
drop policy if exists ftz_inventory_identities_org_access on public.ftz_inventory_identities;
create policy ftz_inventory_identities_org_access on public.ftz_inventory_identities for all to authenticated using (public.nodara_is_org_member(organization_id)) with check (public.nodara_is_org_member(organization_id));
drop policy if exists ftz_admission_receipts_org_access on public.ftz_admission_receipts;
create policy ftz_admission_receipts_org_access on public.ftz_admission_receipts for all to authenticated using (public.nodara_is_org_member(organization_id)) with check (public.nodara_is_org_member(organization_id));
drop policy if exists ftz_inventory_identity_cargo_org_access on public.ftz_inventory_identity_cargo;
create policy ftz_inventory_identity_cargo_org_access on public.ftz_inventory_identity_cargo for all to authenticated using (public.nodara_is_org_member(organization_id)) with check (public.nodara_is_org_member(organization_id));
drop policy if exists ftz_admission_reconciliation_org_access on public.ftz_admission_reconciliation;
create policy ftz_admission_reconciliation_org_access on public.ftz_admission_reconciliation for all to authenticated using (public.nodara_is_org_member(organization_id)) with check (public.nodara_is_org_member(organization_id));

create or replace function public.nodara_create_ftz_admission(
  p_organization_id uuid,
  p_admission_number text default null,
  p_source_reference text default null,
  p_requested_ftz_status text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_id uuid; v_number text; v_settings public.ftz_settings%rowtype; v_identity_number text;
begin
  if not public.nodara_is_org_member(p_organization_id) then raise exception 'Workspace access denied'; end if;
  insert into public.ftz_settings(organization_id) values(p_organization_id) on conflict(organization_id) do nothing;
  select * into v_settings from public.ftz_settings where organization_id=p_organization_id;
  v_number:=nullif(btrim(p_admission_number),'');
  if v_number is null then v_number:=public.next_document_number(p_organization_id,'FTZ_ADMISSION'); end if;
  insert into public.ftz_admissions(organization_id,admission_number,source_reference,requested_ftz_status)
  values(p_organization_id,v_number,nullif(btrim(p_source_reference),''),p_requested_ftz_status) returning id into v_id;
  if v_settings.identity_numbering_method='ADMISSION_NUMBER' then
    v_identity_number:=v_number;
    insert into public.ftz_inventory_identities(organization_id,admission_id,identity_type,identity_number)
    values(p_organization_id,v_id,v_settings.inventory_identification_method,v_identity_number);
  end if;
  return v_id;
end $$;
revoke execute on function public.nodara_create_ftz_admission(uuid,text,text,text) from public,anon;
grant execute on function public.nodara_create_ftz_admission(uuid,text,text,text) to authenticated;

create or replace view public.ftz_admission_workspace with (security_invoker=true) as
select a.*, i.id inventory_identity_id, i.identity_type, i.identity_number, i.status inventory_identity_status,
       count(distinct ar.warehouse_receipt_id) linked_receipts,
       count(distinct r.id) filter (where r.resolution_status='OPEN') open_variances
from public.ftz_admissions a
left join public.ftz_inventory_identities i on i.admission_id=a.id and i.status<>'VOID'
left join public.ftz_admission_receipts ar on ar.admission_id=a.id
left join public.ftz_admission_reconciliation r on r.admission_id=a.id
group by a.id,i.id,i.identity_type,i.identity_number,i.status;

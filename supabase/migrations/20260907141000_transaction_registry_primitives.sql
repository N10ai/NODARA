-- NODARA transaction registry + generic parties/references/relationships.
-- Domain tables remain authoritative; registry is universal identity/projection.

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transaction_type text not null,
  domain_record_id uuid not null,
  document_number text,
  subtype text,
  status_projection text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, transaction_type, domain_record_id)
);
create unique index if not exists transactions_document_number_uq on public.transactions(organization_id,transaction_type,document_number) where document_number is not null;
create index if not exists transactions_org_type_idx on public.transactions(organization_id,transaction_type,updated_at desc);

create table if not exists public.transaction_parties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  role_code text not null,
  entity_id uuid references public.entities(id) on delete set null,
  contact_id uuid references public.entity_contacts(id) on delete set null,
  address_id uuid references public.entity_addresses(id) on delete set null,
  party_name_snapshot text,
  contact_snapshot jsonb not null default '{}'::jsonb,
  address_snapshot jsonb not null default '{}'::jsonb,
  is_primary boolean not null default true,
  sequence_no integer not null default 0,
  source text not null default 'SYSTEM',
  provenance jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists transaction_parties_primary_role_uq on public.transaction_parties(transaction_id,role_code) where is_primary;
create index if not exists transaction_parties_txn_idx on public.transaction_parties(transaction_id,role_code,sequence_no);

create table if not exists public.transaction_references (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  reference_type text not null,
  reference_value text not null,
  issuer_entity_id uuid references public.entities(id) on delete set null,
  is_primary boolean not null default false,
  source text not null default 'SYSTEM',
  provenance jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(transaction_id,reference_type,reference_value)
);
create unique index if not exists transaction_references_primary_type_uq on public.transaction_references(transaction_id,reference_type) where is_primary;
create index if not exists transaction_references_search_idx on public.transaction_references(organization_id,reference_type,reference_value);

create table if not exists public.transaction_relationships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  from_transaction_id uuid not null references public.transactions(id) on delete cascade,
  relationship_type text not null,
  to_transaction_id uuid not null references public.transactions(id) on delete cascade,
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (from_transaction_id <> to_transaction_id),
  unique(from_transaction_id,relationship_type,to_transaction_id)
);
create unique index if not exists transaction_relationships_primary_type_uq on public.transaction_relationships(from_transaction_id,relationship_type) where is_primary;
create index if not exists transaction_relationships_from_idx on public.transaction_relationships(from_transaction_id,relationship_type);
create index if not exists transaction_relationships_to_idx on public.transaction_relationships(to_transaction_id,relationship_type);

alter table public.transactions enable row level security;
alter table public.transaction_parties enable row level security;
alter table public.transaction_references enable row level security;
alter table public.transaction_relationships enable row level security;

drop policy if exists transactions_org_access on public.transactions;
create policy transactions_org_access on public.transactions for all using (public.nodara_is_org_member(organization_id)) with check (public.nodara_is_org_member(organization_id));
drop policy if exists transaction_parties_org_access on public.transaction_parties;
create policy transaction_parties_org_access on public.transaction_parties for all using (public.nodara_is_org_member(organization_id)) with check (public.nodara_is_org_member(organization_id));
drop policy if exists transaction_references_org_access on public.transaction_references;
create policy transaction_references_org_access on public.transaction_references for all using (public.nodara_is_org_member(organization_id)) with check (public.nodara_is_org_member(organization_id));
drop policy if exists transaction_relationships_org_access on public.transaction_relationships;
create policy transaction_relationships_org_access on public.transaction_relationships for all using (public.nodara_is_org_member(organization_id)) with check (public.nodara_is_org_member(organization_id));

create or replace function public.nodara_validate_transaction_child()
returns trigger language plpgsql security definer set search_path=public as $$
declare tx public.transactions%rowtype;
begin
  select * into tx from public.transactions where id=new.transaction_id;
  if tx.id is null then raise exception 'Transaction not found'; end if;
  if tx.organization_id<>new.organization_id then raise exception 'Transaction workspace mismatch'; end if;
  if auth.uid() is not null and not public.nodara_is_org_member(new.organization_id) then raise exception 'Workspace access denied'; end if;
  if tg_table_name='transaction_parties' then
    if new.entity_id is not null and not exists(select 1 from public.entities e where e.id=new.entity_id and e.organization_id=new.organization_id) then raise exception 'Party entity workspace mismatch'; end if;
    if new.contact_id is not null and not exists(select 1 from public.entity_contacts c where c.id=new.contact_id and c.organization_id=new.organization_id) then raise exception 'Party contact workspace mismatch'; end if;
    if new.address_id is not null and not exists(select 1 from public.entity_addresses a where a.id=new.address_id and a.organization_id=new.organization_id) then raise exception 'Party address workspace mismatch'; end if;
  elsif tg_table_name='transaction_references' then
    if new.issuer_entity_id is not null and not exists(select 1 from public.entities e where e.id=new.issuer_entity_id and e.organization_id=new.organization_id) then raise exception 'Reference issuer workspace mismatch'; end if;
    new.reference_value:=btrim(new.reference_value);
    if new.reference_value='' then raise exception 'Reference value cannot be blank'; end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_transaction_parties_validate on public.transaction_parties;
create trigger trg_transaction_parties_validate before insert or update on public.transaction_parties for each row execute function public.nodara_validate_transaction_child();
drop trigger if exists trg_transaction_references_validate on public.transaction_references;
create trigger trg_transaction_references_validate before insert or update on public.transaction_references for each row execute function public.nodara_validate_transaction_child();

create or replace function public.nodara_validate_transaction_relationship()
returns trigger language plpgsql security definer set search_path=public as $$
declare f public.transactions%rowtype; t public.transactions%rowtype;
begin
  select * into f from public.transactions where id=new.from_transaction_id;
  select * into t from public.transactions where id=new.to_transaction_id;
  if f.id is null or t.id is null then raise exception 'Relationship transaction not found'; end if;
  if f.organization_id<>new.organization_id or t.organization_id<>new.organization_id then raise exception 'Relationship workspace mismatch'; end if;
  if auth.uid() is not null and not public.nodara_is_org_member(new.organization_id) then raise exception 'Workspace access denied'; end if;
  return new;
end $$;
drop trigger if exists trg_transaction_relationship_validate on public.transaction_relationships;
create trigger trg_transaction_relationship_validate before insert or update on public.transaction_relationships for each row execute function public.nodara_validate_transaction_relationship();

create or replace function public.nodara_sync_transaction_registry()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_type text; v_number text; v_status text; v_subtype text;
begin
  if tg_table_name='warehouse_receipts' then v_type:='WAREHOUSE_RECEIPT';
  elsif tg_table_name='cargo_releases' then v_type:='CARGO_RELEASE';
  elsif tg_table_name='shipments' then v_type:='SHIPMENT';
  elsif tg_table_name='transport_orders' then v_type:='TRANSPORT_ORDER';
  else raise exception 'Unsupported transaction registry source %',tg_table_name; end if;
  if tg_op='DELETE' then delete from public.transactions where transaction_type=v_type and organization_id=old.organization_id and domain_record_id=old.id; return old; end if;
  if tg_table_name='warehouse_receipts' then v_number:=new.receipt_number; v_status:=new.status::text; v_subtype:='RECEIPT';
  elsif tg_table_name='cargo_releases' then v_number:=new.release_number; v_status:=new.status; v_subtype:='RELEASE';
  elsif tg_table_name='shipments' then v_number:=new.shipment_number; v_status:=new.status; v_subtype:=coalesce(new.mode,'GENERAL');
  elsif tg_table_name='transport_orders' then v_number:=new.order_number; v_status:=new.status; v_subtype:=coalesce(new.order_type,'GENERAL'); end if;
  insert into public.transactions(organization_id,transaction_type,domain_record_id,document_number,status_projection,subtype,created_at,updated_at)
  values(new.organization_id,v_type,new.id,v_number,v_status,v_subtype,coalesce(new.created_at,now()),now())
  on conflict(organization_id,transaction_type,domain_record_id) do update set document_number=excluded.document_number,status_projection=excluded.status_projection,subtype=excluded.subtype,updated_at=now();
  return new;
end $$;

drop trigger if exists trg_registry_wr on public.warehouse_receipts;
create trigger trg_registry_wr after insert or update or delete on public.warehouse_receipts for each row execute function public.nodara_sync_transaction_registry();
drop trigger if exists trg_registry_cr on public.cargo_releases;
create trigger trg_registry_cr after insert or update or delete on public.cargo_releases for each row execute function public.nodara_sync_transaction_registry();
drop trigger if exists trg_registry_shipment on public.shipments;
create trigger trg_registry_shipment after insert or update or delete on public.shipments for each row execute function public.nodara_sync_transaction_registry();
drop trigger if exists trg_registry_transport on public.transport_orders;
create trigger trg_registry_transport after insert or update or delete on public.transport_orders for each row execute function public.nodara_sync_transaction_registry();

-- Compatibility backfill.
insert into public.transactions(organization_id,transaction_type,domain_record_id,document_number,status_projection,subtype,created_at,updated_at)
select organization_id,'WAREHOUSE_RECEIPT',id,receipt_number,status::text,'RECEIPT',created_at,updated_at from public.warehouse_receipts on conflict(organization_id,transaction_type,domain_record_id) do update set document_number=excluded.document_number,status_projection=excluded.status_projection,subtype=excluded.subtype,updated_at=excluded.updated_at;
insert into public.transactions(organization_id,transaction_type,domain_record_id,document_number,status_projection,subtype,created_at,updated_at)
select organization_id,'CARGO_RELEASE',id,release_number,status,'RELEASE',created_at,updated_at from public.cargo_releases on conflict(organization_id,transaction_type,domain_record_id) do update set document_number=excluded.document_number,status_projection=excluded.status_projection,subtype=excluded.subtype,updated_at=excluded.updated_at;
insert into public.transactions(organization_id,transaction_type,domain_record_id,document_number,status_projection,subtype,created_at,updated_at)
select organization_id,'SHIPMENT',id,shipment_number,status,coalesce(mode,'GENERAL'),created_at,updated_at from public.shipments on conflict(organization_id,transaction_type,domain_record_id) do update set document_number=excluded.document_number,status_projection=excluded.status_projection,subtype=excluded.subtype,updated_at=excluded.updated_at;
insert into public.transactions(organization_id,transaction_type,domain_record_id,document_number,status_projection,subtype,created_at,updated_at)
select organization_id,'TRANSPORT_ORDER',id,order_number,status,coalesce(order_type,'GENERAL'),created_at,updated_at from public.transport_orders on conflict(organization_id,transaction_type,domain_record_id) do update set document_number=excluded.document_number,status_projection=excluded.status_projection,subtype=excluded.subtype,updated_at=excluded.updated_at;

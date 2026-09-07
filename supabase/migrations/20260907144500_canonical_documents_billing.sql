-- Canonical document linkage/versioning and operational billing traceability.

delete from public.operational_charges oc where upper(coalesce(oc.source_type,''))='WAREHOUSE_RECEIPT' and not exists(select 1 from public.warehouse_receipts wr where wr.id=oc.source_id and wr.organization_id=oc.organization_id);

alter table public.documents add column if not exists transaction_id uuid references public.transactions(id) on delete cascade;
alter table public.documents add column if not exists cargo_object_id uuid references public.cargo_objects(id) on delete set null;
alter table public.documents add column if not exists template_id uuid references public.document_templates_v2(id) on delete set null;
alter table public.documents add column if not exists display_name text;
alter table public.documents add column if not exists document_number text;
alter table public.documents add column if not exists version_no integer not null default 1;
alter table public.documents add column if not exists is_current boolean not null default true;
alter table public.documents add column if not exists supersedes_document_id uuid references public.documents(id) on delete set null;
alter table public.documents add column if not exists provenance jsonb not null default '{}'::jsonb;
alter table public.documents add column if not exists updated_at timestamptz not null default now();
create index if not exists documents_transaction_idx on public.documents(transaction_id,document_type,created_at desc);
create index if not exists documents_cargo_object_idx on public.documents(cargo_object_id,created_at desc);

create table if not exists public.document_links (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 document_id uuid not null references public.documents(id) on delete cascade, transaction_id uuid references public.transactions(id) on delete cascade,
 cargo_object_id uuid references public.cargo_objects(id) on delete cascade, entity_id uuid references public.entities(id) on delete cascade,
 link_role text not null default 'SUPPORTING', is_primary boolean not null default false, provenance jsonb not null default '{}'::jsonb,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), check (transaction_id is not null or cargo_object_id is not null or entity_id is not null)
);
create unique index if not exists document_links_identity_uq on public.document_links(document_id,coalesce(transaction_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(cargo_object_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(entity_id,'00000000-0000-0000-0000-000000000000'::uuid),link_role);
create index if not exists document_links_transaction_idx on public.document_links(transaction_id,created_at desc);
alter table public.document_links enable row level security;
drop policy if exists document_links_org_access on public.document_links;
create policy document_links_org_access on public.document_links for all using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));

alter table public.signature_requests add column if not exists transaction_id uuid references public.transactions(id) on delete cascade;
alter table public.signature_requests add column if not exists provenance jsonb not null default '{}'::jsonb;

insert into public.documents(id,organization_id,job_id,cargo_unit_id,warehouse_receipt_id,transaction_id,cargo_object_id,document_type,storage_path,file_name,mime_type,created_by,created_at,category,source,status,notes,metadata,display_name,version_no,is_current,provenance,updated_at)
select a.id,a.organization_id,wr.job_id,a.cargo_unit_id,a.warehouse_receipt_id,t.id,a.cargo_unit_id,coalesce(nullif(a.category,''),nullif(a.kind,''),'OTHER'),a.storage_path,a.file_name,a.mime_type,a.uploaded_by,a.created_at,a.category,'WR_ATTACHMENT_LEGACY','ACTIVE',a.notes,coalesce(a.metadata,'{}'::jsonb)||jsonb_build_object('legacy_attachment_id',a.id,'view_label',a.view_label,'group_name',a.group_name),a.file_name,1,true,jsonb_build_object('source_type','SYSTEM','migration','WR_ATTACHMENT_LEGACY'),a.created_at
from public.warehouse_receipt_attachments a join public.warehouse_receipts wr on wr.id=a.warehouse_receipt_id join public.transactions t on t.organization_id=a.organization_id and t.transaction_type='WAREHOUSE_RECEIPT' and t.domain_record_id=a.warehouse_receipt_id on conflict(id) do nothing;
insert into public.document_links(organization_id,document_id,transaction_id,cargo_object_id,link_role,is_primary,provenance)
select d.organization_id,d.id,d.transaction_id,d.cargo_object_id,case when d.category='PHOTO' then 'PHOTO' else 'SUPPORTING' end,true,jsonb_build_object('source_type','SYSTEM','migration','WR_ATTACHMENT_LEGACY') from public.documents d where d.source='WR_ATTACHMENT_LEGACY' and d.transaction_id is not null on conflict do nothing;

alter table public.operational_charges add column if not exists transaction_id uuid references public.transactions(id) on delete cascade;
alter table public.operational_charges add column if not exists billing_rule_id uuid references public.service_agreement_billing_rules(id) on delete set null;
alter table public.operational_charges add column if not exists calculation_snapshot_id uuid references public.calculation_snapshots(id) on delete set null;
alter table public.operational_charges add column if not exists quantity_source text;
alter table public.operational_charges add column if not exists quantity_snapshot jsonb not null default '{}'::jsonb;
alter table public.operational_charges add column if not exists provenance jsonb not null default '{}'::jsonb;
alter table public.operational_charges add column if not exists created_by uuid;
create index if not exists operational_charges_transaction_idx on public.operational_charges(transaction_id,created_at desc);
update public.operational_charges oc set transaction_id=t.id from public.transactions t where oc.transaction_id is null and t.organization_id=oc.organization_id and t.transaction_type=upper(oc.source_type) and t.domain_record_id=oc.source_id;
update public.operational_charges oc set billing_rule_id=br.id from public.service_agreement_billing_rules br where oc.billing_rule_id is null and br.organization_id=oc.organization_id and br.id=oc.rate_source_id and upper(coalesce(oc.rate_source,''))='SERVICE_AGREEMENT';

create or replace function public.nodara_validate_document_link()
returns trigger language plpgsql security definer set search_path=public as $$
declare dorg uuid; xorg uuid;
begin
 select organization_id into dorg from public.documents where id=new.document_id; if dorg is null or dorg<>new.organization_id then raise exception 'Document workspace mismatch'; end if;
 if auth.uid() is not null and not public.nodara_is_org_member(new.organization_id) then raise exception 'Workspace access denied'; end if;
 if new.transaction_id is not null then select organization_id into xorg from public.transactions where id=new.transaction_id; if xorg is null or xorg<>new.organization_id then raise exception 'Transaction workspace mismatch'; end if; end if;
 if new.cargo_object_id is not null then select organization_id into xorg from public.cargo_objects where id=new.cargo_object_id; if xorg is null or xorg<>new.organization_id then raise exception 'Cargo workspace mismatch'; end if; end if;
 if new.entity_id is not null then select organization_id into xorg from public.entities where id=new.entity_id; if xorg is null or xorg<>new.organization_id then raise exception 'Entity workspace mismatch'; end if; end if; return new;
end $$;
drop trigger if exists trg_document_links_validate on public.document_links;
create trigger trg_document_links_validate before insert or update on public.document_links for each row execute function public.nodara_validate_document_link();

create or replace function public.nodara_realize_charge(p_transaction_id uuid,p_service_id uuid,p_quantity numeric,p_unit text,p_sell_rate numeric default null,p_currency text default 'USD',p_billing_rule_id uuid default null,p_calculation_snapshot_id uuid default null,p_description text default null,p_customer_id uuid default null,p_vendor_id uuid default null,p_provenance jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare tx public.transactions%rowtype; br public.service_agreement_billing_rules%rowtype; q numeric:=coalesce(p_quantity,0); rate numeric:=p_sell_rate; unitv text:=upper(p_unit); curr text:=upper(coalesce(p_currency,'USD')); amount numeric; cid uuid; qs text:='MANUAL';
begin
 select * into tx from public.transactions where id=p_transaction_id; if tx.id is null then raise exception 'Transaction not found'; end if; if auth.uid() is not null and not public.nodara_is_org_member(tx.organization_id) then raise exception 'Workspace access denied'; end if; if q<0 then raise exception 'Charge quantity cannot be negative'; end if;
 if not exists(select 1 from public.service_catalog s where s.id=p_service_id and s.organization_id=tx.organization_id) then raise exception 'Service not found in workspace'; end if;
 if p_billing_rule_id is not null then select * into br from public.service_agreement_billing_rules where id=p_billing_rule_id and organization_id=tx.organization_id and active; if br.id is null then raise exception 'Billing rule not found or inactive'; end if; rate:=coalesce(rate,br.rate); unitv:=upper(coalesce(br.unit,unitv)); curr:=upper(coalesce(br.currency,curr)); qs:='BILLING_RULE'; end if;
 if rate is null then raise exception 'Sell rate is required'; end if; amount:=q*rate; if br.id is not null then if br.minimum_charge is not null then amount:=greatest(amount,br.minimum_charge); end if; if br.maximum_charge is not null then amount:=least(amount,br.maximum_charge); end if; end if;
 insert into public.operational_charges(organization_id,transaction_id,customer_id,vendor_id,service_id,source_type,source_id,source_event,description,quantity,unit,sell_rate,sell_amount,currency,rate_source,rate_source_id,billing_rule_id,calculation_snapshot_id,quantity_source,quantity_snapshot,billing_status,vendor_status,provenance,created_by,metadata)
 values(tx.organization_id,tx.id,p_customer_id,p_vendor_id,p_service_id,tx.transaction_type,tx.domain_record_id,'REALIZED',coalesce(p_description,br.rule_code,'Operational charge'),q,unitv,rate,round(amount,2),curr,case when br.id is null then 'MANUAL' else 'SERVICE_AGREEMENT' end,coalesce(br.id,p_billing_rule_id),br.id,p_calculation_snapshot_id,case when p_calculation_snapshot_id is not null then 'CALCULATION' else qs end,jsonb_build_object('quantity',q,'unit',unitv,'calculation_snapshot_id',p_calculation_snapshot_id,'billing_rule_id',br.id),'UNBILLED','UNBILLED',coalesce(p_provenance,'{}'::jsonb),auth.uid(),jsonb_build_object('minimum_charge',br.minimum_charge,'maximum_charge',br.maximum_charge)) returning id into cid;
 perform public.nodara_record_activity(tx.id,'CHARGE_REALIZED','BILLING',coalesce(p_description,br.rule_code,'Operational charge'),jsonb_build_object('charge_id',cid,'quantity',q,'unit',unitv,'rate',rate,'amount',round(amount,2),'currency',curr,'billing_rule_id',br.id,'calculation_snapshot_id',p_calculation_snapshot_id),coalesce(p_provenance,'{}'::jsonb),null); return cid;
end $$;

-- Professional shipment document/versioning and compliance foundation.
create table if not exists public.shipment_document_issues (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 shipment_id uuid not null references public.shipments(id) on delete restrict,
 document_code text not null, document_scope text not null default 'SHIPMENT',
 status text not null default 'DRAFT' check (status in ('DRAFT','ISSUED','VOID')),
 revision integer not null default 1, document_number text,
 data_snapshot jsonb not null default '{}'::jsonb, issued_at timestamptz, voided_at timestamptz,
 created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists shipment_document_issues_shipment_idx on public.shipment_document_issues(organization_id,shipment_id,document_code,status);
alter table public.shipment_document_issues enable row level security;
drop policy if exists shipment_document_issues_org on public.shipment_document_issues;
create policy shipment_document_issues_org on public.shipment_document_issues for all using (organization_id in (select organization_id from public.organization_members where user_id=auth.uid())) with check (organization_id in (select organization_id from public.organization_members where user_id=auth.uid()));

create table if not exists public.shipment_compliance_profiles (
 shipment_id uuid primary key references public.shipments(id) on delete cascade, organization_id uuid not null,
 security_status text, known_shipper_status text, dangerous_goods_status text not null default 'NOT_DECLARED',
 lithium_battery_status text not null default 'NOT_DECLARED', screening_method text, screening_reference text,
 compliance_notes text, metadata jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
);
alter table public.shipment_compliance_profiles enable row level security;
drop policy if exists shipment_compliance_profiles_org on public.shipment_compliance_profiles;
create policy shipment_compliance_profiles_org on public.shipment_compliance_profiles for all using (organization_id in (select organization_id from public.organization_members where user_id=auth.uid())) with check (organization_id in (select organization_id from public.organization_members where user_id=auth.uid()));

create unique index if not exists consolidation_houses_one_shipment_per_consol on public.consolidation_houses(consolidation_id,shipment_id) where shipment_id is not null;

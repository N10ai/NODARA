create table if not exists public.record_billing_states(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, record_type text not null, record_id uuid not null,
 disposition text not null default 'REVIEW' check(disposition in ('REVIEW','NO_CHARGE','READY_TO_BILL','PARTIALLY_BILLED','BILLED','SENT','PARTIALLY_PAID','PAID','VOID')),
 no_charge_reason text, invoice_reference text, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,record_type,record_id));
create index if not exists record_billing_states_lookup_idx on public.record_billing_states(organization_id,record_type,record_id,disposition);
alter table public.record_billing_states enable row level security;
drop policy if exists record_billing_states_org on public.record_billing_states;
create policy record_billing_states_org on public.record_billing_states for all using (public.nodara_is_org_member(organization_id)) with check (public.nodara_is_org_member(organization_id));

create table if not exists public.custom_field_definitions(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, record_type text not null, field_key text not null, label text not null,
 field_type text not null default 'TEXT' check(field_type in ('TEXT','LONG_TEXT','NUMBER','DATE','DATETIME','BOOLEAN','SELECT','MULTI_SELECT','ENTITY','ADDRESS','CONTACT','URL','EMAIL','PHONE')),
 description text, options jsonb not null default '[]'::jsonb, required boolean not null default false, active boolean not null default true,
 show_in_register boolean not null default false, filterable boolean not null default true, sortable boolean not null default false, display_order integer not null default 100,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,record_type,field_key));
create index if not exists custom_field_definitions_record_idx on public.custom_field_definitions(organization_id,record_type,active,display_order);
alter table public.custom_field_definitions enable row level security;
drop policy if exists custom_field_definitions_org on public.custom_field_definitions;
create policy custom_field_definitions_org on public.custom_field_definitions for all using (public.nodara_is_org_member(organization_id)) with check (public.nodara_is_org_member(organization_id));

create table if not exists public.record_custom_field_values(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, record_type text not null, record_id uuid not null,
 field_definition_id uuid not null references public.custom_field_definitions(id) on delete restrict, value jsonb not null default 'null'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,record_type,record_id,field_definition_id));
create index if not exists record_custom_field_values_record_idx on public.record_custom_field_values(organization_id,record_type,record_id);
alter table public.record_custom_field_values enable row level security;
drop policy if exists record_custom_field_values_org on public.record_custom_field_values;
create policy record_custom_field_values_org on public.record_custom_field_values for all using (public.nodara_is_org_member(organization_id)) with check (public.nodara_is_org_member(organization_id));

create or replace function public.nodara_record_indicators(p_organization_id uuid,p_record_type text,p_record_id uuid)
returns jsonb language sql stable security invoker as $$
 select jsonb_build_object(
  'billing',coalesce((select disposition from public.record_billing_states b where b.organization_id=p_organization_id and b.record_type=p_record_type and b.record_id=p_record_id),'REVIEW'),
  'attachments',(select count(*) from public.document_links d where d.organization_id=p_organization_id and d.context_type=p_record_type and d.context_id=p_record_id),
  'related_records',(select count(*) from public.operational_links l where l.organization_id=p_organization_id and l.active=true and ((l.source_type=p_record_type and l.source_id=p_record_id) or (l.target_type=p_record_type and l.target_id=p_record_id))),
  'custom_fields',(select count(*) from public.record_custom_field_values v where v.organization_id=p_organization_id and v.record_type=p_record_type and v.record_id=p_record_id)
 );
$$;
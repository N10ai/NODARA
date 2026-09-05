-- NODARA Operational Context Engine
create table if not exists public.operational_contexts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 target_type text not null, target_id uuid not null,
 direction text check(direction is null or direction in ('INBOUND','OUTBOUND','IMPORT','EXPORT','DOMESTIC','TRANSFER')),
 mode text check(mode is null or mode in ('AIR','OCEAN','GROUND','WAREHOUSE')),
 customs_regime text, bonded boolean not null default false, ftz boolean not null default false,
 ftz_status text, dangerous_goods boolean not null default false, un_numbers text[] not null default '{}',
 origin_country text, destination_country text, origin_port text, destination_port text,
 transaction_stage text, customer_id uuid references public.entities(id) on delete set null,
 context_source text not null default 'SYSTEM', confidence numeric check(confidence is null or (confidence>=0 and confidence<=1)),
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,target_type,target_id)
);
create table if not exists public.operational_rule_library (
 id uuid primary key default gen_random_uuid(), organization_id uuid,
 code text not null, label text not null, priority integer not null default 100, active boolean not null default true,
 conditions jsonb not null default '{}'::jsonb, actions jsonb not null default '[]'::jsonb,
 explanation text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists operational_context_target_idx on public.operational_contexts(organization_id,target_type,target_id);
create index if not exists operational_rule_priority_idx on public.operational_rule_library(organization_id,active,priority);
alter table public.operational_contexts enable row level security;
alter table public.operational_rule_library enable row level security;
drop policy if exists operational_contexts_org_access on public.operational_contexts;
create policy operational_contexts_org_access on public.operational_contexts for all to authenticated using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));
drop policy if exists operational_rule_library_read on public.operational_rule_library;
create policy operational_rule_library_read on public.operational_rule_library for select to authenticated using(organization_id is null or public.nodara_is_org_member(organization_id));
drop policy if exists operational_rule_library_write on public.operational_rule_library;
create policy operational_rule_library_write on public.operational_rule_library for all to authenticated using(organization_id is not null and public.nodara_is_org_member(organization_id)) with check(organization_id is not null and public.nodara_is_org_member(organization_id));
grant select,insert,update,delete on public.operational_contexts to authenticated;
grant select,insert,update,delete on public.operational_rule_library to authenticated;
insert into public.operational_rule_library(organization_id,code,label,priority,conditions,actions,explanation) values
(null,'FTZ_INBOUND_ADMISSION','FTZ inbound admission',10,'{"ftz":true,"direction":["INBOUND","IMPORT"]}','[{"require":"FTZ_214","scope":"CARGO","blocking":true},{"require":"IDENTITY_CONFIRMED","scope":"CARGO","blocking":true}]','FTZ inbound cargo requires admission control and identity.'),
(null,'BONDED_CARGO_7512','Bonded cargo movement',10,'{"bonded":true}','[{"require":"7512","scope":"CARGO","blocking":true}]','Bonded cargo requires bonded movement evidence when applicable.'),
(null,'EXPORT_AES','Export AES readiness',20,'{"direction":"EXPORT"}','[{"require":"AES_ITN","scope":"MASTER","blocking":true}]','Export cargo is evaluated for AES/ITN coverage or exemption.'),
(null,'DG_BASE','Dangerous goods base requirements',10,'{"dangerous_goods":true}','[{"require":"SDS","scope":"CARGO","blocking":true},{"require":"DG_INSPECTION","scope":"CARGO","blocking":true}]','DG cargo activates dangerous-goods documentary and inspection controls.'),
(null,'UN3481','UN3481 lithium battery controls',5,'{"un_number":"UN3481"}','[{"require":"BATTERY_LETTER","scope":"CARGO","blocking":true},{"evaluate":"DGD_APPLICABILITY","scope":"CARGO"}]','UN3481 cargo requires battery evidence and DGD applicability evaluation.'),
(null,'IDENTITY_ALWAYS','Cargo identity control',1,'{}','[{"require":"IDENTITY_CONFIRMED","scope":"CARGO","blocking":true}]','Cargo must be sufficiently identified before final operational release/loading.')
on conflict do nothing;
insert into public.evidence_type_library(code,label,category,default_scope,blocking_default,description) values
('FTZ_214','CBP Form 214 / FTZ Admission','FTZ','CARGO',true,'FTZ admission evidence and admission record.')
on conflict(code) do update set label=excluded.label,category=excluded.category,default_scope=excluded.default_scope,blocking_default=excluded.blocking_default,description=excluded.description;
notify pgrst,'reload schema';
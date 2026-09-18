-- FTZ document case-file organization on top of NODARA canonical documents.
create table if not exists public.ftz_document_links (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 admission_id uuid not null references public.ftz_admissions(id) on delete cascade,
 document_id uuid not null references public.documents(id) on delete cascade,
 category text not null default 'OTHER', record_type text, record_id uuid,
 document_date timestamptz, sequence_no integer, is_key_document boolean not null default false,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), created_by uuid default auth.uid(),
 unique(admission_id,document_id,record_type,record_id)
);
create index if not exists idx_ftz_docs_casefile on public.ftz_document_links(admission_id,category,document_date desc,created_at desc);
alter table public.ftz_document_links enable row level security;
drop policy if exists ftz_document_links_org_access on public.ftz_document_links;
create policy ftz_document_links_org_access on public.ftz_document_links for all to authenticated using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));

create or replace function public.nodara_link_ftz_document(p_admission_id uuid,p_document_id uuid,p_category text default 'OTHER',p_record_type text default null,p_record_id uuid default null,p_document_date timestamptz default null,p_is_key boolean default false)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_doc_org uuid; v_id uuid; v_name text;
begin
 select organization_id into v_org from public.ftz_admissions where id=p_admission_id;
 if v_org is null or not public.nodara_is_org_member(v_org) then raise exception 'Workspace access denied'; end if;
 select organization_id,coalesce(display_name,file_name) into v_doc_org,v_name from public.documents where id=p_document_id;
 if v_doc_org is null or v_doc_org<>v_org then raise exception 'Document workspace mismatch'; end if;
 insert into public.ftz_document_links(organization_id,admission_id,document_id,category,record_type,record_id,document_date,is_key_document)
 values(v_org,p_admission_id,p_document_id,upper(coalesce(nullif(btrim(p_category),''),'OTHER')),upper(nullif(btrim(p_record_type),'')),p_record_id,p_document_date,p_is_key)
 on conflict(admission_id,document_id,record_type,record_id) do update set category=excluded.category,document_date=excluded.document_date,is_key_document=excluded.is_key_document
 returning id into v_id;
 insert into public.ftz_activity_events(organization_id,admission_id,event_at,event_type,title,detail,actor_id,source_type,source_id,metadata)
 values(v_org,p_admission_id,coalesce(p_document_date,now()),'DOCUMENT_LINKED','Document added',v_name,auth.uid(),'DOCUMENT',p_document_id,jsonb_build_object('category',upper(coalesce(p_category,'OTHER')),'record_type',p_record_type,'record_id',p_record_id));
 insert into public.ftz_audit_log(organization_id,admission_id,actor_id,action,record_type,record_id,after_data)
 values(v_org,p_admission_id,auth.uid(),'LINK','DOCUMENT',p_document_id,jsonb_build_object('category',p_category,'record_type',p_record_type,'record_id',p_record_id));
 return v_id;
end $$;
revoke execute on function public.nodara_link_ftz_document(uuid,uuid,text,text,uuid,timestamptz,boolean) from public,anon;
grant execute on function public.nodara_link_ftz_document(uuid,uuid,text,text,uuid,timestamptz,boolean) to authenticated;

create or replace view public.ftz_document_casefile with (security_invoker=true) as
select l.id,l.organization_id,l.admission_id,l.document_id,l.category,l.record_type,l.record_id,l.document_date,l.sequence_no,l.is_key_document,l.created_at,
 d.document_type,d.document_number,d.display_name,d.file_name,d.mime_type,d.storage_path,d.version_no,d.is_current,d.status,d.notes,d.metadata
from public.ftz_document_links l join public.documents d on d.id=l.document_id;

create table if not exists public.ftz_bonded_movements (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 admission_id uuid references public.ftz_admissions(id) on delete set null,
 movement_number text, movement_type text check(movement_type is null or movement_type in ('IT','T&E','IE','OTHER')),
 status text not null default 'DRAFT', origin text,destination text, carrier_entity_id uuid references public.entities(id),
 initiated_at timestamptz,completed_at timestamptz,metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),created_by uuid default auth.uid(),
 unique(organization_id,movement_number)
);
alter table public.ftz_bonded_movements enable row level security;
drop policy if exists ftz_bonded_movements_org_access on public.ftz_bonded_movements;
create policy ftz_bonded_movements_org_access on public.ftz_bonded_movements for all to authenticated using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));

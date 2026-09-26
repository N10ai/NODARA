-- Universal external instructions engine: reusable for Shipment, SLI, FTZ, WR, CR and Transport.
create table if not exists public.instruction_templates (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid,
 code text not null,
 name text not null,
 source_type text not null default 'SHIPMENT',
 mode text,
 version integer not null default 1,
 active boolean not null default true,
 schema jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,code,version)
);

create table if not exists public.instruction_requests (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 request_number text not null,
 template_id uuid references public.instruction_templates(id),
 source_type text not null,
 source_id uuid not null,
 recipient_name text,
 recipient_email text,
 status text not null default 'DRAFT' check(status in ('DRAFT','SENT','OPENED','IN_PROGRESS','SUBMITTED','REVISION_REQUESTED','APPROVED','CANCELLED')),
 secure_token uuid not null default gen_random_uuid() unique,
 expires_at timestamptz,
 current_version integer not null default 0,
 prefill_snapshot jsonb not null default '{}'::jsonb,
 request_message text,
 requested_by uuid default auth.uid(),
 sent_at timestamptz,
 opened_at timestamptz,
 submitted_at timestamptz,
 approved_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,request_number)
);
create index if not exists instruction_requests_source_idx on public.instruction_requests(organization_id,source_type,source_id,created_at desc);

create table if not exists public.instruction_submissions (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 request_id uuid not null references public.instruction_requests(id) on delete restrict,
 version integer not null,
 payload jsonb not null default '{}'::jsonb,
 submitted_by_name text,
 submitted_by_title text,
 certification boolean not null default false,
 signature_name text,
 submitted_at timestamptz not null default now(),
 reviewed_by uuid,
 reviewed_at timestamptz,
 review_status text not null default 'PENDING' check(review_status in ('PENDING','APPROVED','REVISION_REQUESTED','SUPERSEDED')),
 review_notes text,
 unique(request_id,version)
);

create table if not exists public.instruction_attachments (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 request_id uuid not null references public.instruction_requests(id) on delete restrict,
 submission_id uuid references public.instruction_submissions(id) on delete restrict,
 document_id uuid,
 category text,
 file_name text,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

alter table public.instruction_templates enable row level security;
alter table public.instruction_requests enable row level security;
alter table public.instruction_submissions enable row level security;
alter table public.instruction_attachments enable row level security;

drop policy if exists instruction_templates_org on public.instruction_templates;
create policy instruction_templates_org on public.instruction_templates for all
 using (organization_id is null or organization_id in (select organization_id from public.organization_members where user_id=auth.uid()))
 with check (organization_id is null or organization_id in (select organization_id from public.organization_members where user_id=auth.uid()));
drop policy if exists instruction_requests_org on public.instruction_requests;
create policy instruction_requests_org on public.instruction_requests for all
 using (organization_id in (select organization_id from public.organization_members where user_id=auth.uid()))
 with check (organization_id in (select organization_id from public.organization_members where user_id=auth.uid()));
drop policy if exists instruction_submissions_org on public.instruction_submissions;
create policy instruction_submissions_org on public.instruction_submissions for all
 using (organization_id in (select organization_id from public.organization_members where user_id=auth.uid()))
 with check (organization_id in (select organization_id from public.organization_members where user_id=auth.uid()));
drop policy if exists instruction_attachments_org on public.instruction_attachments;
create policy instruction_attachments_org on public.instruction_attachments for all
 using (organization_id in (select organization_id from public.organization_members where user_id=auth.uid()))
 with check (organization_id in (select organization_id from public.organization_members where user_id=auth.uid()));

insert into public.instruction_templates(code,name,source_type,mode,version,schema)
select 'AIR_SHIPPING_INSTRUCTIONS','Air Shipping Instructions','SHIPMENT','AIR',1,
'{"sections":["structure","master_parties","house_parties","cargo","freight","documents","certification"],"structure_options":["UNDECIDED","MASTER_ONLY","HOUSE","CONSOLIDATION"],"freight_terms":["PREPAID","COLLECT"],"conditional_house":true}'::jsonb
where not exists(select 1 from public.instruction_templates where organization_id is null and code='AIR_SHIPPING_INSTRUCTIONS' and version=1);

create or replace function public.nodara_create_instruction_request(
 p_source_type text,p_source_id uuid,p_template_code text,p_recipient_name text default null,p_recipient_email text default null,p_message text default null
) returns public.instruction_requests language plpgsql security invoker set search_path=public as $$
declare org uuid; t uuid; n text; r public.instruction_requests; snap jsonb:='{}'::jsonb;
begin
 if upper(p_source_type)='SHIPMENT' then
   select organization_id, jsonb_build_object('shipment_number',shipment_number,'mode',mode,'direction',direction,'origin_code',origin_code,'destination_code',destination_code,'reference',reference,'pieces',pieces,'weight',weight,'weight_unit',weight_unit,'volume_cbm',volume_cbm)
   into org,snap from shipments where id=p_source_id;
 else raise exception 'Source type % not yet enabled',p_source_type; end if;
 if org is null then raise exception 'Source record not found'; end if;
 select id into t from instruction_templates where code=p_template_code and active=true and (organization_id=org or organization_id is null) order by organization_id nulls last,version desc limit 1;
 if t is null then raise exception 'Instruction template not found'; end if;
 n:='INS-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
 insert into instruction_requests(organization_id,request_number,template_id,source_type,source_id,recipient_name,recipient_email,status,prefill_snapshot,request_message,sent_at)
 values(org,n,t,upper(p_source_type),p_source_id,p_recipient_name,p_recipient_email,'SENT',snap,p_message,now()) returning * into r;
 return r;
end $$;

create or replace function public.nodara_public_instruction(p_token uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r instruction_requests; t instruction_templates;
begin
 select * into r from instruction_requests where secure_token=p_token and status not in ('CANCELLED') and (expires_at is null or expires_at>now());
 if r.id is null then return null; end if;
 select * into t from instruction_templates where id=r.template_id;
 update instruction_requests set status=case when status='SENT' then 'OPENED' else status end,opened_at=coalesce(opened_at,now()),updated_at=now() where id=r.id;
 return jsonb_build_object('request_number',r.request_number,'status',r.status,'recipient_name',r.recipient_name,'prefill',r.prefill_snapshot,'message',r.request_message,'template_code',t.code,'template_name',t.name,'schema',t.schema);
end $$;

create or replace function public.nodara_submit_public_instruction(p_token uuid,p_payload jsonb,p_name text,p_title text default null,p_certification boolean default false,p_signature_name text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r instruction_requests; v integer; sid uuid;
begin
 select * into r from instruction_requests where secure_token=p_token and status not in ('CANCELLED','APPROVED') and (expires_at is null or expires_at>now()) for update;
 if r.id is null then raise exception 'Instruction request is unavailable'; end if;
 if not p_certification then raise exception 'Certification is required'; end if;
 v:=r.current_version+1;
 insert into instruction_submissions(organization_id,request_id,version,payload,submitted_by_name,submitted_by_title,certification,signature_name)
 values(r.organization_id,r.id,v,coalesce(p_payload,'{}'::jsonb),p_name,p_title,true,p_signature_name) returning id into sid;
 update instruction_submissions set review_status='SUPERSEDED' where request_id=r.id and id<>sid and review_status='PENDING';
 update instruction_requests set current_version=v,status='SUBMITTED',submitted_at=now(),updated_at=now() where id=r.id;
 return jsonb_build_object('submission_id',sid,'version',v,'request_number',r.request_number);
end $$;

grant execute on function public.nodara_create_instruction_request(text,uuid,text,text,text,text) to authenticated;
revoke all on function public.nodara_public_instruction(uuid) from public;
revoke all on function public.nodara_submit_public_instruction(uuid,jsonb,text,text,boolean,text) from public;
grant execute on function public.nodara_public_instruction(uuid) to anon,authenticated;
grant execute on function public.nodara_submit_public_instruction(uuid,jsonb,text,text,boolean,text) to anon,authenticated;

-- Undecided is a valid shipment state. Never silently convert it to master-only.
create or replace function public.nodara_initialize_shipment_structure(p_shipment_id uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare s public.shipments; h uuid; c uuid; movement text; structure text;
begin
 select * into s from shipments where id=p_shipment_id; if s.id is null then raise exception 'Shipment not found'; end if;
 structure:=coalesce(nullif(s.metadata->>'document_structure',''),'UNDECIDED');
 movement:=coalesce(nullif(s.metadata->>'movement_type',''),'UNDECIDED');
 if structure in ('UNDECIDED','PENDING') or movement in ('UNDECIDED','PENDING') then
  return jsonb_build_object('shipment_id',s.id,'document_structure',structure,'movement_type',movement,'pending',true);
 end if;
 if structure='HOUSE' then
  insert into shipment_houses(organization_id,shipment_id,house_number,shipper_id,shipper_name,shipper_address,shipper_contact,consignee_id,consignee_name,consignee_address,consignee_contact,metadata)
  values(s.organization_id,s.id,s.house_reference,s.shipper_id,s.shipper_name,s.shipper_address,s.shipper_contact,s.consignee_id,s.consignee_name,s.consignee_address,s.consignee_contact,jsonb_build_object('auto_created',true))
  on conflict(shipment_id) do update set updated_at=now() returning id into h;
 end if;
 if movement='CONSOLIDATION' then
  insert into consolidations(organization_id,consolidation_number,mode,status,origin_code,destination_code,master_reference,booking_reference,carrier_id,etd,eta,metadata)
  values(s.organization_id,'CON-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5)),s.mode,'PLANNING',s.origin_code,s.destination_code,s.master_reference,s.booking_reference,s.carrier_id,s.etd,s.eta,jsonb_build_object('created_from_shipment',s.id)) returning id into c;
  insert into consolidation_houses(organization_id,consolidation_id,shipment_id,sequence_no,readiness,load_plan) values(s.organization_id,c,s.id,1,'{}'::jsonb,'{}'::jsonb) on conflict(consolidation_id,shipment_id) do nothing;
 end if;
 return jsonb_build_object('shipment_id',s.id,'house_id',h,'consolidation_id',c,'document_structure',structure,'movement_type',movement,'pending',false);
end $$;
grant execute on function public.nodara_initialize_shipment_structure(uuid) to authenticated;

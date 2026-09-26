-- Freeze approved instruction submissions as canonical, versioned document snapshots.
create table if not exists public.instruction_document_snapshots (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 request_id uuid not null references public.instruction_requests(id) on delete restrict,
 submission_id uuid not null references public.instruction_submissions(id) on delete restrict,
 source_type text not null,
 source_id uuid not null,
 document_id uuid references public.documents(id) on delete restrict,
 document_code text not null default 'SHIPPING_INSTRUCTIONS',
 version integer not null,
 snapshot jsonb not null,
 content_hash text not null,
 status text not null default 'FINAL' check(status in ('FINAL','SUPERSEDED','VOID')),
 created_by uuid default auth.uid(),
 created_at timestamptz not null default now(),
 unique(submission_id)
);
create index if not exists instruction_document_snapshots_source_idx on public.instruction_document_snapshots(organization_id,source_type,source_id,created_at desc);
alter table public.instruction_document_snapshots enable row level security;
drop policy if exists instruction_document_snapshots_org on public.instruction_document_snapshots;
create policy instruction_document_snapshots_org on public.instruction_document_snapshots for all
 using (organization_id in (select organization_id from public.organization_members where user_id=auth.uid()))
 with check (organization_id in (select organization_id from public.organization_members where user_id=auth.uid()));

alter table public.shipment_document_issues add column if not exists source_stale boolean not null default false;
alter table public.shipment_document_issues add column if not exists stale_reason text;
alter table public.shipment_document_issues add column if not exists source_instruction_submission_id uuid references public.instruction_submissions(id) on delete set null;

create or replace function public.nodara_freeze_instruction_snapshot(p_submission_id uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare sub instruction_submissions; req instruction_requests; snap jsonb; sid uuid; hash text;
begin
 select * into sub from instruction_submissions where id=p_submission_id;
 if sub.id is null then raise exception 'Submission not found'; end if;
 if sub.review_status<>'APPROVED' then raise exception 'Only approved submissions can be frozen'; end if;
 select * into req from instruction_requests where id=sub.request_id;
 snap:=jsonb_build_object(
  'request_number',req.request_number,'request_id',req.id,'submission_id',sub.id,'version',sub.version,
  'source_type',req.source_type,'source_id',req.source_id,'template_id',req.template_id,
  'recipient_name',req.recipient_name,'recipient_email',req.recipient_email,
  'payload',sub.payload,'certification',sub.certification,'signature_name',sub.signature_name,
  'submitted_by_name',sub.submitted_by_name,'submitted_by_title',sub.submitted_by_title,
  'submitted_at',sub.submitted_at,'approved_at',req.approved_at,'reviewed_by',sub.reviewed_by,
  'review_notes',sub.review_notes,'applied_fields',sub.applied_fields
 );
 hash:=md5(snap::text);
 insert into instruction_document_snapshots(organization_id,request_id,submission_id,source_type,source_id,version,snapshot,content_hash)
 values(sub.organization_id,req.id,sub.id,req.source_type,req.source_id,sub.version,snap,hash)
 on conflict(submission_id) do update set snapshot=excluded.snapshot,content_hash=excluded.content_hash
 returning id into sid;
 update instruction_document_snapshots set status='SUPERSEDED'
 where request_id=req.id and id<>sid and status='FINAL';
 if req.source_type='SHIPMENT' then
  update shipment_document_issues set source_stale=true,stale_reason='Approved shipping instructions changed after this document revision was generated'
  where shipment_id=req.source_id and status in ('DRAFT','ISSUED') and document_code in ('HAWB','MAWB_DATA') and coalesce(source_instruction_submission_id,'00000000-0000-0000-0000-000000000000'::uuid)<>sub.id;
 end if;
 return jsonb_build_object('snapshot_id',sid,'content_hash',hash,'version',sub.version);
end $$;
revoke all on function public.nodara_freeze_instruction_snapshot(uuid) from public,anon;
grant execute on function public.nodara_freeze_instruction_snapshot(uuid) to authenticated;

create or replace function public.nodara_link_instruction_document(p_snapshot_id uuid,p_document_id uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare x instruction_document_snapshots; d documents;
begin
 select * into x from instruction_document_snapshots where id=p_snapshot_id;
 select * into d from documents where id=p_document_id;
 if x.id is null or d.id is null or x.organization_id<>d.organization_id then raise exception 'Snapshot/document mismatch'; end if;
 update instruction_document_snapshots set document_id=d.id where id=x.id;
 insert into document_links(organization_id,document_id,context_type,context_id,context_reference,link_role,provenance)
 values(x.organization_id,d.id,x.source_type,x.source_id,'Approved Shipping Instructions','SUPPORTING',jsonb_build_object('instruction_snapshot_id',x.id,'instruction_submission_id',x.submission_id,'immutable_source',true))
 on conflict do nothing;
 insert into document_activity(organization_id,document_id,action,detail)
 values(x.organization_id,d.id,'INSTRUCTION_SNAPSHOT_FINALIZED',jsonb_build_object('instruction_snapshot_id',x.id,'version',x.version,'content_hash',x.content_hash));
 return jsonb_build_object('snapshot_id',x.id,'document_id',d.id);
end $$;
revoke all on function public.nodara_link_instruction_document(uuid,uuid) from public,anon;
grant execute on function public.nodara_link_instruction_document(uuid,uuid) to authenticated;

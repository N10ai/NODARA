begin;
create schema if not exists nodara_private;
alter table public.operations_messages drop constraint operations_messages_source_check;
alter table public.operations_messages add constraint operations_messages_source_check check(source in ('PASTED_EMAIL','PHONE','WHATSAPP','NOTE','GMAIL'));
alter table public.operations_messages add column source_thread_id text;
alter table public.operations_messages add column source_message_id text;
alter table public.operations_messages add column mailbox_connection_id uuid;
alter table public.operations_messages add column extraction jsonb;
alter table public.operations_messages add column extracted_at timestamptz;
alter table public.operations_messages add column source_metadata jsonb not null default '{}'::jsonb;
create index on public.operations_messages(organization_id,mailbox_connection_id,source_thread_id);
create unique index on public.operations_messages(mailbox_connection_id,source_message_id) where mailbox_connection_id is not null;
create table public.operations_mailboxes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),email text not null,
 provider text not null default 'GMAIL',active boolean not null default true,search_query text not null default 'in:inbox',
 created_by uuid not null default auth.uid(),created_at timestamptz not null default now(),last_sync_at timestamptz,sync_count bigint not null default 0,
 last_error text
);
alter table public.operations_mailboxes enable row level security;
create policy mailbox_read on public.operations_mailboxes for select to authenticated using(public.nodara_is_org_member(organization_id));
grant select on public.operations_mailboxes to authenticated;
alter table public.operations_messages add foreign key(mailbox_connection_id) references public.operations_mailboxes(id);
create table nodara_private.mailbox_keys(connection_id uuid primary key references public.operations_mailboxes(id),token_hash text not null unique);
alter table nodara_private.mailbox_keys enable row level security;
revoke all on nodara_private.mailbox_keys from public,anon,authenticated;

create function nodara_private.create_gmail_mailbox(p_org uuid,p_email text,p_query text) returns jsonb language plpgsql security definer set search_path=public,nodara_private,extensions as $$
declare id uuid; token text:=encode(gen_random_bytes(32),'hex');
begin
 if not public.nodara_is_org_member(p_org) then raise exception 'Workspace access denied'; end if;
 if p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter your Gmail or Google Workspace email address'; end if;
 insert into public.operations_mailboxes(organization_id,email,search_query) values(p_org,lower(btrim(p_email)),coalesce(nullif(btrim(p_query),''),'in:inbox')) returning operations_mailboxes.id into id;
 insert into nodara_private.mailbox_keys values(id,encode(digest(token,'sha256'),'hex'));
 return jsonb_build_object('id',id,'token',token);
end $$;
revoke all on function nodara_private.create_gmail_mailbox(uuid,text,text) from public,anon;
grant usage on schema nodara_private to authenticated;
grant execute on function nodara_private.create_gmail_mailbox(uuid,text,text) to authenticated;
create function public.nodara_create_gmail_mailbox(p_org uuid,p_email text,p_query text default 'in:inbox') returns jsonb language sql security invoker set search_path=public as $$ select nodara_private.create_gmail_mailbox(p_org,p_email,p_query) $$;
revoke all on function public.nodara_create_gmail_mailbox(uuid,text,text) from public,anon;
grant execute on function public.nodara_create_gmail_mailbox(uuid,text,text) to authenticated;

create function nodara_private.revoke_gmail_mailbox(p_id uuid) returns void language plpgsql security definer set search_path=public,nodara_private as $$
begin
 if not exists(select 1 from public.operations_mailboxes where id=p_id and public.nodara_is_org_member(organization_id)) then raise exception 'Workspace access denied'; end if;
 delete from nodara_private.mailbox_keys where connection_id=p_id;
 update public.operations_mailboxes set active=false where id=p_id;
end $$;
revoke all on function nodara_private.revoke_gmail_mailbox(uuid) from public,anon;
grant execute on function nodara_private.revoke_gmail_mailbox(uuid) to authenticated;
create function public.nodara_revoke_gmail_mailbox(p_id uuid) returns void language sql security invoker set search_path=public as $$ select nodara_private.revoke_gmail_mailbox(p_id) $$;
revoke all on function public.nodara_revoke_gmail_mailbox(uuid) from public,anon;
grant execute on function public.nodara_revoke_gmail_mailbox(uuid) to authenticated;

create function nodara_private.ingest_gmail(p_token text,p_email text,p_messages jsonb) returns jsonb language plpgsql security definer set search_path=public,nodara_private,extensions as $$
declare box public.operations_mailboxes; item jsonb; mid uuid; n integer:=0;
begin
 if length(p_token)<>64 then raise exception 'Invalid connection' using errcode='28000'; end if;
 select b.* into box from public.operations_mailboxes b join nodara_private.mailbox_keys k on k.connection_id=b.id where k.token_hash=encode(digest(p_token,'sha256'),'hex') and b.active and lower(p_email)=b.email for update of b;
 if box.id is null then raise exception 'Invalid or revoked Gmail connection' using errcode='28000'; end if;
 if jsonb_typeof(p_messages)<>'array' or jsonb_array_length(p_messages)>25 then raise exception 'Invalid message batch'; end if;
 for item in select value from jsonb_array_elements(p_messages) loop
  if nullif(item->>'message_id','') is null or nullif(item->>'thread_id','') is null or length(coalesce(item->>'body',''))>150000 then raise exception 'Invalid message'; end if;
  mid:=null;
  insert into public.operations_messages(organization_id,subject,sender,body,source_url,source,received_at,source_thread_id,source_message_id,mailbox_connection_id,created_by,source_metadata)
  values(box.organization_id,coalesce(item->>'subject',''),coalesce(item->>'sender',''),coalesce(nullif(btrim(item->>'body'),''),'No text body. Open the original Gmail conversation.'),'https://mail.google.com/mail/u/?authuser='||box.email||'#all/'||(item->>'thread_id'),'GMAIL',(item->>'received_at')::timestamptz,item->>'thread_id',item->>'message_id',box.id,box.created_by,coalesce(item->'metadata','{}'::jsonb))
  on conflict(mailbox_connection_id,source_message_id) where mailbox_connection_id is not null do nothing returning id into mid;
  if mid is not null then
   n:=n+1;
   insert into public.operations_request_messages(organization_id,request_id,message_id)
   select distinct box.organization_id,l.request_id,mid from public.operations_request_messages l join public.operations_messages m on m.id=l.message_id where m.mailbox_connection_id=box.id and m.source_thread_id=item->>'thread_id' and m.organization_id=box.organization_id on conflict do nothing;
  end if;
 end loop;
 update public.operations_mailboxes set last_sync_at=now(),sync_count=sync_count+n,last_error=null where id=box.id;
 return jsonb_build_object('imported',n,'connection_id',box.id);
end $$;
revoke all on function nodara_private.ingest_gmail(text,text,jsonb) from public,anon,authenticated;
grant usage on schema nodara_private to service_role;
grant execute on function nodara_private.ingest_gmail(text,text,jsonb) to service_role;
create function public.nodara_ingest_gmail(p_token text,p_email text,p_messages jsonb) returns jsonb language sql security invoker set search_path=public as $$ select nodara_private.ingest_gmail(p_token,p_email,p_messages) $$;
revoke all on function public.nodara_ingest_gmail(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.nodara_ingest_gmail(text,text,jsonb) to service_role;

-- Import runs with a connection key rather than a user JWT. Scope is checked by ingest_gmail.
-- Link guard validates organization on both records even for service imports.
create function public.nodara_apply_inbox_review(p_message_id uuid,p_reviews jsonb,p_mark_reviewed boolean default false) returns jsonb language plpgsql security invoker set search_path=public as $$
declare m public.operations_messages; item jsonb; proposal jsonb; result jsonb:='[]'; existing jsonb; r public.operations_requests; rid uuid; pid uuid;
begin
 select * into m from public.operations_messages where id=p_message_id for update;
 if m.id is null or not public.nodara_is_org_member(m.organization_id) then raise exception 'Workspace access denied'; end if;
 if jsonb_typeof(p_reviews)<>'array' or jsonb_array_length(p_reviews)>30 then raise exception 'Invalid review'; end if;
 for item in select value from jsonb_array_elements(p_reviews) loop
  pid:=(item->>'proposal_id')::uuid;
  select x into proposal from jsonb_array_elements(coalesce(m.extraction->'suggestions','[]')) x where x->>'proposal_id'=pid::text;
  if proposal is null then raise exception 'Suggestion no longer matches this conversation'; end if;
  select x into existing from jsonb_array_elements(coalesce(m.extraction->'applied','[]')) x where x->>'proposal_id'=pid::text;
  if existing is not null then result:=result||jsonb_build_array(existing); continue; end if;
  rid:=null;
  if item->>'action'='NEW' then
   r:=public.nodara_create_operations_request(m.organization_id,item->'input',pid,m.id);rid:=r.id;
  elsif item->>'action'='UPDATE' then
   rid:=(item->>'request_id')::uuid;
   if not exists(select 1 from public.operations_requests where id=rid and organization_id=m.organization_id) then raise exception 'Select an existing request in this workspace'; end if;
   insert into public.operations_request_messages(organization_id,request_id,message_id) values(m.organization_id,rid,m.id) on conflict do nothing;
   if item->>'update_next_action'='true' then update public.operations_requests set next_action=coalesce(item->'input'->>'next_action','') where id=rid; end if;
  elsif item->>'action'<>'INFO' then raise exception 'Invalid action'; end if;
  existing:=jsonb_build_object('proposal_id',pid,'action',item->>'action','request_id',rid,'applied_at',now());
  result:=result||jsonb_build_array(existing);
  m.extraction:=jsonb_set(m.extraction,'{applied}',coalesce(m.extraction->'applied','[]')||jsonb_build_array(existing));
 end loop;
 update public.operations_messages set extraction=m.extraction,reviewed_at=case when p_mark_reviewed then now() else reviewed_at end where id=m.id;
 return result;
end $$;
revoke all on function public.nodara_apply_inbox_review(uuid,jsonb,boolean) from public,anon;
grant execute on function public.nodara_apply_inbox_review(uuid,jsonb,boolean) to authenticated;
create unique index operations_mailbox_active_email on public.operations_mailboxes(organization_id,email) where active;
create function public.nodara_guard_message_identity() returns trigger language plpgsql security invoker set search_path=public as $$ begin if new.organization_id<>old.organization_id or new.mailbox_connection_id is distinct from old.mailbox_connection_id or new.source_message_id is distinct from old.source_message_id or new.source_thread_id is distinct from old.source_thread_id then raise exception 'Conversation identity cannot be changed'; end if; return new; end $$;
create trigger guard_message_identity before update on public.operations_messages for each row execute function public.nodara_guard_message_identity();
notify pgrst,'reload schema';
commit;

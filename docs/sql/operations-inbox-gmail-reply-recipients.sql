begin;
alter table public.operations_mailboxes add column reply_recipient_version integer not null default 1;
alter table public.operations_email_replies add column to_addresses text[] not null default '{}',add column cc_addresses text[] not null default '{}';
update public.operations_email_replies set to_addresses=array[recipient];
create function nodara_private.queue_gmail_reply_recipients(p_id uuid,p_message uuid,p_body text,p_request uuid,p_wait boolean,p_follow timestamptz,p_to text[],p_cc text[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.operations_messages;b public.operations_mailboxes;r public.operations_email_replies;addresses text[];tos text[];ccs text[];
begin
 select * into m from public.operations_messages where id=p_message;
 select * into b from public.operations_mailboxes where id=m.mailbox_connection_id;
 if auth.uid() is null or not public.nodara_is_org_member(m.organization_id) or b.created_by is distinct from auth.uid() or b.id is null or not b.active or b.organization_id is distinct from m.organization_id or coalesce(m.source_message_id,'') !~ '^[a-fA-F0-9]+$' or coalesce(m.source_thread_id,'') !~ '^[a-fA-F0-9]+$' or m.source<>'GMAIL' or m.deleted_at is not null then raise exception 'Use a connected Gmail conversation owned by your account'; end if;
 if not b.reply_enabled or b.reply_last_seen_at<now()-interval '15 minutes' or b.reply_last_seen_at is null then raise exception 'Update the Gmail connection and run setupNodara to enable replies'; end if;
 if p_id is null or length(btrim(coalesce(p_body,''))) not between 1 and 20000 then raise exception 'Write a reply (maximum 20,000 characters)'; end if;
 select array_agg(lower(x[1])) into addresses from regexp_matches(coalesce(nullif(m.source_metadata->>'reply_to',''),m.sender),'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}','g') x;
 if p_to is null then tos:=addresses; else select array_agg(v order by n) into tos from (select lower(btrim(x)) v,min(n) n from unnest(p_to) with ordinality u(x,n) group by lower(btrim(x))) q; end if;
 select coalesce(array_agg(v order by n),'{}'::text[]) into ccs from (select lower(btrim(x)) v,min(n) n from unnest(coalesce(p_cc,'{}'::text[])) with ordinality u(x,n) group by lower(btrim(x))) q where not(v=any(coalesce(tos,'{}'::text[])));
 if coalesce(cardinality(tos),0)=0 or cardinality(tos)+cardinality(ccs)>20 or exists(select 1 from unnest(tos||ccs) x where x is null or length(x)>254 or x !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') then raise exception 'Enter valid email addresses (maximum 20 recipients)'; end if;
 if (cardinality(ccs)>0 or tos is distinct from addresses) and b.reply_recipient_version<2 then raise exception 'Update Code.gs from Gmail connection → Update for replies and run setupNodara to enable editable recipients and CC'; end if;
 if p_request is not null and not exists(select 1 from public.operations_request_messages l join public.operations_messages t on t.id=l.message_id join public.operations_requests q on q.id=l.request_id where q.id=p_request and q.organization_id=m.organization_id and t.mailbox_connection_id=b.id and t.source_thread_id=m.source_thread_id) then raise exception 'The task is not linked to this conversation'; end if;
 if p_wait and p_request is null then raise exception 'Choose a linked task before moving to Waiting'; end if;
 if p_follow is not null and (p_follow<=now() or p_follow>now()+interval '2 years') then raise exception 'Choose a future reminder'; end if;
 select * into r from public.operations_email_replies where id=p_id;
 if r.id is not null then
  if r.created_by<>auth.uid() or r.message_id<>m.id or r.body<>p_body or r.request_id is distinct from p_request or r.wait_after_send<>p_wait or r.follow_up_at is distinct from p_follow or r.to_addresses is distinct from tos or r.cc_addresses is distinct from ccs then raise exception 'This send reference has already been used'; end if;
  return to_jsonb(r);
 end if;
 insert into public.operations_email_replies(id,organization_id,mailbox_id,message_id,request_id,created_by,recipient,subject,body,wait_after_send,follow_up_at,to_addresses,cc_addresses)
 values(p_id,m.organization_id,b.id,m.id,p_request,auth.uid(),array_to_string(tos,', '),m.subject,p_body,coalesce(p_wait,false),p_follow,tos,ccs) returning * into r;
 return to_jsonb(r);
end $$;
revoke all on function nodara_private.queue_gmail_reply_recipients(uuid,uuid,text,uuid,boolean,timestamptz,text[],text[]) from public,anon;
grant execute on function nodara_private.queue_gmail_reply_recipients(uuid,uuid,text,uuid,boolean,timestamptz,text[],text[]) to authenticated;
create function public.nodara_queue_gmail_reply_recipients(p_id uuid,p_message uuid,p_body text,p_to text[],p_cc text[] default '{}',p_request uuid default null,p_wait boolean default false,p_follow timestamptz default null) returns jsonb language sql security invoker set search_path='' as $$select nodara_private.queue_gmail_reply_recipients(p_id,p_message,p_body,p_request,p_wait,p_follow,p_to,p_cc)$$;
revoke all on function public.nodara_queue_gmail_reply_recipients(uuid,uuid,text,text[],text[],uuid,boolean,timestamptz) from public,anon;
grant execute on function public.nodara_queue_gmail_reply_recipients(uuid,uuid,text,text[],text[],uuid,boolean,timestamptz) to authenticated;
create or replace function nodara_private.queue_gmail_reply(p_id uuid,p_message uuid,p_body text,p_request uuid,p_wait boolean,p_follow timestamptz) returns jsonb language sql security invoker set search_path='' as $$select nodara_private.queue_gmail_reply_recipients(p_id,p_message,p_body,p_request,p_wait,p_follow,null,'{}'::text[])$$;
create or replace function nodara_private.gmail_reply_bridge(p_token text,p_email text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.operations_mailboxes;r public.operations_email_replies;m public.operations_messages;mid uuid;
begin
 select mb.* into b from public.operations_mailboxes mb join nodara_private.mailbox_keys k on k.connection_id=mb.id where k.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and mb.active and mb.email=lower(p_email) for update of mb;
 if length(p_token)<>64 or b.id is null or not exists(select 1 from public.organization_members om where om.organization_id=b.organization_id and om.user_id=b.created_by) then raise exception 'Invalid or revoked Gmail connection' using errcode='28000'; end if;
 if p_action='poll_replies' then
  update public.operations_mailboxes set reply_enabled=true,reply_last_seen_at=now(),reply_recipient_version=greatest(reply_recipient_version,case when p_data->>'recipient_version'='2' then 2 else 1 end) where id=b.id;
  update public.operations_email_replies set status='UNKNOWN',last_error='Sending was interrupted. Check Gmail Sent before sending again.' where mailbox_id=b.id and status='SENDING' and claimed_at<now()-interval '10 minutes';
  select * into r from public.operations_email_replies where mailbox_id=b.id and status='QUEUED' and created_by=b.created_by and (p_data->>'recipient_version'='2' or cardinality(cc_addresses)=0 and recipient=coalesce((select lower(x[1]) from public.operations_messages sm cross join lateral regexp_matches(coalesce(nullif(sm.source_metadata->>'reply_to',''),sm.sender),'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}','g') x where sm.id=message_id limit 1),'')) order by created_at for update skip locked limit 1;
  if r.id is null then return jsonb_build_object('job',null); end if;
  update public.operations_email_replies set status='SENDING',claimed_at=now() where id=r.id;
  select * into m from public.operations_messages where id=r.message_id;
  return jsonb_build_object('job',jsonb_build_object('id',r.id,'source_message_id',m.source_message_id,'thread_id',m.source_thread_id,'to',r.recipient,'body',r.body)||case when p_data->>'recipient_version'='2' then jsonb_build_object('to_addresses',r.to_addresses,'cc_addresses',r.cc_addresses) else '{}'::jsonb end);
 elsif p_action='reply_result' then
  select * into r from public.operations_email_replies where id=(p_data->>'id')::uuid and mailbox_id=b.id for update;
  if r.id is null then raise exception 'Unknown reply'; end if;
  if r.status='SENT' then return jsonb_build_object('status','SENT'); end if;
  if r.status not in ('SENDING','UNKNOWN') then raise exception 'Reply is not being sent'; end if;
  if p_data->>'status'='SENT' then
   if coalesce(p_data->>'message_id','') !~ '^[a-f0-9]{1,40}$' then raise exception 'Gmail send confirmation is missing'; end if;
   select * into m from public.operations_messages where id=r.message_id;
   insert into public.operations_messages(organization_id,subject,sender,body,source_url,source,received_at,source_thread_id,source_message_id,mailbox_connection_id,created_by,source_metadata,reviewed_at)
   values(b.organization_id,m.subject,b.email,r.body,m.source_url,'GMAIL',now(),m.source_thread_id,p_data->>'message_id',b.id,b.created_by,jsonb_build_object('to',r.recipient,'cc',array_to_string(r.cc_addresses,', '),'direction','sent','reply_id',r.id),now())
   on conflict(mailbox_connection_id,source_message_id) where mailbox_connection_id is not null do nothing returning id into mid;
   if mid is not null then insert into public.operations_request_messages(organization_id,request_id,message_id) select distinct b.organization_id,l.request_id,mid from public.operations_request_messages l join public.operations_messages t on t.id=l.message_id where t.mailbox_connection_id=b.id and t.source_thread_id=m.source_thread_id on conflict do nothing; end if;
   update public.operations_email_replies set status='SENT',sent_at=now(),sent_message_id=p_data->>'message_id',last_error=null where id=r.id;
   if r.wait_after_send and r.request_id is not null then
    update public.operations_requests set status='WAITING',waiting_on=r.recipient,follow_up_at=r.follow_up_at where id=r.request_id and organization_id=b.organization_id and status not in ('COMPLETED','CANCELLED');
   end if;
   return jsonb_build_object('status','SENT');
  elsif p_data->>'status' in ('FAILED','UNKNOWN') then
   update public.operations_email_replies set status=p_data->>'status',last_error=left(coalesce(p_data->>'error','Could not confirm sending. Check Gmail.'),300) where id=r.id;
   return jsonb_build_object('status',p_data->>'status');
  else raise exception 'Invalid send result'; end if;
 else raise exception 'Invalid bridge action'; end if;
end $$;

create or replace function nodara_private.upgrade_gmail(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.operations_mailboxes;token text:=encode(extensions.gen_random_bytes(32),'hex');
begin
 select * into b from public.operations_mailboxes where id=p_id for update;
 if auth.uid() is null or b.id is null or b.created_by is distinct from auth.uid() or not public.nodara_is_org_member(b.organization_id) or not b.active then raise exception 'Only the mailbox owner can update its Google connection'; end if;
 if exists(select 1 from public.operations_email_replies where mailbox_id=b.id and status in ('QUEUED','SENDING')) then raise exception 'Finish or cancel pending replies before updating this connection'; end if;
 update nodara_private.mailbox_keys set token_hash=encode(extensions.digest(token,'sha256'),'hex') where connection_id=b.id;
 update public.operations_mailboxes set reply_enabled=false,reply_last_seen_at=null,reply_recipient_version=1 where id=b.id;
 return jsonb_build_object('email',b.email,'query',b.search_query,'token',token);
end $$;
notify pgrst,'reload schema';
commit;

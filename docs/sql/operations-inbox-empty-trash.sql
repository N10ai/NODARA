begin;
create table nodara_private.inbox_message_tombstones(
 organization_id uuid not null references public.organizations(id) on delete cascade,
 mailbox_connection_id uuid not null references public.operations_mailboxes(id) on delete cascade,
 source_message_id text not null, primary key(mailbox_connection_id,source_message_id)
);
alter table nodara_private.inbox_message_tombstones enable row level security;
revoke all on nodara_private.inbox_message_tombstones from public,anon,authenticated;
create function nodara_private.skip_purged_inbox_message() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.mailbox_connection_id is not null and exists(select 1 from nodara_private.inbox_message_tombstones t where t.organization_id=new.organization_id and t.mailbox_connection_id=new.mailbox_connection_id and t.source_message_id=new.source_message_id) then return null; end if;
 return new;
end $$;
revoke all on function nodara_private.skip_purged_inbox_message() from public,anon,authenticated;
create trigger skip_purged_inbox_message before insert on public.operations_messages for each row execute function nodara_private.skip_purged_inbox_message();
create function nodara_private.purge_inbox_trash(p_org uuid,p_task_ids uuid[],p_message_ids uuid[],p_empty boolean,p_before timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare tasks uuid[]; emails uuid[]; nt integer; nm integer;
begin
 if auth.uid() is null or not public.nodara_is_org_member(p_org) then raise exception 'Workspace access denied'; end if;
 if p_empty and p_before is null then raise exception 'Choose a Trash snapshot before emptying'; end if;
 perform pg_advisory_xact_lock(hashtextextended('inbox-purge:'||p_org::text,0));
 -- Mailbox-first lock order matches Gmail import and reply workers.
 perform 1 from public.operations_mailboxes b where b.organization_id=p_org and b.id in (select m.mailbox_connection_id from public.operations_messages m where m.organization_id=p_org and m.deleted_at is not null and (case when p_empty then m.deleted_at<=p_before else m.id=any(coalesce(p_message_ids,'{}'::uuid[])) end)) order by b.id for update;
 select coalesce(array_agg(id),'{}'::uuid[]) into tasks from (select id from public.operations_requests where organization_id=p_org and deleted_at is not null and (case when p_empty then deleted_at<=p_before else id=any(coalesce(p_task_ids,'{}'::uuid[])) end) order by id for update) q;
 select coalesce(array_agg(id),'{}'::uuid[]) into emails from (select id from public.operations_messages where organization_id=p_org and deleted_at is not null and (case when p_empty then deleted_at<=p_before else id=any(coalesce(p_message_ids,'{}'::uuid[])) end) order by id for update) q;
 perform 1 from public.operations_email_replies where organization_id=p_org and message_id=any(emails) order by id for update;
 if exists(select 1 from public.operations_email_replies where organization_id=p_org and message_id=any(emails) and status='SENDING') then raise exception 'An email is being sent. Try again when it finishes.'; end if;
 insert into nodara_private.inbox_message_tombstones(organization_id,mailbox_connection_id,source_message_id) select organization_id,mailbox_connection_id,source_message_id from public.operations_messages where organization_id=p_org and id=any(emails) and mailbox_connection_id is not null and source_message_id is not null on conflict do nothing;
 delete from public.operations_email_replies where organization_id=p_org and message_id=any(emails);
 update public.operations_email_replies set request_id=null,wait_after_send=false,follow_up_at=null where organization_id=p_org and request_id=any(tasks);
 delete from public.operations_push_deliveries where request_id=any(tasks);
 delete from public.operations_request_messages where organization_id=p_org and (request_id=any(tasks) or message_id=any(emails));
 delete from public.operations_request_checklist where organization_id=p_org and request_id=any(tasks);
 delete from public.operations_request_notes where organization_id=p_org and request_id=any(tasks);
 delete from public.operations_request_transactions where organization_id=p_org and request_id=any(tasks);
 delete from public.operations_request_activity where organization_id=p_org and request_id=any(tasks);
 delete from public.operations_requests where organization_id=p_org and id=any(tasks); get diagnostics nt=row_count;
 delete from public.operations_messages where organization_id=p_org and id=any(emails); get diagnostics nm=row_count;
 return jsonb_build_object('tasks',nt,'messages',nm);
end $$;
revoke all on function nodara_private.purge_inbox_trash(uuid,uuid[],uuid[],boolean,timestamptz) from public,anon;
grant execute on function nodara_private.purge_inbox_trash(uuid,uuid[],uuid[],boolean,timestamptz) to authenticated;
create function public.nodara_purge_inbox_trash(p_org uuid,p_task_ids uuid[] default '{}',p_message_ids uuid[] default '{}',p_empty boolean default false,p_before timestamptz default null) returns jsonb language sql security invoker set search_path='' as $$ select nodara_private.purge_inbox_trash(p_org,p_task_ids,p_message_ids,p_empty,p_before) $$;
revoke all on function public.nodara_purge_inbox_trash(uuid,uuid[],uuid[],boolean,timestamptz) from public,anon;
grant execute on function public.nodara_purge_inbox_trash(uuid,uuid[],uuid[],boolean,timestamptz) to authenticated;
notify pgrst,'reload schema';
commit;

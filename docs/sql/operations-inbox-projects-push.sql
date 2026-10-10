begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create table public.operations_projects(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),name text not null check(length(btrim(name)) between 1 and 160),created_by uuid default auth.uid(),created_at timestamptz not null default now());
create index on public.operations_projects(organization_id,created_at);
alter table public.operations_projects enable row level security;
revoke all on public.operations_projects from anon,authenticated;
grant select,insert,update on public.operations_projects to authenticated;
create policy projects_read on public.operations_projects for select to authenticated using(public.nodara_is_org_member(organization_id));
create policy projects_add on public.operations_projects for insert to authenticated with check(public.nodara_is_org_member(organization_id) and created_by=(select auth.uid()));
create policy projects_edit on public.operations_projects for update to authenticated using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id));
alter table public.operations_requests add column project_id uuid references public.operations_projects(id),add column assignee_user_id uuid references auth.users(id),add column priority text not null default 'NORMAL' check(priority in ('LOW','NORMAL','HIGH','URGENT'));
create index on public.operations_requests(organization_id,project_id);
create index on public.operations_requests(assignee_user_id,follow_up_at) where follow_up_at is not null and status not in ('COMPLETED','CANCELLED');
create function public.nodara_guard_request_project() returns trigger language plpgsql security invoker set search_path=public as $$ begin
 if new.project_id is not null and not exists(select 1 from public.operations_projects where id=new.project_id and organization_id=new.organization_id) then raise exception 'Project must belong to this workspace'; end if;
 if new.assignee_user_id is not null and not exists(select 1 from public.organization_members where user_id=new.assignee_user_id and organization_id=new.organization_id) then raise exception 'Assignee must belong to this workspace'; end if;
 return new; end $$;
revoke all on function public.nodara_guard_request_project() from public,anon,authenticated;
create trigger guard_request_project before insert or update on public.operations_requests for each row execute function public.nodara_guard_request_project();
create table public.operations_request_checklist(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),request_id uuid not null references public.operations_requests(id),title text not null check(length(btrim(title)) between 1 and 500),done boolean not null default false,created_at timestamptz not null default now());
create index on public.operations_request_checklist(organization_id,request_id,created_at);
alter table public.operations_request_checklist enable row level security;
revoke all on public.operations_request_checklist from anon,authenticated;
grant select,insert,update,delete on public.operations_request_checklist to authenticated;
create policy checklist_read on public.operations_request_checklist for select to authenticated using(public.nodara_is_org_member(organization_id));
create policy checklist_add on public.operations_request_checklist for insert to authenticated with check(public.nodara_is_org_member(organization_id) and exists(select 1 from public.operations_requests r where r.id=request_id and r.organization_id=operations_request_checklist.organization_id));
create policy checklist_edit on public.operations_request_checklist for update to authenticated using(public.nodara_is_org_member(organization_id)) with check(public.nodara_is_org_member(organization_id) and exists(select 1 from public.operations_requests r where r.id=request_id and r.organization_id=operations_request_checklist.organization_id));
create policy checklist_delete on public.operations_request_checklist for delete to authenticated using(public.nodara_is_org_member(organization_id));
create function public.nodara_inbox_team(p_org uuid) returns table(user_id uuid,name text) language plpgsql security definer set search_path='' as $$ begin
 if not public.nodara_is_org_member(p_org) then raise exception 'Workspace access denied'; end if;
 return query select m.user_id,coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email,'Team member')::text from public.organization_members m join auth.users u on u.id=m.user_id where m.organization_id=p_org; end $$;
revoke all on function public.nodara_inbox_team(uuid) from public,anon; grant execute on function public.nodara_inbox_team(uuid) to authenticated;
create table public.operations_push_subscriptions(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),user_id uuid not null references auth.users(id),endpoint text not null unique,p256dh text not null,auth_key text not null,enabled boolean not null default true,created_at timestamptz not null default now(),last_test_at timestamptz);
create index on public.operations_push_subscriptions(organization_id,user_id) where enabled;
alter table public.operations_push_subscriptions enable row level security;
revoke all on public.operations_push_subscriptions from anon,authenticated;
grant select,delete on public.operations_push_subscriptions to authenticated; grant all on public.operations_push_subscriptions to service_role;
create policy push_read on public.operations_push_subscriptions for select to authenticated using(user_id=(select auth.uid()) and public.nodara_is_org_member(organization_id));
create policy push_remove on public.operations_push_subscriptions for delete to authenticated using(user_id=(select auth.uid()));
create table nodara_private.push_config(singleton boolean primary key default true check(singleton),public_key text not null,private_key_secret uuid not null,worker_token_secret uuid not null);
alter table nodara_private.push_config enable row level security;
revoke all on nodara_private.push_config from public,anon,authenticated;
create function public.nodara_push_config() returns jsonb language sql security definer set search_path='' as $$ select jsonb_build_object('public_key',c.public_key,'private_key',(select decrypted_secret from vault.decrypted_secrets where id=c.private_key_secret),'worker_token',(select decrypted_secret from vault.decrypted_secrets where id=c.worker_token_secret)) from nodara_private.push_config c $$;
revoke all on function public.nodara_push_config() from public,anon,authenticated; grant execute on function public.nodara_push_config() to service_role;
create table public.operations_push_deliveries(id uuid primary key default gen_random_uuid(),subscription_id uuid not null references public.operations_push_subscriptions(id) on delete cascade,request_id uuid not null references public.operations_requests(id),reminder_at timestamptz not null,sent_at timestamptz,attempts integer not null default 0,lease_until timestamptz,next_attempt_at timestamptz not null default now(),last_error text,unique(subscription_id,request_id,reminder_at));
create index on public.operations_push_deliveries(next_attempt_at) where sent_at is null;
alter table public.operations_push_deliveries enable row level security;
revoke all on public.operations_push_deliveries from public,anon,authenticated; grant all on public.operations_push_deliveries to service_role;
create function public.nodara_claim_push() returns jsonb language plpgsql security definer set search_path='' as $$ declare result jsonb; begin
 insert into public.operations_push_deliveries(subscription_id,request_id,reminder_at)
 select s.id,r.id,r.follow_up_at from public.operations_requests r join public.operations_push_subscriptions s on s.organization_id=r.organization_id and s.user_id=coalesce(r.assignee_user_id,r.created_by) and s.enabled join public.organization_members m on m.organization_id=s.organization_id and m.user_id=s.user_id
 where r.follow_up_at<=now() and r.status not in ('COMPLETED','CANCELLED') and not exists(select 1 from public.operations_push_deliveries d where d.subscription_id=s.id and d.request_id=r.id and d.reminder_at=r.follow_up_at) order by r.follow_up_at limit 100 on conflict do nothing;
 with candidates as (select d.id from public.operations_push_deliveries d join public.operations_requests r on r.id=d.request_id join public.operations_push_subscriptions s on s.id=d.subscription_id
 where d.sent_at is null and d.attempts<8 and d.next_attempt_at<=now() and (d.lease_until is null or d.lease_until<now()) and s.enabled and r.status not in ('COMPLETED','CANCELLED') and r.follow_up_at=d.reminder_at and s.organization_id=r.organization_id and s.user_id=coalesce(r.assignee_user_id,r.created_by) and exists(select 1 from public.organization_members m where m.organization_id=s.organization_id and m.user_id=s.user_id) order by d.next_attempt_at limit 30 for update of d skip locked), claimed as (update public.operations_push_deliveries d set attempts=attempts+1,lease_until=now()+interval '2 minutes' from candidates c where d.id=c.id returning d.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'attempts',d.attempts,'subscription_id',s.id,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth_key,'request_id',r.id,'organization_id',r.organization_id)), '[]'::jsonb) into result from claimed d join public.operations_push_subscriptions s on s.id=d.subscription_id join public.operations_requests r on r.id=d.request_id; return result; end $$;
revoke all on function public.nodara_claim_push() from public,anon,authenticated; grant execute on function public.nodara_claim_push() to service_role;
create function nodara_private.dispatch_reminder_push() returns bigint language sql security definer set search_path='' as $$ select net.http_post(url:='https://tkthriefudhjrputqaao.supabase.co/functions/v1/nodara-reminder-push',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select s.decrypted_secret from vault.decrypted_secrets s join nodara_private.push_config c on c.worker_token_secret=s.id)),body:='{"action":"dispatch"}'::jsonb,timeout_milliseconds:=55000) $$;
revoke all on function nodara_private.dispatch_reminder_push() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;

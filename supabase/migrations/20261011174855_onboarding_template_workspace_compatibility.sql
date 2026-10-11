-- Preserve the existing template editor during rollout without retaining global write access.
do $$declare oid uuid;begin
 if (select count(distinct organization_id) from public.organization_members)=1 then
  select organization_id into oid from public.organization_members limit 1;
  update public.document_templates set organization_id=oid where organization_id is null;
 end if;
end $$;
create or replace function public.nodara_scope_template_insert()
returns trigger language plpgsql security invoker set search_path=public as $$
declare oid uuid;
begin
 if new.organization_id is null and auth.uid() is not null then
  if (select count(distinct organization_id) from public.organization_members where user_id=auth.uid())<>1 then raise exception 'Choose the template workspace explicitly';end if;
  select organization_id into oid from public.organization_members where user_id=auth.uid() limit 1;
  new.organization_id:=oid;
 end if;
 return new;
end $$;
revoke all on function public.nodara_scope_template_insert() from public,anon;
create trigger nodara_scope_template_insert before insert on public.document_templates for each row execute function public.nodara_scope_template_insert();
notify pgrst,'reload schema';

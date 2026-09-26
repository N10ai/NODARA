-- Controlled deletion for planning/draft consolidations.
create or replace function public.nodara_delete_consolidation(p_consolidation_id uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare c public.consolidations%rowtype; link_count integer;
begin
 select * into c from public.consolidations where id=p_consolidation_id for update;
 if not found then raise exception 'Consolidation not found'; end if;
 if upper(coalesce(c.status,'')) not in ('PLANNING','DRAFT') then raise exception 'Only planning or draft consolidations can be permanently deleted. Cancel or close operational consolidations instead.'; end if;
 select count(*) into link_count from public.consolidation_houses where consolidation_id=c.id;
 delete from public.consolidations where id=c.id;
 return jsonb_build_object('deleted',true,'consolidation_id',c.id,'consolidation_number',c.consolidation_number,'house_links_removed',link_count);
end $$;
revoke all on function public.nodara_delete_consolidation(uuid) from public, anon;
grant execute on function public.nodara_delete_consolidation(uuid) to authenticated;

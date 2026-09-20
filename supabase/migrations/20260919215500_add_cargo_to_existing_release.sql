create or replace function public.add_cargo_release_line(p_release_id uuid,p_cargo_unit_id uuid,p_requested_quantity numeric,p_uom text default null)
returns uuid language plpgsql security invoker set search_path=public as $$
declare v_id uuid;
begin
 if not exists(select 1 from cargo_releases where id=p_release_id and upper(status) in ('DRAFT','ALLOCATED','READY')) then raise exception 'Cargo Release no longer allows cargo changes'; end if;
 insert into cargo_release_lines(cargo_release_id,cargo_unit_id,requested_quantity,uom) values(p_release_id,p_cargo_unit_id,p_requested_quantity,p_uom) returning id into v_id;
 return v_id;
end $$;
grant execute on function public.add_cargo_release_line(uuid,uuid,numeric,text) to authenticated;
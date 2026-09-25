create or replace function public.update_cargo_release_line_allocation(p_line_id uuid,p_requested_quantity numeric)
returns void language plpgsql security invoker as $$
declare v_picked numeric; v_release uuid;
begin
 if p_requested_quantity<=0 then raise exception 'Allocation quantity must be greater than zero'; end if;
 select coalesce(picked_quantity,0),cargo_release_id into v_picked,v_release from public.cargo_release_lines where id=p_line_id for update;
 if v_release is null then raise exception 'Cargo Release line not found'; end if;
 if p_requested_quantity<v_picked then raise exception 'Allocation cannot be less than already picked quantity (%)',v_picked; end if;
 update public.cargo_release_lines set requested_quantity=p_requested_quantity where id=p_line_id;
 perform public.nodara_link_release_to_source_receipts(v_release);
end $$;

create or replace function public.remove_cargo_release_line_allocation(p_line_id uuid)
returns void language plpgsql security invoker as $$
declare v_picked numeric; v_release uuid;
begin
 select coalesce(picked_quantity,0),cargo_release_id into v_picked,v_release from public.cargo_release_lines where id=p_line_id for update;
 if v_release is null then raise exception 'Cargo Release line not found'; end if;
 if v_picked>0 then raise exception 'Reverse picked quantity before removing this allocation'; end if;
 delete from public.cargo_release_lines where id=p_line_id;
 perform public.nodara_link_release_to_source_receipts(v_release);
end $$;
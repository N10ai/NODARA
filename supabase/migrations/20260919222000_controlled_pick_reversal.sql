create or replace function public.reverse_cargo_release_pick(p_event_id uuid,p_reason text)
returns void language plpgsql security invoker set search_path=public as $$
declare e cargo_release_pick_events%rowtype;l cargo_release_lines%rowtype;newtotal numeric;
begin if nullif(trim(p_reason),'') is null then raise exception 'Reversal reason is required';end if;
select * into e from cargo_release_pick_events where id=p_event_id for update;if not found or e.reversed_at is not null then raise exception 'Pick event is unavailable or already reversed';end if;
select * into l from cargo_release_lines where id=e.cargo_release_line_id for update;if l.staged_at is not null then raise exception 'Staged picks cannot be reversed. Unstage through an authorized exception workflow.';end if;
update cargo_release_pick_events set reversed_at=now(),reversed_by=auth.uid(),reversal_reason=p_reason where id=e.id;newtotal:=greatest(0,coalesce(l.picked_quantity,0)-e.quantity);
update cargo_release_lines set picked_quantity=newtotal,pick_status=case when newtotal=0 then 'PENDING' when newtotal<requested_quantity then 'PARTIAL' else 'PICKED' end where id=l.id;end $$;
grant execute on function public.reverse_cargo_release_pick(uuid,text) to authenticated;
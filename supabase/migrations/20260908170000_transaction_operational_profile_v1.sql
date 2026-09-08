alter table public.transactions add column if not exists operational_data jsonb not null default '{}'::jsonb;

create or replace function public.nodara_patch_transaction_operational_data(p_transaction_id uuid,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tx transactions%rowtype; v_next jsonb;
begin
 select * into v_tx from transactions where id=p_transaction_id;
 if not found then raise exception 'Transaction not found'; end if;
 v_next=coalesce(v_tx.operational_data,'{}'::jsonb)||coalesce(p_patch,'{}'::jsonb);
 update transactions set operational_data=v_next,updated_at=now() where id=p_transaction_id;
 insert into transaction_activity_events(organization_id,transaction_id,event_type,summary,metadata,created_at)
 values(v_tx.organization_id,p_transaction_id,'OPERATIONAL_DATA_UPDATED','Operational details updated',jsonb_build_object('patch',p_patch),now());
 return v_next;
end $$;
grant execute on function public.nodara_patch_transaction_operational_data(uuid,jsonb) to authenticated;

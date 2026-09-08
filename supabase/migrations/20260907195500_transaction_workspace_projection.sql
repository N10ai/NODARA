-- Complete canonical transaction workspace projection.
-- Extends the transaction read model with the unified activity stream.

create or replace function public.nodara_get_transaction_workspace(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  base jsonb;
  tx public.transactions%rowtype;
  events jsonb;
begin
  select * into tx from public.transactions where id=p_transaction_id;
  if tx.id is null then raise exception 'Transaction not found'; end if;
  if auth.uid() is not null and not public.nodara_is_org_member(tx.organization_id) then
    raise exception 'Workspace access denied';
  end if;

  base:=public.nodara_get_transaction_read_model(p_transaction_id);

  select coalesce(jsonb_agg(to_jsonb(e) order by e.occurred_at desc),'[]'::jsonb)
    into events
    from public.transaction_activity_events e
   where e.transaction_id=p_transaction_id;

  return base || jsonb_build_object('activity',events);
end $$;

revoke all on function public.nodara_get_transaction_workspace(uuid) from public, anon;
grant execute on function public.nodara_get_transaction_workspace(uuid) to authenticated;

comment on function public.nodara_get_transaction_workspace(uuid) is
'Complete canonical transaction workspace projection including unified activity stream.';

do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid=t.typnamespace
    where t.typname='cargo_status'
      and n.nspname='public'
  ) then
    alter type public.cargo_status add value if not exists 'RELEASED';
  end if;
end $$;

notify pgrst, 'reload schema';

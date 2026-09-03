-- NODARA: fix Cargo Release confirmation against enum cargo_units.status
-- The prior RPC used coalesce(c.status,''), which forces PostgreSQL to cast
-- '' to cargo_status and fails before the comparison can run.

create or replace function public.confirm_cargo_release(p_release_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
  c record;
  remaining numeric;
begin
  if exists(
    select 1
    from public.cargo_releases
    where id = p_release_id
      and status = 'RELEASED'
  ) then
    raise exception 'Cargo release is already confirmed';
  end if;

  if not exists(
    select 1
    from public.cargo_release_lines
    where cargo_release_id = p_release_id
  ) then
    raise exception 'Cargo release has no lines';
  end if;

  for l in
    select *
    from public.cargo_release_lines
    where cargo_release_id = p_release_id
    order by created_at, id
  loop
    if l.cargo_unit_id is null then
      raise exception 'Cargo release line is missing cargo unit';
    end if;

    if l.requested_quantity is null or l.requested_quantity <= 0 then
      raise exception 'Cargo release line has invalid quantity';
    end if;

    select id, quantity, status
    into c
    from public.cargo_units
    where id = l.cargo_unit_id
    for update;

    if c.id is null then
      raise exception 'Cargo unit not found';
    end if;

    -- IMPORTANT: cast enum to text BEFORE coalesce/comparison.
    if upper(coalesce(c.status::text, '')) in (
      'RELEASED',
      'SHIPPED',
      'DELETED',
      'VOID',
      'CANCELLED'
    ) then
      raise exception 'Cargo unit is not available';
    end if;

    if l.requested_quantity > coalesce(c.quantity, 0) then
      raise exception 'Requested quantity exceeds available cargo';
    end if;

    remaining := coalesce(c.quantity, 0) - l.requested_quantity;

    if remaining = 0 then
      update public.cargo_units
      set
        quantity = 0,
        status = 'RELEASED',
        warehouse_location_id = null
      where id = c.id;
    else
      update public.cargo_units
      set quantity = remaining
      where id = c.id;
    end if;
  end loop;

  update public.cargo_releases
  set
    status = 'RELEASED',
    confirmed_at = now(),
    released_by = auth.uid(),
    updated_at = now()
  where id = p_release_id;

  return jsonb_build_object(
    'id', p_release_id,
    'status', 'RELEASED'
  );
end;
$$;

notify pgrst, 'reload schema';

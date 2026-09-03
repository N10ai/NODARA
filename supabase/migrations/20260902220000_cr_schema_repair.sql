-- NODARA Cargo Release schema repair
-- 1) Remove duplicate cargo_unit_id -> cargo_units(id) foreign keys that make PostgREST embedding ambiguous.
-- 2) Make CR numbering safe and monotonic per organization/month.
-- 3) Allow PICKING status used by guided outbound execution.

DO $$
DECLARE
  keep_name text;
  r record;
  cargo_unit_attnum smallint;
BEGIN
  SELECT attnum INTO cargo_unit_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.cargo_release_lines'::regclass
    AND attname = 'cargo_unit_id'
    AND NOT attisdropped;

  IF cargo_unit_attnum IS NOT NULL THEN
    -- Prefer the NODARA canonical constraint when present; otherwise keep the first matching FK.
    SELECT c.conname INTO keep_name
    FROM pg_constraint c
    WHERE c.conrelid = 'public.cargo_release_lines'::regclass
      AND c.confrelid = 'public.cargo_units'::regclass
      AND c.contype = 'f'
      AND c.conkey = ARRAY[cargo_unit_attnum]::smallint[]
    ORDER BY CASE WHEN c.conname = 'cargo_release_lines_cargo_fkey' THEN 0 ELSE 1 END, c.conname
    LIMIT 1;

    IF keep_name IS NOT NULL THEN
      FOR r IN
        SELECT c.conname
        FROM pg_constraint c
        WHERE c.conrelid = 'public.cargo_release_lines'::regclass
          AND c.confrelid = 'public.cargo_units'::regclass
          AND c.contype = 'f'
          AND c.conkey = ARRAY[cargo_unit_attnum]::smallint[]
          AND c.conname <> keep_name
      LOOP
        EXECUTE format('ALTER TABLE public.cargo_release_lines DROP CONSTRAINT %I', r.conname);
      END LOOP;
    ELSE
      ALTER TABLE public.cargo_release_lines
        ADD CONSTRAINT cargo_release_lines_cargo_fkey
        FOREIGN KEY (cargo_unit_id)
        REFERENCES public.cargo_units(id)
        ON DELETE RESTRICT;
    END IF;
  END IF;
END $$;

-- Ensure the workflow statuses used by NODARA are accepted.
ALTER TABLE public.cargo_releases
  DROP CONSTRAINT IF EXISTS cargo_releases_status_check;

ALTER TABLE public.cargo_releases
  ADD CONSTRAINT cargo_releases_status_check
  CHECK (status IN ('DRAFT','ALLOCATED','PICKING','READY','RELEASED','CANCELLED'));

-- Concurrency-safe monthly sequence. The advisory lock prevents two simultaneous
-- create requests from receiving the same number.
CREATE OR REPLACE FUNCTION public.next_cargo_release_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix text;
  next_n integer;
  candidate text;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization is required';
  END IF;

  -- One numbering lock per organization. Transaction-scoped and automatically released.
  PERFORM pg_advisory_xact_lock(hashtextextended('NODARA_CR:' || p_organization_id::text, 0));

  prefix := 'CR-' || to_char(current_date, 'YYMM') || '-';

  SELECT COALESCE(MAX((regexp_match(release_number, '^' || prefix || '([0-9]+)$'))[1]::integer), 0) + 1
    INTO next_n
  FROM public.cargo_releases
  WHERE organization_id = p_organization_id
    AND release_number LIKE prefix || '%';

  LOOP
    candidate := prefix || lpad(next_n::text, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.cargo_releases
      WHERE organization_id = p_organization_id
        AND release_number = candidate
    );
    next_n := next_n + 1;
  END LOOP;

  RETURN candidate;
END $$;

-- Keep both historical unique-constraint shapes harmlessly supported.
CREATE UNIQUE INDEX IF NOT EXISTS cargo_releases_org_number_uidx
  ON public.cargo_releases(organization_id, release_number)
  WHERE release_number IS NOT NULL;

-- Ask PostgREST/Supabase API to refresh its schema cache after FK changes.
NOTIFY pgrst, 'reload schema';

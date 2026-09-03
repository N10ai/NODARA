-- NODARA: ensure cargo_release_lines has exactly one FK relationship to cargo_units
DO $$
DECLARE
  r record;
  cargo_unit_attnum smallint;
  intended_name text := 'cargo_release_lines_cargo_fkey';
BEGIN
  SELECT attnum
  INTO cargo_unit_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.cargo_release_lines'::regclass
    AND attname = 'cargo_unit_id'
    AND NOT attisdropped;

  IF cargo_unit_attnum IS NULL THEN
    RAISE EXCEPTION 'cargo_release_lines.cargo_unit_id does not exist';
  END IF;

  -- Remove ALL FK paths from cargo_release_lines to cargo_units except
  -- a single FK specifically on cargo_unit_id.
  FOR r IN
    SELECT c.conname, c.conkey
    FROM pg_constraint c
    WHERE c.conrelid = 'public.cargo_release_lines'::regclass
      AND c.confrelid = 'public.cargo_units'::regclass
      AND c.contype = 'f'
  LOOP
    IF r.conkey <> ARRAY[cargo_unit_attnum]::smallint[] THEN
      EXECUTE format(
        'ALTER TABLE public.cargo_release_lines DROP CONSTRAINT %I',
        r.conname
      );
    END IF;
  END LOOP;

  -- If more than one FK still exists on cargo_unit_id, keep one only.
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.cargo_release_lines'::regclass
      AND c.confrelid = 'public.cargo_units'::regclass
      AND c.contype = 'f'
      AND c.conkey = ARRAY[cargo_unit_attnum]::smallint[]
      AND c.conname <> COALESCE(
        (
          SELECT c2.conname
          FROM pg_constraint c2
          WHERE c2.conrelid = 'public.cargo_release_lines'::regclass
            AND c2.confrelid = 'public.cargo_units'::regclass
            AND c2.contype = 'f'
            AND c2.conkey = ARRAY[cargo_unit_attnum]::smallint[]
          ORDER BY CASE WHEN c2.conname = intended_name THEN 0 ELSE 1 END,
                   c2.conname
          LIMIT 1
        ),
        intended_name
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.cargo_release_lines DROP CONSTRAINT %I',
      r.conname
    );
  END LOOP;

  -- Ensure the intended relationship exists.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.cargo_release_lines'::regclass
      AND c.confrelid = 'public.cargo_units'::regclass
      AND c.contype = 'f'
      AND c.conkey = ARRAY[cargo_unit_attnum]::smallint[]
  ) THEN
    ALTER TABLE public.cargo_release_lines
      ADD CONSTRAINT cargo_release_lines_cargo_fkey
      FOREIGN KEY (cargo_unit_id)
      REFERENCES public.cargo_units(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Migration 031: Condominium Territory Module
-- ============================================================
-- Applies:
--   1. Fix subdivisions.status CHECK (add 'assigned')
--   2. Fix/create territories.type column with 'condominium'
--   3. Add territories.subtype with condominium constraint
--   4. Create blocks table
--   5. Create units table with business-rule constraints
--
-- Business rules documented (NOT enforced in DB — app layer):
--   a) do_not_visit_until defaults to NOW() + 1 year when status
--      is set to 'do_not_visit'. Global rule, not per-territory.
--   b) When do_not_visit_until is reached, unit status must revert
--      to 'pending'. Handle via scheduled job or query-time check,
--      NOT a DB trigger (avoids silent updates breaking audit trail).
--   c) When a unit reverts from do_not_visit → pending, the active
--      assignment for that territory should be flagged for review.
--      Revisit must be assigned to a mature/responsible publisher.
--      Future phase — not yet implemented.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Fix subdivisions.status: add 'assigned' to CHECK
-- ────────────────────────────────────────────────────────────
-- Drop the existing constraint by finding its name dynamically,
-- then recreate it with all three values.

DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.subdivisions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%available%'
    AND pg_get_constraintdef(oid) LIKE '%completed%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.subdivisions DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE public.subdivisions
  ADD CONSTRAINT subdivisions_status_check
    CHECK (status IN ('available', 'assigned', 'completed'));

-- ────────────────────────────────────────────────────────────
-- 2. territories.type: create if missing, fix CHECK if present
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_constraint TEXT;
  col_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'territories'
      AND column_name  = 'type'
  ) INTO col_exists;

  IF NOT col_exists THEN
    -- Column does not exist at all: create it
    ALTER TABLE public.territories
      ADD COLUMN type TEXT
        CHECK (type IN ('residencial', 'comercial', 'condominium'));
  ELSE
    -- Column exists: drop old CHECK (if any) and recreate with condominium
    SELECT conname INTO v_constraint
    FROM pg_constraint
    WHERE conrelid = 'public.territories'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%type%'
      AND pg_get_constraintdef(oid) LIKE '%residencial%';

    IF v_constraint IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.territories DROP CONSTRAINT %I', v_constraint);
    END IF;

    ALTER TABLE public.territories
      ADD CONSTRAINT territories_type_check
        CHECK (type IN ('residencial', 'comercial', 'condominium'));
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. territories.subtype
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.territories
  ADD COLUMN IF NOT EXISTS subtype TEXT
    CHECK (subtype IN ('building', 'houses'));

-- Enforce: subtype only allowed when type = 'condominium'
-- Drop first if it already exists (safe re-run)
ALTER TABLE public.territories
  DROP CONSTRAINT IF EXISTS subtype_requires_condominium;

ALTER TABLE public.territories
  ADD CONSTRAINT subtype_requires_condominium
    CHECK (subtype IS NULL OR type = 'condominium');

-- ────────────────────────────────────────────────────────────
-- 4. Table: blocks
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.blocks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_id UUID        NOT NULL REFERENCES public.territories(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  order_index  INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blocks_territory_id ON public.blocks(territory_id);

-- Auto-update updated_at (same pattern as rest of project)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_blocks_updated_at'
  ) THEN
    CREATE TRIGGER update_blocks_updated_at
      BEFORE UPDATE ON public.blocks
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 5. Table: units
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.units (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id          UUID        REFERENCES public.blocks(id)       ON DELETE CASCADE,
  subdivision_id    UUID        REFERENCES public.subdivisions(id)  ON DELETE CASCADE,
  number            TEXT        NOT NULL,
  floor             INTEGER,
  status            TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'visited', 'do_not_visit')),
  observation       TEXT,
  do_not_visit_until TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A unit belongs to exactly one parent (block XOR subdivision)
  CONSTRAINT unit_belongs_to_one CHECK (
    (block_id IS NOT NULL AND subdivision_id IS NULL) OR
    (subdivision_id IS NOT NULL AND block_id IS NULL)
  ),

  -- observation and do_not_visit_until only meaningful on do_not_visit
  CONSTRAINT observation_only_on_do_not_visit CHECK (
    observation IS NULL OR status = 'do_not_visit'
  ),
  CONSTRAINT do_not_visit_until_only_on_do_not_visit CHECK (
    do_not_visit_until IS NULL OR status = 'do_not_visit'
  )
);

CREATE INDEX IF NOT EXISTS idx_units_block_id       ON public.units(block_id);
CREATE INDEX IF NOT EXISTS idx_units_subdivision_id ON public.units(subdivision_id);
CREATE INDEX IF NOT EXISTS idx_units_status         ON public.units(status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_units_updated_at'
  ) THEN
    CREATE TRIGGER update_units_updated_at
      BEFORE UPDATE ON public.units
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- Verification queries (run manually to confirm after apply)
-- ────────────────────────────────────────────────────────────
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid IN (
--     'public.subdivisions'::regclass,
--     'public.territories'::regclass,
--     'public.blocks'::regclass,
--     'public.units'::regclass
--   )
--   ORDER BY conrelid::text, conname;
--
-- SELECT table_name, column_name, data_type
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name IN ('territories', 'subdivisions', 'blocks', 'units')
--   ORDER BY table_name, ordinal_position;

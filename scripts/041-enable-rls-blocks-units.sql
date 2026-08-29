-- ============================================================
-- Migration 041: Enable RLS on blocks and units
-- ============================================================
-- Fixes Supabase security alert "rls_disabled_in_public":
-- `blocks` and `units` were created in migration 031 without
-- RLS enabled, leaving both tables fully public (any anon/authenticated
-- request could read, insert, update or delete rows).
--
-- Policy shape mirrors the existing territories/subdivisions pattern
-- (see 001-create-tables.sql, 036-supervisor-rls-assignments.sql):
--   - SELECT: any authenticated user (units/blocks are shown in the
--     condominium field UI to every publisher)
--   - INSERT/DELETE: admin only (blocks/units are managed from
--     territory-form-modal.tsx, an admin-only screen)
--   - UPDATE: admin/supervisor, OR a publisher with an active
--     assignment on the parent territory (mirrors "Users can update
--     subdivisions of their assigned territories" — needed so the
--     condominium page can mark units visited/do_not_visit)
-- ============================================================

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units  ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- blocks
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can view blocks" ON public.blocks;
CREATE POLICY "Authenticated users can view blocks" ON public.blocks
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can insert blocks" ON public.blocks;
CREATE POLICY "Admins can insert blocks" ON public.blocks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can update blocks" ON public.blocks;
CREATE POLICY "Admins can update blocks" ON public.blocks
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete blocks" ON public.blocks;
CREATE POLICY "Admins can delete blocks" ON public.blocks
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ────────────────────────────────────────────────────────────
-- units
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can view units" ON public.units;
CREATE POLICY "Authenticated users can view units" ON public.units
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can insert units" ON public.units;
CREATE POLICY "Admins can insert units" ON public.units
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins or assigned publishers can update units" ON public.units;
CREATE POLICY "Admins or assigned publishers can update units" ON public.units
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
    )
    OR EXISTS (
      SELECT 1 FROM public.blocks b
      JOIN public.assignments a ON a.territory_id = b.territory_id
      WHERE b.id = units.block_id
        AND a.user_id = auth.uid()
        AND a.delivered_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.subdivisions s
      JOIN public.assignments a ON a.territory_id = s.territory_id
      WHERE s.id = units.subdivision_id
        AND a.user_id = auth.uid()
        AND a.delivered_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Admins can delete units" ON public.units;
CREATE POLICY "Admins can delete units" ON public.units
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ────────────────────────────────────────────────────────────
-- Verification (run manually to confirm after apply)
-- ────────────────────────────────────────────────────────────
-- SELECT relname, relrowsecurity
--   FROM pg_class
--   WHERE relname IN ('blocks', 'units');
--
-- SELECT tablename, policyname, cmd
--   FROM pg_policies
--   WHERE tablename IN ('blocks', 'units')
--   ORDER BY tablename, cmd;
